# Verificação de Lançamentos

Usa Node, Python/Playwright, Chromium e PostgreSQL 17 local no container
`mukirana-cartoes-v2-test`, banco `lancamentos_v3_test`. Não usa tokens reais.
Preparar banco vazio com `fixtures/schema-v32.sql`, aplicar as migrações em ordem
e carregar `fixtures/cartoes-v2.sql`. O fixture é exclusivamente local.

```bash
node tests/lancamentos-v3-backend.cjs
node tests/lancamentos-v3-concurrency.cjs
python tests/lancamentos-v3-browser.py
node tests/contas-v2-backend.cjs
node tests/cartoes-v2-backend.cjs
```

`lancamentos-v3.sql` cria dados fictícios dentro de BEGIN/ROLLBACK, tem 37 ASSERTs
e pode verificar também o Supabase sem persistir registros. O gateway executa os
controllers Apps Script reais em VM, e o navegador renderiza os templates reais.
A homologação autenticada no Google é uma etapa distinta desses testes.
