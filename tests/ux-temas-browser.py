"""UX real em três temas: interfaces, controllers e PostgreSQL fictício; sem banco real."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,json,re,os
ROOT=Path(__file__).resolve().parents[1];OUT=Path('/workspace/work/round-categorias-ux');RESULTS=[]
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
  page.route('https://ux-real.test/**',handle);page.goto('https://ux-real.test/');frame=page.frame_locator('#painel-frame');frame.locator('#positions .card').first.wait_for();page.locator('#ux-theme-header').wait_for()
  # UI hooks reais: perfil legado como fallback; escolha do navegador isolada por usuário.
  hooks=index[index.index('    function obterTemaPreferidoMukirana()'):index.index('    function abrirMeuPerfil()')];page.add_script_tag(content=hooks)
  page.evaluate("localStorage.removeItem('mukirana-ux:10000000-1000-4000-8000-100000000001:theme');localStorage.setItem('mukirana_tema','Escuro');aplicarTemaAtualMukirana()")
  assert page.locator('html').get_attribute('data-theme')=='escuro'
  page.evaluate("MukiranaTema.choose('sepia');localStorage.setItem('mukirana_tema','Claro');aplicarTemaAtualMukirana()")
  assert page.locator('html').get_attribute('data-theme')=='sepia'
  page.evaluate("localStorage.setItem('mukirana_id','usuario-de-teste-2');aplicarTemaAtualMukirana()")
  assert page.locator('html').get_attribute('data-theme')=='claro'
  page.evaluate("localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');aplicarTemaAtualMukirana()")
  assert page.locator('html').get_attribute('data-theme')=='sepia'
  page.locator('#ux-theme-header select').focus();page.locator('#ux-theme-header select').press('Home');page.locator('#ux-theme-header select').press('ArrowDown');page.locator('#ux-theme-header select').press('Enter');page.wait_for_function("document.documentElement.dataset.theme==='escuro'")
  for theme in ['claro','escuro','sepia']:
   navigate(page,'Dashboard');frame=page.frame_locator('#painel-frame');frame.locator('#positions .card').first.wait_for();page.wait_for_timeout(300);before=page.locator('#ln-global-saldo strong').inner_text();calls=page.evaluate('uxCalls.length');page.locator('#ux-theme-header select').select_option(theme);frame.locator('html[data-theme="'+theme+'"]').wait_for();page.wait_for_function('(t)=>document.documentElement.dataset.theme===t',arg=theme);frame.locator('html').evaluate('(e,t)=>{if(e.dataset.theme!==t)throw Error("Tema do iframe divergente")}',theme);assert page.locator('#ln-global-saldo strong').inner_text()==before;assert page.evaluate('uxCalls.length')==calls
   colors=frame.locator('body').evaluate('(b)=>({ink:getComputedStyle(b).color,bg:getComputedStyle(b).backgroundColor,muted:getComputedStyle(document.querySelector(".muted")).color})');assert contrast(colors['ink'],colors['bg'])>=4.5,(theme,colors);assert contrast(colors['muted'],colors['bg'])>=4.5,(theme,colors)
   page.screenshot(path=str(OUT/('painel-real-'+device+'-'+theme+'.png')),full_page=True);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),(device,theme)
   navigate(page,'Contas');page.locator('#cn-account-list article').first.wait_for();assert page.locator('#cn-root').get_attribute('data-interface')==('phone' if device=='smartphone' else 'large');page.locator('#cn-new-account').click();page.locator('#cn-account-name').fill('Nome preservado ao trocar tema');page.locator('#ux-theme-header select').select_option('escuro' if theme!='escuro' else 'sepia');assert page.locator('#cn-account-name').input_value()=='Nome preservado ao trocar tema';page.locator('#cn-editor-overlay [data-close="editor"]').first.click() if page.locator('#cn-editor-overlay [data-close="editor"]').count() else page.keyboard.press('Escape');navigate(page,'Cartoes');page.locator('#ct-list article').first.wait_for();page.locator('#ux-theme-header select').select_option(theme);assert page.locator('#ct-root').get_attribute('data-interface')==('phone' if device=='smartphone' else 'large');page.screenshot(path=str(OUT/('cartoes-real-'+device+'-'+theme+'.png')),full_page=True)
   navigate(page,'Lancamentos');ledger=page.frame_locator('#ln-live-frame');ledger.locator('[data-key]').first.wait_for();assert ledger.locator('body').get_attribute('data-interface')==('phone' if device=='smartphone' else 'large');page.locator('#ux-theme-header select').select_option(theme);ledger.locator('[data-action="new"]').click();ledger.locator('#entry-description').fill('Rascunho e tema');ledger.locator('#entry-amount').fill('15,50');page.locator('#ux-theme-header select').select_option('claro' if theme!='claro' else 'sepia');assert ledger.locator('#entry-description').input_value()=='Rascunho e tema';assert ledger.locator('#entry-amount').input_value()=='15,50'
   if device=='smartphone':page.set_viewport_size({'width':844,'height':390});assert ledger.locator('#entry-description').input_value()=='Rascunho e tema';page.set_viewport_size({'width':w,'height':h})
   ledger.locator('.panel-head [data-close="panel"]').click();assert ledger.locator('#dialog .dialog-foot button').all_text_contents()==['Sair','Sair e salvar rascunho'];ledger.locator('[data-action="discard"]').click();ledger.locator('#dialog-layer').wait_for(state='hidden');page.locator('#ux-theme-header select').select_option(theme);page.screenshot(path=str(OUT/('lancamentos-real-'+device+'-'+theme+'.png')),full_page=True);assert not ledger.locator('body').evaluate('(b)=>b.scrollWidth>innerWidth'),(device,theme,'ledger')
   page.reload();page.frame_locator('#painel-frame').locator('#positions .card').first.wait_for();assert page.locator('#ux-theme-header select').input_value()==theme;RESULTS.append({'device':device,'theme':theme,'result':'PASS','checks':'tema sem RPC, valores preservados, contraste, navegação, reload, iframe, formulários, rascunho/rotação'})
  assert not errors,errors;context.close()
 browser.close()
(OUT/'ux-browser-verification.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2));print(json.dumps(RESULTS,ensure_ascii=False))
