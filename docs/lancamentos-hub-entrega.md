# Lançamentos central e retirada de Projetos

Rodada aprovada em 25/10/2026. Implementação e publicação no acesso principal
autorizadas pelo usuário. A proposta está em `proposta-lancamentos-hub.md`.

## Uso diário

- Todas as contas acessíveis no seletor, com Consumo, Crédito e Investimento/
  Patrimônio agrupados. Inativas identificadas para consulta e contas sem
  movimentos disponíveis; busca de contas no painel de filtros.
- Resultado na barra global pelo período mensal e pelos filtros ativos:
  Receitas − Despesas + entradas − saídas de transferências. Investimento faz
  parte da consulta de Lançamentos sem precisar habilitar outra opção. As demais
  telas conservam o contexto operacional de Consumo/Crédito.
- Conta vazia permanece selecionada e mostra zero. Recarregar ou gravar não
  apaga os filtros. Ao trocar de conta, os demais filtros dependentes se ajustam;
  a seleção de conta é a exceção expressa à regra anterior de facetas.
- Edição de descrição, data, valor, categoria, conta e situação na própria linha.
  Campo com Salvar/Cancelar; Enter confirma e Esc cancela. Smartphone expande o
  cartão com seletor de campo próprio. Edição completa permanece disponível para
  conjuntos/rateios e detalhes especiais. Data futura usa situação Pendente.
- Lote de categoria/subcategoria e fixa/variável, além de efetivar/excluir.
  Contador e alcance explícitos; itens protegidos são identificados antes de
  aplicar. Duas pontas de transferência representam uma operação selecionada.
- Ordenação por data, descrição, categoria, conta, valor e situação. Cabeçalhos
  acionáveis com `aria-sort`; controle compacto equivalente no smartphone.
  Valores usam centavos com sinal, com desempate estável por chave.
- Visões Todos, Pendentes e A categorizar, além de até 20 visões nomeadas salvas
  explicitamente por usuário neste navegador. Guardam filtros e ordenação; o
  período mensal continua global. A preferência não é sincronizada entre aparelhos.
- Ações contextuais de edição rápida, fatura, ocorrências do conjunto e rateios.
  Barra de seleção fixa; Novo lançamento permanece acessível ao rolar no desktop
  e na barra inferior própria do smartphone. Busca/teclado e rascunho explícito
  continuam disponíveis, inclusive ao sair de uma edição na linha.

Corrigida também uma abertura de contexto que procurava cartão/grupo com IDs
ausentes e podia selecionar um instrumento indevidamente. A moldura da marca
agora separa logo/nome e perfil, sem margem negativa ou sobreposição.

## Persistência e privacidade

O endpoint autenticado `lancamentosHubAtualizar` usa uma transação para o lote,
com versões, bloqueios em ordem estável e repetição segura. Uma falha reverte
todos os itens. Categoria de rateio altera somente a participação do ator;
mantém valores, pessoas, aprovações e dívida. A versão da própria participação
também é conferida. Classificação em lote não altera rateios protegidos.

Transferências, pagamentos de fatura, saldos iniciais e acertos continuam com
suas regras especiais. O pagamento é persistido uma vez e projetado nas duas
contas. A correção de atualização da Fatura publicada na v47 foi preservada.

Projetos saiu do menu, do formulário/filtro de Lançamentos, da Fatura e da tela de
Recorrências. O código anterior foi arquivado em `docs/archive/projetos-v47/`;
chamadas antigas de gravação/status são recusadas e a rota antiga abre Categorias.
As tabelas e referências históricas permanecem. Não foram criadas categorias
automaticamente nem removidos vínculos antigos. Referências a projetos inacessíveis
não bloqueiam mais a edição de lançamentos nem a validação das recorrências.

Migrações aplicadas ao Supabase `wcczkultokrypdfimbsh`:

- `20261025184541_lancamentos_v8_hub_metadata.sql`;
- `20261025185217_lancamentos_v8_retired_projects.sql`.

Arquivos criados com a CLI e alinhados aos timestamps efetivamente registrados
pelo MCP no histórico remoto. As duas migrações verificam hashes dos registros
sob bloqueio antes/depois e não reescrevem dados financeiros ou de projetos.
A segunda confere também a versão anterior da função de gravação antes de
substituí-la. RPCs são SECURITY INVOKER, com acesso exclusivo de service_role;
a identidade do usuário vem da sessão validada no Apps Script.

## Verificação

- 39 verificações do backend do hub: lote atômico, repetição, concorrência de
  versões, categorias privadas, permissões e preservação dos saldos/aprovações.
- Validadores reais de Recorrências: projeto antigo preservado, projeto novo
  ignorado, dependência retirada e proteção da conta mantida.
- Nove combinações: computador/tablet/smartphone × Claro/Escuro/Sépia. Criação,
  edição, lote, conta vazia, patrimônio, ordenação, filtros, visões, rascunho,
  marca/perfil, teclado/toque e ausência de overflow.
- Casos adicionais de data futura, situação, troca de conta e conflito real entre
  uma edição local e outra gravação no banco fictício; preenchimento preservado.
- Regressões de Lançamentos, Contas, Rateios/concorrência, participação pessoal,
  patrimônio e pagamentos pela Fatura nos três dispositivos.
- Conferência remota de funções, catálogo/lançamentos anteriores e permissões.
  Advisor sem WARNING/ERROR; os 16 INFO anteriores de
  [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  correspondem ao bloqueio de acesso direto já usado pela aplicação.

Testes de gravação usam somente PostgreSQL 17 local e dados sintéticos.
Autenticação remota como usuário final permanece parte da homologação do usuário.
A versão/commit e a comparação das fontes imutáveis constarão em
`lancamentos-hub-publicacao.json` após a publicação.
