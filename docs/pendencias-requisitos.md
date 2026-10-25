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
- Contas ampliada no menu **Contas (tipos)**: três tipos, vínculo único ao grupo
  existente, saldos derivados, inicial nos indicadores, exclusão protegida e
  pagamentos como transferências, com testes locais de upgrade/concorrência e
  navegador; migração aplicada e 29 ASSERTs remotos em ROLLBACK. Ver [contas-tipos-entrega.md](contas-tipos-entrega.md).

## Pendências vigentes

1. Homologar Lançamentos conectado em computador/tablet e smartphone; depois
   promover ao acesso principal e retirar o menu provisório.
2. Homologar Contas (tipos), incluindo a classificação das contas antigas de
   investimento; depois promover a atualização ao acesso principal.
3. Revisar a proposta e implementar o novo Dashboard com Consumo/Crédito separados
   do patrimônio em Investimento. O painel principal ainda usa a base anterior;
   validar metas, classificação fixa/variável e acertos sem duplicidade ao integrá-lo.
4. Escolher e remodelar as demais telas, incluindo Faturas/pagamentos em rodada
   própria. Compatibilidade financeira não equivale à remodelagem dessas telas.
5. Ao concluir a remodelagem de todas as telas, revisar a paleta global.

O backlog anterior ao reinício permanece arquivado. Os demais módulos existentes
na versão 1 não são considerados ausentes sem uma revisão de seus requisitos.
As recorrências antigas conservam seu gerador e interface de manutenção; a nova
recorrência finita usa conjuntos próprios, evitando geração duplicada.
