"""Aplicação da migração em base anterior já populada, somente PostgreSQL local."""
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1];DB='contas_upgrade_test'
def sql(q,db=DB):
 r=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i','mukirana-cartoes-v2-test','psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],input=q,text=True,capture_output=True)
 assert r.returncode==0,r.stderr;return r.stdout
if sql("select count(*) from pg_database where datname='"+DB+"'",'postgres').strip()!='0':sql('DROP DATABASE '+DB,'postgres')
sql('CREATE DATABASE '+DB,'postgres');schema=(ROOT/'tests/fixtures/schema-v32.sql').read_text().replace('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;','');sql(schema)
paths=sorted((ROOT/'supabase/migrations').glob('*.sql'));latest=next(p for p in paths if p.name.endswith('_contas_v3_types_linked_credit.sql'))
for p in paths:
 if p!=latest:sql('BEGIN;\n'+p.read_text()+'\nCOMMIT;')
sql((ROOT/'tests/fixtures/cartoes-v2.sql').read_text());sql("update public.contas set saldo_inicial=123.45 where id_conta='40000000-4000-4000-8000-400000000001'")
# A própria migração aborta se hashes das contas anteriores ou finanças mudarem.
sql('BEGIN;\n'+latest.read_text()+'\nCOMMIT;')
assert sql('select count(*) from contas where id_grupo_cartao_v3 is not null').strip()=='3'
assert sql('select count(*) from lancamentos').strip()=='6';assert sql('select count(*) from pagamentos_faturas').strip()=='2'
sql((ROOT/'tests/contas-tipos.sql').read_text());print('Upgrade de base populada: contas/finanças anteriores preservadas, vínculos únicos e 29 ASSERTs: PASS')
