"""Fluxos de navegador com ponte Apps Script simulada; SQL real é verificado separadamente."""
import asyncio,json,threading,uuid,datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.async_api import async_playwright,expect
from render_preview import render,OUT
OUT.mkdir(parents=True,exist_ok=True);(OUT/'index.html').write_text(render())
TODAY=datetime.datetime.now(ZoneInfo('America/Sao_Paulo')).date().isoformat()
FUTURE=(datetime.date.fromisoformat(TODAY)+datetime.timedelta(days=60)).isoformat()
TOKEN='b'*64;USER=str(uuid.uuid4());accounts=[];categories=[];entries=[];calls=[]
fail_list=False;conflict_save=False;expired=False

def account_dto(a,end=None):
 def total(end):return str(sum((e['amountCents'] if e['nature']=='income' else -e['amountCents']) for e in entries if e['accountId']==a['id'] and (end is None or e['date']<=end)))
 return {**a,'balanceCents':total(TODAY),'projectedCents':total(end)}
def category_dto(c):return {**c,'linkedCount':sum(e['categoryId']==c['id'] for e in entries)}
def options():return [account_dto(a) for a in accounts],[category_dto(c) for c in categories if not c['systemKey'] or category_dto(c)['linkedCount']]
async def api(req):
 global fail_list,conflict_save
 calls.append(req['action']);await asyncio.sleep(.05)
 action=req['action']
 if expired or req.get('token')!=TOKEN:return {'status':'invalid_session'}
 if action=='auth.resolve':return {'status':'authenticated','user':{'id':USER,'email':'browser-check@example.invalid'},'expiresAt':'2027-01-01T00:00:00Z'}
 if action=='auth.logout':return {'status':'logged_out'}
 if action=='accounts.list':return {'status':'ok','accounts':[account_dto(a) for a in accounts]}
 if action=='accounts.save':
  a=dict(req['account']);old=next((x for x in accounts if x['id']==a['id']),None)
  a.pop('confirmTypeChange',None);a['version']+=1
  if old:accounts.remove(old)
  accounts.append(a)
  opening=next((x for x in entries if x['accountId']==a['id'] and x['kind']=='opening_balance'),None)
  if a['initialCents'] is None:
   if opening:entries.remove(opening)
  else:
   cat=next((c for c in categories if c['systemKey']=='opening_balance'),None)
   if not cat:
    cat={'id':str(uuid.uuid4()),'name':'Saldo inicial','parentId':None,'version':1,'systemKey':'opening_balance'};categories.append(cat)
   if opening:entries.remove(opening)
   entries.append({'id':opening['id'] if opening else str(uuid.uuid4()),'version':opening['version']+1 if opening else 1,'kind':'opening_balance','nature':'expense' if a['initialCents']<0 else 'income','description':'Saldo inicial','amountCents':abs(a['initialCents']),'date':a['openingDate'],'accountId':a['id'],'categoryId':cat['id'],'classification':'variable','modality':'single'})
  return {'status':'saved','account':account_dto(a)}
 if action=='accounts.delete':
  if any(e['accountId']==req['id'] for e in entries):return {'status':'linked'}
  accounts[:]=[a for a in accounts if a['id']!=req['id']];return {'status':'deleted'}
 if action=='categories.list':return {'status':'ok','categories':options()[1],'deletionAvailable':True}
 if action=='categories.save':
  c=dict(req['category']);old=next((x for x in categories if x['id']==c['id']),None)
  if any(x['id']!=c['id'] and bool(x['parentId'])==bool(c['parentId']) and x['name'].lower()==c['name'].lower() for x in categories):return {'status':'duplicate'}
  if c['name'].lower() in ['saldo inicial','aguardando categorização']:return {'status':'reserved_name'}
  c.update(version=c['version']+1,systemKey=None)
  if old:categories.remove(old)
  categories.append(c);return {'status':'saved','category':category_dto(c)}
 if action=='categories.delete':
  if any(e['categoryId']==req['id'] for e in entries):return {'status':'linked'}
  if any(c['parentId']==req['id'] for c in categories):return {'status':'has_children'}
  categories[:]=[c for c in categories if c['id']!=req['id']];return {'status':'deleted'}
 if action=='transactions.list':
  if fail_list:fail_list=False;return {'status':'unavailable'}
  f=req['filter'];selected={f['categoryId']} if f['categoryId'] else set()
  for _ in categories:selected.update(c['id'] for c in categories if c['parentId'] in selected)
  result=[dict(e) for e in entries if (not f['startDate'] or e['date']>=f['startDate']) and (not f['endDate'] or e['date']<=f['endDate']) and (not f['nature'] or e['nature']==f['nature']) and (not f['accountId'] or e['accountId']==f['accountId']) and (not f['categoryId'] or e['categoryId'] in selected) and (not f['classification'] or e['classification']==f['classification']) and f['query'].lower() in e['description'].lower()]
  result.sort(key=lambda e:(e['date'],e['id']),reverse=True)
  income=sum(e['amountCents'] for e in result if e['nature']=='income');expense=sum(e['amountCents'] for e in result if e['nature']=='expense')
  summary={'count':len(result),'incomeCents':str(income),'expenseCents':str(expense),'resultCents':str(income-expense)}
  if f['cursorDate']:result=[e for e in result if (e['date'],e['id'])<(f['cursorDate'],f['cursorId'])]
  return {'status':'ok','entries':result[:f['limit']],'summary':summary,'hasMore':len(result)>f['limit'],'accounts':[account_dto(a,f['endDate']) for a in accounts],'categories':options()[1],'today':TODAY}
 if action=='transactions.save':
  if conflict_save:conflict_save=False;return {'status':'conflict'}
  e=dict(req['entry']);old=next((x for x in entries if x['id']==e['id']),None)
  e.update(version=e['version']+1,kind='standard')
  if old:entries.remove(old)
  entries.append(e);return {'status':'saved','entry':dict(e)}
 if action=='transactions.delete':
  old=next((e for e in entries if e['id']==req['id']),None)
  if not old:return {'status':'not_found'}
  if old['kind']=='opening_balance':
   a=next(a for a in accounts if a['id']==old['accountId']);a.update(initialCents=None,openingDate=None,version=a['version']+1)
  entries.remove(old);return {'status':'deleted'}
 raise RuntimeError(action)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(OUT)));threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/index.html'
INIT='localStorage.setItem("mukirana.session",'+json.dumps(TOKEN)+''');window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return {api(request){window.mockApi(request).then(success,failure)}}}}}}}};'''
async def main():
 global fail_list,conflict_save,expired
 checks=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1440,'height':1050});page.on('pageerror',lambda e:errors.append(str(e)))
  await page.expose_function('mockApi',api);await page.add_init_script(INIT)
  tx=lambda id:page.locator('#transactions-view #'+id)
  ac=lambda id:page.locator('#accounts-view #'+id)
  cat=lambda id:page.locator('#categories-view #'+id)
  async def ready():await expect(tx('new-expense')).to_be_enabled()
  async def create(nature,description,amount,date=TODAY,category=None):
   await tx('new-'+nature).click();await tx('description').fill(description);await tx('amount').fill(amount);await tx('date').fill(date)
   if category:await tx('category').select_option(category)
   await tx('save-entry').click();await expect(tx('editor')).not_to_be_visible();await ready()
   return next(e['id'] for e in entries if e['description']==description)
  await page.goto(URL);await expect(page.locator('#home-view')).to_be_visible();await page.locator('#open-transactions').click();await ready()
  await expect(tx('entry-list')).to_contain_text('Um registro de cada vez.');checks.append('consulta vazia e navegação')
  await tx('new-expense').click();await tx('description').fill('Energia');await tx('amount').fill('123,45');await tx('date').fill(TODAY);await page.locator('#transactions-view input[name=classification][value=fixed]').check()
  await tx('quick-account').click();await tx('quick-name').fill('Conta principal');await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible()
  assert await tx('description').input_value()=='Energia' and await tx('amount').input_value()=='123,45' and await tx('date').input_value()==TODAY
  account=accounts[0]['id'];assert await tx('account').input_value()==account;checks.append('criação rápida de conta preserva formulário')
  await tx('quick-category').click();await tx('quick-name').fill('Moradia');await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible();root=next(c['id'] for c in categories if c['name']=='Moradia')
  await tx('quick-category').click();await tx('quick-name').fill('Energia elétrica');await tx('quick-parent').select_option(root);await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible();child=next(c['id'] for c in categories if c['name']=='Energia elétrica')
  assert await tx('category').input_value()==child and await tx('account').input_value()==account and await tx('amount').input_value()=='123,45';checks.append('criação rápida de categoria e subcategoria em seletor único')
  await tx('save-entry').click();await expect(tx('editor')).not_to_be_visible();await ready();energy=next(e['id'] for e in entries if e['description']=='Energia');assert next(e for e in entries if e['id']==energy)['classification']=='fixed';checks.append('despesa fixa única em centavos')
  salary=await create('income','Salário','1.000,00',category=root);assert next(e for e in entries if e['id']==salary)['amountCents']==100000
  await tx('account-filter').select_option(account);await ready();await expect(tx('account-balance')).to_contain_text('876,55');checks.append('receita e saldo atual derivado')
  future=await create('expense','Aluguel futuro','200,00',FUTURE,root)
  await expect(tx('toast-action')).to_be_visible();await tx('toast-action').click();await ready();await expect(tx('entry-list')).to_contain_text('Previsto');await expect(tx('account-balance')).to_contain_text('876,55');await expect(tx('account-balance')).to_contain_text('676,55');checks.append('futuro, projeção acumulada e resultado do período distintos')
  await tx('period-preset').select_option('current');await ready();await page.locator(f'#transactions-view [data-entry-id="{energy}"]').get_by_role('button',name='Editar Energia',exact=True).click();await tx('amount').fill('124,45');await tx('save-entry').click();await expect(tx('editor')).not_to_be_visible();await ready();assert next(e for e in entries if e['id']==energy)['version']==2;checks.append('edição mantém identidade e atualiza valor')
  conflict_save=True;await page.locator(f'#transactions-view [data-entry-id="{salary}"]').get_by_role('button',name='Editar Salário',exact=True).click();await tx('description').fill('Alteração concorrente');await tx('save-entry').click();await expect(tx('form-error')).to_contain_text('outro acesso');await expect(tx('description')).to_have_value('Alteração concorrente');await tx('review').click();await ready();checks.append('conflito preserva rascunho e exige recarga explícita')
  await page.locator(f'#transactions-view [data-entry-id="{energy}"]').get_by_role('button',name='Excluir Energia',exact=True).click();await tx('confirm-accept').click();await ready();assert not any(e['id']==energy for e in entries);checks.append('exclusão confirmada e recálculo')
  await tx('tx-accounts').click();await expect(page.locator('#accounts-view')).to_be_visible();await page.get_by_role('button',name='Ver conta Conta principal',exact=True).click();await expect(ac('detail-amount')).to_contain_text('1.000,00')
  await ac('delete-account').click();await ac('dialog-confirm').click();await expect(ac('confirmation-title')).to_have_text('Esta conta possui movimentações.');await ac('dialog-confirm').click();await expect(ac('account-name')).to_be_visible();checks.append('conta com lançamentos bloqueada e renomeação oferecida')
  await ac('initial-amount').fill('50,00');await expect(ac('opening-date-field')).to_be_visible();await ac('opening-date').fill(TODAY);await ac('save-account').click();await expect(ac('account-form')).not_to_be_visible();assert accounts[0]['initialCents']==5000;checks.append('saldo inicial cadastrado com data')
  await ac('accounts-transactions').click();await ready();opening=next(e for e in entries if e['kind']=='opening_balance');await expect(tx('income-total')).to_contain_text('1.050,00')
  await tx('new-expense').click();assert await tx('category').locator('option',has_text='Saldo inicial').count()==0
  await tx('amount').fill('0');await tx('category').select_option(root);await tx('description').fill('Teste');await tx('save-entry').click();await expect(tx('amount-error')).to_contain_text('positivo');await tx('cancel-editor').click();await expect(tx('confirm')).to_be_visible();await tx('confirm-accept').click();checks.append('classificação automática oculta da seleção e valor positivo obrigatório')
  await page.locator(f'#transactions-view [data-entry-id="{opening["id"]}"]').get_by_role('button',name='Editar saldo inicial de Conta principal').click();await expect(ac('initial-amount')).to_have_value('50,00');await ac('cancel-form').click();await ac('accounts-transactions').click();await ready();checks.append('edição de saldo inicial direcionada ao cadastro')
  await page.locator(f'#transactions-view [data-entry-id="{opening["id"]}"]').get_by_role('button',name='Excluir Saldo inicial',exact=True).click();await expect(tx('confirm-description')).to_contain_text('cadastro da conta');await tx('confirm-accept').click();await ready();assert accounts[0]['initialCents'] is None and len(accounts)==1;checks.append('exclusão de saldo inicial limpa cadastro e preserva conta')
  await tx('tx-categories').click();await expect(cat('new-category')).to_be_enabled();row=page.locator(f'#categories-view [data-category-id="{root}"]');await row.locator('summary').click();await row.get_by_role('button',name='Excluir',exact=True).click();await expect(cat('delete-description')).to_contain_text('não pode ser excluída');await cat('cancel-delete').click();await cat('categories-transactions').click();await ready();checks.append('categorias com lançamentos protegidas')
  fail_list=True;await tx('reload').click();await expect(tx('entry-list').get_by_role('button',name='Tentar novamente')).to_be_visible();await expect(tx('new-expense')).to_be_disabled();await tx('entry-list').get_by_role('button',name='Tentar novamente').click();await ready();checks.append('erro de rede não aparenta lista vazia')
  await tx('start-date').fill('2026-12-31');await tx('end-date').fill('2026-01-01');await tx('apply-period').click();await expect(tx('period-error')).to_be_visible();await tx('period-preset').select_option('current');await ready();checks.append('período inválido recusado')
  for n in range(65):entries.append({'id':str(uuid.uuid4()),'version':1,'kind':'standard','nature':'expense','description':f'Registro {n:02d}','amountCents':1,'date':TODAY,'accountId':account,'categoryId':root,'classification':'variable','modality':'single'})
  await tx('reload').click();await ready();await expect(tx('more')).to_be_visible();await tx('more').click();await ready();assert await page.locator('#transactions-view [data-entry-id]').count()==66;assert len(set(await page.locator('#transactions-view [data-entry-id]').evaluate_all('(rows)=>rows.map(row=>row.dataset.entryId)')))==66;checks.append('paginação sem duplicidade e totais integrais')
  await page.screenshot(path=str(OUT/'desktop.png'),full_page=False)
  expired=True;await tx('reload').click();await expect(page.locator('#email-view')).to_be_visible();assert await tx('entry-list').evaluate('(el)=>!el.textContent.includes("Salário")');assert await tx('description').input_value()=='';assert await page.evaluate('localStorage.getItem("mukirana.session")') is None;checks.append('sessão expirada limpa sessão e dados privados')
  expired=False
  mobile=await browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:errors.append(str(e)));await mobile.expose_function('mockApi',api);await mobile.add_init_script(INIT);await mobile.goto(URL);await expect(mobile.locator('#home-view')).to_be_visible();await mobile.locator('#open-transactions').click();await expect(mobile.locator('#transactions-view #new-expense')).to_be_enabled();await mobile.locator('#transactions-view #theme').select_option('dark');await mobile.screenshot(path=str(OUT/'mobile-list-dark.png'),full_page=False)
  await mobile.locator('#transactions-view #new-expense').click();await mobile.locator('#transactions-view #description').fill('Despesa futura no celular');await mobile.locator('#transactions-view #date').fill(FUTURE);await expect(mobile.locator('#transactions-view #future-note')).to_be_visible();assert await mobile.locator('#transactions-view #editor').evaluate('(el)=>el.getBoundingClientRect().width')>=388;assert await mobile.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'), await mobile.evaluate('''() => [...document.querySelector("#transactions-view").shadowRoot.querySelectorAll("*")].filter(el => {const r=el.getBoundingClientRect();return r.width && r.right>390.5;}).map(el=>({tag:el.tagName,id:el.id,class:el.className,right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width)})).slice(0,25)''');await mobile.screenshot(path=str(OUT/'mobile-form-dark.png'),full_page=False)
  await mobile.keyboard.press('Escape');await expect(mobile.locator('#transactions-view #confirm')).to_be_visible();await mobile.locator('#transactions-view #confirm-cancel').click();await expect(mobile.locator('#transactions-view #editor')).to_be_visible();checks.append('celular, tema escuro, teclado e confirmação de descarte')
  assert not errors,errors
  print(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors,'apiCalls':len(calls)},ensure_ascii=False,indent=2));await browser.close()
 server.shutdown()
asyncio.run(main())
