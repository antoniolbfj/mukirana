"""Concorrência real em PostgreSQL local, sem chamadas ao banco remoto."""
from pathlib import Path
import subprocess,os,uuid,json,time
ROOT=Path(__file__).resolve().parents[1];db=os.environ.get('MUKIRANA_TEST_DB','contas_types_test');uid=lambda:str(uuid.uuid4());actor='10000000-1000-4000-8000-100000000001'
cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i','mukirana-cartoes-v2-test','psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']
def sql(q):return subprocess.run(cmd,input=q,text=True,capture_output=True)
def start(q):p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);p.stdin.write(q);p.stdin.close();return p
def wait_sleep(name):
 for n in range(100):
  r=sql("select count(*) from pg_stat_activity where application_name='"+name+"' and wait_event='PgSleep'");
  if r.stdout.strip()=='1':return
  time.sleep(.02)
 raise AssertionError('not waiting')
# Uma inserção que começou antes da exclusão deve bloquear a exclusão.
a=uid();entry=uid();sql(f"insert into contas(id_conta,id_usuario,nome_conta) values('{a}','{actor}','CONC_{a}')")
p=start(f"set application_name='ct_insert';begin;insert into lancamentos(id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id) values('{entry}','Despesa','Concorrência',1,current_date,current_date,'Conta','{a}','Efetivado','{actor}');select pg_sleep(1);commit;");wait_sleep('ct_insert')
r=sql("select rpc_contas_mutar_v3('"+actor+"',gen_random_uuid(),jsonb_build_object('action','delete','id','"+a+"','version',1))");assert r.returncode!=0 and 'has_movements' in r.stderr,r.stderr;p.wait();assert p.returncode==0;assert sql(f"select count(*) from contas where id_conta='{a}'").stdout.strip()=='1'
# Se a exclusão começou primeiro, uma origem polimórfica não poderá ficar órfã.
a=uid();entry=uid();sql(f"insert into contas(id_conta,id_usuario,nome_conta) values('{a}','{actor}','CONC_{a}')")
p=start("set application_name='ct_delete';begin;select rpc_contas_mutar_v3('"+actor+"',gen_random_uuid(),jsonb_build_object('action','delete','id','"+a+"','version',1));select pg_sleep(1);commit;");wait_sleep('ct_delete')
r=sql(f"insert into lancamentos(id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id) values('{entry}','Despesa','Concorrência',1,current_date,current_date,'Conta','{a}','Efetivado','{actor}')");assert r.returncode!=0 and 'not_found' in r.stderr,r.stderr;p.wait();assert p.returncode==0
# Dois pedidos idênticos de pagamento concorrentes são uma única operação.
from_env=dict(os.environ);from_env['MUKIRANA_TEST_DB']=db
r=sql(f"select id_conta from contas where id_grupo_cartao_v3='20000000-2000-4000-8000-200000000001'");credit=r.stdout.strip();bank='40000000-4000-4000-8000-400000000001';pid=uid();request=dict(id=pid,operationId=uid(),version=0,type='transfer',description='CONC_PAGAMENTO',amountCents='1000',date='2026-10-24',origin=bank,destination=credit,invoiceMonth='2026-10',classification='variable',mode='single',status='done',shares=[])
processes=[subprocess.Popen(['node','tests/lancamentos-v3-gateway.cjs','lancamentosNovoSalvar',json.dumps(['owner-token',request])],cwd=ROOT,env=from_env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(2)]
for p in processes:out,err=p.communicate();assert p.returncode==0,(out,err);assert json.loads(out)['ok'],out
assert sql(f"select count(*) from pagamentos_faturas where id_pagamento_fatura='{pid}'").stdout.strip()=='1'
print('Exclusão concorrente com inserção, prevenção de origem órfã e pagamento idempotente simultâneo: PASS')
# Pagamentos de atores diferentes também não ultrapassam a mesma fatura.
group=uid();card=uid();other='10000000-1000-4000-8000-100000000002'
r=sql(f"insert into grupos_cartoes(id_grupo_cartao,id_titular,nome_grupo,dia_fechamento,dia_vencimento) values('{group}','{actor}','LIMIT_{group}',31,10);insert into cartoes(id_cartao,id_grupo_cartao,id_usuario,nome_cartao,tipo_cartao) values('{card}','{group}','{actor}','Titular','Titular'),(gen_random_uuid(),'{group}','{other}','Adicional','Adicional');insert into lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id) values('Despesa','Fatura limite',100,'2026-10-01','2026-10-01','Cartão','{card}','Efetivado','{actor}');select id_conta from contas where id_grupo_cartao_v3='{group}';");assert r.returncode==0,r.stderr;credit=r.stdout.strip().splitlines()[-1]
processes=[]
for token,bank in [('owner-token','40000000-4000-4000-8000-400000000001'),('additional-token','40000000-4000-4000-8000-400000000002')]:
 request.update(id=uid(),operationId=uid(),origin=bank,destination=credit,amountCents='8000')
 processes.append(subprocess.Popen(['node','tests/lancamentos-v3-gateway.cjs','lancamentosNovoSalvar',json.dumps([token,request])],cwd=ROOT,env=from_env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True))
answers=[json.loads(p.communicate()[0]) for p in processes];assert sum(1 for r in answers if r['ok'])==1,answers;assert any('ultrapassa' in r.get('error','') for r in answers),answers
assert sql(f"select sum(valor) from pagamentos_faturas where id_grupo_cartao='{group}'").stdout.strip()=='80.00'
print('Teto da fatura preservado entre pagamentos concorrentes de titular e adicional: PASS')
