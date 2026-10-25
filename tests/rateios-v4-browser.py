"""Interfaces reais, backend Apps Script em VM e PostgreSQL fictício; sem APIs reais."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,subprocess,uuid,os
ROOT=Path(__file__).resolve().parents[1];OUT=Path('/workspace/work/round-dashboard-rateios');OUT.mkdir(exist_ok=True)
def server(method,args):
 r=subprocess.run(['node','tests/lancamentos-v3-gateway.cjs',method,json.dumps(args)],cwd=ROOT,capture_output=True,text=True)
 return json.loads(r.stdout)
def rendered(name):
 r=server('render',[name]);assert r['ok'],r;return r['result']
views={'Dashboard':rendered('Painel_Novo_View'),'Lancamentos':rendered('Lancamentos_Novo_View')}
boot=r'''<script>
const views=VIEWS;
localStorage.setItem('mukirana_token','owner-token');localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');
window.mukiranaTelaAtual={nomeTela:'',atualizarPeriodoGlobal:null};
function runner(state){return new Proxy(state,{get(target,key){if(key==='withSuccessHandler')return fn=>runner({...target,success:fn});if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:key,args})}).then(r=>r.json()).then(data=>{if(data.ok)target.success?.(data.result);else target.failure?.({message:data.error});});}})}
window.google={script:{run:runner({})}};
function definirFiltroPeriodoGlobalVisivelMukirana(){}function finalizarCarregamentoTelaMukirana(){}
function registrarTelaAtualMukirana(name,options){mukiranaTelaAtual={nomeTela:name,atualizarPeriodoGlobal:options.atualizarPeriodoGlobal};window.MukiranaLancamentosStore?.setView(name);}
function navegarPara(name){if(window.MukiranaLancamentosNovo?.beforeNavigate(()=>navegarPara(name)))return;const host=document.getElementById('conteudo-tela');window.MukiranaLancamentosStore.setView(name);host.innerHTML=views[name]||'<h1>Contas</h1>';[...host.querySelectorAll('script')].forEach(old=>{const fresh=document.createElement('script');fresh.textContent=old.textContent;document.body.append(fresh);old.remove();});}
</script>'''.replace('VIEWS',json.dumps(views).replace('<','\\u003c'))
host='<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+((ROOT/'Global_Estilos.html').read_text()+rendered('UX_Temas_Styles')+rendered('UX_Temas_Client'))+'</head><body class="mukirana-com-topbar"><main id="conteudo-principal"><header id="topbar-app" class="topbar-app" style="display:flex"><button onclick="navegarPara(\'Dashboard\')" id="home">Painel</button><div id="topbar-filtro-periodo-global" style="display:flex"><div class="grupo-campo-global"><label>Inicial</label><input type="month" id="mk_global_mes_inicial" onchange="alterarFiltroPeriodoGlobalMukirana()"></div><div class="grupo-campo-global"><label>Final</label><input type="month" id="mk_global_mes_final" onchange="alterarFiltroPeriodoGlobalMukirana()"></div></div><div id="topbar-contexto-app"></div></header><div id="conteudo-tela"></div></main>'+boot+rendered('Saldo_Global_Client')+'<script>inicializarFiltroPeriodoGlobalMukirana();navegarPara("Dashboard");</script></body></html>'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for name,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  if os.environ.get('MUKIRANA_DEVICE') and name!=os.environ['MUKIRANA_DEVICE']:continue
  options={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
  if ua:options['user_agent']=ua
  context=browser.new_context(**options);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));calls=[];lost={'next':False}
  def route(request):
   if request.request.url.endswith('/rpc'):
    payload=json.loads(request.request.post_data);calls.append(payload['method']);result=server(payload['method'],payload['args'])
    if payload['method']=='rateiosNovoMutar' and lost['next'] and result['ok']:lost['next']=False;result={'ok':False,'error':'Resposta perdida após gravação (teste)'}
    request.fulfill(content_type='application/json',body=json.dumps(result));return
   request.fulfill(content_type='text/html; charset=utf-8',body=host)
  page.route('https://mukirana.test/**',route);page.goto('https://mukirana.test/');f=page.frame_locator('#painel-frame');f.locator('#positions .card').first.wait_for()
  assert f.locator('body').get_attribute('data-interface')==('phone' if name=='smartphone' else 'large'),(name,f.locator('body').get_attribute('data-interface'),page.evaluate('navigator.userAgent'),f.locator('body').evaluate('()=>navigator.userAgent'))
  assert f.locator('#months .card').count()==3;assert f.locator('#positions .card').count()==3
  f.locator('#include-investment').check();page.wait_for_function("document.querySelector('#ln-global-saldo').innerText.includes('Todas as contas')");f.locator('#include-investment').uncheck();page.wait_for_function("document.querySelector('#ln-global-saldo').innerText.includes('Consumo e Crédito')")
  f.locator('[data-position="2"]').click();f.locator('#sheet').wait_for();assert 'Movimento no período' in f.locator('#sheet').inner_text();assert 'Saldo projetado' in f.locator('#sheet').inner_text();f.locator('[data-close]').click()
  f.locator('[data-goal="new"]').click();f.locator('#goal-category').select_option(index=1);f.locator('#goal-amount').fill('2500,00');f.locator('#goal-form button[type="submit"]').click();f.locator('#overlay').wait_for(state='hidden');f.locator('#positions .card').first.wait_for()
  page.screenshot(path=str(OUT/('painel-'+name+'.png')),full_page=True);assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  f.locator('[data-rateios]').click();l=page.frame_locator('#ln-live-frame');l.locator('#panel-title').filter(has_text='Rateios e acertos').wait_for();assert l.locator('.rt-card').count()>0
  l.locator('.panel-head [data-close="panel"]').click();l.locator('#ln-approvals').click();l.locator('[data-rt-receive]').first.click();l.locator('#entry-amount').fill('0,01');l.locator('#entry-account').select_option('40000000-4000-4000-8000-400000000001')
  if name=='smartphone':page.set_viewport_size({'width':844,'height':390});assert l.locator('#entry-amount').input_value()=='0,01';page.set_viewport_size({'width':w,'height':h})
  # Explicit draft preserves settlement identity, direction, other person and amount.
  l.locator('.panel-head [data-close="panel"]').click();assert l.locator('#dialog .dialog-foot button').all_text_contents()==['Sair','Sair e salvar rascunho'];l.locator('[data-action="save-draft"]').click();l.locator('#dialog-layer').wait_for(state='hidden');l.locator('[data-action="resume-draft"]').click();assert l.locator('#entry-amount').input_value()=='0,01'
  lost['next']=True;l.locator('#entry-form button[type="submit"]').click();l.locator('#entry-error').filter(has_text='Resposta perdida').wait_for();l.locator('#entry-form button[type="submit"]').click();l.locator('#panel-layer').wait_for(state='hidden')
  l.locator('#ln-approvals').click();l.locator('[data-rt-review]').first.click();l.locator('#dialog').wait_for();assert 'sua parte' in l.locator('#dialog').inner_text();l.locator('[data-close="dialog"]').click();page.screenshot(path=str(OUT/('rateios-'+name+'.png')),full_page=True)
  assert not l.locator('body').evaluate('(b)=>b.scrollWidth>innerWidth'),name;assert not errors,errors
  # Global monthly control remains visible and alters connected dashboard.
  l.locator('.panel-head [data-close="panel"]').click();page.locator('#home').click();f=page.frame_locator('#painel-frame');f.locator('#months .card').first.wait_for();f.locator('#months .card').first.click();f.locator('#months .card[aria-pressed=true]').first.wait_for();assert page.locator('#mk_global_mes_inicial').input_value()==page.locator('#mk_global_mes_final').input_value()
  results.append({'device':name,'result':'PASS','checks':'painel conectado, tipo, patrimônio, metas, acertos, aprovação, rascunho explícito, perda de resposta, período global, rotação, sem overflow/erros JS'});context.close()
 browser.close()
(OUT/'browser-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
