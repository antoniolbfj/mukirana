# Painel: composição e saldo do rateio pelo período

Rodada de 25/10/2026, a partir da v50. Publicação em
`painel-periodo-publicacao.json`; homologação de uso permanece pendente.

## Composição autorizada

1. Mês anterior, mês selecionado/atual e próximo mês na primeira linha.
2. Dois cards: **Saldo × Contas · Consumo** e **Patrimônio**. Cada um mostra
   suas contas; o acumulado patrimonial permanece no gráfico. O card separado
   “Patrimônio atual” e o total geral duplicado foram retirados.
3. **Saldo dos Cartões** e **Saldo × Rateio**.
4. **Gastos × Categorias** e **Metas × Período**.
5. **Evolução patrimonial**, com toda a largura e os filtros preservados.

Computador/tablet mantêm três cards mensais e duas colunas nas linhas seguintes.
Smartphone conserva os meses na mesma faixa com navegação horizontal e mês
selecionado centralizado; os demais cards seguem a ordem, em coluna própria.
Claro/Escuro/Sépia e a barra global são preservados.

## Correção financeira

O card anterior lia o saldo bilateral de todo o histórico, incluindo lançamentos
futuros. O leitor do Painel também busca meses adicionais para o gráfico; usar o
saldo desse pacote para um card mensal ignorava o filtro global. Os pagamentos
existentes estavam sendo abatidos no banco; não era necessário quitá-los novamente.

A RPC de leitura `rpc_painel_rateios_periodo_v10` aplica o intervalo global à regra
bilateral existente. Considera as participações em despesas, inverte o sinal das
receitas rateadas e inclui acertos ativos, inclusive ajustes históricos sem caixa.
Uma despesa de pagamento e a receita correspondente pertencem ao mesmo acerto e
não abatem a obrigação duas vezes. Acertos rejeitados/cancelados não reduzem a dívida.

O saldo devedor é a posição até o fim do mês escolhido, incluindo os acertos
anteriores e pagamentos antecipados. A checkbox define quais lançamentos a modal
mostra: apenas o mês ou todo o histórico até ele. O movimento do recorte permanece
separado da posição de dívida; não se atribui o pagamento a despesas específicas.
Meses posteriores ficam fora do saldo exibido. A modal de rateios aberta pelo Painel recebe o mesmo resumo; os limites
operacionais do backend para registrar acertos agregados permanecem preservados.

A verificação de leitura na base vigente confirmou junho a outubro/2026 zerados
nos dois modos e novembro conciliado com as participações e acertos existentes.
Valores pessoais e identificação das contrapartes não são publicados neste registro.

Não houve criação, exclusão ou atualização de lançamentos, rateios, pagamentos,
contas ou acertos de produção. A migração compara hashes dessas cinco tabelas na
mesma transação, sob SHARE lock. A RPC é SECURITY INVOKER, search_path vazio,
EXECUTE apenas para service_role e identidade derivada da sessão na API do app.

## Verificação

- 47 verificações com PostgreSQL fictício: despesas/receitas, fechamento quitado,
  posição versus movimento do mês/histórico, futuro excluído e pagamento antecipado, duas pontas de um acerto,
  pagamento parcial, rejeição, Painel/modal consistentes, permissões e leitura
  sem gravação de movimentos.
- 63 regressões de Rateios e regressões de patrimônio, participação por categoria,
  projeções, posições de Contas e limites exatos do semáforo.
- Nove combinações computador/tablet/smartphone × Claro/Escuro/Sépia. Conferidos
  ordem e alinhamento das linhas, ausência do card removido, gráfico em largura
  inteira na última linha, mudança mensal/acumulada do saldo e modal sem sair
  do Painel.
- Consulta no banco real em seis meses, em ambos os modos; nenhum registro de
  teste criado em produção. Advisors sem novos avisos/erros de segurança.
