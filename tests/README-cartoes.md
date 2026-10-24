# Verificação local de Cartões

Somente dados fictícios, sem chaves ou acesso ao Supabase. Requer Node, Python com
Playwright, Chromium em `/usr/bin/chromium` e PostgreSQL 17 em Docker efêmero.
Os scripts de integração usam exclusivamente o socket local do Docker e o
container `mukirana-cartoes-v2-test`, banco `cartoes_final_test`.

Preparar o banco vazio com `tests/fixtures/schema-v32.sql` (schema de teste sem
registros), aplicar as migrações SQL do repositório em ordem, cada uma em transação
única (`psql --single-transaction -v ON_ERROR_STOP=1`), e carregar
`tests/fixtures/cartoes-v2.sql`. Não executar esse preparo no banco real.

Executar da raiz:

```bash
node tests/contas-v2-backend.cjs
node tests/cartoes-v2-backend.cjs
python tests/cartoes-v2-concurrency.py
python tests/cartoes-v2-browser.py
```

Os arquivos `tests/contas-v2.sql` e `tests/cartoes-v2.sql` contêm seus próprios BEGIN/
ROLLBACK e podem ser executados via psql no banco de teste. Na validação remota,
somente esses testes transacionais foram executados; fixtures persistentes e
injeção de falhas/triggers foram restritas ao PostgreSQL efêmero.

A integração de navegador usa as Views reais, os controllers Apps Script em uma
VM Node e RPCs reais do PostgreSQL. A autenticação é fictícia e não substitui a
homologação do usuário autenticado no Google.
