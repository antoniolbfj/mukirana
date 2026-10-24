# Entrega de Cartões (novo)

24/10/2026. Implementação autorizada da proposta, aguardando homologação.
Menu provisório **Cartões (novo)**; **Cartões** atual continua disponível e
**Contas** permanece como tela principal homologada. A paleta não foi revista.

## Comportamento

Duas interfaces dedicadas: linhas comparativas e painéis laterais em computadores/
tablets; blocos, ações inferiores e formulário/detalhe em tela inteira no smartphone.
A escolha se mantém ao rotacionar o aparelho, preservando o rascunho.

Lista inicial independente da busca de usuários e da projeção de recorrências;
busca por nome/titular, filtros de status e papel, resumo das faturas da lista,
consulta de cartões vinculados/competências e acesso real à Fatura e aos Lançamentos.
Formulário com nome, limite não negativo, fechamento/vencimento 1–31 e busca de
adicionais sob demanda. Inativação/restauração com Desfazer, sem excluir histórico.
Erro, zero e carregamento são estados distintos. A previsão não bloqueia a lista.

## Regras financeiras e permissões

- Registrado: despesas de cartão menos créditos/estornos já lançados na competência.
- Pago: pagamentos **Efetivados** da mesma fatura/competência. **Pendentes** aparecem
  como programados e não abatem esse número.
- Em aberto e crédito calculados separadamente por competência antes da soma no
  intervalo; um crédito de um mês não oculta a dívida de outro mês.
- Previsões separadas do registrado. A busca considera o mês anterior para captar
  compras após o fechamento que pertencem à competência selecionada. Ocorrências
  geradas não são duplicadas; recorrências antigas não param nas primeiras 400 datas.
- Segundo carregamento atualiza valores registrados e previsão a partir do mesmo
  snapshot de consulta, evitando misturar etapas diferentes quando há novos movimentos.
- Titular consulta o consolidado. Adicional consulta seus movimentos autorizados,
  sem receber pagamentos globais, limite ou participantes privados como se fossem seus.
- **Decisão confirmada pelo usuário:** adicionais mantêm a permissão existente de
  registrar pagamentos usando contas às quais têm acesso. O teto é calculado no
  servidor pelo saldo global registrado da fatura, não pelo subtotal do adicional.
  Permissões de conta original também são conferidas ao editar um pagamento.
- Em vários meses ou todo o histórico, o acumulado não é comparado a um único limite.
  Para registrar pagamento, selecionar uma única competência na barra de período.
- A competência persistida em `lancamentos.mes_referencia` é preservada quando muda
  o fechamento. O novo dia vale para novas compras/previsões. Corrigir explicitamente
  data ou cartão de origem recalcula a competência daquela compra.
- Não são inferidos vencimentos completos, feriados ou atrasos a partir de um dia do mês.

A leitura de Fatura e da lista antiga utiliza os mesmos conceitos. A Fatura mantém
sua interface existente, com rótulos de registrado/previsto, escopo parcial e retorno
ao menu de origem. Filtros de categoria afetam a lista; o resumo financeiro conserva
o escopo completo autorizado. A remodelagem integral de Faturas/pagamentos é outra rodada.

## Banco e compatibilidade

Supabase `wcczkultokrypdfimbsh`, migração
`20261024180625_cartoes_v2_atomic_scope`. O arquivo foi iniciado pela CLI e recebeu
o identificador efetivamente registrado pelo MCP ao aplicar a mesma migração.
A correção complementar `20261024182639_cartoes_v2_owner_mutex` serializa cada titular
sem bloquear linhas de usuários usados como adicionais. Não é necessário executar SQL manualmente.

Mantidas as tabelas separadas `grupos_cartoes` e `cartoes`. Gravação de grupo,
cartão titular e adicionais feita em transação única, com versão esperada e ID da
última operação. Repetir uma gravação já confirmada devolve o mesmo registro.
Somente o titular altera cadastro/status; titular e vínculos dos cartões são imutáveis.
Retirar adicional inativa o cartão; recolocar a pessoa restaura o mesmo ID.
Nomes repetidos por titular ignoram caixa, acentos e espaços excedentes, incluindo
inativos, em conformidade com a validação anterior.

Na implantação de avaliação, as gravações pela tela antiga também usam as rotinas atômicas. Gravações legadas
diretas invalidam a versão, para a tela nova detectar conflito. Nenhum fechamento,
compra, parcela, recorrência, cartão ou pagamento existente foi reclassificado ou
excluído pela migração. Hashes dentro da transação verificam todos os registros
anteriores. A conferência posterior manteve **7 grupos, 10 cartões, 1.092 lançamentos
(847 de cartão) e 22 pagamentos**, com versões iniciais consistentes.

As novas RPCs exigem `service_role` e usam SECURITY INVOKER; a sessão do Apps Script
fornece o ator, com DTOs mínimos. Não há chaves no navegador. RLS habilitada e acesso
direto negado a `anon`/`authenticated`. O advisor não apresentou WARN; registrou oito
informações de [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
incluindo as quatro tabelas anteriores. Isso mantém negação por padrão para clientes
diretos: a autorização da sessão própria acontece no backend, não em `auth.uid()`.

## Verificação

- Sintaxe global de JS/HTML; APIs autenticadas, ator confiável, campos permitidos,
  validações de moeda/datas/versão e manutenção das duas rotas de Cartões.
- **45 invariantes SQL**, localmente e no Supabase como `service_role`, em transação
  desfeita: permissões, adicional/histórico, crédito, pagamento pendente, competência,
  nome normalizado, IDs estáveis, repetição, conflitos e visibilidade das projeções.
- Migração exata em PostgreSQL 17 novo com registros legados, preservação de hashes
  e execução dos testes anteriores de Contas.
- Concorrência real: criação repetida, duas edições, edição/status, nomes concorrentes e dois titulares incluindo um ao outro como adicionais.
  Falha forçada ao criar adicional desfaz grupo e cartões juntos.
- Chromium em computador, tablet e celular usando os templates reais, uma VM das
  funções Apps Script e PostgreSQL efêmero. Pesquisa de usuários não bloqueia a lista;
  adicional não edita nem vê outros cartões; rotação preserva formulário; falha após
  commit seguida de repetição não duplica; status/Desfazer, período, erro de previsão
  e navegação para Fatura/Lançamentos funcionam.
- Leitura real da Fatura nessa integração, como titular e adicional, com os mesmos
  valores do novo resumo e pagamento permitido ao adicional conforme decisão do usuário.
- Cadastro/edição/inativação pela API da tela antiga preservam IDs e usam o mesmo
  resumo; pagamento valida conta de origem e acesso ao pagamento original.

Não foram utilizados dados pessoais reais nos testes nem enviadas mensagens/e-mails.
A integração de navegador usa sessão fictícia e banco local; a homologação autenticada
no Google com os dados reais permanece com o usuário.

## Publicação

Publicada a **versão 35** na [implantação de avaliação](https://script.google.com/macros/s/AKfycbwfdVNi6mnDWpkDUbYVAYvMj_MbfCWtbcyptd_5MlgreYnI20xp3L-CPWsz1cB6DXzS/exec).
Acesse com a conta Google, entre no Mukirana e abra **Cartões (novo)**.
A tela atual **Cartões** está disponível na mesma implantação para comparação.
Os 61 arquivos foram enviados pelo clasp, baixados da versão imutável e conferidos
byte a byte. Código e migrações enviados ao GitHub. [Identificadores e hashes](cartoes-publicacao.json).

A produção e o endereço usado anteriormente para Contas permanecem na versão 34.
A revisão automática bloqueou a tentativa de atualizar a implantação de produção,
pois a rodada foi autorizada para avaliação provisória, e recomendou uma implantação
separada. A alternativa foi concluída; não foi tentado contornar o bloqueio.
A promoção da tela/implantação de produção fica para depois da homologação explícita.
A versão de avaliação usa o mesmo banco confirmado, portanto as gravações nela são reais.

Na conferência final, foi reproduzido um deadlock quando dois titulares incluíam
um ao outro ao mesmo tempo. O bloqueio de linhas de usuários foi substituído por
um bloqueio transacional por titular; o mesmo teste passou com as duas operações
concluídas, além dos testes de repetição, conflito e reversão de falhas.

## Homologação e promoção

Em 24/10/2026, o usuário declarou **Cartões homologado**. Com essa autorização,
a produção foi atualizada para a **versão 36**, commit `4659a9b`.
**Cartões** agora abre a tela homologada; o menu provisório foi retirado e a rota
`CartoesNovo` permanece como alias para páginas/contextos já abertos.
Os 61 arquivos imutáveis da versão foram baixados e comparados byte a byte com
esse commit. Não houve nova alteração no banco nem na paleta.
[Registro da promoção](cartoes-promocao.json).

O endereço de avaliação passa a ser utilizado para o protótipo de Lançamentos,
em rodada separada. As informações da versão 35 acima são o histórico de entrega,
não o estado atual da implantação de produção.

