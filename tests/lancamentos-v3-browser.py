"""Templates reais + funções Apps Script em VM + PostgreSQL local. Nenhum banco real."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from datetime import datetime,timezone
import json,subprocess,uuid
ROOT=Path(__file__).resolve().parents[1];OUT=Path('/workspace/work/lancamentos-implementation');RESULTS=[]

def server(method,args):
 r=subprocess.run(['node','tests/lancamentos-v3-gateway.cjs',method,json.dumps(args)],cwd=ROOT,capture_output=True,text=True)
 return json.loads(r.stdout)
def rendered(name):
 result=server('render',[name]);assert result['ok'],result;return result['result']
VIEW=rendered('Lancamentos_Novo_View');GLOBAL=rendered('Saldo_Global_Client');STYLE=(ROOT/'Global_Estilos.html').read_text()
assert '<?' not in VIEW and '<?' not in GLOBAL
BOOT=r'''<script>
const viewSource=VIEW_SOURCE;
localStorage.setItem('mukirana_token','owner-token');localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');
window.mukiranaTelaAtual={nomeTela:'',atualizarPeriodoGlobal:null};
window.google={script:{run:new Proxy({}, {get(target,key){if(key==='withSuccessHandler')return fn=>{const next={...target,success:fn};return runner(next)};if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:key,args})}).then(r=>r.json()).then(data=>{if(data.ok)target.success?.(data.result);else target.failure?.({message:data.error});});}})}};
function runner(state){return new Proxy(state,{get(target,key){if(key==='withSuccessHandler')return fn=>runner({...target,success:fn});if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:key,args})}).then(r=>r.json()).then(data=>{if(data.ok)target.success?.(data.result);else target.failure?.({message:data.error});});}})}
function definirFiltroPeriodoGlobalVisivelMukirana(){}function finalizarCarregamentoTelaMukirana(){}
function registrarTelaAtualMukirana(name,options){mukiranaTelaAtual={nomeTela:name,atualizarPeriodoGlobal:options.atualizarPeriodoGlobal};window.MukiranaLancamentosStore?.setView(name);}
function navegarPara(name){if(window.MukiranaLancamentosNovo?.beforeNavigate(()=>navegarPara(name)))return;const host=document.getElementById('conteudo-tela');window.MukiranaLancamentosStore.setView(name);if(name==='LancamentosNovo'){host.innerHTML=viewSource;[...host.querySelectorAll('script')].forEach(old=>{const fresh=document.createElement('script');fresh.textContent=old.textContent;document.body.append(fresh);old.remove();});}else{host.innerHTML='<h1>Tela atual: '+name+'</h1>';}}
</script>'''.replace('VIEW_SOURCE',json.dumps(VIEW).replace('<','\\u003c'))
HOST='<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+STYLE+'</head><body class="mukirana-com-topbar"><div id="app-container"><main id="conteudo-principal"><header id="topbar-app" class="topbar-app" style="display:flex"><button class="botao-menu" onclick="navegarPara(\'Contas\')">☰</button><button class="topbar-marca" onclick="navegarPara(\'LancamentosNovo\')">Mukirana</button><div id="topbar-filtro-periodo-global" style="display:flex"><div class="grupo-campo-global"><label>Inicial</label><input type="month" id="mk_global_mes_inicial" onchange="alterarFiltroPeriodoGlobalMukirana()"></div><div class="grupo-campo-global"><label>Final</label><input type="month" id="mk_global_mes_final" onchange="alterarFiltroPeriodoGlobalMukirana()"></div></div><div id="topbar-contexto-app"></div></header><div id="conteudo-tela"></div></main></div>'+BOOT+GLOBAL+'<script>inicializarFiltroPeriodoGlobalMukirana();navegarPara("LancamentosNovo");</script></body></html>'

def expect_balance(page,number):
 page.wait_for_function('(number)=>document.querySelector("#ln-global-saldo strong")?.textContent.includes(number)',arg=number)
def save(frame):
 frame.locator('#entry-form button[type="submit"]').click();frame.locator('#panel-layer').wait_for(state='hidden')
def new(frame,description,amount,type='expense'):
 frame.locator('[data-action="new"]').click()
 if type!='expense':frame.locator(f'[data-type="{type}"]').click()
 frame.locator('#entry-description').fill(description);frame.locator('#entry-amount').fill(amount)
 frame.locator('#entry-date').fill('2026-10-20')
 if type!='transfer':
  options=frame.locator('#entry-category option').all_text_contents();assert len(options)>1;frame.locator('#entry-category').select_option(index=1)
def quick_account(frame,name):
 frame.locator('[data-action="quick-account"]').click();frame.locator('#quick-name').fill(name);frame.locator('#dialog-form button[type="submit"]').click();frame.locator('#dialog-layer').wait_for(state='hidden');return frame.locator('#entry-account').input_value()
def filter_open(frame):
 if frame.locator('#advanced').is_hidden():frame.locator('[data-action="filters"]').click()

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for name,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  suffix=name+'_'+uuid.uuid4().hex[:6];options={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
  if ua:options['user_agent']=ua
  context=browser.new_context(**options);page=context.new_page();page.clock.set_fixed_time(datetime(2026,10,24,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));lost={'next':False}
  def route(request):
   if request.request.url.endswith('/rpc'):
    payload=json.loads(request.request.post_data);result=server(payload['method'],payload['args'])
    if payload['method']=='lancamentosNovoSalvar' and lost['next'] and result['ok']:
     lost['next']=False;result={'ok':False,'error':'Resposta perdida após gravação (teste).'}
    request.fulfill(content_type='application/json',body=json.dumps(result));return
   request.fulfill(content_type='text/html; charset=utf-8',body=HOST)
  page.route('https://mukirana.test/**',route);page.goto('https://mukirana.test/');f=page.frame_locator('#ln-live-frame');f.locator('[data-key]').first.wait_for()
  assert 'Minha participação' not in f.locator('body').inner_text();assert 'Fluxo de caixa' not in f.locator('body').inner_text()
  f.locator('#search').fill('UI_NO_MATCH_'+suffix);expect_balance(page,'0,00');f.locator('[data-action="clear-filters"]').click()
  new(f,'UI_EXP_'+suffix,'100,00');a=quick_account(f,'UI_A_'+suffix);assert f.locator('#entry-description').input_value()=='UI_EXP_'+suffix;save(f)
  f.locator('#search').fill('UI_EXP_'+suffix);expect_balance(page,'100,00');assert f.locator('[data-key]').count()==1
  new(f,'UI_INCOME_'+suffix,'200,00','income');b=quick_account(f,'UI_B_'+suffix);save(f)
  new(f,'UI_TRF_'+suffix,'50,00','transfer');f.locator('#entry-account').select_option(a);f.locator('#entry-destination').select_option(b);save(f)
  f.locator('#search').fill('UI_TRF_'+suffix);f.locator('[data-key]').first.wait_for();assert f.locator('[data-key]').count()==2;expect_balance(page,'0,00')
  filter_open(f);f.locator('[data-filter="account"]').select_option(a);expect_balance(page,'50,00');assert '−' in page.locator('#ln-global-saldo strong').inner_text();assert f.locator('[data-key]').count()==1
  f.locator('[data-filter="account"]').select_option(b);page.wait_for_function("document.querySelector('#ln-global-saldo strong')?.textContent.includes('50,00')&&!document.querySelector('#ln-global-saldo strong').textContent.includes('−')");assert '−' not in page.locator('#ln-global-saldo strong').inner_text()
  f.locator('[data-action="clear-filters"]').click();filter_open(f);f.locator('[data-filter="type"]').select_option('expense')
  options=f.locator('[data-filter="account"] option').evaluate_all('(options)=>options.map(o=>o.value)');assert a in options and b not in options,options
  f.locator('[data-filter="account"]').select_option(a);expect_balance(page,'100,00')
  f.locator('[data-more]').first.click();f.locator('#action-sheet [data-edit]').click();f.locator('#entry-amount').fill('120,00')
  if name=='smartphone':page.set_viewport_size({'width':844,'height':390});assert f.locator('#entry-amount').input_value()=='120,00';page.set_viewport_size({'width':w,'height':h})
  lost['next']=True;f.locator('#entry-form button[type="submit"]').click();f.locator('#entry-error').filter(has_text='Resposta perdida').wait_for();assert f.locator('#entry-amount').input_value()=='120,00';save(f);expect_balance(page,'120,00');assert f.locator('[data-key]').count()==1
  f.locator('#search').fill('UI_TRF_'+suffix);filter_open(f);f.locator('[data-filter="account"]').select_option(a);assert f.locator('[data-key]').count()==1
  f.locator('[data-more]').first.click();f.locator('#action-sheet [data-delete]').click();f.locator('#dialog-form button[type="submit"]').click();f.locator('#dialog-layer').wait_for(state='hidden');page.wait_for_timeout(50);assert f.locator('[data-key]').count()==0;expect_balance(page,'0,00')
  f.locator('[data-action="new"]').click();f.locator('#entry-description').fill('Rascunho '+suffix);f.locator('.panel-head [data-close="panel"]').click();assert f.locator('#dialog .dialog-foot button').all_text_contents()==['Sair','Sair e salvar rascunho'];f.locator('[data-action="save-draft"]').click();f.locator('#dialog-layer').wait_for(state='hidden');page.reload();f=page.frame_locator('#ln-live-frame');f.locator('[data-action="resume-draft"]').click();assert f.locator('#entry-description').input_value()=='Rascunho '+suffix
  f.locator('.panel-head [data-close="panel"]').click();f.locator('[data-action="discard"]').click();f.locator('#dialog-layer').wait_for(state='hidden')
  f.locator('[data-action="new"]').click();f.locator('#entry-description').fill('Navegação com rascunho '+suffix);page.wait_for_function('window.MukiranaLancamentosNovo.editing===true');page.locator('.botao-menu').click();f.locator('[data-action="save-draft"]').click();page.locator('#ln-live-root').wait_for(state='detached');assert page.locator('#ln-global-saldo').is_visible();assert 'Período global' in page.locator('#ln-global-saldo').inner_text();assert page.evaluate('typeof window.MukiranaLancamentosNovo')=='undefined'
  page.locator('.topbar-marca').click();f=page.frame_locator('#ln-live-frame');f.locator('[data-key]').first.wait_for();page.wait_for_timeout(200);page.screenshot(path=str(OUT/(name+'-connected.png')),full_page=True)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),name
  assert not errors,errors;RESULTS.append({'device':name,'result':'PASS','database':'local fictitious PostgreSQL'});context.close()
 browser.close()
(OUT/'browser-verification.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2));print(json.dumps(RESULTS,ensure_ascii=False))
