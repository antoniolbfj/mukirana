"""Hub conectado às views/controllers reais e PostgreSQL fictício. Nenhuma API real."""
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
import subprocess, json, re, os, uuid

ROOT=Path(__file__).resolve().parents[1];OUT=Path('/workspace/work/lancamentos-hub');OUT.mkdir(exist_ok=True)
assert os.environ.get('MUKIRANA_TEST_DB')=='rateios_v4_browser'
def server(method,args):
    p=subprocess.run(['node','tests/lancamentos-v3-gateway.cjs',method,json.dumps(args)],cwd=ROOT,text=True,capture_output=True)
    return json.loads(p.stdout)
def render(name):
    r=server('render',[name]);assert r['ok'],r;return r['result']
subprocess.run(['node','-e',"require('./tests/lancamentos-hub-fixture.cjs').seed()"],cwd=ROOT,check=True)
index=(ROOT/'Index.html').read_text();nav=re.search(r'<nav id="menu-lateral"[\s\S]*?</nav>',index)[0]
top=index[index.index('<div id="topbar-app"'):index.index('<div id="tela-carregamento"')]
views={'Lancamentos':render('Lancamentos_Novo_View'),'Contas':render('Contas_Tipos_View')}
boot=r'''<script>
localStorage.setItem('mukirana_token','owner-token');localStorage.setItem('mukirana_id','10000000-1000-4000-8000-100000000001');window.mukiranaTelaAtual={nomeTela:'',atualizarPeriodoGlobal:null};const views=VIEWS;window.notices=[];
function runner(state){return new Proxy(state,{get(target,key){if(key==='withSuccessHandler')return fn=>runner({...target,success:fn});if(key==='withFailureHandler')return fn=>runner({...target,failure:fn});return(...args)=>window.rpcBackend({method:key,args}).then(r=>{if(r.ok)target.success?.(r.result);else target.failure?.({message:r.error});});}})}window.google={script:{run:runner({})}};
function mostrarNotificacao(message,type){notices.push({message,type});}function definirFiltroPeriodoGlobalVisivelMukirana(){document.getElementById('topbar-filtro-periodo-global').style.display='flex';}function finalizarCarregamentoTelaMukirana(){}function atualizarVisibilidadeFabPorContexto(){}
function registrarTelaAtualMukirana(name,options){mukiranaTelaAtual={nomeTela:name,atualizarPeriodoGlobal:options.atualizarPeriodoGlobal};window.MukiranaLancamentosStore?.setView(name);}
function navegarPara(name){if(window.MukiranaLancamentosNovo?.beforeNavigate(()=>navegarPara(name)))return;document.body.classList.remove('menu-aberto');window.MukiranaLancamentosStore.setView(name);const host=document.getElementById('conteudo-tela');host.innerHTML=views[name]||'';[...host.querySelectorAll('script')].forEach(old=>{const s=document.createElement('script');s.textContent=old.textContent;document.body.append(s);old.remove();});}
function alternarMenuLateral(){document.body.classList.toggle('menu-aberto');}function fecharMenuLateral(){document.body.classList.remove('menu-aberto');}function alternarTemaSessaoMukirana(){MukiranaTema.cycle();}
</script>'''.replace('VIEWS',json.dumps(views).replace('<','\\u003c'))
HOST='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+render('Global_Estilos')+render('UX_Temas_Styles')+render('UX_Temas_Client')+render('Global_Assets')+'</head><body class="mukirana-com-topbar"><div id="app-container">'+nav+'<div id="menu-overlay" class="menu-overlay oculto" onclick="fecharMenuLateral()"></div><main id="conteudo-principal">'+top+'<div id="conteudo-tela"></div></main></div>'+boot+render('Saldo_Global_Client')+'''<script>document.querySelectorAll('[data-mukirana-logo]').forEach(i=>i.src=window.MUKIRANA_ASSETS.appIcon);document.getElementById('nome-usuario-logado').textContent='Ana Luísa de Almeida Teste';document.getElementById('menu-lateral').style.display='flex';document.getElementById('topbar-app').style.display='flex';inicializarFiltroPeriodoGlobalMukirana();navegarPara('Lancamentos');</script></body></html>'''
BANK='40000000-4000-4000-8000-400000000001';INVEST='40000000-4000-4000-8000-400000000011';EMPTY='40000000-4000-4000-8000-400000000012';INACTIVE='40000000-4000-4000-8000-400000000013';CAT_A='50000000-5000-4000-8000-500000000011';CAT_B='50000000-5000-4000-8000-500000000012'
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    for device,w,h,ua in [('desktop',1440,1000,None),('tablet',820,1180,'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),('smartphone',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')]:
        if os.environ.get('MUKIRANA_DEVICE') and os.environ['MUKIRANA_DEVICE']!=device:continue
        for theme in ['claro','escuro','sepia']:
            if os.environ.get('MUKIRANA_THEME') and os.environ['MUKIRANA_THEME']!=theme:continue
            opts={'viewport':{'width':w,'height':h},'locale':'pt-BR'}
            if ua:opts.update(user_agent=ua,has_touch=True)
            context=browser.new_context(**opts);context.expose_binding('rpcBackend',lambda source,payload:server(payload['method'],payload['args']))
            page=context.new_page();page.clock.set_fixed_time(datetime(2026,10,25,12,tzinfo=timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.route('https://mukirana.test/**',lambda r:r.fulfill(body=HOST,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/')
            page.evaluate('(theme)=>MukiranaTema.choose(theme)',theme);f=page.frame_locator('#ln-live-frame');f.locator('#hub-tools').wait_for()
            assert f.locator('body').get_attribute('data-interface')==('phone' if device=='smartphone' else 'large')
            f.locator('[data-action="filters"]').click();options=f.locator('[data-filter="account"] option').evaluate_all('(all)=>all.map(o=>o.value)')
            assert all(id in options for id in [BANK,INVEST,EMPTY,INACTIVE]);assert len(options)==len(set(options));assert 'Inativa' in f.locator('[data-filter="account"] option[value="'+INACTIVE+'"]').inner_text()
            f.locator('[data-filter="account"]').select_option(EMPTY);expect(f.locator('[data-key]')).to_have_count(0);assert f.locator('[data-filter="account"]').input_value()==EMPTY
            page.wait_for_function("document.querySelector('#ln-global-saldo strong').textContent.includes('0,00')")
            f.locator('#search').fill('não existe');assert f.locator('[data-filter="account"]').input_value()==EMPTY;f.locator('#search').fill('')
            f.locator('[data-filter="account"]').select_option(INVEST);pack=page.evaluate('MukiranaLancamentosStore.load()');assert pack['includeInvestment'] is True
            f.locator('[data-filter="account"]').select_option(BANK)
            prefix='HUB_UI_'+device+'_'+theme+'_'+uuid.uuid4().hex[:6]
            def create(label,amount):
                f.locator('[data-action="new"]').click();assert f.locator('#entry-account').input_value()==BANK
                f.locator('#entry-description').fill(label);f.locator('#entry-amount').fill(amount);f.locator('#entry-date').fill('2026-10-10');f.locator('#entry-category').select_option(CAT_A);f.locator('#entry-form button[type="submit"]').click();f.locator('#panel-layer').wait_for(state='hidden')
            f.locator('#search').fill(prefix);create(prefix+' Alpha','50,00');expect(f.locator('[data-key]')).to_have_count(1)
            page.wait_for_function("document.querySelector('#ln-global-saldo strong').textContent.includes('50,00')")
            create(prefix+' Beta','70,00');expect(f.locator('[data-key]')).to_have_count(2)
            f.locator('[data-key]').filter(has_text=prefix+' Beta').locator('[data-hub-inline][data-field="amount"]').click();f.locator('#hub-inline-value').fill('0,00');f.locator('#hub-inline-value').press('Enter');expect(f.locator('#hub-inline-error')).not_to_have_text('');assert f.locator('#hub-inline-value').input_value()=='0,00';f.locator('#hub-inline-value').press('Escape');f.locator('#hub-inline-form').wait_for(state='detached')
            f.locator('[data-key]').filter(has_text=prefix+' Beta').locator('[data-hub-inline][data-field="amount"]').click();f.locator('#hub-inline-value').fill('80,00');f.locator('#hub-inline-value').press('Enter');f.locator('#hub-inline-form').wait_for(state='detached');page.wait_for_function("document.querySelector('#ln-global-saldo strong').textContent.includes('130,00')")
            f.locator('[data-hub-inline][data-field="description"]').first.click();old=f.locator('#hub-inline-value').input_value();f.locator('#hub-inline-value').fill(old+' editado');f.locator('#hub-inline-value').press('Enter');f.locator('#hub-inline-form').wait_for(state='detached')
            # Ordenação utiliza centavos com sinal; cabeçalho também funciona nas telas grandes.
            f.locator('#hub-sort').select_option('amount:asc');values=f.locator('.row-value').all_inner_texts();assert '80,00' in values[0] and '50,00' in values[-1],values
            if device!='smartphone':
                f.locator('[data-hub-sort="amount"]').click();assert f.locator('[data-hub-sort="amount"]').locator('..').get_attribute('aria-sort')=='descending'
            else:f.locator('#hub-sort').select_option('amount:desc')
            # Seleção e categorização em lote, com atualização na tabela e no valor global.
            def select_all():
                if device=='smartphone':
                    if not f.locator('[data-select]').count():f.locator('[data-action="select"]').click()
                    for cb in f.locator('[data-select]').all():cb.check()
                else:f.locator('#select-all').check()
            select_all();f.locator('[data-hub-bulk="category"]').click();assert '2 lançamento(s)' in f.locator('#dialog').inner_text();f.locator('#hub-batch-value').select_option(CAT_B);f.locator('#dialog-form button[type="submit"]').click();f.locator('#dialog-layer').wait_for(state='hidden')
            pack=page.evaluate('MukiranaLancamentosStore.load()');entries=[e for e in pack['entries'] if e['description'].startswith(prefix)];assert len(entries)==2 and all(e['displayCategory']==CAT_B for e in entries)
            select_all();f.locator('[data-hub-bulk="classification"]').click();f.locator('#hub-batch-value').select_option('fixed');f.locator('#dialog-form button[type="submit"]').click();f.locator('#dialog-layer').wait_for(state='hidden')
            if os.environ.get('MUKIRANA_EDGE')=='1':
                beta=f.locator('[data-key]').filter(has_text=prefix+' Beta')
                def inline_field(field,value):
                    beta.locator('[data-hub-inline][data-field="description"]').click();f.locator('#hub-inline-field').select_option(field)
                    if field in ('status','account','category'):f.locator('#hub-inline-value').select_option(value)
                    else:f.locator('#hub-inline-value').fill(value)
                    f.locator('#hub-inline-value').press('Enter');f.locator('#hub-inline-form').wait_for(state='detached')
                inline_field('date','2026-10-30')
                pack=page.evaluate('MukiranaLancamentosStore.load()');be=next(e for e in pack['entries'] if e['description'].startswith(prefix+' Beta'));assert be['status']=='pending'
                inline_field('date','2026-10-10');inline_field('status','done')
                inline_field('account',INVEST);expect(f.locator('[data-key]')).to_have_count(1)
                f.locator('[data-filter="account"]').select_option('');expect(f.locator('[data-key]')).to_have_count(2)
                inline_field('account',BANK);f.locator('[data-filter="account"]').select_option(BANK)
                beta.locator('[data-hub-inline][data-field="description"]').click();f.locator('#hub-inline-value').fill(prefix+' Beta local')
                remote=server('lancamentosNovoDetalhar',['owner-token',be['id']]);assert remote['ok'],remote
                e=remote['result']['entry'];update={**e,'description':prefix+' Beta remoto','operationId':str(uuid.uuid4()),'scope':'one'}
                remote=server('lancamentosNovoSalvar',['owner-token',update]);assert remote['ok'],remote
                f.locator('#hub-inline-value').press('Enter');expect(f.locator('#hub-inline-error')).to_contain_text('alterados');assert f.locator('#hub-inline-value').input_value()==prefix+' Beta local'
                f.locator('#hub-inline-value').press('Escape');f.locator('#hub-refresh').click();expect(beta).to_contain_text('remoto')
            assert f.locator('[data-filter="project"]').count()==0 and f.locator('[data-hub-bulk="project"]').count()==0
            assert page.locator('#menu-lateral a').filter(has_text='Projetos').count()==0
            # Visão salva explicitamente, período inalterado e persistência por usuário/navegador.
            period=page.evaluate('obterFiltroPeriodoGlobalMukirana()');f.locator('#hub-views').click();f.locator('#hub-view-name').fill('Minha visão '+theme);f.locator('#dialog-form button[type="submit"]').click();f.locator('#dialog-layer').wait_for(state='hidden')
            f.locator('#hub-views').click();f.locator('[data-hub-view="all"]').click();f.locator('#hub-views').click();f.locator('[data-hub-saved="0"]').click();expect(f.locator('[data-key]')).to_have_count(2);assert f.locator('#search').input_value()==prefix.lower();assert page.evaluate('obterFiltroPeriodoGlobalMukirana()')==period
            # Alterar categoria faz a linha sair do recorte, sem apagar o filtro selecionado.
            f.locator('[data-filter="category"]').select_option(CAT_B)
            f.locator('[data-hub-inline][data-field="description"]').first.click();f.locator('#hub-inline-field').select_option('category');f.locator('#hub-inline-value').select_option(CAT_A);f.locator('#hub-inline-value').press('Enter');f.locator('#hub-inline-form').wait_for(state='detached');expect(f.locator('[data-key]')).to_have_count(1);assert f.locator('[data-filter="category"]').input_value()==CAT_B
            # Saída e retomada do rascunho da edição na linha.
            f.locator('[data-hub-inline][data-field="description"]').first.click();f.locator('#hub-inline-value').fill(prefix+' rascunho')
            page.evaluate("navegarPara('Contas')");f.locator('[data-action="save-draft"]').click();page.locator('#cn-root').wait_for();page.evaluate("navegarPara('Lancamentos')");f.locator('[data-action="resume-draft"]').wait_for();f.locator('[data-action="resume-draft"]').click()
            try:f.locator('#hub-inline-value').wait_for(timeout=5000)
            except Exception:
                print('resume errors',errors,'toast',f.locator('#toast').inner_text(),flush=True)
                print('draft',page.evaluate("localStorage.getItem('mukirana-v3:10000000-1000-4000-8000-100000000001:lancamentos-draft')"),flush=True)
                raise
            assert f.locator('#hub-inline-value').input_value()==prefix+' rascunho';f.locator('#hub-inline-value').press('Escape')
            # Moldura real e marca sem sobreposição ao perfil, nos três temas.
            if device!='desktop':
                page.evaluate("document.body.classList.add('menu-aberto')")
                page.wait_for_function("document.querySelector('#menu-lateral').getBoundingClientRect().left>=-1")
            brand=page.locator('.marca-app-lateral').bounding_box();profile=page.locator('.menu-perfil-lateral').bounding_box();title=page.locator('.marca-app-lateral h2').bounding_box();image=page.locator('.marca-app-lateral img').bounding_box();menu=page.locator('#menu-lateral').bounding_box()
            assert brand['y']+brand['height']<=profile['y'],(brand,profile)
            assert abs(title['y']+title['height']/2-image['y']-image['height']/2)<2
            assert title['x']>=menu['x'] and title['x']+title['width']<=menu['x']+menu['width']
            page.screenshot(path=str(OUT/(device+'-'+theme+'-brand.png')),full_page=True);page.evaluate("document.body.classList.remove('menu-aberto')")
            if device!='desktop':page.wait_for_function("document.querySelector('#menu-lateral').getBoundingClientRect().right<=1")
            f.locator('body').evaluate("()=>window.scrollTo({top:0,left:0,behavior:'instant'})")
            page.screenshot(path=str(OUT/(device+'-'+theme+'-hub.png')),full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),device+' outer overflow'
            assert not errors,errors
            results.append({'device':device,'theme':theme,'result':'PASS'});print(results[-1],flush=True);context.close()
    browser.close()
(OUT/('browser-edge-'+os.environ.get('MUKIRANA_DEVICE','all')+'.json' if os.environ.get('MUKIRANA_EDGE') else 'browser-subset-verification.json' if os.environ.get('MUKIRANA_DEVICE') or os.environ.get('MUKIRANA_THEME') else 'browser-verification.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2))
