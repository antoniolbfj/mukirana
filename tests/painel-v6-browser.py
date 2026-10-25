"""UX real em três temas: interfaces, controllers e PostgreSQL fictício; sem banco real."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,json,re,os
ROOT=Path(__file__).resolve().parents[1];OUT=Path('/workspace/work/painel-oficial');RESULTS=[]
def server(method,args):
 r=subprocess.run(['node','tests/lancamentos-v3-gateway.cjs',method,json.dumps(args)],cwd=ROOT,text=True,capture_output=True);return json.loads(r.stdout)
def render(name):
 r=server('render',[name]);assert r['ok'],r;return r['result']
views={r:render(f) for r,f in [('Dashboard','Painel_Novo_View'),('Lancamentos','Lancamentos_Novo_View'),('Contas','Contas_Tipos_View'),('Cartoes','Cartoes_Novo_View')]}
index=(ROOT/'Index.html').read_text();nav=re.search(r'<nav id="menu-lateral"[\s\S]*?</nav>',index)[0];top=index[index.index('<div id="topbar-app"'):index.index('<div id="tela-carregamento"')].replace('style="display: none;"','style="display:flex;"');
boot=r'''<script>
const views=VIEWS;localStorage.setItem('mukirana_token','owner-token');localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');window.mukiranaTelaAtual={nomeTela:'',atualizarPeriodoGlobal:null};window.uxCalls=[];
function runner(state){return new Proxy(state,{get(target,key){if(key==='withSuccessHandler')return fn=>runner({...target,success:fn});if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>{uxCalls.push(key);return fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:key,args})}).then(r=>r.json()).then(data=>{if(data.ok)target.success?.(data.result);else target.failure?.({message:data.error});});};}})}window.google={script:{run:runner({})}};
function definirFiltroPeriodoGlobalVisivelMukirana(){document.getElementById('topbar-filtro-periodo-global').style.display='flex';}function finalizarCarregamentoTelaMukirana(){}function limparRegistroTelaAtualMukirana(){}function atualizarVisibilidadeFabPorContexto(){}
function registrarTelaAtualMukirana(name,options){mukiranaTelaAtual={nomeTela:name,atualizarPeriodoGlobal:options.atualizarPeriodoGlobal};window.MukiranaLancamentosStore?.setView(name);}
function navegarPara(name){if(window.MukiranaLancamentosNovo?.beforeNavigate(()=>navegarPara(name)))return;document.body.classList.remove('menu-aberto');const host=document.getElementById('conteudo-tela');window.MukiranaLancamentosStore.setView(name);host.innerHTML=views[name];[...host.querySelectorAll('script')].forEach(old=>{const s=document.createElement('script');s.textContent=old.textContent;document.body.append(s);old.remove();});}
function alternarMenuLateral(){document.body.classList.toggle('menu-aberto');}function fecharMenuLateral(){document.body.classList.remove('menu-aberto');}function alternarTemaSessaoMukirana(){MukiranaTema.cycle();}
</script>'''.replace('VIEWS',json.dumps(views).replace('<','\\u003c'))
HOST='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+render('Global_Estilos')+render('UX_Temas_Styles')+render('UX_Temas_Client')+render('Global_Assets')+'</head><body class="mukirana-com-topbar"><div id="app-container">'+nav+'<div id="menu-overlay" class="menu-overlay oculto" onclick="fecharMenuLateral()"></div><main id="conteudo-principal">'+top+'<div id="conteudo-tela"></div></main></div>'+boot+render('Saldo_Global_Client')+'<script>document.querySelectorAll("[data-mukirana-logo]").forEach(i=>i.src=window.MUKIRANA_ASSETS.appIcon);document.getElementById("nome-usuario-logado").textContent="Ana teste";document.getElementById("menu-lateral").style.display="flex";document.getElementById("topbar-app").style.display="flex";inicializarFiltroPeriodoGlobalMukirana();navegarPara("Dashboard");</script></body></html>'

def rgb(s):return [int(x)/255 for x in re.findall(r'[\d.]+',s)[:3]]
def lum(v):
 c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v];return sum(x*w for x,w in zip(c,[.2126,.7152,.0722]))
def contrast(a,b):
 x,y=sorted([lum(rgb(a)),lum(rgb(b))]);return (y+.05)/(x+.05)

def navigate(page,name):page.evaluate('(name)=>navegarPara(name)',name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
  options={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
  if ua:options['user_agent']=ua;options['has_touch']=True
  context=browser.new_context(**options);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def handle(r):
   if r.request.url.endswith('/rpc'):
    payload=json.loads(r.request.post_data);result=server(payload['method'],payload['args']);r.fulfill(content_type='application/json',body=json.dumps(result));return
   r.fulfill(content_type='text/html; charset=utf-8',body=HOST)
  page.route('https://ux-real.test/**',handle);page.goto('https://ux-real.test/')
  frame=page.frame_locator('#painel-frame');frame.locator('#positions .card').first.wait_for();page.locator('#ux-theme-header').wait_for()
  for theme in ['claro','escuro','sepia']:
   navigate(page,'Dashboard');frame=page.frame_locator('#painel-frame');frame.locator('#positions .card').first.wait_for()
   page.locator('#ux-theme-header select').select_option(theme);frame.locator('html[data-theme="'+theme+'"]').wait_for()
   assert frame.locator('body').get_attribute('data-interface')==('phone' if device=='smartphone' else 'large')
   assert frame.locator('[data-position]').count()==3
   assert frame.locator('.rateio-card').count()==1
   assert frame.locator('[data-wealth-month]').count()==3
   assert frame.locator('[data-wealth-month]').evaluate_all('(es)=>es.map(e=>e.dataset.wealthMonth)')==['2026-09','2026-10','2026-11']
   balance=page.locator('#ln-global-saldo strong').inner_text();period=page.locator('#mk_global_mes_final').input_value();calls=page.evaluate('uxCalls.length')
   frame.locator('#wealth-account').select_option('61000000-6100-4100-8100-610000000001')
   assert '18.240,00' in frame.locator('.chart-summary').inner_text()
   frame.locator('#wealth-account').select_option('61000000-6100-4100-8100-610000000002')
   assert '1.400,00' in frame.locator('.chart-summary').inner_text()
   frame.locator('[data-chart-mode="half"]').click();assert frame.locator('[data-wealth-month]').count()==6
   assert frame.locator('[data-wealth-month]').first.get_attribute('data-wealth-month')=='2026-07'
   frame.locator('[data-chart-mode="year"]').click();assert frame.locator('[data-wealth-month]').count()==12
   assert page.locator('#mk_global_mes_final').input_value()==period
   assert page.locator('#ln-global-saldo strong').inner_text()==balance
   assert page.evaluate('uxCalls.length')==calls
   frame.locator('[data-wealth-month="2026-11"]').click();assert 'Projetado' in frame.locator('.wealth-selection').inner_text()
   frame.locator('[data-wealth-table]').click();assert frame.locator('#sheet tbody tr').count()==12
   frame.locator('[data-close]').first.press('Tab');assert frame.locator('[data-close]').first.evaluate('(e)=>e===document.activeElement')
   frame.locator('[data-close]').first.press('Escape');frame.locator('#overlay').wait_for(state='hidden')
   assert frame.locator('[data-wealth-table]').evaluate('(e)=>e===document.activeElement')
   assert frame.locator('.chart-section').evaluate('(e)=>Math.abs(e.offsetWidth-document.getElementById("positions").offsetWidth)<2')
   assert not frame.locator('body').evaluate('(e)=>e.scrollWidth>innerWidth'),(device,theme,'iframe')
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(device,theme,'host')
   for signal in ['good','warning','danger']:
    frame.locator('[data-signals]').click();b=frame.locator('#sheet .signal-badge[data-signal="'+signal+'"]');colors=b.evaluate('(e)=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})');assert contrast(colors['fg'],colors['bg'])>=4.5,(theme,signal,colors);frame.locator('[data-close]').first.click()
   assert frame.locator('.card-title').first.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16
   frame.locator('#wealth-account').select_option('all');frame.locator('[data-chart-mode="three"]').click()
   frame.locator('h1').evaluate('()=>{window.scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}')
   page.wait_for_timeout(150)
   page.screenshot(path=str(OUT/('painel-oficial-'+device+'-'+theme+'.png')),full_page=True)
   frame.locator('.rateio-card').focus();page.keyboard.down('Enter')
   ledger=page.frame_locator('#ln-live-frame');ledger.locator('#panel-title').filter(has_text='Rateios e acertos').wait_for()
   page.keyboard.up('Enter')
   navigate(page,'Dashboard');frame=page.frame_locator('#painel-frame');frame.locator('#positions .card').first.wait_for()
   frame.locator('#include-investment').check();page.wait_for_function("document.querySelector('#ln-global-saldo').innerText.includes('Todas as contas')")
   frame.locator('#include-investment').uncheck();page.wait_for_function("document.querySelector('#ln-global-saldo').innerText.includes('Consumo e Crédito')")
   frame.locator('[data-position="2"]').click();assert 'Saldo projetado' in frame.locator('#sheet').inner_text();frame.locator('[data-close]').first.click()
   frame.locator('[data-month="2026-11"]').click();frame.locator('[data-month="2026-11"][aria-pressed="true"]').wait_for()
   assert frame.locator('[data-wealth-month]').evaluate_all('(es)=>es.map(e=>e.dataset.wealthMonth)')==['2026-10','2026-11','2026-12']
   frame.locator('[data-month="2026-10"]').click();frame.locator('[data-month="2026-10"][aria-pressed="true"]').wait_for()
   if device=='smartphone':
    frame.locator('[data-chart-mode="year"]').click();page.set_viewport_size({'width':844,'height':390});assert frame.locator('body').get_attribute('data-interface')=='phone';assert frame.locator('[data-wealth-month]').count()==12;page.set_viewport_size({'width':w,'height':h})
   RESULTS.append({'device':device,'theme':theme,'result':'PASS','checks':'3/6/12 meses; contas e posição real; projeções; saldo/período preservados sem RPC nos filtros; gráfico largo; rateio por teclado; contraste; nomes; navegação; detalhes; rotação; sem overflow/erros JS'})
   print(device,theme,'PASS',flush=True)
  assert not errors,errors;context.close()
 browser.close()
(OUT/'browser-verification.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2));print(json.dumps(RESULTS,ensure_ascii=False))
