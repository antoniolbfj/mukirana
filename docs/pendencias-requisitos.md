# Pendências da base atual — Mukirana

Atualizado em 25/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Entrega vigente

Contas e Cartões remodelados foram homologados anteriormente. As novas telas são
principais por autorização expressa; os acessos antigos foram arquivados. A rodada
de Rateios/Acertos/Painel/Metas foi publicada na v41; a correção da categorização
pessoal foi publicada separadamente na v42. O refinamento visual seguinte acrescenta
Claro/Escuro/Sépia e componentes comuns na v44, preservando as regras da correção.
O Painel oficial refinado foi publicado na v45. Produção e avaliação vigentes:
**versão 52**, com mês global/saldo anterior, fatura contextual, rateios na lista e
modal de lançamentos em Contas/Painel. Publicação conferida em
`painel-periodo-publicacao.json`. A versão48 entregou o hub e a retirada
de Projetos; a versão47 corrigiu transferências após pagamentos de fatura.
A versão46 acrescentou a identificação dos ajustes históricos de rateio. Registros anteriores:
`painel-oficial-publicacao.json` e `conciliacao-rateios-publicacao.json`;
`ux-categorias-publicacao.json` preserva a entrega anterior.

Categorias e metas agora usam a participação pessoal, com a categoria privada de
cada pessoa, independente do acerto. Não somam o original rateado e a própria parte,
nem contam o acerto como novo consumo. A barra global mantém R−D±transferências e
as contas mantêm seus movimentos reais. Ver [correção](correcao-participacoes-categorias.md).

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

## Pendências vigentes

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
   com e sem Saldo anterior.
2. **Classificar o histórico:** identificar contas antigas de Investimento;
   revisar fixa/variável e categorias pessoais pendentes. A classificação reservada
   Aguardando Categorização só aparece quando há participação sem categoria.
3. **Estornos e análises complementares:** fluxo explícito de correção/estorno de
   acertos com ambas as pontas registradas; aprofundar devoluções e análises de
   receitas/despesas fixas e variáveis (IND-05). O painel já calcula comprometimento
   com base suficiente e sinaliza registros sem classificação. A conciliação
   histórica foi uma operação administrativa pontual; o fluxo geral de estorno
   de acertos concluídos continua pendente.
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
