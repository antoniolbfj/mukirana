"""Run from repository root; requires Python Playwright and Chromium. No real credentials/data."""
import re,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path.cwd()
def render(name):
 path=ROOT/(name+'.html')
 if name=='Contas_Nova_Styles':path=ROOT/'Contas_Base_Styles.html'
 elif not path.exists():path=ROOT/'docs/archive/telas-anteriores-v40'/(name+'.html')
 text=path.read_text()
 return re.sub(r"<\?!= incluir_\('([^']+)'\); \?>",lambda m:render(m[1]),text)
html='<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><body>'+render('Contas_Nova_View')+'</body></html>'
bridge=r'''localStorage.setItem('mukirana_token','valid');window.calls=[];window.failSave=false;window.failForecast=false;window.fixture={accounts:[{id:'20000000-2000-4000-8000-200000000002',version:1,name:'Carteira',ownerName:'Teste',ownerId:'10000000-1000-4000-8000-100000000001',canEdit:true,active:true,shared:false,openingAmountCents:'12345',openingDate:'2026-10-01',openingId:'30000000-3000-4000-8000-300000000003',participants:[],currentCents:'12345',registeredForecastCents:'10000'},{id:'20000000-2000-4000-8000-200000000004',version:1,name:'Compartilhada',ownerName:'Outra pessoa',ownerId:'10000000-1000-4000-8000-100000000004',canEdit:false,active:true,shared:true,openingAmountCents:'0',openingDate:'2026-10-01',openingId:null,participants:[],currentCents:'999',registeredForecastCents:'999'}],asOf:'2026-10-24',forecastDate:'2026-10-31',today:'2026-10-24'};window.finalizarCarregamentoTelaMukirana=()=>{};window.registrarTelaAtualMukirana=(n,c)=>{window.screenConfig=c};window.google={script:{get run(){let ok,fail;const proxy=new Proxy({},{get(t,n){if(n==='withSuccessHandler')return f=>{ok=f;return proxy};if(n==='withFailureHandler')return f=>{fail=f;return proxy};return (...a)=>{calls.push({n,a});setTimeout(()=>{try{if(n==='contasNovaListar')return ok(structuredClone(fixture));if(n==='contasNovaPrevisoes'){if(failForecast)throw Error('forecast');return ok({deltas:{}})}if(n==='contasNovaUsuarios')return ok({users:a[1].length>=2?[{id:'10000000-1000-4000-8000-100000000009',name:'Participante teste',email:'teste@example.invalid'}]:[]});if(n==='contasNovaSalvar'){if(failSave)throw Error('Conflito simulado');const q=a[1];const saved={...q,version:q.version+1,name:q.name,ownerName:'Teste',ownerId:'10000000-1000-4000-8000-100000000001',canEdit:true,active:true,currentCents:q.openingAmountCents,registeredForecastCents:q.openingAmountCents,openingId:q.openingAmountCents==='0'?null:'30000000-3000-4000-8000-300000000003'};const i=fixture.accounts.findIndex(x=>x.id===saved.id);if(i<0)fixture.accounts.push(saved);else fixture.accounts[i]=saved;return ok({account:saved})}if(n==='contasNovaStatus'){const q=a[1],saved=fixture.accounts.find(x=>x.id===q.id);saved.active=q.active;saved.version++;return ok({account:structuredClone(saved)})}if(n==='contasNovaMovimentos'){return ok({items:[{id:'30000000-3000-4000-8000-300000000003',date:'2026-10-01',description:'Saldo Inicial da Conta Carteira',type:'Saldo Inicial',amountCents:'12345',opening:true,key:'l:30000000-3000-4000-8000-300000000003'}],nextCursor:null})}throw Error(n)}catch(e){fail(e)}},10)}}});return proxy}}};'''
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for kind,viewport,ua,touch in [
 ('desktop',{'width':1440,'height':1000},None,False),
 ('phone',{'width':390,'height':844},'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',True),
 ('tablet',{'width':820,'height':1180},'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',True)]:
  opts={'viewport':viewport,'has_touch':touch};
  if ua:opts['user_agent']=ua
  context=browser.new_context(**opts);context.add_init_script(bridge)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://mukirana.test/**',lambda route:route.fulfill(body=html,content_type='text/html; charset=utf-8'))
  page.goto('https://mukirana.test/');page.wait_for_selector('#cn-account-list article');page.wait_for_function("document.querySelector('#cn-total-forecast').textContent.includes('R$')")
  assert page.locator('#cn-root').get_attribute('data-interface')==('phone' if kind=='phone' else 'large')
  assert page.locator('#cn-account-list article').count()==2
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),kind+' overflow'
  page.locator('#cn-search').fill('Carteira');assert page.locator('#cn-account-list article').count()==1;page.locator('#cn-search').fill('')
  page.locator('#cn-new-account').click();page.locator('#cn-account-name').fill('Nova teste');page.locator('#cn-has-opening').check();page.locator('#cn-opening-amount').fill('45,67');page.locator('[data-sign="-1"]').click()
  if kind=='phone':
   page.set_viewport_size({'width':844,'height':390});assert page.locator('#cn-account-name').input_value()=='Nova teste';assert page.locator('#cn-root').get_attribute('data-interface')=='phone';page.set_viewport_size(viewport)
  page.evaluate('failSave=true');page.locator('#cn-save-account').click();page.wait_for_function("document.querySelector('#cn-form-error').textContent.includes('Conflito')")
  assert page.locator('#cn-account-name').input_value()=='Nova teste'
  req1=page.evaluate("calls.filter(c=>c.n==='contasNovaSalvar').at(-1).a[1]")
  page.evaluate('failSave=false');page.locator('#cn-save-account').click();page.wait_for_function("document.querySelector('#cn-editor-overlay').hidden")
  req2=page.evaluate("calls.filter(c=>c.n==='contasNovaSalvar').at(-1).a[1]");assert req1['operationId']==req2['operationId'];assert req2['openingAmountCents']=='-4567';assert req1['id']==req2['id']
  page.wait_for_function("document.querySelector('#cn-account-list').textContent.includes('Nova teste')")
  if kind=='phone':page.locator('[data-action="phone-actions"]').first.click();page.locator('#cn-phone-account-actions [data-action="ledger"]').click()
  else:page.locator('[data-action="ledger"]').first.click()
  page.wait_for_selector('#cn-ledger-events .ledger-row');assert 'Saldo inicial' in page.locator('#cn-ledger-events').inner_text();page.locator('#cn-ledger-overlay [data-close]').first.click()
  page.locator('#cn-new-account').click();page.locator('#cn-shared').check();page.locator('#cn-user-search').fill('te');page.wait_for_selector('[name="cn-participant"]');page.locator('[name="cn-participant"]').check();page.locator('#cn-user-search').fill('zz');page.wait_for_timeout(400);assert page.locator('[name="cn-participant"]').is_checked();page.locator('#cn-editor-overlay [data-close]').first.click()
  if kind=='phone':page.locator('[data-action="phone-actions"]').first.click();page.locator('#cn-phone-account-actions [data-action="status"]').click()
  else:page.locator('details.more').first.locator('summary').click();page.locator('details.more').first.locator('[data-action="status"]').click()
  page.wait_for_selector('#cn-toast button');page.locator('#cn-toast button').click();page.wait_for_timeout(150)
  assert all(c['a'][0]=='valid' for c in page.evaluate('calls'))
  if kind=='desktop':page.screenshot(path='/workspace/work/contas-implementation/desktop-real.png',full_page=True)
  if kind=='phone':page.screenshot(path='/workspace/work/contas-implementation/phone-real.png',full_page=True)
  page.evaluate('window.MukiranaContasNova.destroy()');assert page.evaluate('!window.MukiranaContasNova');assert not errors,errors
  results.append({'interface':kind,'passed':True});context.close()
 browser.close()
print(json.dumps(results,ensure_ascii=False))
