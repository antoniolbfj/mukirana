"""Fatura com saldo anterior: complemento, edição, crédito e mês fixado na modal.
Views/controllers/model reais e PostgreSQL local; nenhum pagamento em produção.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from datetime import datetime,timezone
import json,os,subprocess
base=Path(__file__).with_name('faturas-transferencias-browser.py')
exec(base.read_text().split('results = []')[0],globals())
OUT=Path('/workspace/work/nubank-parcial');OUT.mkdir(exist_ok=True)
index=(ROOT/'Index.html').read_text();top=index[index.index('<div id="topbar-app"'):index.index('<div id="tela-carregamento"')]
HOST='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+STYLE+'<body class="mukirana-com-topbar"><div id="app-container"><main id="conteudo-principal">'+top+'<div id="conteudo-tela"></div></main></div>'+BRIDGE+GLOBAL+'<script>inicializarFiltroPeriodoGlobalMukirana();navegarPara("LancamentosNovo");</script></body></html>'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  for theme in ['claro','escuro','sepia']:
   if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
   seed=subprocess.run(['node','tests/faturas-parciais-fixture.cjs'],cwd=ROOT,capture_output=True,text=True);assert seed.returncode==0,seed.stderr;f=json.loads(seed.stdout)
   opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   context=browser.new_context(**opts);context.expose_binding('rpcBackend',lambda source,payload:backend(payload['method'],payload['args']));page=context.new_page();page.set_default_timeout(15000);page.clock.set_fixed_time(datetime(2026,10,26,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.frame_locator('#ln-live-frame').locator('#hub-tools').wait_for();page.evaluate('(t)=>MukiranaTema.choose(t)',theme)
   page.evaluate('''async f=>{salvarFiltroPeriodoGlobalMukirana({Mes_Selecionado:f.month,Considerar_Historico_Anterior:true});aplicarFiltroPeriodoGlobalMukirana();await MukiranaLancamentosStore.reload();localStorage.setItem('mukirana_fatura_cartao',JSON.stringify({ID_Grupo_Cartao:f.group}));navegarPara('FaturasCartao');}''',f)
   page.wait_for_function('(id)=>pacoteFaturaCartao?.ID_Grupo_Cartao===id',arg=f['group']);expect(page.locator('#mk_global_saldo_anterior')).to_be_checked();expect(page.locator('#fatura_em_aberto')).to_contain_text('-40,00')
   def save(value,payment=None):
    if payment:page.evaluate('abrirModalPagamentoFaturaCartaoPorId',payment)
    else:page.evaluate('abrirModalPagamentoFaturaCartao()')
    expect(page.locator('#pag_fatura_mes')).to_have_value('2026-11');expect(page.locator('#pag_fatura_referencia')).to_contain_text('11/2026');page.locator('#pag_fatura_conta').select_option(f['bank']);page.locator('#pag_fatura_valor').fill(value);page.locator('#pag_fatura_data').fill('2026-10-26');page.locator('#btn-salvar-pagamento-fatura').click();expect(page.locator('#modal-pagamento-fatura')).not_to_have_class('fatura-modal-pagamento visivel')
   # Adicionar o restante deve quitar mesmo com Saldo anterior marcado.
   save('40,00');page.wait_for_function('pacoteFaturaCartao.Valor_Pago===100');expect(page.locator('#fatura_em_aberto')).to_contain_text('0,00')
   second=page.evaluate('(id)=>pacoteFaturaCartao.Pagamentos.find(p=>p.ID_Pagamento_Fatura!==id).ID_Pagamento_Fatura',f['payment'])
   save('45,00',second);page.wait_for_function('pacoteFaturaCartao.Valor_Credito===5');expect(page.locator('#fatura_em_aberto')).to_contain_text('5,00');assert '−' not in page.locator('#fatura_em_aberto').inner_text() and '-' not in page.locator('#fatura_em_aberto').inner_text()
   save('10,00');page.wait_for_function('pacoteFaturaCartao.Valor_Credito===15')
   # Editar o primeiro parcial também é uma transferência, sem teto pelo saldo.
   save('100,00',f['payment']);page.wait_for_function('pacoteFaturaCartao.Valor_Credito===55')
   pack=backend('lancamentosNovoListar',['owner-token',{'Mes_Selecionado':'2026-10'}]);assert pack['ok'],pack;legs=[r for r in pack['result']['rows'] if r['entryId']==f['payment']];assert sorted(int(r['signedCents']) for r in legs)==[-10000,10000]
   # A referência já aberta não muda com o filtro da página ao fundo.
   page.evaluate('abrirModalPagamentoFaturaCartao()');page.evaluate("salvarFiltroPeriodoGlobalMukirana({Mes_Selecionado:'2026-12'});aplicarFiltroPeriodoGlobalMukirana();");expect(page.locator('#pag_fatura_mes')).to_have_value('2026-11');page.evaluate('fecharModalPagamentoFaturaCartao()')
   page.evaluate("salvarFiltroPeriodoGlobalMukirana({Mes_Selecionado:'2026-11',Considerar_Historico_Anterior:true});aplicarFiltroPeriodoGlobalMukirana();");assert not errors,errors;assert not [n for n in page.evaluate('notices') if n['type']=='erro'];assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/(device+'-'+theme+'.png')),full_page=True);results.append({'device':device,'theme':theme,'result':'PASS'});print(results[-1],flush=True);context.close()
 browser.close()
(OUT/'browser.json').write_text(json.dumps(results,indent=2))
