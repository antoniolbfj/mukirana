# Lançamentos únicos — entrega

## Regras implementadas

O proprietário é resolvido pela sessão e conferido novamente na transação. Cada
lançamento contém ID estável, receita/despesa, descrição, valor positivo em
centavos, data civil, conta, categoria, classificação fixa/variável e modalidade
Único. Há uma versão esperada para edição/exclusão e repetição idempotente de
gravações cuja resposta possa ter se perdido.

Uma única seleção permite categoria principal ou subcategoria. A escolha de uma
principal em filtros inclui seus lançamentos diretos e os de suas descendentes.
Reorganizar categorias preserva as FKs e altera os agrupamentos consultados.
Contas e categorias de outros usuários ou categorias reservadas são recusadas.

## Datas, saldos e valores

- A data de referência usa `America/Sao_Paulo`; datas civis não passam por conversão
  de fuso ao serem exibidas ou enviadas.
- O saldo atual soma receitas menos despesas até hoje, incluindo o saldo inicial.
- A projeção soma todo o histórico até a data final do período. A data inicial do
  filtro não corta o histórico desse saldo acumulado.
- Os totais do período consideram apenas as datas filtradas, inclusive previsões.
- Apenas data inicial significa até hoje; apenas final significa desde o começo
  do histórico. Ambas vazias incluem todos os lançamentos registrados.
- Totais são calculados em `numeric` no PostgreSQL e transportados como textos
  inteiros de centavos. A interface usa `BigInt` para formatar esses totais.
- Os valores unitários são inteiros positivos de até 99.999.999.999.999 centavos;
  não há multiplicação decimal em ponto flutuante na entrada de valores.

## Saldo inicial

Saldo inicial positivo gera receita; negativo gera despesa. Zero explicitamente
informado também possui uma movimentação especial. Valor ausente não gera registro.
A edição é feita somente pela conta; a exclusão na lista remove o valor inicial
do cadastro sem apagar a conta. As operações são atômicas e preservam a identidade
da movimentação especial ao alterar valor/data.

Os saldos iniciais já existentes foram migrados usando a data de criação da conta
no fuso do aplicativo. Novos cadastros sugerem hoje e permitem alterar a data.
A classificação automática `opening_balance` / “Saldo inicial” fica disponível
somente para leitura quando possui vínculos, e nunca na seleção manual.

## Integridade e privacidade

FKs compostas incluem o proprietário de conta/categoria. Exclusões de contas com
movimentações e de categorias com vínculos são recusadas. A interface oferece
renomeação quando houver bloqueio. As gravações adquirem a trava do proprietário
antes dos registros afetados, compartilhando a ordem usada pela hierarquia.

Nenhum dado financeiro é persistido no localStorage. Apenas sessão e aparência
seguem o comportamento já homologado. Erros do banco não são retransmitidos ao
navegador. As RPCs novas têm `search_path` fixo e execução concedida somente a
`service_role`; os helpers privados não são expostos.

## Validação

`supabase/checks/single_transactions.sql` passou por 48 verificações reais,
incluindo alterações entre contas, datas futuras, totais acima do limite de
inteiro seguro do JavaScript, paginação, hierarquia, saldo inicial, sessões e
propriedade. As fixtures foram revertidas e nenhum usuário de teste permaneceu.

`tests/backend.test.cjs` cobre contratos, normalização, moeda, datas e fronteiras
das RPCs. `tests/browser_test.py` cobre 20 fluxos com ponte simulada em desktop e
celular. Os advisors não apontaram WARN/ERROR; os avisos informativos de RLS sem
políticas correspondem à negação de acesso direto nas tabelas privadas, e o índice
de paginação ainda tem pouca utilização por se tratar de uma tabela nova.
