# Rateios, acertos e painel conectado

PostgreSQL 17 local, container `mukirana-cartoes-v2-test`; exclusivamente dados fictícios.
`rateios-v4-upgrade.py` recria somente `rateios_v4_test` (ou os bancos de teste
`rateios_v4_accounts`, `rateios_v4_ledger`, `rateios_v4_browser`, escolhidos por
`MUKIRANA_TEST_DB`). Aplica a base anterior, popula três acertos legados e depois a
migração v4; compara todos os campos históricos e referências.

```bash
python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_test node tests/rateios-v4-backend.cjs
MUKIRANA_TEST_DB=rateios_v4_test node tests/rateios-v4-concurrency.cjs
MUKIRANA_TEST_DB=rateios_v4_test node tests/painel-v4-regras.cjs
MUKIRANA_TEST_DB=rateios_v4_test python tests/rateios-v4-browser.py
```

O navegador usa os templates reais e o gateway Apps Script em VM sobre o PostgreSQL,
com computador, tablet e smartphone. Verifica período/saldo globais, patrimônio,
metas de família, revisão, acerto, rascunho, rotação, perda de resposta e retomada
idempotente, ausência de overflow e de erros JavaScript. A interface de iframe recebe
a escolha de dispositivo do contêiner, preservada durante a rotação.

`rateios-v4.sql` contém 28 ASSERTs e um caso de excesso esperado, em BEGIN/ROLLBACK.
Pode ser executado no Supabase conectado: todos os usuários e movimentos são
fictícios e a transação é revertida. Não usar os demais testes de aplicação no banco
real. Os testes v3 de Lançamentos e de tipos de Contas também devem passar; executar
Contas em banco recém-preparado, pois suas expectativas usam os totais da fixture.

Decisões atuais de acerto (despesa/receita próprias, ambas as direções e um abatimento)
substituem a redação anterior que o classificava como transferência. Pagamentos de
fatura existentes são apenas vinculados/reconhecidos, preservando seus efeitos.
