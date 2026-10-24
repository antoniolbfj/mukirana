"""Fluxos de modalidades no HTML real com ponte simulada; SQL é verificado no Supabase."""
import asyncio,calendar,datetime,json,uuid
from pathlib import Path
from playwright.async_api import async_playwright,expect
import transfers_browser_test as unified
base=unified.base;groups={};fail_preview=False;conflict_save=False;lose_response=False

def occurrence_date(start,frequency,index,anchor=None):
 d=datetime.date.fromisoformat(start);anchor=anchor or d.day
 if frequency in ['weekly','fortnightly']:return (d+datetime.timedelta(days=index*(7 if frequency=='weekly' else 15))).isoformat()
 months=index*{'monthly':1,'bimonthly':2,'quarterly':3,'semiannual':6,'yearly':12}[frequency];y,m=divmod(d.year*12+d.month-1+months,12);m+=1
 return datetime.date(y,m,min(anchor,calendar.monthrange(y,m)[1])).isoformat()
def group_dto(g):
 rows=[e for e in base.entries if e.get('groupId')==g['id']];dates=[e['date'] for e in rows];last=max(dates) if dates else None
 return {**g,'count':len(rows),'totalCents':str(sum(e['amountCents'] for e in rows)),'firstDate':min(dates) if dates else None,'lastDate':last,'nextDate':occurrence_date(last,g['frequency'],1,g['anchorDay']) if last else None,'canRenew':bool(g['modality']=='recurring' and rows and last<=base.TODAY and not g['createdToday'] and not g['renewed'])}
def schedule(e):
 s=e['series'];anchor=datetime.date.fromisoformat(e['date']).day
 old=groups.get(s.get('renewFromId'))
 if old and e['date']==group_dto(old)['nextDate']:anchor=old['anchorDay']
 rows=[];modality=e['modality'];end=occurrence_date(e['date'],'monthly',s['durationMonths']) if modality=='recurring' else None
 if modality=='installment' and (not 1<=s['quantity']<=1000 or e['amountCents']<s['quantity']):raise ValueError('quantity')
 for i in range(1001):
  if modality=='installment' and i>=s['quantity']:break
  date=occurrence_date(e['date'],s['frequency'],i,anchor)
  if end and date>=end:break
  if i==1000:raise ValueError('limit')
  amount=e['amountCents'] if modality=='recurring' else e['amountCents']//s['quantity']+(e['amountCents']%s['quantity'] if i==0 else 0)
  rows.append({'occurrenceIndex':i+1,'date':date,'amountCents':amount})
 return rows,anchor
def selected_rows(id,scope):
 e=next(e for e in base.entries if e['id']==id);rows=[r for r in base.entries if r.get('groupId')==e['groupId']]
 return [r for r in rows if scope=='all' or (scope=='one' and r['id']==id) or (scope=='following' and r['occurrenceIndex']>=e['occurrenceIndex']) or (scope=='preceding' and r['occurrenceIndex']<=e['occurrenceIndex'])]
async def api(req):
 global fail_preview,conflict_save,lose_response
 action=req['action'];await asyncio.sleep(.03)
 if action=='transactions.preview':
  if fail_preview:fail_preview=False;return {'status':'unavailable'}
  try:rows,_=schedule(req['entry'])
  except ValueError:return {'status':'invalid_request'}
  return {'status':'ok','preview':{'count':len(rows),'totalCents':str(sum(r['amountCents'] for r in rows)),'firstDate':rows[0]['date'],'lastDate':rows[-1]['date'],'firstAmountCents':rows[0]['amountCents'],'regularAmountCents':min(r['amountCents'] for r in rows),'samples':rows[:5]}}
 if action=='transactions.group':
  rows=[e for e in base.entries if e['id']==req['id']] if req.get('id') else [e for e in base.entries if e.get('groupId')==req['groupId']]
  if not rows:return {'status':'not_found'}
  e=max(rows,key=lambda r:r.get('occurrenceIndex',0));g=groups[e['groupId']]
  return {'status':'ok','entry':dict(e),'group':group_dto(g),'scopeCounts':{scope:len(selected_rows(e['id'],scope)) for scope in ['one','following','preceding','all']}}
 if action=='transactions.save' and req['entry'].get('batch'):
  if conflict_save:conflict_save=False;return {'status':'conflict'}
  e=req['entry'];b=e['batch'];g=groups[b['groupId']]
  if g['version']!=b['groupVersion']:return {'status':'conflict'}
  affected=selected_rows(e['id'],b['scope']);original=next(r for r in affected if r['id']==e['id'])['occurrenceIndex']
  for row in affected:
   for key in b['fields']:row[key]=occurrence_date(e['date'],g['frequency'],row['occurrenceIndex']-original) if key=='date' and b['scope']!='one' else e[key]
   row['version']+=1;g['version']+=1
  if 'date' in b['fields'] and b['scope']!='one':g['anchorDay']=datetime.date.fromisoformat(e['date']).day
  g['version']+=1
  return {'status':'saved','entry':dict(next(r for r in affected if r['id']==e['id'])),'group':group_dto(g),'affectedCount':len(affected)}
 if action=='transactions.save' and req['entry'].get('modality') in ['installment','recurring']:
  e=req['entry'];old=groups.get(e['id'])
  if old:return {'status':'saved','entry':dict(next(r for r in base.entries if r.get('groupId')==old['id'])),'group':group_dto(old),'affectedCount':old['plannedCount']}
  rows,anchor=schedule(e);s=e['series'];g={'id':e['id'],'version':len(rows)+1,'nature':e['nature'],'modality':e['modality'],'frequency':s['frequency'],'startDate':e['date'],'anchorDay':anchor,'durationMonths':s['durationMonths'] if e['modality']=='recurring' else None,'plannedCount':len(rows),'renewed':False,'createdToday':True,'dismissed':False};groups[g['id']]=g
  for r in rows:base.entries.append({**{k:e[k] for k in ['nature','description','accountId','categoryId','classification','modality']},**r,'id':str(uuid.uuid4()),'version':1,'kind':'standard','groupId':g['id']})
  if s.get('renewFromId'):groups[s['renewFromId']]['renewed']=True;groups[s['renewFromId']]['version']+=1
  if lose_response:lose_response=False;raise RuntimeError('simulated lost reply')
  return {'status':'saved','entry':dict(next(r for r in base.entries if r.get('groupId')==g['id'])),'group':group_dto(g),'affectedCount':len(rows)}
 if action=='transactions.delete' and req.get('batch'):
  b=req['batch'];g=groups[b['groupId']]
  if g['version']!=b['groupVersion']:return {'status':'conflict'}
  affected=selected_rows(req['id'],b['scope']);ids={r['id'] for r in affected};base.entries[:]=[r for r in base.entries if r['id'] not in ids];g['version']+=len(ids)+1
  return {'status':'deleted','group':group_dto(g),'affectedCount':len(ids)}
 if action=='transactions.dismissRenewal':groups[req['id']]['dismissed']=True;groups[req['id']]['version']+=1;return {'status':'dismissed'}
 r=await unified.api(req)
 if action=='transactions.list' and r['status']=='ok':
  ids={e.get('groupId') for e in r['entries']};r['groups']=[group_dto(g) for g in groups.values() if g['id'] in ids]
  r['renewals']=[{'group':group_dto(g),'description':next(e['description'] for e in base.entries if e.get('groupId')==g['id']),'date':group_dto(g)['lastDate']} for g in groups.values() if group_dto(g)['canRenew'] and not g['dismissed']]
 return r
async def main():
 global fail_preview,conflict_save,lose_response
 checks=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1440,'height':1050});page.on('pageerror',lambda e:errors.append(str(e)));await page.expose_function('mockApi',api);await page.add_init_script(base.INIT)
  tx=lambda id:page.locator('#transactions-view #'+id)
  async def ready():await expect(tx('new-expense')).to_be_enabled()
  async def save():await tx('save-entry').click();await expect(tx('editor')).not_to_be_visible();await ready()
  def rows(g):return sorted((e for e in base.entries if e.get('groupId')==g),key=lambda e:e['occurrenceIndex'])
  def item(e):return page.locator(f'#transactions-view [data-entry-id="{e["id"]}"][data-entry-kind="standard"]')
  async def edit(e):await item(e).get_by_role('button',name='Editar '+e['description'],exact=True).click();await expect(tx('group-edit')).to_be_visible()
  async def remove(e,scope):await item(e).get_by_role('button',name='Excluir '+e['description'],exact=True).click();await expect(tx('delete-scope-field')).to_be_visible();await tx('delete-scope').select_option(scope);await tx('confirm-accept').click();await ready()
  async def create(description,modality='installment',amount='100,00',start='2027-01-31',quantity=3,duration=1,frequency='monthly'):
   await tx('new-expense').click();await tx('description').fill(description);await tx('amount').fill(amount);await tx('date').fill(start);await tx('category').select_option(base.categories[0]['id']);await tx('modality').select_option(modality);await tx('frequency').select_option(frequency)
   await tx('quantity' if modality=='installment' else 'duration').fill(str(quantity if modality=='installment' else duration));await save();return next(g['id'] for g in groups.values() if any(e['description']==description for e in rows(g['id'])))
  await page.goto(base.URL);await expect(page.locator('#home-view')).to_be_visible();await page.locator('#open-transactions').click();await ready();assert not await page.locator('#occurrences-view').count()
  await tx('new-expense').click();await tx('description').fill('Compra parcelada');await tx('amount').fill('100,00');await tx('date').fill('2027-01-31');await tx('modality').select_option('installment');await tx('quantity').fill('3');await expect(tx('amount-label')).to_have_text('Valor total');await expect(tx('series-preview')).to_contain_text('33,34');checks.append('modalidade no formulário comum com prévia exata')
  await tx('quick-account').click();await tx('quick-name').fill('Banco');await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible();await tx('quick-category').click();await tx('quick-name').fill('Compras');await tx('quick-save').click();await expect(tx('quick')).not_to_be_visible();assert await tx('modality').input_value()=='installment' and await tx('quantity').input_value()=='3' and await tx('amount').input_value()=='100,00';checks.append('criação rápida preserva modalidade, quantidade e valor')
  await save();g=next(iter(groups));assert [e['amountCents'] for e in rows(g)]==[3334,3333,3333];assert [e['date'] for e in rows(g)]==['2027-01-31','2027-02-28','2027-03-31'];await tx('period-preset').select_option('all');await ready();await expect(tx('result-count')).to_contain_text('3 lançamentos');await expect(tx('expense-total')).to_contain_text('100,00');await expect(tx('entry-list')).to_contain_text('Total do conjunto: R$');checks.append('ocorrências antecipadas e total derivado sem movimento extra')
  await tx('account-filter').select_option(base.accounts[0]['id']);await ready();await expect(tx('account-balance')).to_contain_text('0,00');await expect(tx('account-balance')).to_contain_text('100,00');checks.append('futuras afetam projeção e preservam saldo atual')
  await edit(rows(g)[0]);await expect(tx('modality')).to_be_disabled();await expect(tx('amount-label')).to_have_text('Valor desta ocorrência');await tx('amount').fill('40,00');await save();assert [e['amountCents'] for e in rows(g)]==[4000,3333,3333];await expect(tx('entry-list')).to_contain_text('106,66');checks.append('edição individual não redistribui centavos ou diferenças')
  await edit(rows(g)[1]);await tx('edit-scope').select_option('following');await expect(tx('scope-note')).to_contain_text('2 ocorrência');await tx('description').fill('Parcelas seguintes');await expect(page.locator('#transactions-view #batch-fields [value=description]')).to_be_checked();await save();assert rows(g)[0]['description']=='Compra parcelada' and all(e['description']=='Parcelas seguintes' for e in rows(g)[1:]);assert rows(g)[0]['amountCents']==4000;checks.append('editar desta em diante aplica somente campos marcados')
  await edit(rows(g)[1]);await tx('edit-scope').select_option('all');await tx('date').fill('2028-01-31');await save();assert [e['date'] for e in rows(g)]==['2027-12-31','2028-01-31','2028-02-29'];assert rows(g)[0]['amountCents']==4000;checks.append('editar datas de todas preserva periodicidade e valores individuais')
  conflict_save=True;await edit(rows(g)[0]);await tx('amount').fill('45,00');await tx('save-entry').click();await expect(tx('form-error')).to_contain_text('outro acesso');await expect(tx('amount')).to_have_value('45,00');await tx('review').click();await ready();checks.append('conflito de conjunto preserva rascunho')
  await tx('new-expense').click();await tx('category').select_option(base.categories[0]['id']);await tx('description').fill('Inválido');await tx('amount').fill('0,02');await tx('modality').select_option('installment');await tx('quantity').fill('3');await tx('save-entry').click();await expect(tx('form-error')).to_contain_text('prévia');await tx('cancel-editor').click();await tx('confirm-accept').click();checks.append('validação impede parcelas de valor zero')
  recurring=await create('Energia variável','recurring','50,00',(datetime.date.fromisoformat(base.TODAY)+datetime.timedelta(days=1)).isoformat(),duration=1,frequency='weekly');assert all(e['classification']=='variable' for e in rows(recurring));await expect(tx('renewals')).not_to_be_visible();checks.append('recorrência finita independente de fixa/variável e sem aviso na criação')
  past=(datetime.date.fromisoformat(base.TODAY)-datetime.timedelta(days=60)).isoformat();old=await create('Mensalidade anterior','recurring','20,00',past,duration=1);await expect(tx('renewals')).not_to_be_visible();groups[old]['createdToday']=False;groups[old]['version']+=1;await tx('period-preset').select_option('next');await ready();await expect(tx('renewals')).to_contain_text('Mensalidade anterior');await tx('renewal-list').get_by_role('button',name='Renovar',exact=True).click();await expect(tx('editor-title')).to_have_text('Renovar recorrência.');await expect(tx('modality')).to_be_disabled();await tx('duration').fill('3');await tx('amount').fill('25,00');await tx('date').fill((datetime.date.fromisoformat(base.TODAY)+datetime.timedelta(days=1)).isoformat());await save();assert groups[old]['renewed'];assert any(gr['id']!=old and gr['plannedCount']==3 and all(e['amountCents']==2500 for e in rows(gr['id'])) for gr in groups.values());await expect(tx('renewals')).not_to_be_visible();checks.append('aviso independe do filtro e renovação aceita nova configuração')
  await tx('period-preset').select_option('all');await ready();dismiss=await create('Dispensar','recurring','10,00',past,duration=1);groups[dismiss]['createdToday']=False;await tx('reload').click();await ready();before=len(base.entries);await tx('renewal-list').get_by_role('button',name='Dispensar aviso').click();await ready();await expect(tx('renewals')).not_to_be_visible();assert len(base.entries)==before;checks.append('dispensar aviso preserva ocorrências e saldos')
  await remove(rows(g)[0],'one');assert len(rows(g))==2 and [e['occurrenceIndex'] for e in rows(g)]==[2,3];checks.append('exclusão individual mantém outras ocorrências e índices')
  d1=await create('Excluir início',quantity=4);await remove(rows(d1)[2],'preceding');assert len(rows(d1))==1 and rows(d1)[0]['occurrenceIndex']==4;checks.append('excluir da primeira até a selecionada')
  d2=await create('Excluir final',quantity=4);await remove(rows(d2)[1],'following');assert len(rows(d2))==1 and rows(d2)[0]['occurrenceIndex']==1;checks.append('excluir da selecionada até a última')
  await remove(rows(d2)[0],'all');assert not rows(d2);checks.append('excluir todas recalcula o total do grupo')
  lose_response=True;await tx('new-expense').click();await tx('description').fill('Resposta perdida');await tx('category').select_option(base.categories[0]['id']);await tx('amount').fill('30,00');await tx('modality').select_option('installment');await tx('quantity').fill('3');await tx('save-entry').click();await expect(tx('form-error')).to_contain_text('não pôde ser confirmada');await save();assert sum(e['description']=='Resposta perdida' for e in base.entries)==3;checks.append('repetição após resposta perdida não duplica o conjunto')
  await page.screenshot(path=str(base.OUT/'occurrences-desktop.png'),full_page=False)
  mobile=await browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:errors.append(str(e)));await mobile.expose_function('mockApi',api);await mobile.add_init_script(base.INIT);await mobile.goto(base.URL);await expect(mobile.locator('#home-view')).to_be_visible();await mobile.locator('#open-transactions').click();await expect(mobile.locator('#transactions-view #new-expense')).to_be_enabled();await mobile.locator('#transactions-view #new-expense').click();await mobile.locator('#transactions-view #modality').select_option('recurring');await mobile.locator('#transactions-view #duration').fill('3');assert await mobile.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth');await mobile.screenshot(path=str(base.OUT/'occurrences-mobile.png'),full_page=False);checks.append('modalidades funcionais no formulário de celular')
  assert not errors,errors;print(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2));await browser.close()
 base.server.shutdown()
if __name__=='__main__':asyncio.run(main())
