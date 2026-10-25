"""Disponibilidade global, acerto sem duplicidade e seleção de subcategoria pelo teclado."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from datetime import datetime,timezone
from decimal import Decimal
import os,json,uuid
base=Path(__file__).with_name('lancamentos-contextos-browser.py');exec(base.read_text().split('results=[]')[0],globals());OUT=Path('/workspace/work/disponivel-rateios');OUT.mkdir(exist_ok=True)
def call(method,*args):
 r=backend(method,list(args));assert r['ok'],r;return r['result']
def uid():return str(uuid.uuid4())
def money(n):
 sign='− 'if n<0 else '';s=str(abs(n)).zfill(3);whole='{:,.0f}'.format(int(s[:-2])).replace(',','.');return sign+'R$ '+whole+','+s[-2:]
def cents(s):return int(Decimal(s.replace('−','-').replace('R$','').replace('.','').replace(',','.').replace(' ',''))*100)
cats=call('lancamentosNovoListar','owner-token',{'Mes_Selecionado':'2026-10'})['categories'];parent=next((c['id']for c in cats if c['name']=='Alimentação teclado'and not c.get('parent')),uid());child=next((c['id']for c in cats if c['name']=='Kombucha'and c.get('parent')==parent),uid())
for category_id,name,up in [(parent,'Alimentação teclado',None),(child,'Kombucha',parent)]:
 if not any(c['id']==category_id for c in cats):call('lancamentosNovoCadastroRapido','owner-token',{'id':category_id,'operationId':uid(),'action':'quick-category','name':name,'kind':'Despesa','parent':up})
other_bank=uid();call('contasTiposSalvar','other-token',{'id':other_bank,'version':0,'operationId':uid(),'name':'Conta externa '+other_bank,'type':'Consumo','openingAmountCents':'0','openingDate':'2026-10-01','shared':False,'participants':[]})
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
  for theme in ['claro','escuro','sepia']:
   if os.environ.get('MUKIRANA_THEME') and os.environ['MUKIRANA_THEME']!=theme:continue
   opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   context=browser.new_context(**opts);context.expose_binding('rpcBackend',lambda source,payload:backend(payload['method'],payload['args']));page=context.new_page();page.clock.set_fixed_time(datetime(2026,10,25,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.evaluate('(v)=>MukiranaTema.choose(v)',theme)
   f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for();page.wait_for_function("document.querySelector('#ln-global-saldo strong').textContent.includes('R$')")
   original=cents(page.locator('#ln-global-saldo strong').inner_text());cat=next(c['id']for c in page.evaluate('MukiranaLancamentosStore.load()')['categories']if c.get('global')and c['type']=='Despesa')
   # Compromisso novo pago por outra pessoa: disponível cai pela sua parte.
   call('lancamentosNovoSalvar','other-token',{'id':uid(),'operationId':uid(),'version':0,'type':'expense','description':'Reserva UI '+device+' '+theme,'amountCents':'20000','date':'2026-10-05','origin':other_bank,'category':cat,'classification':'variable','mode':'single','status':'done','shares':[{'id':OWNER,'cents':'10000'},{'id':'10000000-1000-4000-8000-100000000003','cents':'10000'}]})
   page.evaluate('MukiranaLancamentosStore.reload()');expect(page.locator('#ln-global-saldo strong')).to_have_text(money(original-10000))
   # Novo lançamento: busca nativa do select começa no nome, sem seta.
   f.locator('[data-action=new]').click();option=f.locator('#entry-category option[value="'+child+'"]');assert option.inner_text()=='Kombucha (subcategoria de Alimentação teclado)';f.locator('#entry-category').focus();f.locator('#entry-category').press('k');assert f.locator('#entry-category').input_value()==child
   f.locator('#panel-layer [data-close=panel]').first.click();f.locator('[data-action=discard]').click();f.locator('#panel-layer').wait_for(state='hidden')
   # Parcial: mesmo disponível; caixa e reserva passam a se compensar.
   pay=call('rateiosNovoMutar','owner-token',{'action':'settle','id':uid(),'operationId':uid(),'entryId':uid(),'version':0,'side':'pay','other':'10000000-1000-4000-8000-100000000003','amountCents':'4000','date':'2026-10-10','account':BANK})['settlement'];page.evaluate('MukiranaLancamentosStore.reload()');expect(page.locator('#ln-global-saldo strong')).to_have_text(money(original-10000))
   # Filtro de conta conserva o resultado real do recorte, com rótulo explícito.
   f.locator('[data-action=filters]').click();f.locator('[data-filter=account]').select_option(BANK);expect(page.locator('#ln-global-saldo small').first).to_have_text('Resultado do recorte');pack=page.evaluate('MukiranaLancamentosStore.load()');expected=page.evaluate('(p)=>MukiranaLancamentosStore.getCore().query(p.rows,{account:"'+BANK+'"}).summary.resultCents',pack);expect(page.locator('#ln-global-saldo strong')).to_have_text(money(int(expected)));f.locator('[data-action=clear-filters]').click();expect(page.locator('#ln-global-saldo small').first).to_have_text('Ainda posso gastar')
   # Explicação auditável do valor, incluindo a reserva.
   page.locator('#ln-global-saldo').click();expect(page.locator('#ln-global-dialog')).to_contain_text('Rateios a pagar');expect(page.locator('#ln-global-dialog')).to_contain_text('não é descontado duas vezes');page.locator('#ln-dialog-close').click()
   page.evaluate("navegarPara('Dashboard')");pf=page.frame_locator('#painel-frame');pf.locator('#months .metric').first.wait_for();assert pf.locator('#months').inner_text().count('Reservado para rateios')>=1
   page.screenshot(path=str(OUT/(device+'-'+theme+'.png')),full_page=True)
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');results.append({'device':device,'theme':theme,'result':'PASS'});print(results[-1],flush=True);context.close()
 browser.close()
(OUT/('browser-subset.json'if os.environ.get('MUKIRANA_DEVICE')else'browser-verification.json')).write_text(json.dumps(results,indent=2))
