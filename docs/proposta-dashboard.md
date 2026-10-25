# Proposta do novo Painel geral

Base: documento v0.1 e decisões posteriores, especialmente a fórmula única
Receitas − Despesas ± Transferências. Contas já oferece Consumo, Investimento e
Crédito vinculado aos cartões existentes. Esta é uma proposta para avaliação;
o Dashboard conectado ainda não foi substituído.

## O que o painel deve responder

| Pergunta do levantamento | Resposta na tela |
| --- | --- |
| Depois dos pagamentos e investimentos, quanto ainda posso gastar? | **Ainda posso gastar**, na barra global, com resultado do período e escopo visíveis; receitas, despesas e transferências explicam sua composição. |
| Cumpri minhas metas de receitas e despesas? | Até três metas relevantes, com realizado, objetivo/teto e diferença em reais; comprometimento da renda fixa quando houver classificação suficiente. |
| Para onde foi meu dinheiro? | Três maiores categorias de despesas, mais Outras; aportes/resgates aparecem no bloco de Investimentos, sem virar despesa ou receita. |

## Composição enxuta

1. **Barra global existente:** período mensal e Ainda posso gastar sempre visíveis.
   A legenda informa “Resultado do período · Consumo e Crédito”. A composição abre
   sob demanda. Um seletor discreto permite incluir Investimento no mesmo cálculo.
2. **Três cartões mensais:** anterior, atual e seguinte, com resultado e resumo
   compacto de receitas/despesas. Clique troca o período global apenas na sessão.
   Na abertura são os meses do calendário; os cartões não salvam preferência.
   Para intervalo de vários meses, o cabeçalho mostra o intervalo completo e os
   cartões continuam como atalhos explícitos, sem substituir a seleção sozinhos.
3. **Três posições atuais:** Disponível em Consumo; Saldo dos cartões; Patrimônio
   em Investimento. Cada número leva às contas que o compõem. Investimento traz
   também o movimento líquido dentro do período; sua projeção fica no detalhe.
4. **Dois blocos de análise:** Para onde foi, com barras horizontais por categoria,
   e Metas, mostrando primeiro excessos e objetivos não atingidos. Uma linha compacta de **A acertar** mostra a receber, a pagar e aprovações
   pendentes quando houver algo relevante, com acesso direto ao extrato por pessoa.

Projetos, listas completas de contas, todas as faturas e tabelas de rateio ficam
nos respectivos módulos, acessíveis pelo detalhe. Não ocupar a abertura com oito
seções extensas ou gráficos repetindo o mesmo número.

## Cálculos propostos

**Operacional padrão:** movimentos das contas de Consumo e Cartão de Crédito,
datados no período global. Investimento fica fora por padrão, conforme IND-02.
A opção de incluí-lo muda apenas o conjunto de registros da mesma fórmula.
O saldo global acompanha esse escopo e informa a seleção; ao abrir Lançamentos,
o recorte é preservado. Não haverá modos Minha participação/Fluxo de caixa.

`Resultado = receitas − despesas + transferências recebidas − transferências enviadas`

- Pagamento Consumo → Crédito: os dois lados se anulam no operacional; a compra
  no cartão já é a despesa. Não somar o pagamento como uma segunda despesa.
- Aporte Consumo → Investimento: saída no operacional padrão; entrada no patrimônio.
  Com investimentos incluídos no recorte, os dois lados se anulam.
- Resgate Investimento → Consumo: entrada no operacional padrão; redução do investimento.
- Transferência entre duas contas do mesmo recorte: efeito líquido zero. Ao filtrar
  uma conta, permanece apenas seu lado, com o sinal correspondente.
- Saldo inicial: participa uma única vez como receita ou despesa na sua data, conforme
  CON-04; nunca acrescentar novamente o campo do cadastro por fora do lançamento.
- Ocorrências futuras/pendentes e recorrências previstas são identificadas e entram
  na perspectiva do período, sem antecipar o saldo atual. Deduplicar os geradores antigos.
- Não limitar o resultado a zero: um resultado negativo deve continuar negativo.

**Posições atuais:** somar apenas movimentos efetivados até hoje, desde o início do
histórico. Consumo e Crédito aparecem separados. Crédito negativo indica dívida;
crédito positivo é saldo a favor. **Patrimônio = saldo atual das contas cujo tipo
atual é Investimento**, sem acrescentar Consumo ou limite de cartão.

**Movimento de Investimentos no período:** entradas − saídas nas contas de
Investimento, incluindo aportes, resgates, rendimentos e custos efetivamente
registrados. Transferências internas entre investimentos se anulam. Esse movimento
não é o patrimônio acumulado nem uma rentabilidade percentual.

Exemplo de conciliação (didático): receitas 10.000; despesas em Consumo 2.500;
compras no cartão 1.500; pagamento da fatura 1.000; aporte 1.500. Operacional:
`10.000 − 2.500 − 1.500 − 1.500 = 4.500`. O pagamento não é descontado outra vez.
Com rendimento de 100 e Investimento incluído: `10.100 − 4.000 = 6.100`.

## Metas e classificações

Reaproveitar os cadastros existentes após conferir sua semântica; não declarar
metas de receitas atendidas por uma regra que só verifica teto de despesas.
Despesas: teto; receitas: mínimo. Principal agrega diretos e descendentes, sem
somar a principal e suas filhas novamente no total. Alertas não bloqueiam registros.

Proposta para intervalos com vários meses completos: tratar o valor configurado como
mensal e mostrar o cálculo explicitamente, por exemplo “R$ 2.000/mês × 3 meses”.
Sem histórico de vigência, a meta atual se aplica aos meses consultados. Essa regra
faz parte da avaliação da proposta, antes de alterar o comportamento de Metas.

Comprometimento = despesas fixas ÷ receitas fixas × 100. Receita fixa zero não é
0% de comprometimento: mostrar “Sem renda fixa registrada”. Registros antigos sem
classificação ficam como **Sem classificação**, com acesso para revisão; não deduzir
fixa/variável de ser parcelado ou recorrente, nem apresentar percentual incompleto
como se representasse todo o período. Sem meta, mostrar “Definir meta”, sem alerta falso.

## Desktop/tablet e smartphone

Computador/tablet: três meses em uma linha, posições atuais compactas e duas colunas
para categorias/metas. O detalhe abre em painel lateral e mantém a visão do período.
Smartphone: template próprio, três atalhos mensais compactos, posições em cartões
curtos e análises em sequência; detalhe em folha inferior. Sem tabelas espremidas,
rolagem horizontal de página ou cópia reduzida da grade desktop. A barra global se
mantém disponível e os alvos de toque têm pelo menos 44 px.

A [prévia visual HTML](prototipos/painel.html) usa exclusivamente dados fictícios
identificados e recalcula os exemplos ao trocar mês/incluir investimentos. Serve
para avaliar hierarquia, densidade e interação; não se conecta ao Supabase.

## O que a revisão do código encontrou

O painel atual tem oito blocos e o cálculo de patrimônio agrega contas/obrigações
sem distinguir o tipo de Investimento. Também mistura posição acumulada projetada
e resultado do período em uma apresentação que exige explicações extensas.
Não basta redesenhar o HTML e conservar esses cálculos.

Antes da implantação conectada, conciliar os registros legados de acerto pelos IDs
existentes, evitando apresentar liquidação como nova receita/despesa. Devoluções e
estornos precisam seguir o vínculo/natureza registrados; não inferir estorno pelo
texto da descrição. Validar o tratamento com exemplos reais autorizados e testes
revertidos, preservando os registros originais.

A implementação terá um pacote autenticado para os blocos do painel, usando a
mesma regra financeira de Lançamentos e os saldos derivados de Contas. Dinheiro em
centavos exatos, erro distinto de zero, carregamento identificado e consulta somente
a dados autorizados. O adicional não recebe totais privados do titular. Valores de
relatórios futuros em PDF/planilha devem vir da mesma consolidação, conforme REL-03;
o motor configurável de relatórios continua uma rodada própria.

Referências: VIS-03; CON-04/08/09/10/11; SAL-01 a SAL-05; FIL-01/02/03/06;
IND-01 a IND-05; MET-01 a MET-09; ACE-09; REL-03/04. Decisões atuais prevalecem
sobre a separação econômica/caixa do documento original na apresentação principal.

Após avaliação, implementar no menu provisório **Painel (novo)**, testar as duas
interfaces e promover ao principal somente depois da homologação. Paleta global
continua para a rodada final.

## Prévia para avaliação

- [Abrir HTML interativo](prototipos/painel.html)
- [Computador](prototipos/painel-desktop.png)
- [Tablet](prototipos/painel-tablet.png)
- [Smartphone](prototipos/painel-smartphone.png)

A navegação mensal da prévia é demonstrativa. Na implementação conectada será
reutilizado o período global existente, com mês inicial/final, preferência explícita
e intervalos relativos. A prévia não grava preferências nem movimentações.

## Rateios incluídos nesta rodada

A [proposta de Rateios](proposta-rateios.md) detalha a implementação integrada.
Decisão confirmada: despesa de R$ 300 paga e dividida por três continua como R$ 300
no resultado financeiro; os R$ 200 a receber aparecem em A acertar. Quando recebidos,
entram como transferências e o efeito líquido desse exemplo passa a −R$ 100, sem
criar receita ou despesa novamente. A participação individual fica no detalhe.
A acertar é bilateral e acumulado; o período global não apaga dívidas anteriores.
Sua integração deve concluir leitura autorizada, categoria individual, aprovações
e liquidação dos acertos antes da entrega do Dashboard conectado.
