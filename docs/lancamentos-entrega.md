# Lançamentos conectado

Substitui o protótipo no menu provisório **Lançamentos (novo)**. A tela principal
existente permanece até homologação. Desktop/tablet usam lista e painel compacto;
smartphones usam cartões e formulário próprio em tela inteira.

Uma regra compartilhada no servidor e navegador calcula Receitas − Despesas +
transferências recebidas − transferências enviadas. Uma transferência tem um único
registro e duas projeções: origem negativa, destino positiva. A seleção das duas
contas resulta em zero. Os filtros são dependentes e o saldo da barra global segue
os filtros ativos de Lançamentos; nas outras telas, considera todo o período.

O período é mensal, com preferência explícita por usuário e atalhos relativos.
Formulários oferecem apenas Sair ou Sair e salvar rascunho, inclusive ao navegar.
Rascunhos são isolados por usuário. Não há salvamento automático.

## Funcionalidades

- CRUD autenticado, versões concorrentes e repetição segura após perda da resposta.
- Modalidade fixa/variável, transferência, parcelamento e recorrência finita com
  sete frequências, término exclusivo e acerto de centavos na primeira parcela.
- Edição individual/do ponto em diante/do conjunto; exclusão individual, próxima,
  anterior ou integral. Geração e rateios gravados numa única transação.
- Histórico pessoal e favoritos sem reutilizar valor; cadastro contextual real.
- Base de aprovações individuais de rateios, escolha de categoria na decisão,
  motivo da recusa e nova solicitação após mudanças. Exclusão compartilhada aguarda
  os participantes. A persistência da categoria por participação, a leitura do
  destinatário e a liquidação completa são parciais; ver [proposta de Rateios](proposta-rateios.md).
- Renovação como novo conjunto com vínculo ao anterior, sem alterar o original.
- Compras mantêm a competência persistida. Pagamentos de fatura aparecem como
  transferência, sem nova despesa. Acesso adicional continua limitado.
- Conjuntos antigos e projeções de recorrências legadas continuam disponíveis;
  projeções são identificadas e editadas no módulo original, sem duplicar geração.

Na versão 39, o saldo inicial conservava a regra anterior, separado do resultado.
A atualização de [Contas](contas-tipos-entrega.md) passou a incluí-lo nos indicadores
novos conforme CON-04 e habilitou a exclusão especial que zera o cadastro.
Também completou o pagamento da fatura como transferência editável e alinhou o
recorte à data de ocorrência, preservando a competência no módulo de Faturas.

## Banco e verificação

Migração `20261025005407_lancamentos_v3_integrated_ledger.sql` aplicada ao projeto
`wcczkultokrypdfimbsh`. Estrutura aditiva; hashes das colunas financeiras existentes
conferidos dentro da transação. Mantidos 1.092 lançamentos, 17 contas, 942 rateios
e 22 pagamentos. Nenhum registro financeiro real foi criado nos testes.

37 ASSERTs executados no PostgreSQL local e no Supabase com BEGIN/ROLLBACK.
Backend e concorrência verificam autorização, atomicidade, centavos, escopos,
aprovações e repetição. Navegador integrado ao PostgreSQL local: computador,
tablet, smartphone, rotação, filtros, dois lados da transferência, rascunho e
perda de resposta após commit. Regressões de Contas e Cartões passaram.

As cinco novas tabelas privadas têm RLS e nenhum acesso de anon/authenticated;
somente o servidor com service_role acessa os RPCs. O advisor emitiu apenas INFO
[RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
esperado nesse modelo de bloqueio de acesso direto (oito casos anteriores e cinco
novos). Não foi realizado login remoto como usuário final; essa é a homologação.

O registro imutável de versão/commit está em `lancamentos-publicacao.json`.
