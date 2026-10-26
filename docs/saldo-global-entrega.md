# Resultado global, previsão de rateios e filtro mensal

Rodada de 26/10/2026, a partir da v53. Publicação em
`saldo-global-publicacao.json`. A homologação de uso permanece pendente.

## Regra vigente

O resultado financeiro destacado usa o mesmo período e escopo em todas as telas.
Sem **Saldo anterior**, considera apenas o mês escolhido. Com a opção marcada,
considera o histórico até o fim desse mês. Os cards anterior/selecionado/próximo
aplicam essa mesma escolha ao mês indicado em cada card.

Essa decisão substitui a regra anterior que sempre transportava a posição de
rateios até o mês, mesmo com a checkbox desmarcada. A RPC existente continua
oferecendo posição e movimento separadamente; a interface escolhe o valor
correspondente ao filtro, sem regravar dívidas ou alocar pagamentos por despesa.

O usuário também determinou incluir **receitas previstas de rateios** no
disponível. Essa decisão substitui a regra anterior de não antecipar recebíveis.
O resultado previsto é Receitas − Despesas ± Transferências, acrescido do efeito
dos direitos/obrigações de rateio no mesmo recorte. Pagamentos e recebimentos
substituem as previsões, sem contabilizar o acerto duas vezes.

O detalhe do valor global identifica a previsão e permite conferir seus
componentes. Os saldos efetivos das contas permanecem identificados separadamente;
não são criados recebimentos bancários fictícios.

## Correções

1. O cabeçalho de Lançamentos incluía Investimento automaticamente, enquanto o
   Painel usava Consumo e Crédito. A disponibilidade agora usa a mesma preferência
   global nas duas telas. A lista mantém todas as contas e as duas pontas das
   transferências; um filtro específico continua exibindo Resultado do recorte.
2. Transferências previstas perdiam a marca de projeção ao gerar suas duas
   pontas. Por isso, Contas e os indicadores por conta do Painel não recebiam
   seus deltas. A marca é preservada, sem materializar novas transações.
3. Os três cards mensais e a disponibilidade escolhem movimento do período ou
   posição acumulada conforme Saldo anterior. Acertos ainda sem lançamento
   próprio usam a diferença entre início/fim do período, evitando carregar uma
   pendência antiga em cada novo mês.
4. Direitos do credor entram na previsão. A despesa original continua integral
   no caixa; as parcelas a receber compensam a parte dos outros participantes.
   O participante devedor considera sua obrigação com sinal negativo.
5. Datas diferentes de pagamento/recebimento são conciliadas com a data bilateral
   do acerto. Parcial, duas pontas e virada de mês não geram receita/despesa em
   duplicidade. Ajustes históricos sem caixa conservam seu tratamento.
6. Os indicadores de Consumo, Investimento e Cartões no Painel e os valores
   principais de Contas usam o período global, incluindo previsões. Contas
   identifica o saldo efetivo de hoje como informação separada. O gráfico
   patrimonial continua identificado como evolução acumulada.
7. O card de Rateio e a lista/modal identificam movimento mensal ou acumulado,
   conforme a checkbox. Os limites operacionais de pagamento continuam sendo
   validados pelo backend sobre a dívida real; movimento não cria uma dívida.

## Validação

- Consultas de leitura na base vigente reproduziram a divergência e confirmaram
  os recebíveis omitidos e a diferença entre movimento/posição do credor.
  Identidades, registros e valores pessoais ficam fora deste relatório.
- Cenário fictício com aporte recorrente de Consumo para Investimento: cabeçalho
  igual ao navegar entre Lançamentos, Painel e Contas; ambas as pontas consultáveis,
  projeção por conta conciliada e opção de incluir Investimento consistente.
- Mês/histórico, credor/devedor, meses sem novas despesas, parcial, duas pontas,
  recebimento sem pagamento próprio registrado e acerto em meses diferentes.
- Regressões de Rateios, posições de Contas, categorias/metas, patrimônio e
  semáforo; interfaces próprias para computador/tablet e smartphone e três temas.

Contagens e verificações da versão publicada estão no registro de publicação.
Nenhuma migração, alteração de credenciais ou escrita financeira foi necessária
no Supabase de produção. Os testes de gravação usaram PostgreSQL fictício local.
