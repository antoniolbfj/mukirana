# Conciliação autorizada e identificação dos valores de Contas

Rodada de 26/10/2026. Publicação em `contas-saldos-publicacao.json`;
homologação de uso permanece pendente.

## Conciliação de dados

O usuário informou o saldo real de uma conta e solicitou sua regularização.
A conferência separou o resultado histórico filtrado do saldo efetivo até hoje.
A diferença foi calculada sobre o saldo efetivo, preservando o recorte escolhido.

Foi cadastrado um único crédito de conciliação na data corrente, pela RPC de
Lançamentos já existente, usando a categoria global **Ajustes de entrada**.
O lançamento é identificado como conciliação, sem atribuição a salário ou a um
recebimento específico que não tenha sido informado. Não houve alteração do saldo
inicial nem de movimentos anteriores para forçar um resultado histórico.

A operação confere titularidade, saldo anterior e valor de referência, mantém
identificação fixa para evitar duplicidade e verifica o saldo efetivo após gravar.
Hashes de lançamentos anteriores, pagamentos, rateios, acertos e contas foram
comparados na transação. Os registros anteriores permaneceram inalterados.
Uma nova leitura confirmou o valor conciliado, um único crédito e a preservação
do resultado histórico selecionado. Identidades, valores e SQL ficam na auditoria
privada do workspace, fora do Git.

## Identificação na interface

A mesma linha exibia o resultado do filtro em destaque e o saldo efetivo menor,
com uma frase que misturava as duas referências. Depois de esclarecer o significado,
o usuário determinou inverter a apresentação em **Contas**:

- **Em destaque: Saldo acumulado em [data]**, somente os registros efetivados até
  a data indicada, independente do mês consultado.
- **Menor: Movimento de [mês/ano]**, quando Saldo anterior estiver desmarcado.
- **Menor: Acumulado até [data final]**, quando a checkbox estiver marcada.

O resumo de Consumo e os valores de Investimento/Crédito da tela de Contas seguem
essa ordem. Os layouts de computador/tablet e smartphone recebem a apresentação.
Essa preferência específica de Contas substitui o destaque anterior do resultado
do filtro. O disponível global, o resultado do período e os cálculos das demais
telas preservam suas regras. Estilos e os três temas permanecem idênticos à v54.

## Verificação

Conferidas a conciliação e a quantidade do novo lançamento na base vigente;
resultados de mês/histórico consultados separadamente do saldo efetivo.
Nos testes fictícios, 19 verificações de escopo/projeções e os três dispositivos
em Sépia confirmam destaque do acumulado, mês/acumulado menor, data do saldo efetivo, independência
entre os valores e navegação com o filtro global. Sintaxe renderizada e espaços
conferidos. O client de Contas e os dois templates de layout mudam entre as 74 fontes publicadas.
Não houve migração ou criação de categorias. A sessão aberta deve ser recarregada
para atualizar os dados e a interface.
