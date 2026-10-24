# Requisitos ainda pendentes — Mukirana

Atualizado em 24/10/2026, a partir da revisão do levantamento v0.1 e das decisões
posteriores. Base da rodada: v0.5.0.

Esta lista deve ser reescrita ao final de cada rodada. Ela inclui funcionalidades
não implementadas, partes ainda faltantes de requisitos maiores e pendências de
qualidade. Homologação é registrada separadamente da implementação.

## Rodada concluída tecnicamente — parcelamentos e recorrências

Implementados RQ-GER-01 a RQ-GER-11 e as modalidades previstas em RQ-LAN-02: prévia,
geração antecipada, total derivado, centavos residuais na primeira parcela, duração
finita com término exclusivo, dia âncora, escopos de edição/exclusão e renovação
interna. Incluída exclusão de somente uma ocorrência, conforme decisão do usuário.
O rateio independente citado em RQ-LAN-02 permanece na lista abaixo.

Base atual: v0.5.0. Banco aplicado/validado; publicação desta rodada registrada
no histórico do projeto. A homologação do usuário será registrada separadamente.

## Demais funcionalidades a implementar/completar

1. **Histórico e favoritos** — RQ-RAP-01 a RQ-RAP-05: sugestões pessoais, modelos independentes, preenchimento dos campos reutilizáveis e valor vazio com foco ao selecionar.
2. **Grupos e convites** — RQ-GRP-01 a RQ-GRP-15 e RQ-VIS-02: integrantes, convites/aceitação, elegibilidade, privacidade, múltiplos grupos e regras de saída/remoção/exclusão.
3. **Aprovações** — RQ-APR-01 a RQ-APR-05: solicitação vigente por token/versão, participantes, decisões/justificativas e invalidação de decisões antigas.
4. **Rateios e participações econômicas** — RQ-RAT-01 a RQ-RAT-13, RQ-CAT-09 e parte de RQ-LAN-02: distribuição exata, aprovações, categorização individual/temporária, efeitos econômicos, alterações/exclusões e integração futura aos conjuntos de ocorrências.
5. **Obrigações bilaterais e acertos** — RQ-ACE-01 a RQ-ACE-09: dívida líquida, pagamentos parciais/totais, aprovação do credor, rejeição e prevenção de pagamentos excedentes/simultâneos.
6. **Metas financeiras** — RQ-MET-01 a RQ-MET-09: tetos de despesas, objetivos de receitas, regras hierárquicas e acompanhamento sem bloquear lançamentos.
7. **Filtro temporal completo** — RQ-FIL-03, parte de RQ-FIL-04 e RQ-FIL-06: preferência global salva, períodos relativos persistentes e cartões dos meses anterior/atual/seguinte.
8. **Painel e indicadores** — RQ-SAL-04/05 e partes de RQ-IND-01 a RQ-IND-05: disponível para gastar, resumo operacional, exclusão padrão de Investimento/opção de inclusão, patrimônio, movimentação líquida e análises de receitas/despesas fixas/variáveis.
9. **Relatórios** — RQ-REL-01 a RQ-REL-04 e complemento de RQ-CAT-05: motor configurável, agrupamentos hierárquicos, apresentação interativa, PDF e planilha com os mesmos resultados.
10. **Qualidade e capacidade** — partes de RQ-NFR-01/03/05: medições de desempenho/consumo, acessibilidade/compatibilidade ampliadas e instalação reprodutível do banco vazio.
11. **Refinamento de UX** — etapa final, depois da implementação funcional e da construção do banco, conforme orientação do usuário.

## Definições de produto ainda abertas

- Repertório de cálculos/fórmulas do motor de relatórios — PEN-01.
- Validação hierárquica das metas mínimas de receitas — PEN-02.
- Redistribuição automática de participações mantendo centavos exatos e valores positivos — PEN-03.
- Composição do cálculo de quanto ainda posso gastar — PEN-04.
- Capacidade do armazenamento, gráficos/exportação e cenários extremos de aprovações — partes de PEN-05/07/08.

## Homologação registrada separadamente

- A correção que integrou Transferência a Meus lançamentos está implementada/publicada na versão 6; ainda não houve homologação explícita registrada.
- Parcelamentos/recorrências estão implementados e validados tecnicamente na v0.5.0; aguardam homologação explícita do usuário.

Autenticação, Contas, cadastro de Categorias, lançamentos únicos, parcelamentos, recorrências, transferências
próprias e cálculos básicos de saldo/resultado já estão implementados. Permanecem
as integrações desses fundamentos com os módulos compartilhados futuros.
