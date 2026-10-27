# Exclusão autorizada de acerto duplicado e verificação do aceite

Rodada de 27/10/2026. Operação de dados autorizada pelo usuário após diagnóstico.
Produção e avaliação continuam na versão58, com fontes de runtime preservadas.

Foi excluída uma receita separada e o acerto independente ligado a ela. A saída
original na conta do pagador e seu acerto foram preservados integralmente,
inclusive identificação, data, valor, situação e versão. O pagamento original
continua aguardando confirmação do credor. Outro recebimento e um ajuste de
saldo apontados no diagnóstico foram preservados, pois constituem uma pendência
distinta.

A transação usa IDs explícitos, verifica vínculos, versões e valores antes de
excluir, confirma a quantidade de linhas removidas e compara hashes de todos os
demais lançamentos, acertos, participações, pagamentos de fatura e contas. Nenhum
outro movimento foi alterado. A consulta independente posterior confirmou a
exclusão e a preservação do original. Backup, SQL e auditorias com identidades
e valores ficam privados no workspace, fora do Git.

## Verificação da rotina

O usuário pediu conferir se aceitar um pagamento duplica o lançamento. O teste
foi feito com dados fictícios em PostgreSQL local e nas interfaces reais:

- **Registrar meu recebimento**, dentro do pagamento enviado, conserva o mesmo
  acerto e cria uma única receita do credor. O saldo de rateio não é abatido de
  novo. Despesa do pagador e receita do credor representam as duas pontas próprias.
- Repetir a mesma operação após perder a resposta é idempotente. Uma nova
  tentativa de aceitar o acerto já recebido é recusada.
- **Receber**, na ação geral, inicia um acerto independente. Foi reproduzida a
  criação de outro acerto de mesmo valor/data enquanto o envio anterior ainda
  estava pendente. Esse fluxo permite a estrutura de duplicidade observada nos
  dados; o banco não vincula automaticamente os dois registros por semelhança.

Dez verificações focadas do backend e três dispositivos aprovados no aceite pela
interface, incluindo perda de resposta/repetição no smartphone. A reprodução do
novo recebimento independente foi confirmada separadamente. A verificação não
alterou código nem introduziu bloqueios novos; a prevenção dessa situação fica
pendente de implementação. Não foi necessário novo push ou versão Apps Script.

Recarregar a página atualiza os dados em cache. Para confirmar o pagamento
preservado, abrir esse acerto e usar **Registrar meu recebimento**.
