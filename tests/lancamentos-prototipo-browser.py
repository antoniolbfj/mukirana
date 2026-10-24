"""Conferência da prévia: HTML real, dinheiro/datas e fluxos nas duas interfaces.

Executar: python tests/lancamentos-prototipo-browser.py
Requer Playwright Python e Chromium em /usr/bin/chromium. Não usa o banco.
"""
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
import json

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'Lancamentos_Prototipo_Demo.html').read_text()
OUT = Path('/workspace/work/lancamentos-prototipo')
OUT.mkdir(parents=True, exist_ok=True)
RESULTS = []


def search(page, text):
    page.locator('#search').fill(text)


def close_editor(page):
    page.locator('.panel-head [data-close="panel"]').click()
    page.locator('[data-action="exit-discard"]').click()
    page.locator('#dialog-layer').wait_for(state='hidden')


def period(page, start, end):
    page.locator('[data-action="period"]').click()
    page.locator('#period-start').fill(start[:7])
    page.locator('#period-end').fill(end[:7])
    page.locator('#dialog-form button[type="submit"]').click()


def new_entry(page, description, amount='100,00'):
    page.locator('[data-action="new"]').click()
    page.locator('#entry-description').fill(description)
    if description == 'Super': page.locator('[data-history="market"]').wait_for(state='visible')
    page.locator('#entry-amount').fill(amount)
    page.locator('#entry-category').select_option('shopping')


def run_device(browser, name, size, ui, user_agent=None):
    options = {'viewport': size}
    if user_agent:
        options['user_agent'] = user_agent
    ctx = browser.new_context(**options)
    page = ctx.new_page()
    page.clock.set_fixed_time(datetime(2026, 10, 24, 12, tzinfo=timezone.utc))
    errors, unexpected = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: unexpected.append(r.url) if r.url != 'https://mukirana.test/?ui='+ui else None)
    page.route('https://mukirana.test/**', lambda r: r.fulfill(body=HTML, content_type='text/html; charset=utf-8'))
    page.goto('https://mukirana.test/?ui='+ui)
    page.wait_for_selector('[data-entry]')
    assert page.locator('body').get_attribute('data-interface') == ('phone' if ui == 'phone' else 'large')
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), name
    page.screenshot(path=str(OUT / (name+'.png')), full_page=True)
    assert page.locator('[data-renew]').is_visible()

    # A projeção global é independente da busca, da visão e dos filtros da lista.
    baseline=page.locator('#global-available').inner_text()
    assert '4.892,10' in baseline
    search(page, 'Supermercado')
    assert '144,95' in page.locator('[data-entry] .row-value').inner_text()
    page.locator('[data-view="cash"]').click()
    assert '289,90' in page.locator('[data-entry] .row-value').inner_text()
    assert page.locator('#global-available').inner_text() == baseline
    page.locator('[data-view="economic"]').click()
    search(page, '')

    # Participante não altera a conta privada do autor. Aprova sua categoria,
    # sem aprovar automaticamente a participação de João.
    page.locator('[data-detail="lunch"]').click()
    assert page.locator('[data-edit="lunch"]').count() == 0
    page.locator('[data-action="approve"]').click()
    assert page.locator('#approval-error').inner_text()
    page.locator('#approval-category').select_option('restaurant')
    page.locator('[data-action="approve"]').click()
    assert page.locator('.approval-card').count() == 0
    assert 'Aguardando aprovação' in page.locator('#panel').inner_text()
    page.locator('.panel-head [data-close="panel"]').click()

    # Histórico e favoritos reutilizam metadados, apagam o valor e focam nele.
    new_entry(page, 'Super')
    page.locator('[data-history="market"]').click()
    assert page.locator('#entry-amount').input_value() == ''
    assert page.locator('#entry-category').input_value() == 'market'
    page.wait_for_timeout(60)
    assert page.locator('#entry-amount').evaluate('(e)=>e===document.activeElement')
    page.locator('#entry-amount').fill('42,00')
    page.locator('[data-favorite="1"]').click()
    assert page.locator('#entry-amount').input_value() == ''
    page.locator('#entry-description').fill('Nova compra')
    page.locator('#entry-amount').fill('100,00')

    # Cadastro contextual conserva descrição/valor e seleciona o novo item.
    page.locator('[data-action="quick-category"]').click()
    page.locator('#quick-name').fill('Equipamentos')
    page.locator('#quick-parent').select_option('shopping')
    page.locator('#dialog-form button[type="submit"]').click()
    assert page.locator('#entry-category option:checked').inner_text() == '↳ Equipamentos'
    assert page.locator('#entry-amount').input_value() == '100,00'
    page.locator('[data-action="quick-account"]').click()
    page.locator('#quick-name').fill('Minha conta demo')
    page.locator('#dialog-form button[type="submit"]').click()
    assert page.locator('#entry-account option:checked').inner_text() == 'Minha conta demo'
    assert page.locator('#entry-description').input_value() == 'Nova compra'

    # Parcela pelo total, residual na primeira e âncora restaurada após fevereiro.
    page.locator('[data-mode="installment"]').click()
    page.locator('#entry-date').fill('2026-01-31')
    page.locator('#entry-date').dispatch_event('input')
    page.locator('#schedule-preview details').evaluate('(e)=>e.open=true')
    preview = page.locator('#schedule-preview').inner_text()
    assert '33,34' in preview and '33,33' in preview
    assert '31/01' in preview and '28/02' in preview and '31/03' in preview
    page.locator('#entry-sharing').check()
    page.locator('[data-person="joao"]').check()
    assert '33,34' in page.locator('#sharing').inner_text()
    page.locator('[data-share-mode="percent"]').click()
    page.locator('[data-share-value="me"]').fill('60,00')
    page.locator('[data-share-value="me"]').dispatch_event('change')
    assert page.locator('[data-share-value="marina"]').input_value() == '20,00'
    if ui == 'phone':
        page.set_viewport_size({'width': 844, 'height': 390})
        assert page.locator('#entry-description').input_value() == 'Nova compra'
        assert page.locator('body').get_attribute('data-interface') == 'phone'
        page.set_viewport_size(size)
    page.locator('.panel-body').evaluate('(e)=>e.scrollTop=0')
    page.screenshot(path=str(OUT / (name+'-cadastro.png')), full_page=True)
    page.locator('#entry-submit').click()
    assert page.locator('#panel-layer').is_hidden()
    period(page, '2026-01-01', '2026-03-31')
    search(page, 'Nova compra')
    assert page.locator('[data-entry]').count() == 3
    page.locator('[data-entry] [data-detail]').first.click()
    assert '100,00' in page.locator('.mini-group').inner_text()
    share_rows=page.locator('#panel .share-person')
    assert share_rows.count() == 3
    assert all(t.replace('R$','').strip() != '0,00' for t in share_rows.locator('strong').all_inner_texts())
    page.locator('.panel-head [data-close="panel"]').click()

    # Recorrência finita, término exclusivo e rateio independente da modalidade.
    search(page, '')
    new_entry(page, 'Curso recorrente', '10,00')
    page.locator('[data-mode="recurring"]').click()
    page.locator('#entry-date').fill('2026-01-15')
    page.locator('#entry-date').dispatch_event('input')
    page.locator('#schedule-preview details').evaluate('(e)=>e.open=true')
    text=page.locator('#schedule-preview').inner_text()
    assert '3 ocorrências' in text and '15/03' in text and '15/04' in text
    assert page.locator('.preview-table tbody tr').count() == 3
    page.locator('#entry-submit').click()
    search(page, 'Curso recorrente')
    assert page.locator('[data-entry]').count() == 3
    page.locator('[data-entry] [data-detail]').nth(1).click()
    page.locator('[data-edit]').click()
    page.locator('#entry-amount').fill('20,00')
    page.locator('#entry-submit').click()
    assert page.locator('[name="scope"]').count() == 3
    page.locator('#dialog-form button[type="submit"]').click()
    page.locator('[data-entry] [data-detail]').nth(1).click()
    assert '40,00' in page.locator('.mini-group').inner_text()
    page.locator('[data-delete]').click()
    assert page.locator('[name="scope"]').count() == 4
    page.locator('[name="scope"][value="previous"]').check()
    page.locator('#dialog-form button[type="submit"]').click()
    assert page.locator('[data-entry]').count() == 1
    page.locator('#toast [data-action="undo"]').click()
    assert page.locator('[data-entry]').count() == 3

    # Transferências são um tipo no mesmo formulário e rejeitam origem=destino.
    new_entry(page, 'Guardar')
    page.locator('[data-type="transfer"]').click()
    assert page.locator('#entry-category').count() == 0
    assert page.locator('[data-mode]').count() == 0
    page.locator('#entry-destination').select_option('daily')
    page.locator('#entry-submit').click()
    assert 'contas diferentes' in page.locator('#entry-error').inner_text()
    close_editor(page)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert not errors, errors
    assert not unexpected, unexpected
    RESULTS.append({'device':name,'result':'PASS','external_requests':0})
    ctx.close()


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    run_device(browser,'desktop',{'width':1440,'height':1000},'large')
    run_device(browser,'tablet',{'width':820,'height':1180},'large','Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    run_device(browser,'smartphone',{'width':390,'height':844},'phone','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')

    # Mesmo isolamento da implantação: frame sem origem, storage, sessão ou bridge.
    ctx=browser.new_context(viewport={'width':1000,'height':900})
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://mukirana.test/**',lambda r:r.fulfill(body='<iframe id="demo" sandbox="allow-scripts allow-forms" style="width:100%;height:800px"></iframe>',content_type='text/html'))
    page.goto('https://mukirana.test/embedded')
    page.locator('#demo').evaluate('(e,html)=>e.srcdoc=html', HTML)
    frame=page.frame_locator('#demo')
    frame.locator('[data-action="new"]').click()
    frame.locator('#entry-description').fill('Teste isolado')
    frame.locator('#entry-amount').fill('19,90')
    frame.locator('#entry-category').select_option('shopping')
    frame.locator('#entry-submit').click()
    assert frame.locator('#panel-layer').is_hidden()
    assert not errors, errors
    RESULTS.append({'device':'iframe isolado','result':'PASS'})
    ctx.close();browser.close()

(OUT / 'verification.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2))
print(json.dumps(RESULTS,ensure_ascii=False))
