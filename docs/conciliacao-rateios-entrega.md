# Conciliação dos rateios históricos — julho a outubro de 2026

O usuário autorizou quitar o período com os movimentos já existentes, reconhecer
os lançamentos antigos como especiais e excluir os novos duplicados. A inclusão
de outubro e da terceira receita nova foi confirmada expressamente.

## Critério da correção

- Reutilizar os 11 lançamentos históricos, preservando integralmente seus IDs,
  datas, valores, contas, categorias e demais campos. O caráter especial é
  reconhecido pelo vínculo ao acerto; não renomear o tipo Receita/Despesa nem
  duplicar o movimento financeiro.
- Reparar quatro acertos e reconhecer quatro recebimentos antigos adicionais.
  Vincular somente as pontas realmente existentes; não lançar pagamentos em
  contas de outras pessoas quando a despesa correspondente não existe.
- Excluir exclusivamente as três receitas novas que o usuário autorizou remover.
  Copiar os registros completos para o diário privado antes da exclusão.
- Zerar cada fechamento de julho, agosto, setembro e outubro por par de pessoas.
  Diferenças entre os pagamentos e o saldo do período recebem ajustes de quitação
  sem movimentação bancária, usando a modalidade Perda já existente. Não alterar
  as participações originais, nem inventar aprovações retroativas.
- Preservar os compromissos de novembro em diante. Saldo do período quitado zero
  é distinto do saldo acumulado que inclui obrigações futuras já registradas.

## Execução e auditoria

A transação operacional tem bloqueios de concorrência, hashes de pré-condição,
backup dos registros afetados, verificações de saldos de todas as contas e ASSERTs
para cada fechamento. Tem uma chave de operação privada para impedir repetição.
O ensaio integral em produção com ROLLBACK passou antes da execução definitiva.
Os dados pessoais e os identificadores da operação permanecem fora do Git, no
diretório local `/workspace/work/conciliacao-rateios-jul-set/` e no diário privado
`mukirana_rateios.operacoes` após a conclusão.

## Exibição dos ajustes

Foi necessário distinguir um ajuste de quitação das pontas bancárias na tela de
Rateios. O DTO privado de acertos informa a modalidade de exibição e a nota do
ajuste; ajustes não oferecem o botão de registrar pagamento/recebimento. A tela
mostra “Quitação histórica” e “Sem movimentação bancária”. Os fluxos normais de
acerto conservam suas regras e botões.

Migração de leitura `20261025171520_rateios_v7_adjustment_display.sql`: somente
`CREATE OR REPLACE` do DTO privado, mantendo security invoker, search_path vazio
e execução restrita ao service_role. Não cria tabelas ou movimentações bancárias.
Os dados são corrigidos separadamente, em uma operação administrativa autorizada.

Validações: ensaio transacional completo com ROLLBACK, 60 regressões de Rateios,
teste do ajuste sem caixa e sem ações de pagamento para ambas as pessoas, nota
escapada, sintaxe de todos os arquivos e navegação real nas interfaces próprias.
O registro final de aplicação e publicação fica em
`conciliacao-rateios-publicacao.json`.
