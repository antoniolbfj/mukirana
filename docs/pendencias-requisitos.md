# Pendências da base atual — Mukirana

Atualizado em 27/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Entrega vigente

Contas e Cartões remodelados foram homologados anteriormente. As novas telas são
principais por autorização expressa; os acessos antigos foram arquivados. A rodada
de Rateios/Acertos/Painel/Metas foi publicada na v41; a correção da categorização
pessoal foi publicada separadamente na v42. O refinamento visual seguinte acrescenta
Claro/Escuro/Sépia e componentes comuns na v44, preservando as regras da correção.
O Painel oficial refinado foi publicado na v45. Produção e avaliação vigentes:
**versão 58**, com pagamento de fatura como transferência parcial/integral/crédito
e competência preservada com Saldo anterior, Favoritos retirado e histórico por autocompletar,
UX de smartphones refinada no Painel e em Lançamentos,
saldo acumulado em destaque e mês/acumulado do filtro menor em Contas,
cálculo global consistente, transferências previstas em Contas,
recebíveis de rateio na previsão e mês/histórico seguindo a checkbox em todos os
indicadores desta rodada. Preserva seletores de subcategoria acessíveis pelo
teclado, fatura contextual e modais. Publicação conferida em
`faturas-pagamento-simples-publicacao.json`. A versão57 retirou Favoritos;
a versão56 refinou o UX de smartphones;
a versão55 ajustou os valores de Contas;
a versão54 unificou as previsões; a versão52
reorganizou o Painel e corrigiu
o saldo devedor até o mês. A versão48 entregou o hub e a retirada
de Projetos; a versão47 corrigiu transferências após pagamentos de fatura.
A versão46 acrescentou a identificação dos ajustes históricos de rateio. Registros anteriores:
`painel-oficial-publicacao.json` e `conciliacao-rateios-publicacao.json`;
`ux-categorias-publicacao.json` preserva a entrega anterior.

Categorias e metas agora usam a participação pessoal, com a categoria privada de
cada pessoa, independente do acerto. Não somam o original rateado e a própria parte,
nem contam o acerto como novo consumo. O resultado dos lançamentos mantém
R−D±transferências e as contas mantêm seus movimentos reais. A disponibilidade
geral considera os compromissos a pagar e as receitas previstas de rateios,
sem duplicar pagamentos/recebimentos registrados. O mês/histórico segue o filtro.
Essa decisão substitui a regra anterior de não antecipar recebíveis. Ver
[resultado global](saldo-global-entrega.md),
[disponibilidade](disponivel-rateios-entrega.md) e
[categorias](correcao-participacoes-categorias.md).

UX modernizada nas telas principais, com paleta comum nas legadas, layouts próprios
para telas grandes/pequenas, preferência de tema por usuário neste navegador e
sincronização dos iframes. Não houve reescrita dos fluxos legados. Ver
[entrega de UX](ux-tres-temas-entrega.md) e [protótipo](prototipos/ux-temas.html).

Refinamento posterior autorizado para o **Painel geral oficial**: semáforo nos
indicadores, evolução patrimonial em largura inteira com visões 3 meses/semestral/
anual e filtro por conta de investimento, card de saldo do rateio clicável e títulos
maiores. Implementação conectada aos contratos existentes, sem migração, preservando
os três temas e os layouts próprios. Ver [entrega](painel-oficial-entrega.md).
Publicado e conferido na versão45, com 72 fontes idênticas ao commit `29d680a`.
Ver `painel-oficial-publicacao.json`; homologação de uso permanece pendente.

Depois da [análise do legado](analise-rateios-legados.md), o usuário autorizou e
foi concluída a conciliação de **julho a outubro/2026**: 11 movimentos antigos
reconhecidos como especiais, três receitas novas duplicadas excluídas e cinco
ajustes de quitação sem caixa. Fechamentos dos quatro meses zerados nos dois
pares de pessoas; obrigações futuras preservadas. Dados antigos e participações
mantidos, com backup privado dos registros afetados. Ver
[entrega da conciliação](conciliacao-rateios-entrega.md).

Pagamentos feitos em Faturas passam a atualizar automaticamente o cache global
também na edição e exclusão. Lançamentos mostra a saída da conta de origem e a
entrada da conta do cartão sem recarregar o navegador. Os pagamentos existentes
já tinham esse vínculo; nenhuma migração ou duplicação é necessária. Ver
[correção das faturas](faturas-transferencias-entrega.md).

A rodada seguinte implementa **Lançamentos como hub**: catálogo completo de contas,
Investimento disponível, valor do período/filtros atualizado ao gravar, lote de
categoria e fixa/variável, edição na linha/cartão, ordenação, visões salvas e
atalhos contextuais. Corrigidos o contexto de abertura e o alinhamento da marca.
**Projetos foi descontinuado**, com histórico preservado e organização por
categorias/subcategorias. Ver [entrega](lancamentos-hub-entrega.md). Produção e
avaliação publicadas na versão48, com 73 fontes idênticas ao commit `be295b5`.
Ver `lancamentos-hub-publicacao.json`; homologação de uso permanece pendente.

A rodada atual centraliza os rateios na lista, inclui participações sem novo caixa,
categoria individual padrão, cadastro preso à fatura aberta, modal de Lançamentos
em Contas e Painel, card Saldo das contas e um mês global com histórico opcional.
Ver [entrega](lancamentos-contextos-entrega.md). Homologação de uso pendente.

O Painel foi reorganizado em cinco linhas conforme a orientação mais recente,
com Consumo e Patrimônio em cards próprios, sem o antigo card Patrimônio atual.
O saldo devedor do rateio e sua modal agora respeitam o fim do mês e abatem os
acertos existentes uma única vez, inclusive antecipações, excluindo obrigações
futuras do recorte. A checkbox define o histórico de lançamentos exibido.
Ver [correção do Painel](painel-periodo-entrega.md). Homologação de uso pendente.

A rodada atual corrige **Ainda posso gastar**: desconta a posição de rateios a
pagar até o mês global e mantém reservado o acerto recebido pela outra pessoa
enquanto faltar a própria saída. A barra e os cards mensais compartilham a regra;
filtros da lista exibem Resultado do recorte com disponibilidade geral no detalhe.
As subcategorias começam pelo nome, com a categoria mãe ao final, permitindo
busca nativa pelo teclado. Ver [entrega](disponivel-rateios-entrega.md).

A decisão seguinte faz todos os resultados desta rodada respeitarem a checkbox:
sem Saldo anterior, somente o mês; com ela, histórico até o mês. Inclui previsões
de rateios do credor e preserva a identificação de transferências previstas nas
projeções de Contas/Painel. Os três cards aplicam a escolha ao respectivo mês.
Indicadores e valores principais de Contas usam o recorte; saldos efetivos são
identificados separadamente. Ver [entrega atual](saldo-global-entrega.md).

Regularização posterior de dados: um pagamento histórico de fatura faltante foi
confirmado pelo usuário e cadastrado a partir de outro mês. A competência ficou
quitada, com uma única transferência especial, duas pontas conciliadas e
pagamentos existentes preservados. Não houve alteração de código ou da versão54.
Ver [regularização](regularizacao-fatura-entrega.md).

A rodada seguinte conciliou o saldo efetivo de uma conta com o valor real
informado pelo usuário, por um único crédito identificado em Ajustes de entrada.
Os movimentos anteriores foram preservados. Por solicitação do usuário, Contas
agora destaca o saldo acumulado efetivo datado e mostra o resultado do filtro
menor, nos dois layouts. Ver
[entrega](contas-saldos-entrega.md).

Refinamento posterior exclusivo para smartphones: o Painel reúne os três meses
em um único card, com cada mês clicável; os cards de Lançamentos exibem descrição,
valor/situação e metadados em áreas próprias, sem cortar os textos. Cálculos e UX
de telas maiores preservados. Ver [entrega](ux-mobile-entrega.md) e seu registro
de publicação. Homologação no aparelho do usuário permanece pendente.

A decisão seguinte retirou Favoritos das interfaces de computador/tablet e
smartphone. O campo Descrição conserva os exemplos do histórico pessoal por
autocompletar, sem copiar o valor. Sessões antigas não criam novos favoritos;
dados anteriores preservados. Ver [entrega](autocomplete-entrega.md).

Pagamento de fatura passa a ser somente transferência da conta de origem para a
conta do cartão, aceitando saldo residual, quitação ou crédito. O mês é preservado
ao incluir/editar com Saldo anterior e as compras mantêm sua situação. O teto
anterior foi retirado do formulário, servidor e trigger; históricos preservados.
Ver [entrega](faturas-pagamento-simples-entrega.md).

## Pendências vigentes

Operação de dados posterior: por autorização do usuário, uma receita duplicada e
seu acerto separado foram excluídos, mantendo o pagamento original e os demais
dados. A versão58 permanece vigente. Ver [exclusão e teste do aceite](remocao-acerto-duplicado-entrega.md).

1. **Homologar a rodada:** validar a correção de categorias/metas e os três temas,
   além das funcionalidades novas de Contas, Lançamentos, Rateios/Acertos, Painel
   e Metas, em computador/tablet e smartphone. Conferir o Painel oficial conectado
   (semáforo, patrimônio, rateios e títulos) com os dados reais. Sua implementação
   e promoção foram autorizadas; a homologação de uso continua separada.
   Validar também pagamentos de fatura e a atualização imediata de Lançamentos.
   Nesta rodada, conferir todas as contas nos filtros, valor do recorte, edição
   direta, lote, ordenação, visões, rascunho e alinhamento da marca. Conferir o mês
   com/sem saldo anterior, compras pela competência do cartão, inclusão na fatura
   aberta, rateios/categoria pessoal na lista e modais de Contas/Painel. Validar
   também a composição do Painel em cinco linhas e o saldo do rateio por mês,
   com e sem Saldo anterior. Validar a dedução dos rateios no disponível,
   pagamentos parciais/totais sem nova dedução, recebimento iniciado pela outra
   pessoa, resultado dos filtros e seleção de subcategorias pelo teclado.
   Validar o disponível igual entre telas, as transferências previstas em Contas,
   a previsão do credor e todos os indicadores com/sem Saldo anterior.
   Recarregar a sessão e conferir também o pagamento histórico regularizado.
   Conferir o crédito de conciliação autorizado e os rótulos dos valores de Contas,
   inclusive ao consultar meses antigos e alternar Saldo anterior.
   Avaliar o card único de meses e a organização completa dos lançamentos no
   smartphone, incluindo nomes longos, seleção, edição e ações de rateio.
   Conferir também o formulário sem favoritos e a seleção de exemplos anteriores
   pelo autocompletar de Descrição, nos dois layouts e nas modais.
   Homologar também pagamentos parciais/integral/crédito e a competência correta
   com Saldo anterior, tanto pela fatura quanto como transferência em Lançamentos.
2. **Classificar o histórico:** identificar contas antigas de Investimento;
   revisar fixa/variável e categorias pessoais pendentes. A classificação reservada
   Aguardando Categorização só aparece quando há participação sem categoria.
3. **Estornos e análises complementares:** fluxo explícito de correção/estorno de
   acertos com ambas as pontas registradas; aprofundar devoluções e análises de
   receitas/despesas fixas e variáveis (IND-05). O painel já calcula comprometimento
   com base suficiente e sinaliza registros sem classificação. A conciliação
   histórica foi uma operação administrativa pontual; o fluxo geral de estorno
   de acertos concluídos continua pendente.
   Distinguir e prevenir novo recebimento independente que repita um pagamento
   ainda pendente: o aceite normal foi validado sem duplicidade, mas a ação geral
   Receber permite outro acerto com mesmo valor/data. Conferir também o outro
   recebimento e o ajuste de saldo apontados no diagnóstico, preservados nesta operação.
4. **Relatórios configuráveis (REL-01 a REL-04):** motor de campos, dimensões,
   agrupamentos e cálculos, apresentação interativa, PDF e planilha com os mesmos
   resultados e limites de privacidade.
5. **Revisões específicas dos módulos legados:** conferir requisitos e aprimorar
   fluxos de Faturas/pagamentos, Categorias, Recorrências antigas e
   Usuários/autenticação, sem presumir que funcionalidades existentes estejam
   ausentes. As telas já acompanham os temas; refinamentos próprios de interação
   continuam sujeitos às próximas rodadas e à homologação.
   A atualização do cache após pagamentos de fatura foi corrigida nesta rodada.

A paleta global com os três temas já foi implementada, conforme a nova
autorização do usuário, e deixa de ser uma pendência de implementação. Ajustes de
UX apontados na homologação continuam possíveis. Preferência Sépia é visual e
local ao navegador; não modifica o cadastro de temas do banco.
