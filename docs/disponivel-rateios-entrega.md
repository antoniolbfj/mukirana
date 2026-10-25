# Disponibilidade após compromissos de rateio

Rodada de 25/10/2026, a partir da v52. Registro de publicação em
`disponivel-rateios-publicacao.json`; homologação de uso permanece pendente.

## Regra confirmada pelo usuário

A participação em despesa paga por outra pessoa é um compromisso. O saldo
negativo ainda a acertar precisa reduzir **Ainda posso gastar**. O cálculo é:

**Resultado dos lançamentos − rateios a pagar − pagamentos ainda sem saída
própria registrada.**

O resultado dos lançamentos permanece Receitas − Despesas + transferências
recebidas − transferências enviadas. A reserva usa os saldos bilaterais negativos
até o fim do mês global, incluindo obrigações anteriores e antecipações. A
checkbox Saldo anterior continua definindo o período dos movimentos de caixa.

- Quem paga uma despesa mantém o valor integral no caixa. O direito de receber
  uma parte de terceiros fica separado e não antecipa dinheiro disponível.
- A parte de quem ainda deve reduz a capacidade de gasto sem inventar uma saída
  bancária nem duplicar o consumo nas categorias.
- Pagamentos parciais ou totais substituem a reserva pelo movimento real. As duas
  pontas de um mesmo acerto não descontam a dívida duas vezes.
- Se o credor registrar o recebimento primeiro, o montante continua reservado
  até o devedor registrar a sua saída. Ajustes históricos sem caixa e acertos
  rejeitados/cancelados ficam fora dessa reserva complementar.
- O corte temporal exclui obrigações/acertos posteriores ao mês selecionado.
  Valores são calculados em centavos exatos.

Exemplo fictício: resultado de R$ 1.000 e dívida de rateio de R$ 200 deixam
R$ 800 disponíveis. Ao pagar R$ 50, o resultado passa a R$ 950 e a dívida a
R$ 150; continuam disponíveis R$ 800.

## Aplicação nas telas

A barra global e os três cards mensais do Painel consideram os compromissos.
O detalhe da barra explica resultado, reserva, disponível e valores a receber.
Cada card mensal usa a posição do rateio no fim daquele mês.

Filtros específicos da lista continuam mostrando o resultado efetivo dos
lançamentos selecionados, com o título **Resultado do recorte**. A reserva
bilateral é geral: o usuário só escolhe a conta de pagamento quando registra
o acerto. O detalhe oferece também a disponibilidade geral, sem atribuir a
dívida a uma conta/categoria arbitrária.

Saldos reais das contas, patrimônio e cálculos pessoais por categoria não mudam.
A correção reutiliza `rpc_painel_rateios_periodo_v10`, com identidade derivada da
sessão. Nenhuma migração ou alteração financeira foi necessária em produção.
A consulta de leitura confirmou a ausência da dedução no caso analisado;
valores e identidades pessoais não são publicados neste registro.

## Subcategorias e teclado

Seletores de cadastro/edição, edição em linha/lote e categoria pessoal do rateio
começam pelo nome: **Restaurante (subcategoria de Alimentação)**. A hierarquia
permanece explícita e a busca nativa pelo teclado passa a encontrar o nome sem
uma seta anterior. Os nomes persistidos no banco não foram alterados.

## Verificação

- 19 verificações de regras: dívida, pagamentos, recebimento iniciado pelo credor,
  futuro, rejeição, cancelamento, ajustes, centavos grandes e nomes de categorias.
- 14 verificações novas com controllers reais e PostgreSQL fictício: compromisso
  de outra pessoa, parcial/total, duas pontas, recebimento antes do pagamento,
  igualdade com os cards mensais e consultas sem gravar movimentos.
- 63 regressões de Rateios; regressões do Painel, posições de Contas,
  participações por categoria, patrimônio e semáforo.
- Nove combinações computador/tablet/smartphone × Claro/Escuro/Sépia: reserva
  atualizada sem recarregar o navegador, parcial sem desconto adicional, seleção
  nativa de subcategoria pelo teclado, resultado com filtro e detalhe do saldo.
- Sintaxe dos scripts renderizados e verificação de espaços aprovadas.

Não foram criados lançamentos de teste em produção. A execução autenticada
do usuário e a homologação de uso permanecem separadas desses testes.
