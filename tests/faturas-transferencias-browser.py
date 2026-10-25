"""Regressão: Faturas → Lançamentos com cache já carregado, sem recarregar a página.

PostgreSQL efêmero; views, store e controllers/model reais. Não usa rede de produção.
MUKIRANA_TEST_BASELINE=1 reproduz a falha retirando só a correção da view renderizada.
"""
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
import json, os, subprocess, uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/workspace/work/faturas-transferencias'); OUT.mkdir(exist_ok=True)
assert os.environ.get('MUKIRANA_TEST_DB') in ('rateios_v4_browser', 'rateios_v4_accounts')

def backend(method, args):
    p = subprocess.run(['node', 'tests/faturas-transferencias-gateway.cjs', method, json.dumps(args)], cwd=ROOT, text=True, capture_output=True)
    return json.loads(p.stdout)

def render(name):
    r = backend('render', [name]); assert r['ok'], r
    return r['result']

VIEW = render('Faturas_Cartao_View')
if os.environ.get('MUKIRANA_TEST_BASELINE') == '1':
    VIEW = VIEW.replace('window.MukiranaLancamentosStore?.reload().catch(function() {});', '')
LEDGER = render('Lancamentos_Novo_View')
GLOBAL = render('Saldo_Global_Client')
STYLE = render('Global_Estilos') + render('UX_Temas_Styles') + render('UX_Temas_Client')
BRIDGE = '''<script>
localStorage.setItem('mukirana_token','owner-token');localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');
localStorage.setItem('mukirana_fatura_cartao',JSON.stringify({ID_Grupo_Cartao:'20000000-2000-4000-8000-200000000001',Mes_Referencia:'2026-10'}));
window.mukiranaTelaAtual={nomeTela:'',atualizarPeriodoGlobal:null};window.notices=[];
function runner(state){return new Proxy(state,{get(target,key){if(key==='withSuccessHandler')return fn=>runner({...target,success:fn});if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>window.rpcBackend({method:key,args}).then(r=>{if(r.ok)target.success?.(r.result);else target.failure?.({message:r.error});});}})}window.google={script:{run:runner({})}};
function mostrarNotificacao(message,type){notices.push({message,type});}function confirmarAcao(message,yes){yes();}function mascaraMoeda(){}
function definirFiltroPeriodoGlobalVisivelMukirana(){}function finalizarCarregamentoTelaMukirana(){}
function registrarTelaAtualMukirana(name,options){mukiranaTelaAtual={nomeTela:name,atualizarPeriodoGlobal:options.atualizarPeriodoGlobal};window.MukiranaLancamentosStore?.setView(name);}
function navegarPara(name){const host=document.getElementById('conteudo-tela');host.innerHTML=name==='FaturasCartao'?INVOICE_SOURCE:LEDGER_SOURCE;[...host.querySelectorAll('script')].forEach(old=>{const s=document.createElement('script');s.textContent=old.textContent;document.body.append(s);old.remove();});}
</script>'''.replace('INVOICE_SOURCE', json.dumps(VIEW).replace('<', '\\u003c')).replace('LEDGER_SOURCE', json.dumps(LEDGER).replace('<', '\\u003c'))
HOST = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + STYLE + '''<body class="mukirana-com-topbar"><div id="app-container"><main id="conteudo-principal"><header id="topbar-app" class="topbar-app" style="display:flex"><div id="topbar-filtro-periodo-global"><input type="month" id="mk_global_mes_inicial"><input type="month" id="mk_global_mes_final"></div><div id="topbar-contexto-app"></div></header><div id="conteudo-tela"></div></main></div>''' + BRIDGE + GLOBAL + '<script>inicializarFiltroPeriodoGlobalMukirana();navegarPara("LancamentosNovo");</script></body></html>'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    for device, w, h in [('desktop', 1440, 1000), ('tablet', 820, 1180), ('smartphone', 390, 844)]:
        context = browser.new_context(viewport={'width':w,'height':h}, locale='pt-BR')
        context.expose_binding('rpcBackend', lambda source,payload: backend(payload['method'],payload['args']))
        page = context.new_page(); page.clock.set_fixed_time(datetime(2026,10,25,12,tzinfo=timezone.utc))
        errors = []; page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://mukirana.test/**', lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'))
        page.goto('https://mukirana.test/'); frame = page.frame_locator('#ln-live-frame')
        frame.locator('[data-key]').first.wait_for()
        label = 'INVOICE_CACHE_' + device + '_' + uuid.uuid4().hex[:8]

        def invoice():
            page.evaluate("navegarPara('FaturasCartao')")
            page.wait_for_function('pacoteFaturaCartao && pacoteFaturaCartao.Contas_Origem?.length>0')

        def save(amount, status='Efetivado', payment_id=None):
            if payment_id: page.evaluate('abrirModalPagamentoFaturaCartaoPorId', payment_id)
            else: page.evaluate('abrirModalPagamentoFaturaCartao()')
            page.locator('#pag_fatura_conta').select_option('40000000-4000-4000-8000-400000000001')
            page.locator('#pag_fatura_valor').fill(amount)
            page.locator('#pag_fatura_data').fill('2026-10-01')
            page.locator('#pag_fatura_status').select_option(status)
            page.locator('#pag_fatura_observacao').fill(label)
            page.locator('#btn-salvar-pagamento-fatura').click()
            page.wait_for_function("!document.querySelector('#modal-pagamento-fatura').classList.contains('visivel')")

        def ledger(amount, count=2):
            page.evaluate("navegarPara('LancamentosNovo')")
            frame.locator('#search').wait_for(); frame.locator('#search').fill(label)
            expect(frame.locator('[data-key]')).to_have_count(count,timeout=8000)
            pack = page.evaluate('MukiranaLancamentosStore.load()')
            legs = [r for r in pack['rows'] if r['description']==label]
            assert len(legs)==count, legs
            if count:
                assert sorted(int(r['signedCents']) for r in legs)==[-amount,amount],legs
                assert all(r['type']=='transfer' for r in legs)
                assert sum(int(r['signedCents']) for r in legs)==0
                page.wait_for_function("document.querySelector('#ln-global-saldo strong').textContent.includes('0,00')")
            return pack, legs

        # Cache primado pela visita inicial ao Lançamentos; navegação mantém mês e sessão.
        invoice(); save('50,00'); pack,legs = ledger(5000)
        entry = next(e for e in pack['entries'] if e['description']==label)
        assert entry['special']=='invoice-payment'
        payment_id = entry['id']
        # Filtrar uma conta mostra só seu movimento e muda o cálculo global.
        frame.locator('[data-action="filters"]').click()
        for account, sign in [(entry['origin'],'−'), (entry['destination'],'')]:
            frame.locator('[data-filter="account"]').select_option(account)
            expect(frame.locator('[data-key]')).to_have_count(1)
            assert '50,00' in page.locator('#ln-global-saldo strong').inner_text()
            if sign: assert sign in page.locator('#ln-global-saldo strong').inner_text()
        invoice(); save('60,00',payment_id=payment_id); ledger(6000)
        invoice(); save('60,00',status='Pendente',payment_id=payment_id); _,legs = ledger(6000)
        assert all(r['status']=='pending' for r in legs)
        invoice(); save('60,00',payment_id=payment_id); _,legs = ledger(6000)
        assert all(r['status']=='done' for r in legs)
        page.screenshot(path=str(OUT/(device+'-transfer.png')),full_page=True)
        invoice(); page.evaluate('excluirPagamentoFaturaCartaoFront',payment_id)
        page.wait_for_function('(id)=>!pacoteFaturaCartao.Pagamentos.some(p=>p.ID_Pagamento_Fatura===id)',arg=payment_id)
        ledger(0,count=0)
        # Sem duplicação de linhas persistidas; criação/edições/exclusão ocorreram no modelo real.
        assert not errors, errors
        assert not [n for n in page.evaluate('notices') if n['type']=='erro'], page.evaluate('notices')
        results.append({'device':device,'createEditStatusDeleteAndFilters':'PASS'})
        context.close()
    browser.close()
(OUT/'browser-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False))
