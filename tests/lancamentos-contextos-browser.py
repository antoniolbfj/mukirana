"""Views e modais reais + PostgreSQL local. Três dispositivos e três temas."""
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
import subprocess,json,re,os,uuid
ROOT=Path(__file__).resolve().parents[1];OUT=Path('/workspace/work/rodada-contextos');assert os.environ.get('MUKIRANA_TEST_DB')=='rateios_v4_browser'
def backend(method,args):
 p=subprocess.run(['node','tests/faturas-transferencias-gateway.cjs',method,json.dumps(args)],cwd=ROOT,text=True,capture_output=True)
 return json.loads(p.stdout)
def render(name):
 r=backend('render',[name]);assert r['ok'],r;return r['result']
index=(ROOT/'Index.html').read_text();top=index[index.index('<div id="topbar-app"'):index.index('<div id="tela-carregamento"')];modal=index[index.index('  <div id="modal-tela-contextual"'):index.index('  <script>',index.index('  <div id="modal-tela-contextual"'))]
functions=[]
for name in ['abrirLancamentosContextuaisMukirana','abrirTelaContextualMukirana','fecharTelaContextualMukirana','estaEmTelaContextualMukirana','registrarAtualizacaoTelaContextualMukirana','atualizarTelaOrigemContextualMukirana','atualizarTelaOrigemExternaContextualMukirana']:
 start=index.index('    function '+name+'(');end=index.index('\n    }',start)+6;functions.append(index[start:end])
views={'Lancamentos':render('Lancamentos_Novo_View'),'Contas':render('Contas_Tipos_View'),'Dashboard':render('Painel_Novo_View'),'FaturasCartao':render('Faturas_Cartao_View')}
boot=r'''<script>
const views=VIEWS;localStorage.setItem('mukirana_token','owner-token');localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');localStorage.setItem('mukirana_fatura_cartao',JSON.stringify({ID_Grupo_Cartao:'20000000-2000-4000-8000-200000000001',Mes_Inicial:'2026-10',Mes_Final:'2026-10'}));
window.mukiranaTelaAtual={nomeTela:'',atualizarPeriodoGlobal:null};window.mukiranaTelaContextual={ativa:false,contexto:null,callbackOrigem:null,callbackAtualizacao:null};window.notices=[];
function runner(state){return new Proxy(state,{get(target,key){if(key==='withSuccessHandler')return fn=>runner({...target,success:fn});if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>{if(key==='obterHtmlDaTela'){target.success(views[args[0]]);return;}window.rpcBackend({method:key,args}).then(r=>r.ok?target.success?.(r.result):target.failure?.({message:r.error}));};}})}window.google={script:{run:runner({})}};
function mostrarNotificacao(m,t){notices.push({m,t});}function confirmarAcao(m,yes){yes();}function mascaraMoeda(){}function atualizarVisibilidadeFabPorContexto(){}function ativarAcessibilidadeModalMukirana(){}function desativarAcessibilidadeModalMukirana(){}
function definirFiltroPeriodoGlobalVisivelMukirana(){document.getElementById('topbar-filtro-periodo-global').style.display='flex';}function finalizarCarregamentoTelaMukirana(){}
function registrarTelaAtualMukirana(name,options){mukiranaTelaAtual={nomeTela:name,atualizarPeriodoGlobal:options.atualizarPeriodoGlobal};window.MukiranaLancamentosStore.setView(name);}
function navegarPara(name){if(window.MukiranaLancamentosNovo?.beforeNavigate(()=>navegarPara(name)))return;window.MukiranaLancamentosStore.setView(name);const host=document.getElementById('conteudo-tela');host.innerHTML=views[name];[...host.querySelectorAll('script')].forEach(old=>{const s=document.createElement('script');s.textContent=old.textContent;document.body.append(s);old.remove();});}
FUNCTIONS
</script>'''.replace('VIEWS',json.dumps(views).replace('<','\\u003c')).replace('FUNCTIONS','\n'.join(functions))
HOST='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+render('Global_Estilos')+render('UX_Temas_Styles')+render('UX_Temas_Client')+'<body class="mukirana-com-topbar"><div id="app-container"><main id="conteudo-principal">'+top+'<div id="conteudo-tela"></div></main></div>'+modal+boot+render('Saldo_Global_Client')+'''<script>document.getElementById('topbar-app').style.display='flex';inicializarFiltroPeriodoGlobalMukirana();navegarPara('Lancamentos');</script></body></html>'''
BANK='40000000-4000-4000-8000-400000000001';OWNER='10000000-1000-4000-8000-100000000001'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
  for theme in ['claro','escuro','sepia']:
   if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
   if os.environ.get('MUKIRANA_THEME') and os.environ['MUKIRANA_THEME']!=theme:continue
   opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
   if ua:opts.update(user_agent=ua,has_touch=True)
   context=browser.new_context(**opts);context.expose_binding('rpcBackend',lambda source,payload:backend(payload['method'],payload['args']));page=context.new_page();page.set_default_timeout(10000);page.clock.set_fixed_time(datetime(2026,10,25,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/');page.evaluate('(v)=>MukiranaTema.choose(v)',theme)
   f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for();assert page.locator('#topbar-filtro-periodo-global input[type=month]').count()==1
   assert not page.locator('#mk_global_saldo_anterior').is_checked();page.locator('#mk_global_saldo_anterior').check();page.wait_for_function('MukiranaLancamentosStore.load().then(p=>p.period.first===null)');page.locator('#mk_global_saldo_anterior').uncheck();page.wait_for_function('MukiranaLancamentosStore.load().then(p=>p.period.first==="2026-10-01")')
   f.locator('[data-action="filters"]').click();f.locator('[data-filter="sharing"]').select_option('shared');expect(f.locator('#rt-workspace')).to_be_visible();assert f.locator('[data-key]').count()>0
   f.locator('[data-rt-expand]').first.click();expect(f.locator('#rt-inline')).to_be_visible();expect(f.locator('#panel-layer')).to_be_hidden();expect(f.locator('#rt-inline')).to_contain_text('Sua parte');f.locator('#rt-inline [data-close=panel]').last.click()
   # Rateio novo nasce na própria lista, com categoria padrão por participante.
   f.locator('[data-rt-new]').click();expect(f.locator('#rt-inline #entry-form')).to_be_visible();expect(f.locator('#panel-layer')).to_be_hidden()
   shared_label='RATEIO_UI_'+device+'_'+theme+'_'+uuid.uuid4().hex[:5]
   f.locator('#entry-description').fill(shared_label);f.locator('#entry-amount').fill('30,01');f.locator('#entry-date').fill('2026-10-08');shared_cat=f.locator('#entry-category option').nth(1).get_attribute('value');f.locator('#entry-category').select_option(shared_cat);f.locator('[data-person="10000000-1000-4000-8000-100000000002"]').check();f.locator('#entry-form button[type=submit]').click();f.locator('#rt-inline').wait_for(state='hidden');f.locator('#search').fill(shared_label);expect(f.locator('[data-key]')).to_have_count(1);f.locator('#search').fill('')
   # Contexto Contas abre a mesma lista em modal; inclusão atualiza a conta sem sair.
   page.evaluate("navegarPara('Contas')");page.locator('#cn-root[aria-busy=false]').wait_for();assert page.locator('#cn-ledger-overlay').count()==0
   account=page.locator('[data-action=ledger][data-id="'+BANK+'"]');
   try:account.first.click()
   except Exception:
    print('accounts errors',errors, 'content',page.locator('#cn-root').inner_text(),flush=True);page.screenshot(path=str(OUT/'account-failure.png'),full_page=True);raise
   f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for();expect(page.locator('#modal-tela-contextual')).not_to_have_class(re.compile('oculto'));assert page.locator('#cn-root').count()==1
   label='CONTEXT_UI_'+device+'_'+theme+'_'+uuid.uuid4().hex[:5]
   f.locator('[data-action=new]').click();assert f.locator('#entry-account').input_value()==BANK;assert len(f.locator('#entry-account option').all())==2
   f.locator('#entry-description').fill(label);f.locator('#entry-amount').fill('10,01');f.locator('#entry-date').fill('2026-10-08');cat=f.locator('#entry-category option').nth(1).get_attribute('value');f.locator('#entry-category').select_option(cat);f.locator('#entry-form button[type=submit]').click();f.locator('#panel-layer').wait_for(state='hidden');f.locator('#search').fill(label);expect(f.locator('[data-key]')).to_have_count(1);page.locator('.modal-contextual-cabecalho button').click();expect(page.locator('#modal-tela-contextual')).to_have_class(re.compile('oculto'));assert page.locator('#cn-root').count()==1
   # Fatura escolhida: data de agosto, competência de outubro. O servidor preserva ambos.
   page.evaluate("navegarPara('FaturasCartao')");page.wait_for_function('pacoteFaturaCartao && pacoteFaturaCartao.Lancamentos');page.locator('button[onclick="novoLancamentoNestaFaturaCartao()"]').click();f=page.frame_locator('#ln-live-frame');
   try:f.locator('#entry-form').wait_for()
   except Exception:
    print('invoice errors',errors,'frame',f.locator('body').inner_text(),flush=True);page.screenshot(path=str(OUT/'invoice-failure.png'),full_page=True);raise
   assert f.locator('[data-type=transfer]').is_disabled();assert f.locator('[data-mode=installment]').is_disabled()
   f.locator('#entry-description').fill(label+' invoice');f.locator('#entry-amount').fill('20,03');f.locator('#entry-date').fill('2026-08-28');f.locator('#entry-category').select_option(cat);f.locator('#entry-form button[type=submit]').click();f.locator('#panel-layer').wait_for(state='hidden');f.locator('#search').fill(label+' invoice');expect(f.locator('[data-key]')).to_have_count(1);page.locator('.modal-contextual-cabecalho button').click();assert page.locator('#corpo-fatura-cartao').count()==1;page.wait_for_function('(label)=>pacoteFaturaCartao.Lancamentos.some(e=>e.Descricao===label)',arg=label+' invoice')
   page.evaluate("navegarPara('Lancamentos')");f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for();f.locator('[data-action=filters]').click();pack=page.evaluate('MukiranaLancamentosStore.load()');credit=next(a['id'] for a in pack['accounts'] if a.get('linkedGroup')=='20000000-2000-4000-8000-200000000001');f.locator('[data-filter=account]').select_option(credit);f.locator('#search').fill(label+' invoice');expect(f.locator('[data-key]')).to_have_count(1)
   # Card do Painel abre os rateios na modal e conserva a página de origem.
   page.evaluate("navegarPara('Dashboard')");pf=page.frame_locator('#painel-frame');pf.locator('[data-rateios]').wait_for();expect(pf.locator('[data-accounts-total]')).to_be_visible();pf.locator('[data-rateios]').first.click();f=page.frame_locator('#ln-live-frame');f.locator('#rt-workspace').wait_for();assert page.locator('#painel-frame').count()==1;expect(page.locator('#modal-tela-contextual')).not_to_have_class(re.compile('oculto'));page.screenshot(path=str(OUT/(device+'-'+theme+'-rateios.png')),full_page=True);page.locator('.modal-contextual-cabecalho button').click();page.wait_for_function("getComputedStyle(document.getElementById('modal-tela-contextual')).opacity==='0'");expect(pf.locator('[data-accounts-total]')).to_be_visible();pf.locator('body').evaluate("()=>window.scrollTo({top:0,left:0,behavior:'instant'})");assert page.locator('#painel-frame').count()==1
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),device+' overflow'
   page.screenshot(path=str(OUT/(device+'-'+theme+'-painel.png')),full_page=True);results.append({'device':device,'theme':theme,'result':'PASS'});print(results[-1],flush=True);context.close()
 browser.close()
(OUT/'browser-contextos.json').write_text(json.dumps(results,indent=2))
