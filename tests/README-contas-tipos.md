# Testes de tipos de Contas

PostgreSQL 17 local no container `mukirana-cartoes-v2-test`, sem tokens reais.
Preparar banco vazio `contas_types_test` com `fixtures/schema-v32.sql`, migrações em
ordem e `fixtures/cartoes-v2.sql`, além de uma categoria de teste. Fixtures são locais.

```bash
MUKIRANA_TEST_DB=contas_types_test node tests/contas-tipos-backend.cjs
MUKIRANA_TEST_DB=contas_types_test python tests/contas-tipos-browser.py
MUKIRANA_TEST_DB=contas_types_test python tests/contas-tipos-concurrency.py
python tests/contas-tipos-upgrade.py
```

O upgrade cria exclusivamente `contas_upgrade_test` no mesmo PostgreSQL local,
aplica a base anterior, popula dados fictícios e então aplica a migração de tipos.
O gateway compartilha os controllers reais de Contas/Lançamentos/Cartões e os
navegadores renderizam os templates reais. Os testes de aplicação fazem gravações
apenas nesses bancos locais.

`contas-tipos.sql` tem 29 ASSERTs com usuários aleatórios e BEGIN/ROLLBACK e também
pode validar o Supabase sem persistir dados. Os demais testes SQL anteriores continuam
verificando as regras de compatibilidade. O teste antigo de crédito em fatura agora
simula a redução da compra após o pagamento, preservando os totais esperados sem
criar um pagamento maior que a dívida disponível.
