# Pendências da base atual — Mukirana

Atualizado em 24/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Estado atual

- Contas e Cartões homologados e principais na produção versão 36.
- Lançamentos conectado implementado no menu provisório **Lançamentos (novo)**,
  com interfaces próprias, fórmula única R−D±transferências, filtros dependentes,
  período/saldo globais, rascunho explícito, geração finita, favoritos, cadastro
  contextual e aprovações. Migração aplicada e testes concluídos. Detalhes em
  [lancamentos-entrega.md](lancamentos-entrega.md).
- A versão conectada substitui o protótipo fictício na implantação de avaliação;
  código e publicação registrados em `lancamentos-publicacao.json`.
- Próxima etapa autorizada: completar Contas com os tipos Consumo, Investimento
  e Cartão de Crédito. O usuário confirmou vínculo aos cartões existentes.

## Pendências vigentes

1. Homologar Lançamentos conectado em computador/tablet e smartphone; depois
   promover ao acesso principal e retirar o menu provisório.
2. Completar Contas conforme CON-01 a CON-11: tipos, vínculo de crédito, saldo
   inicial nos indicadores, exclusão de contas vazias e mudança retroativa de
   classificação. Preparar saldos atuais/projetados, patrimônio de investimentos
   e movimento do período conforme SAL-01 a SAL-05. Publicar para homologação.
3. Desenhar o novo Dashboard após a atualização de Contas; o painel ainda é o da
   base em produção. Nenhum Dashboard novo foi declarado concluído.
4. Escolher e remodelar as demais telas, incluindo Faturas/pagamentos em rodada
   própria. Compatibilidade financeira não equivale à remodelagem dessas telas.
5. Ao concluir a remodelagem de todas as telas, revisar a paleta global.

O backlog anterior ao reinício permanece arquivado. Os demais módulos existentes
na versão 1 não são considerados ausentes sem uma revisão de seus requisitos.
As recorrências antigas conservam seu gerador e interface de manutenção; a nova
recorrência finita usa conjuntos próprios, evitando geração duplicada.
