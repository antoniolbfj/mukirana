"""Card do Painel, modal e filtros reais com dados locais de meses distintos."""
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
import os,json,subprocess
os.environ['MUKIRANA_TEST_DB']='rateios_v4_browser'
base=Path(__file__).resolve().with_name('lancamentos-contextos-browser.py');exec(base.read_text().split('results=[]')[0],globals())
OUT=Path('/workspace/work/rateios-filtro-v60');fixture=json.loads((OUT/'fixture.json').read_text());baseline=os.environ.get('MUKIRANA_BASELINE')=='1';results=[]
if baseline:HOST=(OUT/'baseline-host.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  for theme in ['claro','escuro','sepia']:
   if baseline and (device!='desktop' or theme!='claro'):continue
   opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   c=b.new_context(**opts);requests=[]
   def invoke(source,payload):
    if payload['method']=='lancamentosContextoListar':requests.append(payload['args'][1])
    return backend(payload['method'],payload['args'])
   c.expose_binding('rpcBackend',invoke);page=c.new_page();page.set_default_timeout(15000);page.clock.set_fixed_time(datetime(2026,10,27,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.evaluate('(v)=>MukiranaTema.choose(v)',theme);page.frame_locator('#ln-live-frame').locator('#hub-tools').wait_for();page.evaluate("navegarPara('Dashboard')");d=page.frame_locator('#painel-frame');d.locator('[data-rateios]').wait_for()
   for case in fixture['cases']:
    if baseline and case is not fixture['cases'][0]:break
    period={'Mes_Selecionado':case['month'],'Considerar_Historico_Anterior':case['history']};page.evaluate('(period)=>{salvarFiltroPeriodoGlobalMukirana(period);aplicarFiltroPeriodoGlobalMukirana();alterarFiltroPeriodoGlobalMukirana();}',period);page.wait_for_function('(month)=>MukiranaLancamentosStore.load().then(p=>p.period.end===month)',arg=case['month']);d.locator('[data-rateios]').click();f=page.frame_locator('#ln-live-frame');f.locator('#rt-workspace').wait_for();f.locator('#rt-workspace summary' if baseline else '#rt-workspace .rt-record-list summary').click()
    actual_entries=sorted(set(k.split(':')[0] for k in f.locator('#entries [data-key]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.key)')));actual_settlements=sorted(f.locator('.rt-records [data-rt-settlement]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.rtSettlement)'));actual_approvals=sorted(f.locator('.rt-records [data-rt-review]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.rtReview)'))
    if baseline:
     assert actual_entries==sorted(case['entries']),(actual_entries,case['entries']);assert actual_settlements!=sorted(case['settlements']) or actual_approvals!=sorted(case['approvals'])
     result={'baseline':'v59','month':case['month'],'history':case['history'],'correctMainEntryCount':len(actual_entries),'actualSettlementCount':len(actual_settlements),'expectedSettlementCount':len(case['settlements']),'actualApprovalCount':len(actual_approvals),'expectedApprovalCount':len(case['approvals']),'bugReproduced':True};print(result,flush=True);(OUT/'baseline.json').write_text(json.dumps(result,indent=2));break
    for metric,amount in case['totals'].items():
     integer,cents=divmod(int(amount),100);formatted='R$ '+format(integer,',').replace(',','.')+','+str(cents).zfill(2)
     expect(f.locator('[data-rt-total="'+metric+'"]')).to_have_text(formatted)
    assert f.locator('.rt-overview-phone').count()==(1 if device=='smartphone' else 0);assert f.locator('.rt-overview').count()==(0 if device=='smartphone' else 1)
    assert f.locator('html').evaluate('(node)=>node.scrollWidth<=innerWidth'),device+' overflow'
    assert actual_entries==sorted(case['entries']),(case,actual_entries);assert actual_settlements==sorted(case['settlements']),(case,actual_settlements);assert actual_approvals==sorted(case['approvals']),(case,actual_approvals)
    expect(f.locator('#rt-workspace .rt-record-list summary')).to_contain_text('('+str(len(case['settlements'])+len(case['approvals']))+')');assert requests[-1]['period']['Mes_Selecionado']==case['month'];assert requests[-1]['period']['Considerar_Historico_Anterior']==case['history'];assert requests[-1]['rateiosPeriod'] is True
    if fixture['groupApproval'] in case['approvals']:
     group_row=f.locator('.rt-record').filter(has=f.locator('[data-rt-review="'+fixture['groupApproval']+'"]'));expect(group_row).to_contain_text('1 ocorrência(s) no período');expect(group_row.locator('strong')).to_have_text('R$ 15,00')
     f.locator('[data-rt-review="'+fixture['groupApproval']+'"]').click();expect(f.locator('#dialog')).to_contain_text('3 ocorrência(s)');expect(f.locator('#dialog')).to_contain_text('inclusive datas fora do período visível');f.locator('#dialog [data-close=dialog]').click();expect(f.locator('#dialog-layer')).to_be_hidden()
    if not case['settlements'] and not case['approvals']:expect(f.locator('.rt-records')).to_contain_text('Nenhum acerto ou aprovação neste período.')
    assert not errors,errors;f.locator('[aria-label="Resumo dos rateios"]').scroll_into_view_if_needed();page.screenshot(path=str(OUT/(device+'-'+theme+'-'+case['month']+('-history' if case['history'] else '')+'.png')),full_page=True);page.locator('.modal-contextual-cabecalho button').click();page.wait_for_function("getComputedStyle(document.getElementById('modal-tela-contextual')).opacity==='0'")
   results.append({'device':device,'theme':theme,'cases':1 if baseline else len(fixture['cases']),'result':'PASS','monthHistoryEmptyAndOwnReceiptDate':True,'fullGroupDecisionPreserved':not baseline,'expensePaidDebtTotals':not baseline});print(results[-1],flush=True);c.close()
 b.close()
if not baseline:(OUT/'browser.json').write_text(json.dumps(results,indent=2))
