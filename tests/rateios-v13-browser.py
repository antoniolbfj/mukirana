"""Aceite pelo botão geral, seletor de acertos, fatura sem receita e atualização do Painel."""
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
import os,json,subprocess
os.environ['MUKIRANA_TEST_DB']='rateios_v4_browser'
base=Path(__file__).resolve().with_name('lancamentos-contextos-browser.py');exec(base.read_text().split('results=[]')[0],globals())
OUT=Path('/workspace/work/rateio-aceite-v59');OUT.mkdir(parents=True,exist_ok=True);results=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  for theme,mode in [('claro','single'),('escuro','multiple'),('sepia','invoice')]:
   fixture=json.loads(subprocess.check_output(['node','tests/rateios-v13-fixture.cjs',mode],cwd=ROOT,text=True));opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   c=b.new_context(**opts);requests=[];lost={'pending':device=='smartphone' and mode=='single'}
   def invoke(source,payload):
    r=backend(payload['method'],payload['args'])
    if payload['method']=='rateiosNovoMutar':
     requests.append(payload['args'][1])
     if lost['pending'] and r['ok']:lost['pending']=False;return {'ok':False,'error':'Resposta perdida após gravar (teste local)'}
    return r
   c.expose_binding('rpcBackend',invoke);page=c.new_page();page.set_default_timeout(15000);page.clock.set_fixed_time(datetime(2026,10,27,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.evaluate('(v)=>MukiranaTema.choose(v)',theme)
   f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for();page.locator('#mk_global_mes').fill('2026-11');page.locator('#mk_global_mes').dispatch_event('change');page.wait_for_function('MukiranaLancamentosStore.load().then(p=>p.period.end==="2026-11")');f.locator('#ln-approvals').click();f.locator('#rt-workspace').wait_for();person=f.locator('.rt-balances article').filter(has=f.locator('[data-rt-receive="'+fixture['other']+'"]'));expect(person).to_contain_text('Sem valor pendente');expect(person.locator('.rt-value')).to_contain_text('0,00')
   for i,payment in enumerate(fixture['payments']):
    f.locator('[data-rt-receive="'+fixture['other']+'"]').click()
    if mode=='multiple' and i==0:
     expect(f.locator('#rt-pending')).to_be_visible();f.locator('#rt-pending').select_option(payment['id']);f.locator('#dialog-form button[type=submit]').click();expect(f.locator('#dialog-layer')).to_be_hidden()
    expect(f.locator('#entry-form')).to_be_visible();expect(f.locator('#entry-amount')).to_have_value('15,00' if mode=='multiple' else '30,00');assert f.locator('#entry-amount').get_attribute('readonly') is not None
    if mode=='invoice':expect(f.locator('#entry-form')).to_contain_text('não criará outra receita');assert f.locator('#entry-account').count()==0
    else:f.locator('#entry-account').select_option(fixture['account'])
    f.locator('#entry-form button[type=submit]').click()
    if device=='smartphone' and mode=='single':expect(f.locator('#entry-error')).to_contain_text('Resposta perdida');f.locator('#entry-form button[type=submit]').click()
    f.locator('#entry-form').wait_for(state='hidden');pack=backend('lancamentosNovoListar',['owner-token',{}]);assert pack['ok'],pack;data=pack['result'];s=next(s for s in data['rateios']['settlements'] if s['id']==payment['id']);assert s['status']=='Efetivado' and s['ownRegistered'] and s['otherRegistered'];receipts=[e for e in data['entries'] if e.get('settlementId')==payment['id'] and e['type']=='income'];assert len(receipts)==(0 if mode=='invoice' else 1)
   assert all(r['id'] in [s['id'] for s in fixture['payments']] for r in requests),requests
   if device=='smartphone' and mode=='single':assert requests[0]['operationId']==requests[1]['operationId'] and requests[0]['entryId']==requests[1]['entryId']
   expect(f.locator('[data-rt-receive="'+fixture['other']+'"]').first).to_have_count(0)
   # A mesma posição quitada aparece no Painel e na sua modal, inclusive novembro
   # com obrigações quitadas no mês anterior e com/sem Saldo anterior.
   page.evaluate("navegarPara('Dashboard')");d=page.frame_locator('#painel-frame');d.locator('[data-rateios]').wait_for();expect(d.locator('[data-rateios]')).to_contain_text('Sem valor pendente');expect(d.locator('[data-rateios] .metric')).to_contain_text('0,00')
   d.locator('[data-rateios]').click();f=page.frame_locator('#ln-live-frame');expect(f.locator('#rt-workspace')).to_be_visible();expect(f.locator('.rt-balances')).to_contain_text('Sem valor pendente');page.locator('.modal-contextual-cabecalho button').click();expect(d.locator('[data-rateios]')).to_contain_text('Sem valor pendente')
   assert not errors,errors;results.append({'device':device,'theme':theme,'flow':mode,'result':'PASS','sameSettlement':True,'oneReceiptOrInvoiceRecognition':True,'balancesUpdated':True,'lostResponseRetry':device=='smartphone' and mode=='single'});print(results[-1],flush=True);page.screenshot(path=str(OUT/(device+'-'+theme+'.png')),full_page=True);c.close()
 b.close()
(OUT/'browser.json').write_text(json.dumps(results,indent=2))
