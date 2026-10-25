# Rateios, acertos e Painel geral — entrega conectada

Implementação autorizada em 25/10/2026. A autorização mais recente promove as novas
telas aos acessos principais e retira as interfaces anteriores do menu, sem exigir
outra autorização para essa organização. A homologação desta rodada continua sendo
uma etapa do usuário. A publicação e a conferência da versão imutável são registradas
em `rateios-painel-publicacao.json`.

## Comportamento entregue

- **Lançamentos** passa a usar a interface conectada, com estruturas próprias para
  computador/tablet e smartphone, saldo/período globais, filtros dependentes,
  geração finita, rascunho explícito e ações contextuais.
- **Rateios e acertos** é um acesso ao fluxo de Lançamentos. Mostra saldo acumulado
  por pessoa, participações do período, solicitações com datas/valores/decisões,
  categorias privadas e convites privados por e-mail exato. O convite aparece na
  aplicação; não envia mensagens externas nem concede acesso a contas.
- Participações mantêm seus IDs ao editar. A categoria pessoal persiste fora do
  token. O autor recebe sua categoria original quando ela é acessível; não se
  inventa aprovação histórica para os demais. A classificação interna
  Aguardando Categorização só aparece em participações sem categoria; não há opção
  reservada selecionável no cadastro.
- O responsável financeiro vem da conta ou do titular do grupo de Cartões. O autor
  adicional pode revisar seus registros, mas não recebe os movimentos bancários
  privados do titular em seu resultado financeiro. Aprovações incluem o titular
  quando ele é responsável financeiro, mesmo sem participação de benefício.
- **Pagar** cria uma despesa na conta do próprio usuário. **Receber** cria uma
  receita na conta do próprio usuário, inclusive quando o recebimento inicia o
  acerto. As pontas compartilham o mesmo ID e reduzem a dívida uma única vez.
- O saldo bilateral considera todo o histórico e obrigações futuras registradas;
  não depende do período global. Há sugestão até o mês atual e limite pelo saldo
  total. Valores parciais, concorrência e repetição de requisição são validados
  no PostgreSQL. Previsões virtuais não autorizam pagamento.
- Pagamento aguardando recebimento reserva o saldo. Recusa exige motivo, restaura
  a dívida e preserva a despesa até correção/exclusão explícita pelo pagador.
  Depois que ambas as pontas são registradas, elas ficam protegidas; não apagar
  ou reescrever o lançamento da outra pessoa.
- É possível vincular um lançamento próprio existente, inclusive fora do período
  selecionado, sem lançá-lo novamente. Pagamentos de fatura existentes mantêm
  seus efeitos como transferência; o vínculo e reconhecimento não criam outra
  despesa/receita. Os acertos antigos mantêm suas referências originais.
- **Painel geral** usa R−D±transferências, Consumo+Crédito por padrão e opção de
  incluir Investimento. A mesma opção acompanha a barra global e Lançamentos.
  Três atalhos mensais mudam a sessão, sem salvar a preferência automaticamente.
- Consumo, Crédito e patrimônio em Investimento são posições efetivadas até hoje,
  desde o início do histórico. Movimento no período e saldo projetado ficam
  separados no detalhe. Categoria principal agrega descendentes sem duplicidade;
  aparecem as três maiores despesas e Outras.
- **Metas** reaproveita o painel e abre o editor da família de categorias. Receitas
  têm mínimos; despesas têm tetos. Alterações da principal e filhas são atômicas;
  principal automática acompanha as filhas, e teto manual incompatível é recusado.
  A meta mensal é multiplicada pelos meses completos do intervalo. Metas não
  bloqueiam lançamentos reais. Classificação insuficiente não produz percentual
  de comprometimento enganoso.

A despesa de R$ 300, dividida por três, produz resultado −R$ 300 e R$ 200 a receber.
Uma receita própria de acerto de R$ 200 leva o resultado a −R$ 100. Os pagamentos
registrados pelas outras pessoas são suas despesas. Não há separação de modos
Minha participação/Fluxo de caixa. Isso substitui as regras anteriores RAT-03/12 e
ACE-02/03/09 na apresentação financeira, conforme decisões explícitas do usuário.

## Menu e compatibilidade

Painel geral; Movimentações (Lançamentos, Contas, Cartões, Rateios e acertos);
Organização (Categorias, Metas, Recorrências, Projetos); Administração (Usuários).
Contas usa a atualização com três tipos. ContasTipos/ContasNova, CartoesNovo e
LancamentosNovo continuam como aliases para links existentes, sem telas concorrentes.
O antigo protótipo redireciona ao fluxo real.

Interfaces anteriores estão em `docs/archive/telas-anteriores-v40`, excluídas do
push pelo `.claspignore`. Helpers de Contas, Cartões, Faturas e recorrências
históricas continuam disponíveis. O contexto de edição de Faturas abre o editor
novo, mantém a proteção de rascunho e atualiza a tela de origem após gravação.

## Banco e verificação

Migração `20261025103532_rateios_v4_acertos_dashboard.sql` aplicada no projeto
`wcczkultokrypdfimbsh`. Snapshot e ASSERTs da própria migração comparam todos os
campos preexistentes de lançamentos, participações, acertos e metas. Depois da
aplicação, o hash de lançamentos continuou
`f103f87353113e552b244a7269d613fb`: **1.092 lançamentos, 942 participações, três
acertos e 258 referências resolvidas**, nenhuma referência perdida e nenhuma
solicitação de aprovação inventada.

Os 28 ASSERTs de `tests/rateios-v4.sql` passaram no Supabase em BEGIN/ROLLBACK,
com usuários e valores fictícios; nenhum dado de teste foi persistido. As novas
RPCs são service-only e extraem o ator da sessão Apps Script. As tabelas privadas
não permitem consulta anônima ou de usuários PostgREST autenticados. Advisor de
segurança: nenhum WARN/ERROR; 16 INFO de RLS sem políticas são intencionais para
acesso exclusivo pelo servidor. [Explicação do linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
O advisor de desempenho não identificou novas FKs sem índice nesta migração;
os avisos informativos preexistentes continuam para revisão de desempenho própria.

Validação local: upgrade com três acertos legados, 60 verificações de integração,
concorrência real de pagamento/recebimento e retry, regras do painel em centavos,
regressão de Lançamentos/Contas, sintaxe de todos os JS/HTML e navegador real em
computador, tablet e smartphone. Os testes usam os templates e controllers reais
com PostgreSQL local; não substituem a homologação de uso com a conta Google.
Detalhes de reprodução em `tests/README-rateios-v4.md`.

A paleta global permanece para a rodada final. Correções de acertos que já têm as
duas pontas registradas precisam de um fluxo explícito de estorno; por segurança,
esses registros estão protegidos nesta entrega, sem reescrita automática.
