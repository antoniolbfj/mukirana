# Rateios: quitação vinculada e saldo do filtro

A regra vigente é receitas menos despesas **do rateio pessoal**. A parte devida
por outra pessoa gera um crédito; a própria parte devida gera um débito. O acerto
registrado abate esse saldo uma vez. Uma saída bancária e a confirmação da receita
continuam vinculadas ao mesmo acerto, sem repetir a quitação.

Exemplo fictício: uma pessoa deve R$ 100 e paga R$ 60. Seu saldo passa de −R$ 100
para −R$ 40; o direito do credor passa de R$ 100 para R$ 40. Com o complemento de
R$ 40, os dois saldos zeram. O aceite posterior não altera esse resultado.
Receitas compartilhadas invertem a obrigação. A parte própria já paga por quem
custeou a despesa não se transforma em outra dívida.

O card do Painel, a lista e a modal usam a mesma composição. Os créditos incluem
partes a receber e pagamentos destinados a quitar a própria dívida; os débitos
incluem partes devidas e recebimentos que quitam direitos. A composição identifica
pagamentos, recebimentos e quitações históricas sem caixa. Confirmações pendentes
continuam acessíveis, separadas do saldo.

Sem **Saldo anterior**, contam somente as partes e acertos do mês selecionado.
Com a opção marcada, conta o histórico até o fim desse mês. As datas persistidas
regem o recorte. Um pagamento antecipado pode gerar crédito no mês do devedor e
saldo negativo no recorte do credor antes da obrigação futura; a apresentação não
muda datas nem redistribui o pagamento por despesa.

Lançamentos especiais de acerto e transferências de fatura vinculadas também
aparecem no filtro **Rateados**. As duas pontas financeiras mantêm suas regras e
proteções. Os acertos continuam agregados por pessoa, sem alocação despesa a
despesa, sem nova conta bancária e sem lançamento financeiro duplicado.

A migração v15 acrescenta somente leitura: composição ao resumo autenticado
existente e identificação da fatura já vinculada ao acerto. Mantém SECURITY
INVOKER, search_path vazio e acesso exclusivo de service_role. As tabelas
financeiras são bloqueadas brevemente e comparadas integralmente por hash na
mesma transação; nenhum dado financeiro é alterado. Auditorias reais ficam fora
do Git.

Validação: integração com PostgreSQL fictício, quitação parcial/total/complementar,
aceite no mesmo acerto em outro mês, replay, vínculo a lançamento existente,
receita compartilhada, mês/histórico, filtros, permissões e centavos exatos;
regressões de Rateios e navegação real em computador/tablet/smartphone nos três
temas. A publicação e a verificação imutável constam do registro próprio.
Homologação autenticada pelo usuário permanece separada.
