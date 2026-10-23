"""Transferências com ponte Apps Script simulada; regras SQL são testadas em PostgreSQL."""
import asyncio,json,uuid,datetime
from pathlib import Path
from playwright.async_api import async_playwright,expect
import browser_test as base
transfers=[];fail_list=False;conflict_save=False;expired=False;save_response_lost=False
original_account_dto=base.account_dto

def account_dto(a,end=None):
 result=original_account_dto(a,end)
 def effect(end):
  return sum((-t['amountCents'] if t['sourceAccountId']==a['id'] else t['amountCents']) for t in transfers if a['id'] in [t['sourceAccountId'],t['destinationAccountId']] and (end is None or t['date']<=end))
 result['balanceCents']=str(int(result['balanceCents'])+effect(base.TODAY));result['projectedCents']=str(int(result['projectedCents'])+effect(end));return result
base.account_dto=account_dto
async def api(req):
 global fail_list,conflict_save,save_response_lost
 if not req['action'].startswith('transfers.'):
  if req['action']=='accounts.delete' and any(req['id'] in [t['sourceAccountId'],t['destinationAccountId']] for t in transfers):return {'status':'linked'}
  return await base.api(req)
 base.calls.append(req['action']);await asyncio.sleep(.05)
 if expired or req.get('token')!=base.TOKEN:return {'status':'invalid_session'}
 action=req['action']
 if action=='transfers.list':
  if fail_list:fail_list=False;return {'status':'unavailable'}
  f=req['filter'];result=[dict(t) for t in transfers if (not f['startDate'] or t['date']>=f['startDate']) and (not f['endDate'] or t['date']<=f['endDate']) and (not f['accountId'] or f['accountId'] in [t['sourceAccountId'],t['destinationAccountId']]) and f['query'].lower() in t['description'].lower()]
  result.sort(key=lambda e:(e['date'],e['id']),reverse=True);summary={'count':len(result),'amountCents':str(sum(t['amountCents'] for t in result))}
  if f['cursorDate']:result=[e for e in result if (e['date'],e['id'])<(f['cursorDate'],f['cursorId'])]
  return {'status':'ok','entries':result[:f['limit']],'summary':summary,'hasMore':len(result)>f['limit'],'accounts':[account_dto(a,f['endDate']) for a in base.accounts],'today':base.TODAY}
 if action=='transfers.save':
  if conflict_save:conflict_save=False;return {'status':'conflict'}
  e=dict(req['entry']);old=next((t for t in transfers if t['id']==e['id']),None)
  if old and old['version']==e['version']+1 and all(old[k]==v for k,v in e.items() if k!='version'):return {'status':'saved','entry':dict(old)}
  if old and old['version']!=e['version']:return {'status':'conflict'}
  e['version']+=1
  if old:transfers.remove(old)
  transfers.append(e)
  if save_response_lost:save_response_lost=False;raise RuntimeError('simulated lost response')
  return {'status':'saved','entry':dict(e)}
 if action=='transfers.delete':
  old=next((t for t in transfers if t['id']==req['id']),None)
  if not old:return {'status':'not_found'}
  if old['version']!=req['version']:return {'status':'conflict'}
  transfers.remove(old);return {'status':'deleted'}
 raise RuntimeError(action)
async def main():
 global fail_list,conflict_save,expired,save_response_lost
 checks=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1440,'height':1050});page.on('pageerror',lambda e:errors.append(str(e)))
  await page.expose_function('mockApi',api);await page.add_init_script(base.INIT)
  tr=lambda id:page.locator('#transfers-view #'+id)
  tx=lambda id:page.locator('#transactions-view #'+id)
  ac=lambda id:page.locator('#accounts-view #'+id)
  async def ready():await expect(tr('new-transfer')).to_be_enabled()
  async def save():await tr('save-entry').click();await expect(tr('editor')).not_to_be_visible();await ready()
  async def new(description,amount,source,destination,date=base.TODAY):
   await tr('new-transfer').click();await tr('description').fill(description);await tr('amount').fill(amount);await tr('date').fill(date);await tr('source').select_option(source);await tr('destination').select_option(destination);await save()
   return next(t['id'] for t in transfers if t['description']==description)
  async def row(id):return page.locator(f'#transfers-view [data-entry-id="{id}"]')
  await page.goto(base.URL);await expect(page.locator('#home-view')).to_be_visible();await page.locator('#open-transfers').click();await ready();await expect(tr('entry-list')).to_contain_text('Suas contas em movimento.');checks.append('consulta vazia e entrada pelo menu principal')
  await tr('new-transfer').click();await tr('description').fill('Aporte na reserva');await tr('amount').fill('100,01');await tr('save-entry').click();await expect(tr('source-error')).to_be_visible();await expect(tr('destination-error')).to_be_visible()
  await tr('quick-source').click();await tr('quick-name').fill('Conta principal');await tr('quick-save').click();await expect(tr('quick')).not_to_be_visible();a=base.accounts[0]['id']
  await tr('quick-destination').click();await tr('quick-name').fill('Reserva');await tr('quick-type').select_option('investment');await tr('quick-save').click();await expect(tr('quick')).not_to_be_visible();b=base.accounts[1]['id']
  assert await tr('description').input_value()=='Aporte na reserva' and await tr('amount').input_value()=='100,01' and await tr('source').input_value()==a and await tr('destination').input_value()==b
  await save();first=transfers[0]['id'];assert transfers[0]['amountCents']==10001;await expect(tr('amount-total')).to_contain_text('100,01');await expect(tr('count-total')).to_have_text('1');checks.append('criação rápida de origem e destino preserva o formulário')
  await tr('account-filter').select_option(a);await ready();await expect(tr('account-balance')).to_contain_text('−R$');await expect(tr('account-balance')).to_contain_text('100,01')
  await tr('account-filter').select_option(b);await ready();await expect(tr('account-balance')).to_contain_text('100,01');assert await page.locator('#transfers-view [data-entry-id]').count()==1;checks.append('saída e entrada em contas distintas, filtro das duas pontas')
  await tr('new-transfer').click();await tr('description').fill('Inválida');await tr('amount').fill('0');await tr('source').select_option(a);await tr('destination').select_option(a);before=base.calls.count('transfers.save');await tr('save-entry').click();await expect(tr('amount-error')).to_be_visible();await tr('amount').fill('1,00');await tr('save-entry').click();await expect(tr('destination-error')).to_contain_text('diferentes');assert base.calls.count('transfers.save')==before;await tr('cancel-editor').click();await tr('confirm-accept').click();checks.append('valor positivo e contas diferentes antes do envio')
  await tr('tr-transactions').click();await expect(tx('new-expense')).to_be_enabled();await expect(tx('income-total')).to_contain_text('0,00');await expect(tx('expense-total')).to_contain_text('0,00');await tx('account-filter').select_option(a);await expect(tx('account-balance')).to_contain_text('100,01');await tx('tx-transfers').click();await ready();checks.append('saldos integrados sem receitas nem despesas adicionais')
  await tr('account-filter').select_option('');await ready();future=await new('Aporte futuro','20,00',a,b,base.FUTURE);await expect(tr('toast-action')).to_be_visible();await tr('toast-action').click();await ready();await expect(tr('entry-list')).to_contain_text('Previsto');await tr('account-filter').select_option(a);await ready();await expect(tr('account-balance')).to_contain_text('100,01');await expect(tr('account-balance')).to_contain_text('120,01');checks.append('transferência futura altera apenas projeção e oferece ver mês')
  period=await tr('start-date').input_value();await tr('tr-transactions').click();await expect(tx('new-expense')).to_be_enabled();assert await tx('start-date').input_value()==period;await tx('tx-transfers').click();await ready();assert await tr('start-date').input_value()==period;checks.append('filtro temporal global compartilhado entre módulos')
  await tr('period-preset').select_option('all');await ready();await tr('account-filter').select_option('');await ready();await (await row(first)).get_by_role('button',name='Editar Aporte na reserva',exact=True).click();await tr('source').select_option(b);await tr('destination').select_option(a);await tr('amount').fill('50,02');await save();assert next(t for t in transfers if t['id']==first)['version']==2;assert int(account_dto(base.accounts[0])['balanceCents'])==5002;checks.append('editar valor e inverter contas recalcula os dois lados')
  conflict_save=True;await (await row(first)).get_by_role('button',name='Editar Aporte na reserva',exact=True).click();await tr('description').fill('Conflito preservado');await tr('save-entry').click();await expect(tr('form-error')).to_contain_text('outro acesso');await expect(tr('description')).to_have_value('Conflito preservado');await tr('review').click();await ready();checks.append('conflito mantém rascunho e oferece recarregar')
  save_response_lost=True;await tr('new-transfer').click();await tr('description').fill('Resposta perdida');await tr('amount').fill('1,23');await tr('source').select_option(a);await tr('destination').select_option(b);await tr('save-entry').click();await expect(tr('form-error')).to_contain_text('não pôde ser confirmada');await tr('save-entry').click();await expect(tr('editor')).not_to_be_visible();await ready();assert sum(t['description']=='Resposta perdida' for t in transfers)==1;checks.append('repetição após resposta perdida mantém ID e não duplica')
  await tr('tr-accounts').click();await page.get_by_role('button',name='Ver conta Reserva',exact=True).click();await ac('delete-account').click();await ac('dialog-confirm').click();await expect(ac('confirmation-title')).to_have_text('Esta conta possui movimentações.');await ac('dialog-confirm').click();await expect(ac('account-name')).to_be_visible();await ac('cancel-form').click();await ac('accounts-transfers').click();await ready();checks.append('conta vinculada é protegida e oferece renomeação')
  await tr('tr-categories').click();await expect(page.locator('#categories-view #new-category')).to_be_enabled();await page.locator('#categories-view #categories-transfers').click();await ready();checks.append('navegação integrada a categorias')
  fail_list=True;await tr('reload').click();await expect(tr('entry-list').get_by_role('button',name='Tentar novamente')).to_be_visible();await expect(tr('new-transfer')).to_be_disabled();await tr('entry-list').get_by_role('button',name='Tentar novamente').click();await ready();checks.append('falha de leitura mostra erro e permite tentar novamente')
  await (await row(first)).get_by_role('button',name='Excluir Aporte na reserva',exact=True).click();await expect(tr('confirm-description')).to_contain_text('removidas juntas');await tr('confirm-accept').click();await ready();assert not any(t['id']==first for t in transfers);checks.append('exclusão da operação completa com confirmação')
  for n in range(55):transfers.append({'id':str(uuid.uuid4()),'version':1,'description':f'Histórico {n:02d}','amountCents':1,'date':base.TODAY,'sourceAccountId':a,'destinationAccountId':b})
  await tr('reload').click();await ready();await expect(tr('more')).to_be_visible();await tr('more').click();await ready();assert await page.locator('#transfers-view [data-entry-id]').count()==57;checks.append('paginação sem duplicidade com total integral')
  await page.screenshot(path=str(base.OUT/'transfers-desktop.png'),full_page=False)
  expired=True;await tr('reload').click();await expect(page.locator('#email-view')).to_be_visible();assert await tr('description').input_value()=='';assert not await tr('entry-list').locator('[data-entry-id]').count();assert await page.evaluate('localStorage.getItem("mukirana.session")') is None;checks.append('sessão expirada limpa registros, formulário e sessão')
  expired=False
  mobile=await browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:errors.append(str(e)));await mobile.expose_function('mockApi',api);await mobile.add_init_script(base.INIT);await mobile.goto(base.URL);await expect(mobile.locator('#home-view')).to_be_visible();await mobile.locator('#open-transfers').click();await expect(mobile.locator('#transfers-view #new-transfer')).to_be_enabled();await mobile.locator('#transfers-view #theme').select_option('dark');await mobile.locator('#transfers-view #new-transfer').click();await mobile.locator('#transfers-view #description').fill('No celular');await mobile.locator('#transfers-view #date').fill(base.FUTURE);await expect(mobile.locator('#transfers-view #future-note')).to_be_visible();assert await mobile.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth');await mobile.screenshot(path=str(base.OUT/'transfers-mobile.png'),full_page=False);await mobile.keyboard.press('Escape');await expect(mobile.locator('#transfers-view #confirm')).to_be_visible();await mobile.locator('#transfers-view #confirm-cancel').click();await expect(mobile.locator('#transfers-view #editor')).to_be_visible();checks.append('celular, tema, data futura e descarte seguro')
  assert not errors,errors;print(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2));await browser.close()
 base.server.shutdown()
if __name__=='__main__':asyncio.run(main())
