"""Concorrência real: executar somente em banco isolado com psql ou prefixo Docker."""
import concurrent.futures,json,os,secrets,subprocess,uuid
if os.environ.get('MUKIRANA_TEST_DATABASE_ISOLATED')!='1':
 raise SystemExit('Este teste exige um banco isolado e MUKIRANA_TEST_DATABASE_ISOLATED=1.')
PSQL=json.loads(os.environ.get('MUKIRANA_TEST_PSQL','["psql","-v","ON_ERROR_STOP=1","-Atq"]'))
def sql(source):
 result=subprocess.run(PSQL,input=source,text=True,capture_output=True,check=True)
 return [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
u,a,b,c,t=[str(uuid.uuid4()) for _ in range(5)];token=secrets.token_hex(32)
def save(id,version,description,amount,source=a,destination=b):
 return f"select public.mukirana_transfers_save('{token}','{id}',{version},'{description}',{amount},mukirana_private.finance_today(),'{source}','{destination}');"
def pair(first,second):
 # A chamada de gravação adquire a trava do proprietário antes dos registros.
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  futures=[pool.submit(sql,s) for s in [first,second]]
  return [f.result() for f in futures]
sql(f"""insert into mukirana_private.users(id,email) values('{u}','concurrency-check-{u}@example.invalid');
insert into mukirana_private.sessions(token_hash,user_id,expires_at) values(encode(extensions.digest('{token}','sha256'),'hex'),'{u}',clock_timestamp()+interval '1 hour');
select public.mukirana_accounts_save('{token}','{a}',0,'Origem','consumption',null,false);
select public.mukirana_accounts_save('{token}','{b}',0,'Destino','investment',null,false);
select public.mukirana_accounts_save('{token}','{c}',0,'Outra','credit',null,false);""")
checks=[]
try:
 r=pair('begin;'+save(t,0,'Duplicada',100)+'select pg_sleep(0.4);commit;',save(t,0,'Duplicada',100))
 assert [x[0]['status'] for x in r]==['saved','saved']
 assert sql(f"select json_build_object('count',count(*),'maxVersion',max(version)) from mukirana_private.transfers where id='{t}';")[0]=={'count':1,'maxVersion':1}
 checks.append('duas criações simultâneas com mesmo ID são idempotentes')
 r=pair(save(t,1,'Edição A',200),save(t,1,'Edição B',300))
 assert sorted(x[0]['status'] for x in r)==['conflict','saved']
 state=sql(f"select json_build_object('rows',count(*),'sum',sum(signed_cents),'sides',count(distinct side)) from mukirana_private.account_movements where operation_id='{t}' and operation_kind='transfer';")[0]
 assert state=={'rows':2,'sum':0,'sides':2}
 checks.append('edições simultâneas preservam uma versão e duas pontas consistentes')
 # Com uma operação ativa, remoção da conta e gravação concorrente nunca deixam
 # movimentação apontando para conta excluída. O mesmo gate protege os módulos.
 sql(f"select public.mukirana_transfers_delete('{token}','{t}',2);")
 q=str(uuid.uuid4());r=pair('begin;'+save(q,0,'Proteção',500,a,c)+'select pg_sleep(0.4);commit;',f"select public.mukirana_accounts_delete('{token}','{c}',1);")
 statuses=[x[0]['status'] for x in r]
 assert statuses in [['saved','linked'],['invalid_account','deleted']],statuses
 broken=sql(f"select json_build_object('broken',count(*)) from mukirana_private.transfers t join mukirana_private.accounts a on a.id=t.destination_account_id where t.user_id='{u}' and a.deleted_at is not null;")[0]
 assert broken['broken']==0
 checks.append('transferir e excluir conta simultaneamente mantém a integridade')
 # Independente da ordem de chegada, uma exclusão e uma edição com a mesma
 # versão não deixam dois resultados financeiros ativos.
 r=pair(save(t,0,'Atualização ou exclusão',100,a,b),save(t,0,'Atualização ou exclusão',100,a,b));assert all(x[0]['status']=='saved' for x in r)
 r=pair(save(t,1,'Atualizada',200,a,b),f"select public.mukirana_transfers_delete('{token}','{t}',1);")
 statuses=[x[0]['status'] for x in r];assert statuses in [['saved','conflict'],['not_found','deleted']],statuses
 state=sql(f"select json_build_object('rows',count(*),'sum',coalesce(sum(signed_cents),0)) from mukirana_private.account_movements where operation_id='{t}' and operation_kind='transfer';")[0]
 assert state['rows'] in [0,2] and state['sum']==0
 checks.append('editar e excluir simultaneamente não deixa meia transferência')
 print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
finally:
 sql(f"delete from mukirana_private.transfers where user_id='{u}';delete from mukirana_private.accounts where user_id='{u}';delete from mukirana_private.sessions where user_id='{u}';delete from mukirana_private.users where id='{u}';")
