"""Transferência como tipo de lançamento, na lista e no formulário comuns."""
import asyncio,json,uuid,datetime
from pathlib import Path
from playwright.async_api import async_playwright,expect
import browser_test as base
transfers=[];fail_list=False;conflict_save=False;expired=False;save_response_lost=False
original_account_dto=base.account_dto

def account_dto(a,end=None):
 result=original_account_dto(a,end)
 def effect(end):return sum((-t['amountCents'] if t['sourceAccountId']==a['id'] else t['amountCents']) for t in transfers if a['id'] in [t['sourceAccountId'],t['destinationAccountId']] and (end is None or t['date']<=end))
 result['balanceCents']=str(int(result['balanceCents'])+effect(base.TODAY));result['projectedCents']=str(int(result['projectedCents'])+effect(end));return result
base.account_dto=account_dto
async def api(req):
 global fail_list,conflict_save,save_response_lost
 action=req['action']
 if expired:return {'status':'invalid_session'}
 if action=='accounts.delete' and any(req['id'] in [t['sourceAccountId'],t['destinationAccountId']] for t in transfers):return {'status':'linked'}
 if action=='transactions.list':
  if fail_list:fail_list=False;return {'status':'unavailable'}
  f=req['filter'];only=f['nature']=='transfer';cursor=f.get('cursor') or {'standard':None,'transfer':None}
  regular=await base.api({**req,'filter':{**f,'nature':None if only else f['nature']}})
  if regular['status']!='ok':return regular
  if only:regular.update(entries=[],hasMore=False,summary={'count':0,'incomeCents':'0','expenseCents':'0','resultCents':'0'})
  result=[]
  if (not f['nature'] or only) and not f['categoryId'] and not f['classification']:
   result=[{**t,'kind':'transfer','nature':'transfer'} for t in transfers if (not f['startDate'] or t['date']>=f['startDate']) and (not f['endDate'] or t['date']<=f['endDate']) and (not f['accountId'] or f['accountId'] in [t['sourceAccountId'],t['destinationAccountId']]) and f['query'].lower() in t['description'].lower()]
  count=len(result);result.sort(key=lambda e:(e['date'],e['id']),reverse=True)
  if cursor.get('transfer'):result=[e for e in result if (e['date'],e['id'])<(cursor['transfer']['date'],cursor['transfer']['id'])]
  more=len(result)>f['limit'];all_rows=regular['entries']+result[:f['limit']];all_rows.sort(key=lambda e:e['kind']);all_rows.sort(key=lambda e:(e['date'],e['id']),reverse=True)
  page=all_rows[:f['limit']];next_cursor=dict(cursor)
  for e in page:next_cursor['transfer' if e['kind']=='transfer' else 'standard']={'date':e['date'],'id':e['id']}
  return {**regular,'entries':page,'summary':{**regular['summary'],'count':regular['summary']['count']+count},'hasMore':regular['hasMore'] or more or len(all_rows)>f['limit'],'nextCursor':next_cursor}
 if action=='transactions.save' and req['entry']['nature']=='transfer':
  base.calls.append(action);await asyncio.sleep(.05)
  if conflict_save:conflict_save=False;return {'status':'conflict'}
  e=dict(req['entry']);old=next((t for t in transfers if t['id']==e['id']),None)
  if old and old['version']==e['version']+1 and all(old[k]==v for k,v in e.items() if k!='version'):return {'status':'saved','entry':dict(old)}
  if old and old['version']!=e['version']:return {'status':'conflict'}
  e['version']+=1
  if old:transfers.remove(old)
  transfers.append(e)
  if save_response_lost:save_response_lost=False;raise RuntimeError('simulated lost response')
  return {'status':'saved','entry':{**e,'kind':'transfer','nature':'transfer'}}
 if action=='transactions.delete' and req.get('kind')=='transfer':
  old=next((t for t in transfers if t['id']==req['id']),None)
  if not old:return {'status':'not_found'}
  if old['version']!=req['version']:return {'status':'conflict'}
  transfers.remove(old);return {'status':'deleted'}
 return await base.api(req)
async def main():
 global fail_list,conflict_save,expired,save_response_lost
 checks=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1440,'height':1050});page.on('pageerror',lambda e:errors.append(str(e)));await page.expose_function('mockApi',api);await page.add_init_script(base.INIT)
  tx=lambda id:page.locator('#transactions-view #'+id)
  ac=lambda id:page.locator('#accounts-view #'+id)
  async def ready():await expect(tx('new-transfer')).to_be_enabled()
  async def save():await tx('save-entry').click();await expect(tx('editor')).not_to_be_visible();await ready()
  def row(id,kind='transfer'):return page.locator(f'#transactions-view [data-entry-id="{id}"][data-entry-kind="{kind}"]')
  async def new(description,amount,source,destination,date=base.TODAY):
   await tx('new-transfer').click();await tx('description').fill(description);await tx('amount').fill(amount);await tx('date').fill(date);await tx('account').select_option(source);await tx('destination').select_option(destination);await save()
   return next(t['id'] for t in transfers if t['description']==description)
  await page.goto(base.URL);await expect(page.locator('#home-view')).to_be_visible();assert not await page.locator('#open-transfers').count();assert not await page.locator('#transfers-view').count();await page.locator('#open-transactions').click();await ready();checks.append('uma única entrada e tela para lançamentos')
  await tx('new-expense').click();await tx('description').fill('Aporte na reserva');await tx('amount').fill('100,01');await page.locator('#transactions-view [name=nature][value=transfer]').check();await expect(tx('destination-field')).to_be_visible();await expect(tx('category-field')).not_to_be_visible();await expect(tx('classification-field')).not_to_be_visible();await expect(tx('account-label')).to_have_text('Conta de origem');await expect(tx('description')).to_have_value('Aporte na reserva');checks.append('trocar tipo para transferência preserva formulário e mostra origem/destino')
  await tx('save-entry').click();await expect(tx('account-error')).to_be_visible();await expect(tx('destination-error')).to_be_visible()
  await tx('quick-account').click();await tx('quick-name').fill('Conta principal');await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible();a=base.accounts[0]['id']
  await tx('quick-destination').click();await tx('quick-name').fill('Reserva');await tx('quick-type').select_option('investment');await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible();b=base.accounts[1]['id'];assert await tx('account').input_value()==a and await tx('destination').input_value()==b and await tx('amount').input_value()=='100,01';await save();first=transfers[0]['id'];await expect(row(first)).to_contain_text('Transferência');await expect(row(first)).to_contain_text('De: Conta principal');await expect(row(first)).to_contain_text('Para: Reserva');checks.append('criação rápida das duas contas e transferência na listagem comum')
  await expect(tx('income-total')).to_contain_text('0,00');await expect(tx('expense-total')).to_contain_text('0,00');await expect(tx('result-count')).to_contain_text('1 lançamento');await tx('account-filter').select_option(a);await ready();await expect(tx('account-balance')).to_contain_text('−R$');await tx('account-filter').select_option(b);await ready();await expect(tx('account-balance')).to_contain_text('100,01');checks.append('transferência conta uma vez e altera saldos sem receita/despesa')
  await tx('new-transfer').click();await tx('description').fill('Inválida');await tx('amount').fill('0');await tx('account').select_option(a);await tx('destination').select_option(a);before=base.calls.count('transactions.save');await tx('save-entry').click();await expect(tx('amount-error')).to_be_visible();await tx('amount').fill('1,00');await tx('save-entry').click();await expect(tx('destination-error')).to_contain_text('diferentes');assert base.calls.count('transactions.save')==before;await tx('cancel-editor').click();await tx('confirm-accept').click();checks.append('centavos positivos e contas distintas no formulário comum')
  # Receitas/despesas reais no mesmo modelo de ponte, sem copiar transferências para ele.
  cat=str(uuid.uuid4());base.categories.append({'id':cat,'name':'Trabalho','parentId':None,'version':1,'systemKey':None})
  base.entries.extend([{'id':str(uuid.uuid4()),'version':1,'kind':'standard','nature':n,'description':d,'amountCents':v,'date':base.TODAY,'accountId':a,'categoryId':cat,'classification':'variable','modality':'single'} for n,d,v in [('income','Salário',100000),('expense','Compra',1000)]])
  await tx('account-filter').select_option('');await ready();await expect(tx('entry-list')).to_contain_text('Salário');await expect(tx('entry-list')).to_contain_text('Compra');await expect(tx('entry-list')).to_contain_text('Aporte na reserva');await expect(tx('result-total')).to_contain_text('990,00');checks.append('receita, despesa e transferência convivem na mesma consulta')
  await tx('nature-filter').select_option('transfer');await ready();await expect(tx('category-filter')).to_be_disabled();await expect(tx('entry-list')).not_to_contain_text('Salário');await expect(tx('result-total')).to_contain_text('0,00');await tx('nature-filter').select_option('income');await ready();await expect(tx('entry-list')).to_contain_text('Salário');await expect(tx('entry-list')).not_to_contain_text('Aporte na reserva');await tx('nature-filter').select_option('');await ready();await tx('category-filter').select_option(cat);await ready();await expect(tx('entry-list')).not_to_contain_text('Aporte na reserva');await tx('category-filter').select_option('');await ready();checks.append('filtros por tipo e categoria respeitam a natureza dos lançamentos')
  future=await new('Aporte futuro','20,00',a,b,base.FUTURE);await expect(tx('toast-action')).to_be_visible();await tx('toast-action').click();await ready();await expect(row(future)).to_contain_text('Previsto');await tx('account-filter').select_option(b);await ready();await expect(tx('account-balance')).to_contain_text('100,01');await expect(tx('account-balance')).to_contain_text('120,01');await tx('period-preset').select_option('all');await ready();await tx('account-filter').select_option('');await ready();checks.append('data futura, período global e projeção na tela comum')
  await row(first).get_by_role('button',name='Editar Aporte na reserva',exact=True).click();await expect(tx('category-field')).not_to_be_visible();await expect(page.locator('#transactions-view [name=nature][value=income]')).to_be_disabled();await tx('account').select_option(b);await tx('destination').select_option(a);await tx('amount').fill('50,02');await save();assert next(t for t in transfers if t['id']==first)['version']==2;checks.append('editar transferência abre formulário comum e mantém operação vinculada')
  conflict_save=True;await row(first).get_by_role('button',name='Editar Aporte na reserva',exact=True).click();await tx('description').fill('Rascunho preservado');await tx('save-entry').click();await expect(tx('form-error')).to_contain_text('outro acesso');await expect(tx('description')).to_have_value('Rascunho preservado');await tx('review').click();await ready();checks.append('conflito preserva rascunho e oferece recarga')
  save_response_lost=True;await tx('new-transfer').click();await tx('description').fill('Resposta perdida');await tx('amount').fill('1,23');await tx('account').select_option(a);await tx('destination').select_option(b);await tx('save-entry').click();await expect(tx('form-error')).to_contain_text('não pôde ser confirmada');await tx('save-entry').click();await expect(tx('editor')).not_to_be_visible();await ready();assert sum(t['description']=='Resposta perdida' for t in transfers)==1;checks.append('resposta perdida mantém gravação idempotente')
  await tx('tx-accounts').click();await page.get_by_role('button',name='Ver conta Reserva',exact=True).click();await ac('delete-account').click();await ac('dialog-confirm').click();await expect(ac('confirmation-title')).to_have_text('Esta conta possui movimentações.');await ac('dialog-confirm').click();await expect(ac('account-name')).to_be_visible();await ac('cancel-form').click();await ac('accounts-transactions').click();await ready();await expect(row(first)).to_be_visible();checks.append('conta vinculada protegida e retorno à listagem comum')
  await tx('tx-categories').click();await expect(page.locator('#categories-view #new-category')).to_be_enabled();assert not await page.locator('#categories-view #categories-transfers').count();await page.locator('#categories-view #categories-transactions').click();await ready();checks.append('navegação sem destino independente de transferências')
  fail_list=True;await tx('reload').click();await expect(tx('entry-list').get_by_role('button',name='Tentar novamente')).to_be_visible();await expect(tx('new-transfer')).to_be_disabled();await tx('entry-list').get_by_role('button',name='Tentar novamente').click();await ready();checks.append('falha da consulta integrada mantém estado de erro')
  await row(first).get_by_role('button',name='Excluir Aporte na reserva',exact=True).click();await expect(tx('confirm-description')).to_contain_text('removidas juntas');await tx('confirm-accept').click();await ready();assert not any(t['id']==first for t in transfers);checks.append('excluir transferência pela mesma lista remove os dois efeitos')
  for n in range(35):
   common={'id':str(uuid.uuid4()),'version':1,'description':f'Misto {n:02d}','amountCents':1,'date':base.TODAY}
   base.entries.append({**common,'kind':'standard','nature':'expense','accountId':a,'categoryId':cat,'classification':'variable','modality':'single'})
   transfers.append({**common,'sourceAccountId':a,'destinationAccountId':b})
  await tx('reload').click();await ready();await expect(tx('more')).to_be_visible();await tx('more').click();await ready();rows=await page.locator('#transactions-view [data-entry-key]').evaluate_all('(rows)=>rows.map(row=>row.dataset.entryKey)');assert len(rows)==74 and len(set(rows))==74;checks.append('paginação mista mantém todos os tipos, inclusive IDs iguais entre operações')
  await page.screenshot(path=str(base.OUT/'entries-desktop.png'),full_page=False)
  expired=True;await tx('reload').click();await expect(page.locator('#email-view')).to_be_visible();assert await tx('description').input_value()=='' and not await tx('entry-list').locator('[data-entry-id]').count();assert await page.evaluate('localStorage.getItem("mukirana.session")') is None;checks.append('expiração limpa dados de todos os tipos de lançamento')
  expired=False
  mobile=await browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:errors.append(str(e)));await mobile.expose_function('mockApi',api);await mobile.add_init_script(base.INIT);await mobile.goto(base.URL);await expect(mobile.locator('#home-view')).to_be_visible();await mobile.locator('#open-transactions').click();await expect(mobile.locator('#transactions-view #new-transfer')).to_be_enabled();assert await mobile.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth');await mobile.locator('#transactions-view #theme').select_option('dark');await mobile.locator('#transactions-view #new-transfer').click();await mobile.locator('#transactions-view #description').fill('No celular');await mobile.locator('#transactions-view #date').fill(base.FUTURE);await expect(mobile.locator('#transactions-view #future-note')).to_be_visible();assert await mobile.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth');await mobile.screenshot(path=str(base.OUT/'entries-mobile.png'),full_page=False);await mobile.keyboard.press('Escape');await expect(mobile.locator('#transactions-view #confirm')).to_be_visible();await mobile.locator('#transactions-view #confirm-cancel').click();await expect(mobile.locator('#transactions-view #editor')).to_be_visible();checks.append('formulário único em celular, tema escuro e descarte seguro')
  assert not errors,errors;print(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2));await browser.close()
 base.server.shutdown()
if __name__=='__main__':asyncio.run(main())
