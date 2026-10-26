# Pagamento de fatura como transferência

Rodada de 26/10/2026. Publicação em `faturas-pagamento-simples-publicacao.json`;
homologação autenticada permanece pendente.

O usuário definiu que pagamento de fatura é somente uma transferência da conta
de origem para a conta de crédito vinculada ao cartão. Pode ser parcial, integral
ou superior à dívida, formando crédito. Essa decisão substitui o teto anterior
pelo saldo em aberto.

Foram retiradas as comparações de teto do formulário, do controller e do trigger
de pagamentos. Permanecem as verificações de conta acessível, fatura ativa,
competência válida e valor positivo, além da identificação única e das duas
pontas já existentes. O mesmo registro atende Faturas e Lançamentos.

Criar/editar pagamento agora modifica apenas o pagamento/transferência. A rotina
anterior que efetivava todas as compras foi removida. Compras e classificações
anteriores são preservadas. A fatura exibe saldo negativo quando devedora, zero
quando quitada e positivo quando há crédito.

Havia também uma falha de competência: Saldo anterior deixa o início global em
branco, mas o formulário o usava como mês do pagamento; o servidor assumia o mês
corrente. A modal agora fixa o mês selecionado ao abrir e conserva o mês original
nas edições. A competência fica identificada na modal, e o servidor recusa um mês
ausente em vez de presumir outro.

A migração `20261026202540_faturas_v12_pagamento_transferencia_credito` atualiza
somente a função de trigger, preservando sua origem, locks, permissões e modo
invoker. Não há reescrita financeira: hashes de lançamentos, pagamentos, contas,
participações e acertos foram comparados dentro da transação. O pagamento parcial
informado pelo usuário permaneceu com a mesma identificação, data e valor; sua
edição ou complemento será feito pelo próprio usuário na interface atualizada.
Auditoria de dados reais fica privada, fora do Git.

## Verificação

- As duas falhas anteriores foram reproduzidas com o controller da v57 em dados
  fictícios: mês em branco e valor acima do saldo restante.
- 25 verificações em PostgreSQL local: parcial, integral, crédito, edição do
  pagamento original, novo complemento, transferência em Lançamentos, repetição
  idempotente, duas pontas sem nova despesa e compras sem mudança de situação.
- Nove combinações de dispositivo/tema aprovadas, com Saldo anterior marcado,
  mês da modal fixado, saldo devedor/zero/crédito e edição de pagamentos.
- Regressão SQL de Contas aprovada, incluindo crédito excedente. Três dispositivos
  aprovados na regressão de cache de Faturas/Lançamentos: criar, editar, alterar
  situação, excluir e filtrar as duas pontas sem recarregar a sessão.
- Sintaxe de sete bundles e verificação de espaços aprovadas. Migração aplicada
  na base vigente, com leitura independente da função/permissões e preservação do
  pagamento anterior. Advisors mantêm somente os INFO já existentes.

Os testes financeiros usam dados locais fictícios. A publicação exige conta Google;
a conferência da autenticação não substitui a homologação real do usuário.
