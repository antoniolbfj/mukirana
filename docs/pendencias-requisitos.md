# Pendências da base atual — Mukirana

Atualizado em 25/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Entrega vigente

Contas e Cartões remodelados foram homologados anteriormente. As novas telas são
principais por autorização expressa; os acessos antigos foram arquivados. A rodada
de Rateios/Acertos/Painel/Metas foi publicada na v41; a correção da categorização
pessoal foi publicada separadamente na v42. O refinamento visual seguinte acrescenta
Claro/Escuro/Sépia e componentes comuns na v44, preservando as regras da correção.
O Painel oficial refinado foi publicado depois. Produção e avaliação vigentes:
**versão 45**. Registro definitivo: `painel-oficial-publicacao.json`; o arquivo
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

Análise posterior dos rateios manuais concluída somente em leitura: 11 movimentos
históricos relevantes e três receitas recentes para conferência; sete receitas
antigas sem vínculo. Preservados os dados e a implantação v45. A atualização
depende da conciliação dos vínculos e das diferenças encontradas. Ver
[análise do legado](analise-rateios-legados.md).

## Pendências vigentes

1. **Homologar a rodada:** validar a correção de categorias/metas e os três temas,
   além das funcionalidades novas de Contas, Lançamentos, Rateios/Acertos, Painel
   e Metas, em computador/tablet e smartphone. Conferir o Painel oficial conectado
   (semáforo, patrimônio, rateios e títulos) com os dados reais. Sua implementação
   e promoção foram autorizadas; a homologação de uso continua separada.
2. **Conciliar os rateios manuais antigos:** validar o mapa de recebimentos e
   pagamentos, resolver diferenças e a eventual sobreposição com receitas novas;
   reaproveitar os lançamentos existentes e tratar explicitamente os registros
   confirmados como repetidos, sem duplicar movimentos ou a quitação. Análise
   concluída, nenhuma atualização aplicada.
3. **Classificar o histórico:** identificar contas antigas de Investimento;
   revisar fixa/variável e categorias pessoais pendentes. A classificação reservada
   Aguardando Categorização só aparece quando há participação sem categoria.
4. **Estornos e análises complementares:** fluxo explícito de correção/estorno de
   acertos com ambas as pontas registradas; aprofundar devoluções e análises de
   receitas/despesas fixas e variáveis (IND-05). O painel já calcula comprometimento
   com base suficiente e sinaliza registros sem classificação.
5. **Relatórios configuráveis (REL-01 a REL-04):** motor de campos, dimensões,
   agrupamentos e cálculos, apresentação interativa, PDF e planilha com os mesmos
   resultados e limites de privacidade.
6. **Revisões específicas dos módulos legados:** conferir requisitos e aprimorar
   fluxos de Faturas/pagamentos, Categorias, Recorrências antigas, Projetos e
   Usuários/autenticação, sem presumir que funcionalidades existentes estejam
   ausentes. As telas já acompanham os temas; refinamentos próprios de interação
   continuam sujeitos às próximas rodadas e à homologação.

A paleta global com os três temas foi implementada nesta rodada, conforme a nova
autorização do usuário, e deixa de ser uma pendência de implementação. Ajustes de
UX apontados na homologação continuam possíveis. Preferência Sépia é visual e
local ao navegador; não modifica o cadastro de temas do banco.
