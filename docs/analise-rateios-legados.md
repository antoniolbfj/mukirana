# Análise dos pagamentos e recebimentos manuais de rateio

> Esta é a análise anterior à correção. Posteriormente, o usuário autorizou a
> quitação de julho a outubro e a exclusão dos três novos duplicados, já
> concluídas. Ver [entrega da conciliação](conciliacao-rateios-entrega.md).

Rodada de 25/10/2026, posterior à publicação do Painel oficial v45. Pedido do
usuário: localizar os lançamentos manuais anteriores às aprovações e aos acertos
especiais, para preparar a atualização sem duplicar pagamentos/recebimentos.

Análise exclusivamente de leitura no projeto confirmado `wcczkultokrypdfimbsh`,
com consultas em transações `READ ONLY`. Nenhuma alteração de dados, esquema,
aplicação ou implantação. Contagens e hashes das três tabelas financeiras
conferidos no início e no final, sem mudanças.

## Resultado e encaminhamento

- Base observada: 1.095 lançamentos, 942 participações, quatro acertos efetivados
  e nenhuma solicitação de aprovação. Os registros diferem do retrato histórico
  da v41 porque foram criadas três receitas especiais e concluídos acertos depois.
- Onze movimentos históricos relevantes para a conciliação: três despesas e oito
  receitas. As três despesas e uma receita já têm vínculo; sete receitas antigas
  não têm vínculo de acerto. Um par histórico está conciliado em ambas as pontas.
- Três receitas especiais recentes precisam ser confrontadas com esses registros.
  Há evidência forte de sobreposição em um caso, e dois casos exigem conciliar
  valores diferentes. Outros recebimentos têm forte correspondência com rateios
  de uma segunda pessoa, incluindo uma diferença de centavos não quitada.
- As 258 referências antigas a participações continuam resolvidas. Aprovação
  ausente no legado não deve ser inventada nem confundida com pagamento pendente.
- O método cruza texto, categoria, titular financeiro, natureza, valor, datas e
  vínculo existente. Coincidências isoladas de valor/data, palavras semelhantes,
  gastos efetivamente rateados e pagamentos futuros não viram acertos por inferência.
- A correção futura deve reaproveitar os movimentos históricos e abater cada
  evento uma vez. Receitas recentes confirmadas como repetidas precisam de
  tratamento explícito, preservando a trilha da correção. O fluxo atual protege
  acertos concluídos e exige valores idênticos ao reutilizar lançamentos;
  diferenças não podem ser corrigidas apenas trocando IDs ou alterando valores
  históricos para forçar a conciliação.

O relatório detalhado com valores, contas, IDs, evidências e casos não conclusivos
fica no diretório local `/workspace/work/analise-rateios-legados/`:

- `relatorio.md`: análise e proposta de conciliação por evento.
- `mapa-conciliacao.csv`: 14 movimentos identificados, sendo 11 históricos e três
  receitas recentes sob análise.
- `evidencias.json`, `verificacao-final.json` e `resumo.json`: evidências e
  verificação de preservação.

Os dados financeiros individuais não foram copiados para arquivos versionados.
O relatório prepara a decisão sobre os vínculos e divergências; a atualização dos
registros não foi solicitada nem executada nesta etapa.
