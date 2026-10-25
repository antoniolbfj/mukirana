"""Somente PostgreSQL local. Upgrade com financeiros e referências anteriores à migração."""
from pathlib import Path
import subprocess,os,re
ROOT=Path(__file__).resolve().parents[1];DB=os.environ.get('MUKIRANA_TEST_DB','rateios_v4_test');assert re.fullmatch(r'rateios_v4_(test|accounts|ledger|browser)',DB),'Nome de banco de teste inválido'
def sql(query,db=DB):
 r=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i','mukirana-cartoes-v2-test','psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],input=query,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout
if sql("select count(*) from pg_database where datname='"+DB+"'",'postgres').strip()!='0':sql('DROP DATABASE '+DB,'postgres')
sql('CREATE DATABASE '+DB,'postgres');sql((ROOT/'tests/fixtures/schema-v32.sql').read_text().replace('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',''))
paths=sorted((ROOT/'supabase/migrations').glob('*.sql'));latest=next(p for p in paths if p.name.endswith('_rateios_v4_acertos_dashboard.sql'))
for p in paths:
 if p!=latest:sql('BEGIN;\n'+p.read_text()+'\nCOMMIT;')
sql((ROOT/'tests/fixtures/cartoes-v2.sql').read_text());sql("insert into categorias(nome,tipo,global) values('Categoria teste','Despesa',true)");sql((ROOT/'tests/fixtures/rateios-v4-upgrade.sql').read_text())
old=sql("select md5(string_agg(to_jsonb(l)::text,'' order by id_lancamento)) from lancamentos l")
sql('BEGIN;\n'+latest.read_text()+'\nCOMMIT;')
assert old==sql("select md5(string_agg(to_jsonb(l)::text,'' order by id_lancamento)) from lancamentos l")
assert sql("select count(*) from acertos_rateios where status='Aguardando_Credor'").strip()=='2'
assert sql("select count(*) from acertos_rateios a cross join unnest(a.ids_rateios) ref left join rateios r on r.id_rateio=ref where r.id_rateio is null").strip()=='0'
print('Upgrade v4 com legado populado: todos os campos financeiros, participações e vínculos preservados; nenhuma aprovação inventada: PASS')
