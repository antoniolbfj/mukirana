"""Integração local: Chromium -> contratos Apps Script reais (VM) -> PostgreSQL efêmero.
Execute da raiz após preparar o banco/fixtures. Não usa dados ou credenciais remotos.
"""
from pathlib import Path
import re,json,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path.cwd()
def render(name):
 return re.sub(r"<\?!= incluir_\('([^']+)'\); \?>",lambda m:render(m[1]),(ROOT/(name+'.html')).read_text())
def frame(name):
 return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+render('Global_Estilos')+'<body class="mukirana-com-topbar"><main id="conteudo-principal"><div id="topbar-app" class="topbar-app" style="display:flex"><strong>Mukirana</strong><span>Outubro de 2026</span></div><div id="conteudo-tela">'+render(name)+'</div></main><div id="fab-container"></div></body></html>'
def backend(data):
 r=subprocess.run(['node','tests/cartoes-v2-gateway.cjs',data['name'],json.dumps(data['args'])],text=True,capture_output=True)
 try:return json.loads(r.stdout)
 except Exception:raise RuntimeError(r.stderr[:1200]+r.stdout[:1200])
bridge=r'''localStorage.setItem('mukirana_token','TOKEN');window.calls=[];window.failAfterCommit=false;window.failForecast=false;window.testFilters={Mes_Inicial:'2026-10',Mes_Final:'2026-10'};window.getCalls=n=>calls.filter(c=>c.name===n);window.obterFiltroPeriodoGlobalMukirana=()=>testFilters;window.finalizarCarregamentoTelaMukirana=()=>{};window.registrarTelaAtualMukirana=(n,c)=>{window.screenConfig=c};window.mostrarNotificacao=(t)=>{window.lastNotification=t};window.confirmarAcao=(text,fn)=>fn();window.navegarPara=n=>window.navigation=n;window.abrirLancamentosContextuaisMukirana=f=>window.movementFilters=f;window.google={script:{get run(){let ok,fail;const proxy=new Proxy({},{get(t,name){if(name==='withSuccessHandler')return f=>{ok=f;return proxy};if(name==='withFailureHandler')return f=>{fail=f;return proxy};return(...args)=>{calls.push({name,args:structuredClone(args)});if(name==='cartoesNovoPrevisoes'&&failForecast){setTimeout(()=>fail(Error('Falha de previsão simulada')),10);return}window.testBackend({name,args}).then(r=>{if(name==='cartoesNovoSalvar'&&failAfterCommit&&r.ok){failAfterCommit=false;fail(Error('Falha de comunicação simulada'));return}if(r.ok)ok(r.result);else fail(Error(r.error))}).catch(fail)}}});return proxy}}};'''
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for kind,size,ua in [('desktop',{'width':1440,'height':1000},None),('tablet',{'width':820,'height':1180},'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('phone',{'width':390,'height':844},'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  opts={'viewport':size,'has_touch':kind!='desktop'}
  if ua:opts['user_agent']=ua
  context=browser.new_context(**opts);context.expose_binding('testBackend',lambda source,data:backend(data));context.add_init_script(bridge.replace('TOKEN','owner-token'))
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://mukirana.test/**',lambda r:r.fulfill(body=frame('Cartoes_Novo_View'),content_type='text/html; charset=utf-8'))
  page.goto('https://mukirana.test/');page.wait_for_selector('#ct-list article');page.wait_for_function("document.querySelector('#ct-total-planned').textContent.includes('R$')")
  assert page.locator('#ct-root').get_attribute('data-interface')==('phone' if kind=='phone' else 'large')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),kind+' overflow'
  assert page.locator('#ct-search').bounding_box()['width']>200,'search compressed by global styles'
  assert page.evaluate("getCalls('cartoesNovoUsuarios').length")==0,'Users blocked initial list'
  page.locator('#ct-search').fill('Principal');assert page.locator('#ct-list article').count()==1
  assert '1.685,00' in page.locator('#ct-list').inner_text();assert '180,00' in page.locator('#ct-list').inner_text()
  page.locator('[data-action="cards"]').first.click();page.wait_for_selector('#ct-detail-content .physical');assert page.locator('#ct-detail-content .physical').count()==2
  assert '100,00' in page.locator('#ct-detail-content').inner_text(),'scheduled payment is missing'
  page.locator('#ct-detail-content [data-action="movements"]').first.click();assert page.evaluate('movementFilters.ID_Cartao')
  page.locator('#ct-search').fill('Viagens');page.locator('[data-action="cards"]').first.click();page.wait_for_selector('#ct-detail-content .physical');assert page.locator('#ct-detail-content .physical').count()==1;assert page.locator('#ct-detail-edit').is_hidden();assert 'Carla teste · titular' not in page.locator('#ct-detail-content').inner_text();page.locator('#ct-detail [data-close]').first.click()
  page.locator('#ct-search').fill('');page.locator('[data-action="new"]').first.click();page.locator('#ct-name').fill('Nova '+kind);page.locator('#ct-limit').fill('2.000,00');page.locator('#ct-closing').select_option('12');page.locator('#ct-due').select_option('19');page.locator('details.option summary').click();page.locator('#ct-person-search').fill('Br');page.wait_for_selector('[name="ct-person"]');page.locator('[name="ct-person"]').first.check();page.locator('#ct-person-search').fill('Ca');page.wait_for_timeout(500);assert page.locator('[name="ct-person"]:checked').count()==1
  if kind=='phone':page.set_viewport_size({'width':844,'height':390});assert page.locator('#ct-name').input_value()=='Nova '+kind;assert page.locator('#ct-root').get_attribute('data-interface')=='phone';page.set_viewport_size(size)
  page.evaluate('failAfterCommit=true');page.locator('#ct-form button[type="submit"]').click();page.wait_for_function("document.querySelector('#ct-form-error').textContent.includes('comunicação')")
  first=page.evaluate("getCalls('cartoesNovoSalvar').at(-1).args[1]");assert page.locator('#ct-name').input_value()=='Nova '+kind
  page.locator('#ct-form button[type="submit"]').click();page.wait_for_function("document.querySelector('#ct-editor').hidden")
  last=page.evaluate("getCalls('cartoesNovoSalvar').at(-1).args[1]");assert first['id']==last['id'] and first['operationId']==last['operationId']
  page.wait_for_function("document.querySelector('#ct-list').textContent.includes('Nova '+"+json.dumps(kind)+")")
  page.locator('#ct-search').fill('Nova '+kind)
  if kind=='phone':page.locator('[data-action="phone-actions"]').click();page.locator('#ct-actions-content [data-action="status"]').click()
  else:page.locator('details.more summary').click();page.locator('details.more [data-action="status"]').click()
  page.wait_for_selector('#ct-toast button');box=page.locator('#ct-toast').bounding_box();assert box['x']>=0 and box['x']+box['width']<=size['width']+1,'toast outside viewport';page.locator('#ct-toast button').click();page.wait_for_timeout(300);page.wait_for_function("document.querySelector('#ct-list article')!==null")
  page.locator('#ct-search').fill('Principal');page.locator('[data-action="invoice"]').first.click();assert page.evaluate('navigation')=='FaturasCartao';assert page.evaluate("JSON.parse(localStorage.getItem('mukirana_fatura_cartao')).Retorno_Tela")=='CartoesNovo'
  page.locator('#ct-search').fill('');page.evaluate("testFilters={Mes_Inicial:'2026-10',Mes_Final:'2026-11'};screenConfig.atualizarPeriodoGlobal()")
  page.wait_for_function("document.querySelector('#ct-period-label')?.textContent.includes('nov')||!document.querySelector('#ct-period-label')")
  page.wait_for_timeout(300);assert page.locator('.meter').count()==0,'Range cannot be compared to one limit'
  page.evaluate("testFilters={Mes_Inicial:'2026-10',Mes_Final:'2026-10'};failForecast=true;screenConfig.atualizarPeriodoGlobal()")
  page.wait_for_function("document.querySelector('#ct-total-planned').textContent==='Indisponível'");assert page.locator('#ct-list article').count()>0
  page.evaluate('failForecast=false;screenConfig.atualizarPeriodoGlobal()');page.wait_for_function("document.querySelector('#ct-total-planned').textContent.includes('R$')")
  if kind in ['desktop','phone']:page.screenshot(path='/workspace/work/cartoes-implementation/'+kind+'-connected.png',full_page=True)
  page.evaluate('window.MukiranaCartoesNovo.destroy()');assert page.evaluate('!window.MukiranaCartoesNovo');assert not errors,errors
  results.append({'interface':kind,'passed':True});context.close()
 # Tela de fatura real com os contratos do PostgreSQL, para conferir os números e o adicional.
 for role in ['owner','additional']:
  context=browser.new_context(viewport={'width':1280,'height':900});context.expose_binding('testBackend',lambda source,data:backend(data));context.add_init_script(bridge.replace('TOKEN',role+'-token')+"localStorage.setItem('mukirana_fatura_cartao',JSON.stringify({ID_Grupo_Cartao:'20000000-2000-4000-8000-200000000001',Mes_Inicial:'2026-10',Mes_Final:'2026-10',Retorno_Tela:'CartoesNovo'}));")
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=frame('Faturas_Cartao_View'),content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.wait_for_function("document.querySelector('#fatura_total').textContent!=='R$ 0,00'")
  if role=='owner':assert '2.125,00' in page.locator('#fatura_total').inner_text();assert '1.685,00' in page.locator('#fatura_em_aberto').inner_text();assert '180,00' in page.locator('#fatura_total_recorrencias').inner_text()
  else:assert '285,00' in page.locator('#fatura_total').inner_text();assert page.locator('#fatura_pago').is_hidden();assert page.locator('[onclick="abrirModalPagamentoFaturaCartao()"]').is_enabled()
  assert not errors,errors;results.append({'invoice':role,'passed':True});context.close()
 browser.close()
print(json.dumps(results,ensure_ascii=False))
