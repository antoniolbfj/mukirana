# Somente PostgreSQL efêmero do teste, sem conexão ao Supabase.
import subprocess,uuid,concurrent.futures
D=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock','exec','-i','mukirana-cartoes-v2-test','psql','-U','postgres','-d','cartoes_final_test','-v','ON_ERROR_STOP=1','-At']
def run(s):return subprocess.run(D,input=s,text=True,capture_output=True)
def uid():return str(uuid.uuid4())
user,gid,operation=uid(),uid(),uid()
def save(g,v,o,name):return f"SELECT rpc_cartoes_salvar_v2('{user}','{g}',{v},'{o}','{name}',100000,10,17,'{{}}');"
def pair(a,b):
 with concurrent.futures.ThreadPoolExecutor(2) as pool:return list(pool.map(run,[a,b]))
assert run(f"INSERT INTO usuarios(id_usuario,nome,email) VALUES('{user}','Concurrent test','{user}@example.invalid');").returncode==0
try:
 r=pair(save(gid,0,operation,'Concurrent'),save(gid,0,operation,'Concurrent'));assert all(x.returncode==0 for x in r),[x.stderr for x in r];assert any('"replayed": true' in x.stdout for x in r)
 r=pair(save(gid,1,uid(),'Edit A'),save(gid,1,uid(),'Edit B'));assert sorted(x.returncode==0 for x in r)==[False,True];assert any('CK:conflict' in x.stderr for x in r)
 r=pair(save(gid,2,uid(),'Edit C'),f"SELECT rpc_cartoes_status_v2('{user}','{gid}',2,'{uid()}',false);");assert sorted(x.returncode==0 for x in r)==[False,True]
 r=pair(save(uid(),0,uid(),'Same name'),save(uid(),0,uid(),'Sáme  name'));assert sorted(x.returncode==0 for x in r)==[False,True];assert any('CK:duplicate_name' in x.stderr for x in r)
 print('Concurrent creation replay, two edits, edit/status, normalized duplicate names: PASS')
finally:
 r=run(f"BEGIN;DELETE FROM cartoes WHERE id_usuario='{user}';DELETE FROM grupos_cartoes WHERE id_titular='{user}';DELETE FROM usuarios WHERE id_usuario='{user}';COMMIT;");assert r.returncode==0,r.stderr
r=run("""BEGIN;
CREATE FUNCTION pg_temp.cartoes_forcar_falha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tipo_cartao='Adicional' THEN RAISE EXCEPTION 'forced_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER cartoes_forcar_falha_teste BEFORE INSERT OR UPDATE ON public.cartoes FOR EACH ROW EXECUTE FUNCTION pg_temp.cartoes_forcar_falha();
SET LOCAL ROLE service_role;
DO $$ DECLARE u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();g uuid:=gen_random_uuid();falhou boolean:=false; BEGIN
INSERT INTO usuarios(id_usuario,nome,email) VALUES(u,'Atomic test',u||'@example.invalid'),(a,'Atomic additional',a||'@example.invalid');
BEGIN PERFORM rpc_cartoes_salvar_v2(u,g,0,gen_random_uuid(),'Atomic test',10000,10,17,ARRAY[a]);EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%forced_failure%';END;
ASSERT falhou AND NOT EXISTS(SELECT 1 FROM grupos_cartoes WHERE id_grupo_cartao=g) AND NOT EXISTS(SELECT 1 FROM cartoes WHERE id_grupo_cartao=g),'partial group/card commit';
ASSERT COALESCE(current_setting('mukirana_cartoes.sincronizando',true),'')<>'1','trigger suppression leaked';
END $$;
ROLLBACK;""");assert r.returncode==0,r.stderr
print('Forced failure while creating additional: group and cards rolled back together, trigger context restored: PASS')

import subprocess,uuid,concurrent.futures
D=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock','exec','-i','mukirana-cartoes-v2-test','psql','-U','postgres','-d','cartoes_final_test','-v','ON_ERROR_STOP=1','-At']
def run(q):return subprocess.run(D,input=q,text=True,capture_output=True)
u1,u2,g1,g2=[str(uuid.uuid4()) for _ in range(4)]
r=run(f"INSERT INTO usuarios(id_usuario,nome,email) VALUES('{u1}','Mutex one','{u1}@example.invalid'),('{u2}','Mutex two','{u2}@example.invalid'); CREATE FUNCTION mukirana_cartoes.teste_pausa() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END$$; CREATE TRIGGER teste_pausa BEFORE INSERT ON grupos_cartoes FOR EACH ROW WHEN (NEW.nome_grupo LIKE 'Mutex test%') EXECUTE FUNCTION mukirana_cartoes.teste_pausa();");assert r.returncode==0,r.stderr
try:
 queries=[f"SELECT rpc_cartoes_salvar_v2('{owner}','{g}',0,gen_random_uuid(),'Mutex test',1000,10,17,ARRAY['{member}'::uuid]);" for owner,member,g in [(u1,u2,g1),(u2,u1,g2)]]
 with concurrent.futures.ThreadPoolExecutor(2) as p:res=list(p.map(run,queries))
 print('Both owners adding each other:',[r.returncode==0 for r in res]);print('Deadlock detected:',any('deadlock detected' in r.stderr for r in res))
 assert all(r.returncode==0 for r in res),[r.stderr for r in res]
finally:
 r=run(f"DROP TRIGGER teste_pausa ON grupos_cartoes; DROP FUNCTION mukirana_cartoes.teste_pausa(); DELETE FROM cartoes WHERE id_usuario IN ('{u1}','{u2}'); DELETE FROM grupos_cartoes WHERE id_titular IN ('{u1}','{u2}'); DELETE FROM usuarios WHERE id_usuario IN ('{u1}','{u2}');");assert r.returncode==0,r.stderr
