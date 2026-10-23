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

Transferências ficam na própria listagem, acessível pelo início e pelos módulos
Contas, Categorias e Lançamentos. Receitas e despesas continuam em sua listagem e
não recebem registros ou categorias artificiais de transferência. Pagamento de
cartão é uma transferência para a conta de Cartão; aporte/resgate usa a conta de
Investimento. Nenhuma dessas operações cria receita ou despesa adicional.

## Saldos, consulta e concorrência

Os saldos de Contas e de Lançamentos usam o mesmo cálculo derivado dos movimentos.
Saldo atual considera até hoje no fuso America/Sao_Paulo. Projeção considera o
histórico completo até a data final do período, sem cortar movimentos anteriores
à data inicial. Transferências futuras alteram a projeção; o efeito consolidado
entre todas as contas é sempre zero.

O período é o mesmo objeto em memória usado por Lançamentos. Há busca literal por
descrição, filtro por conta (origem ou destino), paginação por data/ID e totais de
valor transferido que contam a operação uma vez, independentemente da paginação.
O volume transferido não é indicador de receitas/despesas ou de patrimônio.

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

**A instalação remota está pendente.** O conector Supabase retornou duas vezes
`Invalid or expired requestState`; foi confirmado que a tabela não foi criada e
nenhuma migração foi registrada. O arquivo
`supabase/pending/enable_own_account_transfers.sql` instala a estrutura e executa
as 60 verificações na mesma transação. Qualquer falha reverte toda a instalação.
Executá-lo uma vez no SQL Editor do projeto `thpqielkntwcbdycucfn`. Não reaplicar
se a estrutura já tiver sido instalada. O script não envia e-mails e reverte todas
as fixtures antes do commit. A instalação manual não registra histórico MCP.

A validação foi feita em PostgreSQL 17.11 isolado, sem rede e sem dados reais, com
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

Após a instalação remota, conferir a revisão por
`mukirana_transfers_health_check`, executar `supabase/checks/transfers.sql` e os
advisors no Supabase. As verificações no banco remoto ainda não foram executadas.
