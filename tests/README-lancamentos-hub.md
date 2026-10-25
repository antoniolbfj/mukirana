# Testes do hub de Lançamentos

PostgreSQL 17 no container local `mukirana-cartoes-v2-test`. Nenhuma API financeira
real é usada pelos gateways. Os nomes de banco permitidos são exclusivos dos testes.

```bash
MUKIRANA_TEST_DB=rateios_v4_browser python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_browser node tests/lancamentos-hub-backend.cjs
MUKIRANA_TEST_DB=rateios_v4_browser python tests/lancamentos-hub-browser.py
MUKIRANA_TEST_DB=rateios_v4_browser MUKIRANA_DEVICE=desktop MUKIRANA_THEME=claro MUKIRANA_EDGE=1 python tests/lancamentos-hub-browser.py
MUKIRANA_TEST_DB=rateios_v4_browser MUKIRANA_DEVICE=smartphone MUKIRANA_THEME=sepia MUKIRANA_EDGE=1 python tests/lancamentos-hub-browser.py
MUKIRANA_TEST_DB=rateios_v4_browser node tests/recorrencias-projetos-retirados.cjs
```

O navegador usa as duas interfaces, os três temas, a moldura real e os
controllers/serviços reais. Verifica cadastro, todas as contas, vazio, filtros,
valor global, edição direta, lote, ordenação, visões, rascunho, marca e permissões.
EDGE inclui data futura/situação, troca de conta e concorrência real com outra
gravação no banco local. Saídas por execução ficam em `/workspace/work/lancamentos-hub`.

Os testes financeiros anteriores devem usar bancos separados recém-preparados
quando dependem dos totais iniciais das fixtures:

```bash
MUKIRANA_TEST_DB=rateios_v4_accounts python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_accounts node tests/contas-tipos-backend.cjs
MUKIRANA_TEST_DB=rateios_v4_ledger python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_ledger node tests/lancamentos-v3-backend.cjs
MUKIRANA_TEST_DB=rateios_v4_test python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_test node tests/rateios-v4-backend.cjs
MUKIRANA_TEST_DB=rateios_v4_test node tests/rateios-v4-concurrency.cjs
```
