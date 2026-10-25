# Mês global, faturas e rateios na lista central

Rodada de 25/10/2026. Base: produção/avaliação v48. Publicação desta rodada é
registrada em `lancamentos-contextos-publicacao.json`; homologação de uso permanece
separada da implementação e da publicação.

## Comportamento

- Um campo global de mês e a checkbox **Saldo anterior**. Desmarcada consulta
  somente o mês completo. Marcada consulta desde o primeiro lançamento até o fim
  do mês selecionado. Preferência explícita por usuário/navegador; atalhos atual,
  anterior e próximo permanecem relativos. Preferências antigas de intervalo são
  convertidas para o mês final, sem conservar dois campos na interface.
- A fórmula continua R−D+transferências recebidas−transferências enviadas. A lista
  geral usa as datas dos movimentos. Ao selecionar uma conta vinculada a Cartões,
  as compras usam a competência persistida da fatura. Pagamentos entram pela
  competência na ponta do cartão e pela data na ponta bancária. A tela identifica
  esse recorte como **Competência da fatura**. Alterar fechamento não reclassifica
  o histórico. Alterações explícitas de data/origem fora do cadastro contextual
  mantêm o recálculo já existente.
- Lançamentos busca dados atuais ao abrir, mesmo que o período já esteja em cache.
  Ações em lote da fatura também invalidam o store global.
- **Lançar nesta fatura** abre a lista em modal com o grupo/cartão e mês de origem.
  O novo registro é único, tem origem restrita aos cartões autorizados desse
  contexto e competência fixada pelo servidor. Sua data real é preservada. Para
  gerar parcelas/recorrências em outras faturas, usar o cadastro geral. A consulta
  contextual usa competência; limpar filtros conserva o conjunto da fatura.
- Contas abre a mesma modal de Lançamentos, limitada à conta de origem, em vez do
  antigo painel de histórico. Novos registros selecionam essa conta. Gravar
  atualiza a modal e os valores da tela de origem sem navegar para outra página.
- Rateios têm filtro **Todos / Rateados / Não rateados**. Participações em contas
  alheias também aparecem na lista, identificadas como **Sua participação**. O
  valor pessoal é exibido; o impacto de caixa é zero até registrar o próprio
  pagamento/recebimento. Elas continuam nos gastos pessoais por categoria e metas,
  sem somar a despesa original duas vezes.
- Novo rateio, edição, detalhamento, acertos e conferências usam a própria região
  da lista. Aprovação e escolha da categoria usam diálogos centrais. O antigo
  painel lateral de Rateios foi removido. Sair permite descartar ou salvar o
  rascunho explicitamente, inclusive no formulário em linha.
- Novos rateios recebem a categoria do autor como padrão em todas as partes.
  Categorias globais são reutilizadas. Quando a categoria do autor é privada, a
  árvore necessária é copiada/reutilizada para o participante, sem abrir acesso
  ao restante do catálogo alheio. Alterações posteriores são pessoais, inclusive
  pela edição em linha/lote, sem alterar as demais partes. Escolhas anteriores
  são preservadas. No legado sem categoria pessoal, a categoria original acessível
  é usada como padrão de leitura, sem regravar os registros.
- Painel inclui **Saldo das contas**, soma das posições atuais próprias de Consumo,
  Crédito e Investimento, identificada como efetivada até hoje. Cards ocupam uma
  ou duas colunas; smartphone tem composição própria em uma coluna. Evolução
  patrimonial conserva a largura inteira e os filtros 3/6/12 meses. Saldo do rateio
  abre a modal da lista com rateios, mantendo o painel de origem.

## Banco, permissões e integridade

Migração `lancamentos_v9_contextos`: RPC de gravação contextual, consulta autorizada
às próprias participações e categoria padrão em novas partes. Sem apagar,
reclassificar ou duplicar compras, participações, pagamentos ou acertos históricos.
Hashes das cinco tabelas financeiras são comparados dentro da mesma transação,
com bloqueio SHARE. Não se criam lançamentos de teste em produção.

RPCs são SECURITY INVOKER, com search_path vazio, identidade derivada da sessão e
EXECUTE restrito a service_role. A consulta de uma participação não libera acesso
à conta do pagador. Categorias pessoais, valores e decisões dos demais usuários
preservam os limites já existentes. Repetição de operações e versões mantêm os
controles de idempotência e concorrência.

## Verificação

- Upgrade local com legado populado e comparação dos registros financeiros.
- 35 verificações específicas: fatura explícita com data de compra em outro mês,
  competência, repetição, origem/grupo, permissões de titular/adicional, consulta
  pelo cartão, padrão individual/global/privado, ausência de caixa duplicado e
  mês com/sem histórico.
- 39 verificações do hub: lote atômico, conflitos, privacidade e saldos.
- 63 verificações de Rateios e regressões de Contas/pagamentos/Painel/patrimônio.
- Views e controllers reais com PostgreSQL fictício: computador, tablet e
  smartphone × Claro/Escuro/Sépia. Incluir rateio em linha, conta e compra em uma
  fatura de mês diferente da data, fechar modais e conservar a tela de origem;
  conferir card de saldo e modal de rateios do Painel.
- Regressão de edição direta/lote/rascunho e transferência de pagamentos de fatura.

O banco real foi consultado somente para diagnóstico e validação de leitura. Na
leitura de 25/10, o Nubank de lbfjantonio tinha 34 compras com competência em
novembro/2026. Essa quantidade pode mudar com os testes do usuário. A verificação
publicada das fontes e implantações não substitui a homologação autenticada com os
dados reais.
