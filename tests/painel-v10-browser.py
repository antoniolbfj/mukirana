"""Painel conectado: ordem das linhas e rateios pelo período, três layouts/temas."""
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
import json,os
base=Path(__file__).with_name('lancamentos-contextos-browser.py')
exec(base.read_text().split('results=[]')[0],globals())
OUT=Path('/workspace/work/painel-periodo');OUT.mkdir(exist_ok=True)
HOST=HOST.replace("'owner-token'","'other-token'").replace("'10000000-1000-4000-8000-100000000001'","'10000000-1000-4000-8000-100000000003'")
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
  for theme in ['claro','escuro','sepia']:
   if os.environ.get('MUKIRANA_THEME') and os.environ['MUKIRANA_THEME']!=theme:continue
   opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   context=browser.new_context(**opts);context.expose_binding('rpcBackend',lambda source,payload:backend(payload['method'],payload['args']));page=context.new_page();page.set_default_timeout(12000);page.clock.set_fixed_time(datetime(2026,10,25,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.evaluate('navegarPara("Dashboard")');page.evaluate('(v)=>MukiranaTema.choose(v)',theme)
   f=page.frame_locator('#painel-frame');f.locator('.rateio-card').wait_for();rate=f.locator('.rateio-card .metric');expect(rate).to_contain_text('0,00');assert f.locator('[data-position]').count()==3
   assert f.locator('#balances .card-title').all_text_contents()==['Saldo × Contas · Consumo','Patrimônio']
   assert f.locator('#positions .card-title').all_text_contents()==['Saldo dos Cartões','Saldo × Rateio']
   assert f.locator('#analytics h2').all_text_contents()==['Gastos × Categorias','Metas × Período']
   assert 'Patrimônio atual' not in f.locator('body').inner_text()
   ordering=f.locator('body').evaluate("""()=>['months','balances','positions','analytics'].map(id=>document.getElementById(id).getBoundingClientRect().top).concat(document.querySelector('.chart-section').getBoundingClientRect().top)""")
   assert all(a<b for a,b in zip(ordering,ordering[1:])),ordering
   for selector,count in [('#months .card',3),('#balances .card',2),('#positions .card',2),('#analytics>.section',2)]:
    assert f.locator(selector).count()==count
    if device!='smartphone' or selector.startswith('#months'):
     ys=f.locator(selector).evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().top)');assert max(ys)-min(ys)<2,(device,selector,ys)
   assert f.locator('.chart-section').evaluate('(e)=>Math.abs(e.offsetWidth-document.getElementById("balances").offsetWidth)<2')
   # O calendário muda; o card deixa de exibir todos os meses futuros somados.
   month=page.locator('#mk_global_mes');month.fill('2026-11');month.dispatch_event('change');expect(rate).to_contain_text('100,00');expect(f.locator('.rateio-card')).to_contain_text(re.compile('nov'))
   month.fill('2026-12');month.dispatch_event('change');expect(rate).to_contain_text('200,00');page.locator('#mk_global_saldo_anterior').check();expect(rate).to_contain_text('300,00')
   page.locator('#mk_global_saldo_anterior').uncheck();month.fill('2026-10');month.dispatch_event('change');expect(rate).to_contain_text('0,00')
   # Filtros do gráfico continuam locais ao gráfico.
   old_period=page.evaluate('obterFiltroPeriodoGlobalMukirana()');f.locator('[data-chart-mode=year]').click();assert f.locator('[data-wealth-month]').count()==12;assert page.evaluate('obterFiltroPeriodoGlobalMukirana()')==old_period
   f.locator('[data-chart-mode=half]').click();assert f.locator('[data-wealth-month]').count()==6;f.locator('[data-chart-mode=three]').click();assert f.locator('[data-wealth-month]').count()==3
   f.locator('body').evaluate("()=>window.scrollTo({top:0,left:0,behavior:'instant'})");page.screenshot(path=str(OUT/(device+'-'+theme+'-painel.png')),full_page=True)
   f.locator('[data-rateios]').first.click();ledger=page.frame_locator('#ln-live-frame');ledger.locator('#rt-workspace').wait_for();expect(ledger.locator('#rt-workspace .rt-value')).to_contain_text('0,00');assert ledger.locator('#rt-workspace [data-rt-pay]').count()==0;assert page.locator('#painel-frame').count()==1
   page.locator('.modal-contextual-cabecalho button').click();page.wait_for_function("getComputedStyle(document.getElementById('modal-tela-contextual')).opacity==='0'");expect(rate).to_contain_text('0,00')
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not f.locator('body').evaluate('(e)=>e.scrollWidth>innerWidth'),(device,theme,'iframe overflow')
   results.append({'device':device,'theme':theme,'result':'PASS'});print(results[-1],flush=True);context.close()
 browser.close()
(OUT/('browser-subset.json' if os.environ.get('MUKIRANA_DEVICE') else 'browser-verification.json')).write_text(json.dumps(results,indent=2))
