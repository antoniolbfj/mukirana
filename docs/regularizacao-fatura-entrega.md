# Regularização de pagamento histórico de fatura

Rodada de 26/10/2026. Operação de dados autorizada pelo usuário após a análise.
O código e as implantações permanecem na versão54.

A conferência encontrou uma competência com despesa registrada e sem pagamento.
Os pagamentos existentes de outras competências eram reconhecidos corretamente.
Também não foi encontrado lançamento bancário comum que representasse a quitação
faltante. O usuário confirmou a omissão e solicitou um pagamento igual ao modelo
existente de outro mês, ajustando data e competência para o mês regularizado.

Foi criado **um único registro em `pagamentos_faturas`**, com conta de origem,
valor, status, observação e autoria iguais ao modelo confirmado. ID e momento
de criação são próprios do novo registro. A persistência existente projeta esse
pagamento como transferência especial: saída na conta de origem e entrada na
conta de crédito vinculada. Não foi criada uma segunda despesa em `lancamentos`.

A transação valida o titular, a conta, o modelo, o saldo da fatura e a ausência
de outro pagamento na competência. Usa o mesmo advisory lock do limite de
pagamentos, possui identificação fixa para retomada sem duplicidade e mantém
ativos os gatilhos existentes. A comparação dos hashes dos pagamentos anteriores
foi feita dentro da transação; todos permaneceram inalterados.

As verificações no banco confirmaram a quitação, uma única transferência especial
na RPC de Lançamentos e duas pontas de sinais opostos, cuja soma é zero. Uma nova
consulta após o commit confirmou os dados e os movimentos por conta. As demais
faturas verificadas permaneceram quitadas. Não houve migração nem alteração de
código. A versão54 continua idêntica às fontes publicadas e conferidas.

Auditorias antes/depois e SQL com identidades e valores ficam privados no
workspace. Este relatório não publica os dados pessoais da operação.
A sessão aberta do usuário deve recarregar a página para atualizar o cache.

Registro resumido: `regularizacao-fatura-verificacao.json`.
