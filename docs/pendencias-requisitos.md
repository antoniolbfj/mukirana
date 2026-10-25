# Pendências da base atual — Mukirana

Atualizado em 25/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Estado atual

- Contas e Cartões homologados e principais na produção versão 36.
- Lançamentos conectado implementado no menu provisório **Lançamentos (novo)**,
  com interfaces próprias, fórmula única R−D±transferências, filtros dependentes,
  período/saldo globais, rascunho explícito, geração finita, favoritos, cadastro
  contextual e aprovações. Migração aplicada e testes concluídos. Detalhes em
  [lancamentos-entrega.md](lancamentos-entrega.md).
- A versão conectada substitui o protótipo fictício na implantação de avaliação;
  código inicial na versão 39 em `lancamentos-publicacao.json`; a avaliação vigente
  é a **versão 40**, registrada em `contas-tipos-publicacao.json`.
- Contas ampliada no menu **Contas (tipos)**: três tipos, vínculo único ao grupo
  existente, saldos derivados, inicial nos indicadores, exclusão protegida e
  pagamentos de fatura como transferências, com testes locais de upgrade/concorrência e
  navegador; migração aplicada e 29 ASSERTs remotos em ROLLBACK. Ver [contas-tipos-entrega.md](contas-tipos-entrega.md).

- Revisão do Dashboard concluída e [proposta visual](proposta-dashboard.md)
  preparada para computador/tablet e smartphone, com fórmula conciliada e exemplos
  fictícios identificados. A prévia não altera o Dashboard em produção.

- Rateios incluídos na rodada com o Dashboard. Revisados documento, código e banco:
  942 participações/471 lançamentos e 3 acertos preservados. A avaliação tem base de
  divisão/aprovações, mas o módulo completo ainda é parcial. Ver [proposta de Rateios](proposta-rateios.md).
- Regra confirmada: gasto de R$ 300 rateado continua R$ 300 no saldo financeiro;
  R$ 200 a receber aparecem separadamente em A acertar até os pagamentos.
- Acertos são pagamentos/recebimentos do saldo total ou parcial, com lançamentos
  especiais de despesa/receita feitos pelos respectivos usuários. Não quitar
  despesa por despesa nem abater duas vezes pelas duas pontas do mesmo acerto.

## Pendências vigentes

1. Homologar Lançamentos conectado em computador/tablet e smartphone; depois
   promover ao acesso principal e retirar o menu provisório.
2. Homologar Contas (tipos), incluindo a classificação das contas antigas de
   investimento; depois promover a atualização ao acesso principal.
3. Completar Rateios em Lançamentos: categoria individual persistente, visão
   autorizada do participante, divisão/alcances, reaprovações e proteção dos IDs
   vinculados a acertos; distinguir autoria e responsável financeiro em adicionais.
4. Completar acertos bilaterais: parciais, confirmação/recusa, limites concorrentes,
   antecipações registradas e ações Pagar/Receber como despesa/receita especiais,
   registradas por cada usuário e vinculadas a um único abatimento, preservando os legados.
5. Avaliar e implementar o Dashboard com A acertar e Consumo/Crédito separados
   do patrimônio em Investimento; integrar metas, classificações e estornos sem duplicidade.
6. Remodelar as demais telas, incluindo Faturas/pagamentos em rodada própria.
7. Revisar a paleta global depois da remodelagem de todas as telas.

O backlog anterior ao reinício permanece arquivado. Os demais módulos existentes
na versão 1 não são considerados ausentes sem uma revisão de seus requisitos.
As recorrências antigas conservam seu gerador e interface de manutenção; a nova
recorrência finita usa conjuntos próprios, evitando geração duplicada.
