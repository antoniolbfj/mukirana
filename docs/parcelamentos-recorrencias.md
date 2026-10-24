# Parcelamentos e recorrências — entrega v0.5.0

Data: 24/10/2026. Fonte: levantamento v0.1, RQ-LAN-01 a RQ-LAN-07,
RQ-GER-01 a RQ-GER-11 e contrato futuro RQ-RAT-10.
Estado: implementado e validado tecnicamente; disponível para homologação após
publicação da v0.5.0. Em 24/10/2026 o usuário confirmou exclusão individual e
término exclusivo da duração em meses.

## Integração aos lançamentos

Parcelado e Recorrente são modalidades de receitas/despesas em **Meus lançamentos**.
O mesmo formulário passa a oferecer Único (padrão), Parcelado e Recorrente,
mutuamente exclusivos. Os resultados aparecem na lista existente e usam seus
filtros, contas, categorias, saldos e ações. O documento define os grupos de
ocorrências para receita/despesa; não inclui parcelar ou repetir transferências
nesta entrega.

Fixa/variável continua independente da modalidade. Uma ocorrência recorrente não
é automaticamente classificada como fixa. Conta, categoria, descrição, natureza
e classificação permanecem obrigatórias conforme os contratos atuais.

## Parcelamento — RQ-GER-04 e RQ-GER-05

Informar valor total, quantidade de parcelas, data inicial e periodicidade.
Gerar todas as parcelas antecipadamente, com valores em centavos inteiros.
Dividir o total igualmente e atribuir todo o resíduo à primeira parcela.

Exemplo: R$ 100,00 em três parcelas gera R$ 33,34, R$ 33,33 e R$ 33,33.
A validação deve preservar os valores positivos exigidos pelos lançamentos;
quantidade e total precisam permitir parcelas de pelo menos um centavo.

Depois da criação, cada parcela pode ser alterada individualmente. Alterar a
primeira parcela para R$ 40,00 nesse exemplo deixa as outras em R$ 33,33 e muda o
total atualizado do conjunto para R$ 106,66. Não se redistribui a diferença.

## Recorrência — RQ-GER-07 e RQ-GER-08

Informar duração determinada em meses, periodicidade, descrição e valor por
ocorrência. Gerar todas as ocorrências antecipadamente; não há recorrência infinita.
O valor é o de cada ocorrência, enquanto no parcelamento a entrada é o total.

Na data prevista da última ocorrência, apresentar uma notificação interna que
ofereça renovação e nova duração/configuração. A criação do conjunto não deve
exibir antecipadamente esse aviso. A renovação depende de uma ação do usuário;
não há renovação financeira automática prevista no documento.

O usuário confirmou o intervalo desde a data inicial, inclusive, até a data
inicial acrescida da duração, exclusive. Exemplo: mensal em 15/01 por três meses
gera 15/01, 15/02 e 15/03, excluindo 15/04.

## Periodicidades e datas — RQ-GER-09 e RQ-GER-10

| Periodicidade | Regra |
| --- | --- |
| Semanal | A cada sete dias |
| Quinzenal | A cada 15 dias |
| Mensal | A cada mês |
| Bimestral | A cada dois meses |
| Trimestral | A cada três meses |
| Semestral | A cada seis meses |
| Anual | A cada ano |

Não há periodicidade personalizada. Quinzenal significa 15 dias, sem converter
para duas datas fixas por mês.

Nas frequências em meses/anos, manter o dia original como âncora. Quando esse dia
não existir no mês, usar o último dia daquele mês. Exemplo: 31/01/2027 gera
28/02/2027 e depois 31/03/2027; a passagem por fevereiro não muda a âncora para 28.
As datas permanecem civis e seguem o fuso financeiro do aplicativo.

## Grupo e ocorrências — RQ-GER-01 a RQ-GER-03 e RQ-GER-11

O Grupo de Lançamentos tem ID próprio, natureza e modalidade, e serve como vínculo
lógico. Ele não é movimentação e não tem saldo ou valor financeiro independente.

Cada parcela/ocorrência é um lançamento completo, com ID e atributos próprios.
O total atualizado do grupo é a soma das ocorrências existentes. Alterações e
exclusões devem se refletir nessa soma sem duplicar receitas/despesas/saldos.
A geração em lote não cria bloqueio permanente de edição/exclusão.

Esse grupo é distinto dos futuros grupos de pessoas. O vínculo lógico deve
permitir a integração posterior de rateios: RQ-RAT-10 prevê aprovação e
categorização unificadas por participante para o conjunto. Rateios continuam
fora da implementação desta rodada.

## Escopos de edição/exclusão — RQ-GER-06

Edição prevista no documento:

1. Somente a ocorrência selecionada.
2. Da ocorrência selecionada até a última.
3. Todas as ocorrências.

Exclusão prevista no documento:

1. Todas as ocorrências.
2. Da ocorrência selecionada até a última.
3. Da primeira ocorrência até a selecionada.

O usuário acrescentou a opção **Somente esta ocorrência** aos três escopos de
exclusão previstos no documento.

Os escopos se referem ao conjunto inteiro, inclusive ocorrências fora do filtro
atual. A interface deve identificar o alcance da ação. O período da tela não
pode transformar silenciosamente “todas” em “somente as que estão visíveis”.

## Integração financeira e verificações

- Ocorrências futuras participam da projeção nas respectivas datas e passam a compor o saldo atual na data informada.
- Valores, datas, propriedade, versões e dependências continuam validados no backend/banco.
- Criação e ações coletivas precisam manter a integridade de todo o conjunto, com tratamento de concorrência e repetição sem duplicidade.
- Criação rápida de conta/categoria/subcategoria preserva o formulário, incluindo os dados da modalidade.
- Verificar divisão exata, datas mensais/anuais, limites da duração, alteração individual sem redistribuição, todos os escopos coletivos, totais derivados, previsões e renovação na data correta.

## Decisões confirmadas em 24/10/2026

1. Incluir exclusão de somente uma ocorrência.
2. Usar término exclusivo para a duração em meses.

## Encerramento da rodada

Atualizar a matriz de requisitos e `docs/pendencias-requisitos.md` com as entregas
que forem efetivamente implementadas, publicadas e verificadas. Reescrever a lista
de pendências na resposta de encerramento, conforme a nova orientação do usuário.

## Banco e contratos da entrega

A migração real `20261024120028_add_installments_and_recurring_transactions` foi
aplicada pelo conector e copiada do histórico registrado do Supabase. A tabela
privada `transaction_groups` guarda configuração e versão; `transactions` recebeu
`group_id` e `occurrence_index`. Conta/categoria/proprietário continuam protegidos
por FKs e regras de servidor. O grupo não armazena total financeiro independente.

O banco mantém a configuração original do conjunto. Os atributos financeiros de
cada ocorrência podem ser alterados, inclusive natureza, conta e categoria. Os
saldos e resultados sempre usam a natureza/valor/data efetivos de cada ocorrência.
Edição de datas em lote usa a data da selecionada como âncora e mantém os intervalos
da periodicidade. Os índices das ocorrências permanecem estáveis após exclusões.

As operações coletivas exigem versão do conjunto e da ocorrência selecionada. Um
ID estável de operação permite repetir uma resposta perdida sem aplicar o lote
novamente; modificações concorrentes são recusadas para revisão. A criação usa ID
estável e hash da configuração original. Renovar um conjunto gera outro e mantém
um vínculo único com o anterior, evitando duas renovações concorrentes.

O limite operacional é de 1.000 ocorrências por geração e a duração aceita é de
1 a 1.200 meses, sujeita também ao limite de ocorrências e às datas civis válidas.
Esses limites protegem a geração antecipada e são validados pelo backend/banco.
Nenhuma ocorrência financeira de valor zero é criada.

O aviso de renovação usa a última data das ocorrências existentes e independe do
filtro temporal. Ele não aparece no dia da criação do conjunto, mesmo se todas
as datas informadas já estiverem no passado. A partir do dia seguinte, torna-se
elegível quando a última data já tiver chegado. Pode ser dispensado sem alterar
lançamentos; renovar continua disponível ao editar uma ocorrência histórica do
conjunto elegível. A data sugerida conserva o dia âncora original quando sofreu
redução para o fim de um mês. O usuário pode conferir/alterar a nova configuração.

## Validação e segurança

- 61 verificações SQL passaram em PostgreSQL 17.11 isolado e no Supabase, com rollback de todas as fixtures e zero usuários de teste restantes.
- As 48 verificações anteriores de lançamentos e as 60 de transferências passaram novamente no Supabase.
- Cinco cenários concorrentes reais passaram no banco isolado: criação idempotente, dois lotes, edição individual versus lote, exclusão versus edição e duas renovações.
- Passaram 50 grupos de backend e 56 fluxos de navegador, incluindo desktop e celular. Os fluxos de navegador usam uma ponte Apps Script simulada.
- As sete RPCs novas foram conferidas por REST com HTTP 200, saúde correta e recusa de sessão ausente, sem gravar dados financeiros reais.

RLS está habilitado na nova tabela, sem acesso direto pelas roles da API. As novas
RPCs têm `search_path` fixo e execução apenas para `service_role`; a sessão própria
do Mukirana determina o proprietário dentro da transação. Os advisors não
apontaram WARN/ERROR. Os avisos informativos de
[RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
correspondem à negação de acesso direto das tabelas privadas. O
[índice ainda sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
é o índice de paginação existente, preservado para uso por proprietário/data.

A consulta nova inclui todas as modalidades e metadados dos conjuntos. A RPC
legada mantém os lançamentos únicos para compatibilidade dos clientes anteriores;
os saldos continuam incluindo todas as movimentações existentes. Não foi alterado
o contrato financeiro das transferências.
