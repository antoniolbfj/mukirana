"""Barra global mensal, rascunho explícito, layout e persistência no frame real."""
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
import json, re
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'docs/archive/telas-anteriores-v40/Lancamentos_Prototipo_Demo.html').read_text()
WRAPPER=(ROOT/'docs/archive/telas-anteriores-v40/Lancamentos_Prototipo_View.html').read_text()
OUT=Path('/workspace/work/lancamentos-prototipo');OUT.mkdir(parents=True,exist_ok=True)
RESULTS=[]

def set_clock(page,month=10):
    page.clock.set_fixed_time(datetime(2026,month,24,12,tzinfo=timezone.utc))

def monthly(page,start,end,save=False,preset=None):
    page.locator('[data-action="period"]').click()
    if preset:
        page.locator('#period-preset').select_option(preset)
    else:
        page.locator('#period-start').fill(start)
        page.locator('#period-end').fill(end)
    if save:page.locator('#save-period').check()
    page.locator('#dialog-form button[type="submit"]').click()

def navigate(page,route,phone):
    if phone:page.locator('[data-action="demo-menu"]').click();page.locator(f'#action-sheet [data-demo-route="{route}"]').click()
    else:page.locator(f'.sidebar [data-demo-route="{route}"]').click()

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    for name,w,h,ui in [('desktop',1440,900,'large'),('tablet',820,1180,'large'),('smartphone',390,844,'phone')]:
        c=b.new_context(viewport={'width':w,'height':h},locale='pt-BR');page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));set_clock(page)
        c.route('https://mukirana.test/**',lambda r:r.fulfill(body=HTML,content_type='text/html; charset=utf-8'))
        page.goto('https://mukirana.test/?ui='+ui);page.wait_for_selector('[data-entry]')
        baseline=page.locator('#global-available').inner_text();assert '4.892,10' in baseline
        assert page.locator('#demo-global input[type="month"]').count()==2
        assert page.locator('#demo-global input[type="date"]').count()==0
        page.locator('#search').fill('nada corresponde');assert page.locator('#global-available').inner_text()==baseline
        page.locator('#search').fill('')
        page.evaluate('scrollTo(0,500)');assert abs(page.locator('#demo-global').bounding_box()['y'])<=1
        page.evaluate('scrollTo(0,0)')
        for route in ['accounts','cards','categories','overview','entries']:
            navigate(page,route,ui=='phone');assert page.locator('#demo-global').is_visible();assert page.locator('#global-available').inner_text()==baseline
        monthly(page,'2026-01','2026-03');assert page.locator('#demo-global-end').input_value()=='2026-03'
        navigate(page,'accounts',ui=='phone');assert page.locator('#demo-global-start').input_value()=='2026-01';navigate(page,'entries',ui=='phone')
        monthly(page,'2026-09','');assert page.locator('#demo-global-end').input_value()=='2026-10'
        monthly(page,'','2026-08');assert page.locator('#demo-global-start').input_value()==''
        monthly(page,'2026-12','2026-01');assert page.locator('#dialog-error').inner_text();page.locator('[data-close="dialog"]').click()
        monthly(page,'','',preset='current')
        page.locator('[data-action="new"]').click();page.locator('#entry-description').fill('Descartar este preenchimento');page.locator('.panel-head [data-close="panel"]').click()
        assert page.locator('#dialog button').all_inner_texts()==['Sair','Sair e salvar rascunho']
        page.keyboard.press('Escape');assert page.locator('#dialog-layer').is_visible()
        page.locator('[data-action="exit-discard"]').click();page.locator('#dialog-layer').wait_for(state='hidden')
        page.locator('[data-action="new"]').click();assert page.locator('#entry-description').input_value()==''
        page.locator('#entry-description').fill('Meu rascunho');page.locator('#entry-amount').fill('42,35')
        if ui=='large':
            dims=page.locator('.panel-body').evaluate('(e)=>({client:e.clientHeight,scroll:e.scrollHeight})');assert dims['scroll']==dims['client'],dims
            assert page.locator('#entry-account').bounding_box()['y'] == page.locator('#entry-category').bounding_box()['y']
        else:
            assert page.locator('#entry-account').bounding_box()['y'] < page.locator('#entry-category').bounding_box()['y']
            page.set_viewport_size({'width':844,'height':390});assert page.locator('#entry-description').input_value()=='Meu rascunho';page.set_viewport_size({'width':w,'height':h})
        page.wait_for_timeout(200);page.screenshot(path=str(OUT/(name+'-compacto.png')),full_page=True)
        page.locator('.panel-head [data-close="panel"]').click();page.locator('[data-action="exit-save-draft"]').click();page.locator('#dialog-layer').wait_for(state='hidden')
        page.reload();page.locator('[data-action="resume-draft"]').click();assert page.locator('#entry-description').input_value()=='Meu rascunho';assert page.locator('#entry-amount').input_value()=='42,35'
        page.locator('.panel-head [data-close="panel"]').click();page.locator('[data-action="exit-discard"]').click();page.locator('#dialog-layer').wait_for(state='hidden');assert page.locator('#draft-banner').is_hidden()
        # Sem preferência explicitamente salva, um novo acesso volta ao mês atual.
        monthly(page,'2026-01','2026-02');other=c.new_page();set_clock(other);other.goto('https://mukirana.test/?ui='+ui);assert other.locator('#demo-global-start').input_value()=='2026-10';other.close()
        monthly(page,'','',save=True,preset='previous');other=c.new_page();set_clock(other,11);other.goto('https://mukirana.test/?ui='+ui);assert other.locator('#demo-global-start').input_value()=='2026-10';other.close()
        assert not errors,errors;assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        RESULTS.append({'device':name,'globalMonthlyBalance':'PASS','explicitDraft':'PASS','compactLayout':'PASS'});c.close()

    # Executa o wrapper publicado com isolamento de origem e a ponte restrita real.
    wrapper=re.sub(r'<\?!=[\s\S]*?\?>',lambda _:json.dumps(HTML).replace('<','\\u003c'),WRAPPER)
    host='<!doctype html><html><body><div id="app-container"><nav id="menu-lateral"></nav><main id="conteudo-principal"><div id="topbar-app"></div><div id="conteudo-tela">'+wrapper+'</div></main></div><script>function registrarTelaAtualMukirana(){} function navegarPara(route){document.body.dataset.route=route;document.querySelector("#conteudo-tela").innerHTML="Tela real de teste";}</script></body></html>'
    c=b.new_context(viewport={'width':1280,'height':900});page=c.new_page();set_clock(page);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://mukirana.test/**',lambda r:r.fulfill(body=host,content_type='text/html; charset=utf-8'));page.goto('https://mukirana.test/host');f=page.frame_locator('#mk-lancamentos-demo-frame')
    f.locator('[data-action="new"]').click();f.locator('#entry-description').fill('Rascunho no ambiente de avaliação');f.locator('#entry-amount').fill('88,70')
    f.locator('.panel-head [data-close="panel"]').click();f.locator('[data-action="exit-save-draft"]').click();f.locator('#dialog-layer').wait_for(state='hidden')
    assert page.evaluate('JSON.parse(localStorage.getItem("mk-demo-lanc-v2-draft")).draft.amount')=='88,70'
    page.reload();f=page.frame_locator('#mk-lancamentos-demo-frame');f.locator('[data-action="resume-draft"]').click();assert f.locator('#entry-description').input_value()=='Rascunho no ambiente de avaliação'
    f.locator('.panel-head [data-close="panel"]').click();f.locator('[data-action="exit-discard"]').click();f.locator('#dialog-layer').wait_for(state='hidden')
    assert page.evaluate('localStorage.getItem("mk-demo-lanc-v2-draft")') is None
    # Sem allow-same-origin: o conteúdo da prévia não pode ler dados do aplicativo.
    assert page.frames[1].evaluate('(()=>{try{parent.localStorage.length;return false}catch{return true}})()')
    f.locator('.sidebar [data-action="leave-demo"]').click();page.wait_for_function('document.body.dataset.route==="Lancamentos"');assert page.evaluate('typeof window.MukiranaLancamentosPrototipo')=='undefined'
    assert not errors,errors
    RESULTS.append({'device':'wrapper publicado','draftPersistence':'PASS','isolationAndCleanup':'PASS'});c.close();b.close()
(OUT/'refinamento-verification.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2))
print(json.dumps(RESULTS,ensure_ascii=False))
