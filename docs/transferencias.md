# Transferências entre contas próprias

Implementa RQ-TRF-01 a RQ-TRF-03 e integra RQ-CON-06/09/10/11 e RQ-SAL-01/02/03.
O refinamento visual continua reservado para depois da implementação funcional.

## Operação e movimentos

A tabela privada `transfers` guarda ID, proprietário, descrição, valor em centavos,
data, conta de origem, conta de destino, versão e timestamps. Ambas as contas são
obrigatórias, distintas, ativas e do usuário autenticado. Valores são inteiros
positivos até 99.999.999.999.999 centavos. Não se impede saldo negativo.

A view privada `account_movements`, com `security_invoker`, combina os lançamentos
existentes com dois movimentos derivados de cada transferência: negativo na origem
e positivo no destino. Uma única linha contém valor e data de ambas as pontas;
não existem cópias independentes editáveis. Alterar ou excluir a operação atualiza
os dois efeitos atomicamente. A view não permite editar uma ponta isolada.

Transferência é um tipo de lançamento, junto de Receita e Despesa. Os três tipos
usam **Meus lançamentos**, a mesma lista, o mesmo formulário, os mesmos filtros
e as mesmas ações de edição/exclusão. A opção Transferência mostra conta de origem
e destino; categoria e classificação fixa/variável se aplicam a receitas/despesas.
A tela independente e seus links foram removidos na correção v0.4.1.

O backend comum `EntryService_` usa as operações já instaladas. `transactions.save`
e `transactions.delete` encaminham cada tipo ao serviço financeiro apropriado.
A consulta combina as páginas autorizadas das RPCs existentes, ordenando por data,
ID e tipo. Cada origem mantém seu próprio cursor e só avança até o último item
que foi entregue ao navegador. Isso preserva paginação completa mesmo com IDs
iguais nas duas tabelas. A chave visual inclui tipo e ID.

O filtro de tipo admite Todos, Receita, Despesa e Transferência; uma conta inclui
transferências em que aparece como origem ou destino. Filtros de categoria ou
classificação se aplicam apenas aos lançamentos que possuem esses atributos. Ao
selecionar somente Transferências, os dois filtros são limpos e desabilitados.
Transferências entram na contagem de lançamentos uma vez e têm efeito zero nos
cards de receitas, despesas e resultado.

A correção preserva as tabelas, RPCs e dados financeiros já instalados; não requer
outro SQL. Pagamento de cartão continua sendo transferência para a conta de Cartão;
aporte/resgate usa a conta de Investimento, com ambas as pontas alteradas juntas.

## Saldos, consulta e concorrência

Os saldos de Contas e de Lançamentos usam o mesmo cálculo derivado dos movimentos.
Saldo atual considera até hoje no fuso America/Sao_Paulo. Projeção considera o
histórico completo até a data final do período, sem cortar movimentos anteriores
à data inicial. Transferências futuras alteram a projeção; o efeito consolidado
entre todas as contas é sempre zero.

O período é o mesmo objeto em memória usado por Lançamentos. Há busca literal por
descrição, filtro por conta (origem ou destino), paginação por data/ID e contagem
de lançamentos que inclui cada transferência uma vez, independentemente da paginação.
Os totais de receitas/despesas não incorporam valores de transferências.

Todas as RPCs revalidam a sessão e a propriedade. FKs compostas incluem o usuário.
A trava do proprietário precede as travas de registros, conforme os módulos
existentes. ID estável e versão esperada permitem repetição idempotente de uma
gravação após perda de resposta e recusam alterações/exclusões de versões antigas.
Contas vinculadas são protegidas contra exclusão, inclusive se a transferência
for futura; a opção de renomeação permanece disponível.

Tabelas e view não têm acesso direto por roles da API. RPCs têm `search_path` vazio
e EXECUTE apenas para `service_role`. Nenhuma identidade, credencial ou propriedade
vem do navegador. Não há armazenamento financeiro no localStorage.

## Instalação e validação

**Instalação remota confirmada em 24/10/2026.** O SQL foi executado manualmente
no SQL Editor, depois de duas falhas técnicas do conector. A tabela, a view com
`security_invoker=true` e as RPCs na revisão 1 foram conferidas no Supabase.
A instalação manual não foi registrada como migração MCP.

O arquivo `supabase/pending/enable_own_account_transfers.sql` foi mantido como
registro da instalação, com status atualizado. **Não executá-lo novamente.**
Ele instala a estrutura e executa 60 verificações na mesma transação, revertendo
toda a instalação em caso de falha e descartando todas as fixtures antes do commit.

A validação inicial foi feita em PostgreSQL 17.11 isolado, sem rede e sem dados reais, com
a estrutura atual recuperada do catálogo do Supabase. Passaram:

- 60 verificações SQL de transferências, precisão, sessões, propriedade e ACL;
- quatro cenários com conexões concorrentes reais: criar, editar, excluir e
  proteger contas de movimentações simultâneas;
- 48 verificações anteriores de lançamentos e 20 de categorias;
- 24 grupos de contratos e utilitários de backend;
- 20 fluxos anteriores de navegador e 17 novos de transferências, com ponte Apps
  Script simulada, em desktop e celular.

Os testes de concorrência exigem banco isolado e
`MUKIRANA_TEST_DATABASE_ISOLATED=1`. O prefixo de execução psql pode ser configurado
por `MUKIRANA_TEST_PSQL` como uma lista JSON; não executar esse teste em produção.
Os scripts SQL anteriores usam configuração local de transação: ao executá-los
via psql, usar `--single-transaction`.

No Supabase, passaram novamente as 60 verificações de transferências e as 48 de
lançamentos, com zero usuários de teste restantes. Foram confirmadas as quatro
RPCs pela API REST: health check saudável e consulta/gravação/exclusão sem sessão
recusadas com `invalid_session` e HTTP 200. Não houve envio de e-mails nem alteração
de dados financeiros reais.

Os advisors não apontaram WARN/ERROR. Os únicos resultados informativos foram
[RLS habilitado sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
esperado nas tabelas privadas com negação de acesso direto, e
[índice ainda sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
para `transactions_owner_date_idx`, mantido para a paginação por proprietário/data.

A versão 5 corresponde à entrega anterior, com tela independente. A correção
v0.4.1 publica uma nova versão do Apps Script com a experiência unificada, usando
o mesmo banco instalado. A documentação da validação financeira acima permanece
válida: esta correção não modifica SQL nem o cálculo dos saldos.

## Verificação da correção v0.4.1

Passaram 24 grupos anteriores de backend, 12 novos grupos de integração e 38
fluxos de navegador (20 regressões e 18 da tela unificada), sem erros de página.
Os novos grupos incluem 30 combinações de paginação, variando quantidades de cada
tipo, tamanhos de página e IDs/datas iguais entre as origens. Também conferem
totais acima do limite seguro de inteiro JavaScript, filtros, falha de sessão,
whitelist dos DTOs e encaminhamento das gravações/exclusões às RPCs corretas.

Os testes de navegador usam ponte simulada; verificam a convivência dos três tipos
na mesma lista, troca de tipo no formulário novo sem perder o rascunho, criação
rápida de ambas as contas, transferência futura, conflitos, exclusão completa,
expiração, paginação mista e tela de celular. As RPCs existentes e suas permissões
foram conferidas no Supabase. Nenhum dado financeiro real foi modificado.
