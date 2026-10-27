# Aceite de rateios sem duplicidade

A ação geral Receber podia iniciar outro acerto enquanto já existia o pagamento
aguardando confirmação. A confirmação pelo ID correto já usava o mesmo acerto.
Esta rodada corrige a entrada do fluxo e protege o banco contra a repetição.

## Comportamento

- Pagar/Receber encontra a ponta já enviada pela outra pessoa. Com um registro,
  abre sua confirmação; com vários, pede qual acerto confirmar. O formulário
  conserva seu ID/versão e permite escolher a própria conta ou vincular um
  lançamento existente. Não cria movimento na conta da outra pessoa.
- A confirmação gera uma única receita do credor no mesmo acerto do pagamento.
  O saldo entre as pessoas é abatido uma vez. Reenvio da mesma operação retorna
  o resultado anterior; uma confirmação nova do mesmo acerto é recusada.
- Sessões antigas não podem iniciar outro acerto com o mesmo valor enquanto a
  ponta correspondente está aguardando confirmação. Um novo Receber idêntico em
  pessoa/valor/data/conta, após o aceite, também não cria outra receita. A trava
  bilateral existente serializa operações simultâneas.
- Pagamentos reais distintos com IDs diferentes continuam podendo ser
  confirmados, inclusive com o mesmo valor/data. Vincular uma receita financeira
  distinta já existente continua disponível. Receber pode iniciar um acerto
  quando não existe pagamento correspondente pendente.
- Pagamento de fatura reconhecido como acerto continua sem receita adicional.
  O servidor recusa tentar tratá-lo como recebimento bancário comum.

## Saldos e filtro

Painel, lista principal e modal de Rateios exibem a mesma posição devedor/credor
até o fim do mês global, com pagamentos e recebimentos abatidos uma vez. Essa é
uma posição de dívida; o movimento mensal é outro valor. Por exemplo: obrigação
em novembro quitada em outubro resulta em zero pendente em novembro, também sem
marcar Saldo anterior. Não há alocação do pagamento por despesa.

Após gravar ou confirmar, o store global, a lista e a tela de origem da modal
são recarregados. Zero por pessoa é identificado como **Sem valor pendente**.
A confirmação de uma ponta ainda não registrada permanece acessível mesmo com
saldo zero, com indicação separada das conferências. Dívidas com pessoas
opostas não se quitam pelo simples saldo líquido total zerado.

A checkbox continua definindo mês/histórico dos lançamentos e do cálculo global
de Ainda posso gastar. Esta rodada muda a apresentação da posição de dívida nos
cards de Rateios; não modifica a fórmula da disponibilidade ou o caixa.

## Banco e validação

Migração `20261027131420_rateios_v13_aceite_sem_duplicidade` aplicada no projeto
`wcczkultokrypdfimbsh`. Função SECURITY INVOKER, search_path vazio e execução
restrita ao serviço preservados. A migração comparou hashes de todas as linhas
das cinco tabelas financeiras dentro da transação, sem alterar dados. A função
remota tem o mesmo hash da função testada localmente.

43 verificações específicas, 63 regressões de Rateios e 47 verificações de saldos
por período aprovadas. Nove combinações dispositivo/tema passaram com as views,
controllers e PostgreSQL fictício: confirmação única, seletor entre acertos,
reconhecimento de fatura e atualização da modal/Painel. No smartphone foi
simulada perda da resposta após gravar; reenvio não duplicou o recebimento.
Sete bundles renderizados passaram na análise de sintaxe. Consultas e advisors
posteriores confirmaram as proteções e nenhuma mudança nos achados existentes.
Referências dos achados anteriores: [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[índices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

A exclusão de dados autorizada anteriormente está documentada em
[remoção do acerto duplicado](remocao-acerto-duplicado-entrega.md). Esta rodada
não altera nem confirma pagamentos históricos. O recebimento adicional e o
ajuste de saldo ainda apontados no diagnóstico permanecem para conciliação;
não se força um saldo zero que os registros existentes não sustentem.

Produção e avaliação publicadas na **versão59**, com os 74 arquivos da versão
imutável baixados em diretório independente e conferidos por bytes/SHA-256 com
o commit `0612925`. Endereços existentes preservados. Acesso HTTP exige login
Google; a verificação HTTP não substitui o teste autenticado pelo usuário.

Publicação e hashes: `rateios-aceite-publicacao.json`,
`rateios-aceite-verificacao-v59.json` e `rateios-aceite-fontes-v59.json`.
Homologação autenticada pelo usuário permanece separada dos testes locais.
