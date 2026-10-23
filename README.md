# Mukirana

Aplicação de finanças individuais com interface HTML/CSS/JavaScript, backend
Google Apps Script e PostgreSQL no Supabase. O acesso usa código temporário de
e-mail e sessões próprias por navegador.

## Funcionalidades

- Contas de Consumo, Investimento e Cartão de Crédito, com saldo atual calculado.
- Categorias e subcategorias individuais em uma única tabela hierárquica.
- Receitas e despesas únicas: cadastro, consulta, edição e exclusão.
- Valores em centavos, classificação fixa/variável e datas passadas ou futuras.
- Filtros de período, natureza, conta, categoria, classificação e descrição.
- Resultado do período, saldo atual e posição acumulada até o fim do período.
- Criação rápida de conta, categoria ou subcategoria dentro do lançamento.
- Saldo inicial como movimentação especial, com data e edição pelo cadastro da
  conta. Excluí-lo na lista limpa o valor inicial e preserva a conta.
- Proteção de contas/categorias com movimentações, categorias reservadas,
  versões concorrentes e acesso de outros usuários.
- Interface responsiva com temas claro, escuro e sépia; diagnósticos reais de
  leitura disponíveis dentro do aplicativo.

As modalidades parcelada e recorrente, transferências e compartilhamentos serão
entregues em módulos próprios. O período selecionado é mantido em memória durante
a navegação; preferência de período salva por usuário será uma entrega posterior.

## Organização

`authentication`, `accounts`, `categories` e `transactions` contêm os contratos,
serviços e DAOs de cada módulo. `web/ApiController.js` é a fronteira da interface;
as funções e objetos internos terminam em `_`. `infrastructure/SupabaseDao.js`
centraliza o acesso às RPCs. A interface existente fica em `generated/App.html`,
com os módulos adicionais incluídos por `web/WebController.js`.

As regras de dados e as migrações estão descritas em [supabase/README.md](supabase/README.md).
As decisões desta entrega estão em [docs/lancamentos-unicos.md](docs/lancamentos-unicos.md).

## Configuração e publicação

O projeto Apps Script está vinculado por `.clasp.json`. Configure nas propriedades
privadas do script `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. A chave de servidor fica
exclusivamente no backend. Não a inclua no HTML, no código-fonte ou no Git.

Aplique as migrações ao projeto Supabase correspondente. As tabelas privadas têm
RLS e nenhum acesso direto pelas roles da API; somente RPCs específicas permitem
operações com sessão válida e verificação de propriedade.

Com o clasp autenticado na conta proprietária:

```sh
clasp push
clasp create-version "Mukirana: lançamentos únicos"
clasp create-deployment -V NUMERO_DA_VERSAO -d "Mukirana: lançamentos únicos"
```

O manifesto configura execução pela conta responsável pela implantação e acesso
web público. A autenticação própria protege os dados dentro do aplicativo.

## Verificação

Node.js 18+ e Python 3 são necessários apenas no desenvolvimento. Para o navegador,
instale `requirements-dev.txt` e o Chromium. O teste usa o Chromium do sistema
quando disponível, ou o navegador instalado pelo Playwright.

```sh
npm test
npm run check
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
npm run test:ui
```

Os testes de navegador usam uma ponte Apps Script simulada, sem enviar e-mails.
Os testes SQL em `supabase/checks` exercitam o banco real com dados isolados em
subtransações revertidas. A instalação desta entrega passou por 48 asserções de
lançamentos no banco, 16 grupos de contratos/utilitários e 20 fluxos de interface.

As migrações registradas aqui foram recuperadas do histórico efetivamente aplicado
no Supabase. As estruturas de autenticação e contas anteriores à primeira migração
do repositório já existiam no ambiente; este diretório não representa uma instalação
completa dessas fundações em um banco vazio.
