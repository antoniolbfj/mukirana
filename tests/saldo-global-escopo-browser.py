"""Mesmo disponível ao navegar; aporte previsto, investimento opcional e filtros locais."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from datetime import datetime,timezone
import os,json,subprocess
base=Path(__file__).with_name('lancamentos-contextos-browser.py');exec(base.read_text().split('results=[]')[0],globals())
OUT=Path('/workspace/work/saldo-unificado');OUT.mkdir(exist_ok=True)
if os.environ.get('MUKIRANA_REUSE_FIXTURE'):fixture=json.loads((OUT/'backend.json').read_text())
else:
 fixture=subprocess.run(['node','tests/saldo-global-escopo.cjs'],cwd=ROOT,text=True,capture_output=True);assert fixture.returncode==0,fixture.stderr;fixture=json.loads(fixture.stdout);(OUT/'backend.json').write_text(json.dumps(fixture,indent=2))
def money(value):
 n=int(value);s=str(abs(n)).zfill(3);return ('− 'if n<0 else '')+'R$ '+'{:,.0f}'.format(int(s[:-2])).replace(',','.')+','+s[-2:]
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  for theme in ['claro','escuro','sepia']:
   if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
   if os.environ.get('MUKIRANA_THEME') and os.environ['MUKIRANA_THEME']!=theme:continue
   opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   context=browser.new_context(**opts);context.expose_binding('rpcBackend',lambda source,payload:backend(payload['method'],payload['args']));page=context.new_page();page.clock.set_fixed_time(datetime(2026,10,25,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.evaluate('(v)=>MukiranaTema.choose(v)',theme)
   f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for();page.locator('#mk_global_mes').fill('2026-11');page.locator('#mk_global_mes').dispatch_event('change');expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 700,00');expect(page.locator('#ln-global-saldo small').last).to_have_text('Consumo e Crédito')
   assert page.evaluate('(id)=>MukiranaLancamentosStore.load().then(p=>p.rows.filter(r=>r.entryId===id).length)','projection:'+fixture['recurrence']+':2026-11-01')==2
   # A lista mantém Investimento e a sua ponta, mesmo fora da capacidade operacional.
   f.locator('[data-action=filters]').click();f.locator('[data-filter=account]').select_option(fixture['investment']);expect(page.locator('#ln-global-saldo small').first).to_have_text('Resultado do recorte');expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 300,00');f.locator('[data-action=clear-filters]').click();expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 700,00')
   page.locator('#ln-global-saldo').click();expect(page.locator('#ln-global-dialog')).to_contain_text('Escopo global: Consumo e Crédito');page.locator('#ln-dialog-close').click()
   page.evaluate("navegarPara('Dashboard')");pf=page.frame_locator('#painel-frame');expect(pf.locator('#months .metric').nth(1)).to_have_text('R$ 700,00');expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 700,00')
   page.evaluate("navegarPara('Contas')");page.locator('#cn-root').wait_for();expect(page.locator('#cn-current-label')).to_have_text('Consumo no período');expect(page.locator('[aria-label="Conta Conta Ana teste"] strong').first).to_have_text(money(fixture['bankPeriod']));expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 700,00')
   page.evaluate("navegarPara('Dashboard');scrollTo(0,0)");pf.locator('#include-investment').check();expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 1.000,00');expect(pf.locator('#months .metric').nth(1)).to_have_text('R$ 1.000,00')
   page.evaluate("navegarPara('Lancamentos')");f.locator('#hub-tools').wait_for();expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 1.000,00');expect(page.locator('#ln-global-saldo small').last).to_have_text('Todas as contas')
   page.locator('#mk_global_saldo_anterior').check();expect(page.locator('#ln-global-saldo strong')).to_have_text(money(fixture['expectedHistory']['true']));page.evaluate("navegarPara('Dashboard')");expect(page.locator('#ln-global-saldo strong')).to_have_text(money(fixture['expectedHistory']['true']));expect(pf.locator('#include-investment')).to_be_checked();pf.locator('#include-investment').uncheck();expect(page.locator('#ln-global-saldo strong')).to_have_text(money(fixture['expectedHistory']['false']))
   page.evaluate("navegarPara('Lancamentos')");f.locator('#hub-tools').wait_for();expect(page.locator('#ln-global-saldo strong')).to_have_text(money(fixture['expectedHistory']['false']));page.locator('#mk_global_saldo_anterior').uncheck();expect(page.locator('#ln-global-saldo strong')).to_have_text('R$ 700,00');page.evaluate("navegarPara('Dashboard')");expect(pf.locator('#months .metric').nth(1)).to_have_text('R$ 700,00')
   page.evaluate('scrollTo(0,0)');expect(pf.locator('#months')).to_be_in_viewport();page.screenshot(path=str(OUT/(device+'-'+theme+'.png')),full_page=True);assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');results.append({'device':device,'theme':theme,'result':'PASS'});print(results[-1],flush=True);context.close()
 browser.close()
(OUT/('browser-subset.json'if os.environ.get('MUKIRANA_DEVICE')else'browser-verification.json')).write_text(json.dumps(results,indent=2))
