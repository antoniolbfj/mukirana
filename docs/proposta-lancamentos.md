# Lançamentos — requisitos revistos e protótipo

24/10/2026. Protótipo para avaliação; não é implementação conectada.
Cartões foi homologado e promovido à produção na versão 36.

## Fonte e decisões atuais

Releitura integral de **Mukirana — Especificação de Requisitos do Produto — v0.1**,
consolidado em 19/10/2026. Os dois anexos disponíveis são idênticos, SHA-256
`92389294df293864b032096c7d7bcdaad897debe0eade20d19a6a8936640f402`.

O documento é referência de produto. Sua descrição antiga de planilhas, de
cartão como tipo de conta e seu backlog de implantação inicial não substituem a
base vigente: Apps Script, Supabase confirmado, Contas e Cartões homologados.
Nenhuma instrução operacional do anexo foi executada.

Decisões expressas posteriores incorporadas:

- Transferência é um tipo de lançamento na mesma tela.
- Parcelamentos e recorrências fazem parte dos lançamentos.
- Incluir exclusão individual, além dos três alcances coletivos de RQ-GER-06.
- Recorrência usa término exclusivo: início 15/01, três meses, mensal →
  15/01, 15/02 e 15/03; 15/04 fica fora.
- Duas interfaces dedicadas, com homologação de ambas; paleta definitiva no fim.
- Categorias reservadas não são opções de cadastro; só aparecem na consulta
  quando há registros associados. Uma categoria principal pode ser selecionada
  mesmo tendo subcategorias; um único seletor apresenta ambas.

## Requisitos traduzidos em fluxos

| Referência | Proposta demonstrada |
| --- | --- |
| RQ-LAN-01 a 06 | Receita/despesa com descrição, valor, data, origem, categoria, fixa/variável, modalidade e situação. Futuro separado da realização atual. |
| RQ-LAN-02 | Uma vez, Parcelado e Recorrente são exclusivos; dividir com pessoas é opcional e independente. |
| RQ-LAN-07 e CAT-04 | Criação rápida de conta, categoria ou subcategoria em janela contextual; conserva rascunho e seleciona o novo item. |
| RQ-GER-01 a 05, 11 | Conjunto tem vínculo lógico, não valor extra; ocorrências individuais e total derivado. Parcelamento pelo total, residual na primeira; edição individual livre. |
| RQ-GER-06 | Editar uma, desta em diante ou todas; excluir uma, desta em diante, até esta ou todas. Alcance e quantidade visíveis antes de confirmar. |
| RQ-GER-07 a 10 | Duração finita em meses, término exclusivo, sete periodicidades, geração antecipada e dia âncora preservado. Aviso de renovação na data da última ocorrência de conjunto antigo. |
| RQ-RAP-01 a 05 | Histórico pessoal e favoritos preenchem descrição/origem/categoria/classificação; valor limpo e foco nele. Modelo não gera movimentos. |
| RQ-RAT-01 a 07, 12, 13 | Igual/valor/percentual; partes positivas com soma exata. Autor recebe residual da divisão igual. Separar total desembolsado e participação econômica; conta do outro não aparece. |
| RQ-RAT-08 a 11, APR | Aprovação da própria participação/categoria, rejeição justificada e alcance coletivo. Alterar rateio renova aprovações; exclusão fica pendente e preserva o original. Estados simulados, sem tokens reais. |
| RQ-TRF-01 a 03 | Transferência no mesmo formulário, origem/destino diferentes, sem categoria/modalidade/rateio. Uma operação, sem receita/despesa adicional. |
| RQ-FIL-01 a 05 | Um período para lista e resumo da prévia, mês atual, atalhos e datas abertas; preferência somente com salvamento explícito. |
| RQ-PRN, NFR | Centavos, informação progressiva, busca imediata, ações em lote, Desfazer, foco/teclado, rascunho e interfaces próprias. |

## Computadores e tablets

Cabeçalho com Novo lançamento, período global e alternância **Minha participação /
Fluxo de caixa**. Três números principais: receitas, despesas e resultado do
recorte. Valores pendentes/futuros são informados separadamente; resultado não é
saldo acumulado de conta.

Lista comparável com data, descrição, modalidade, categoria, conta/cartão, valor
e situação. Busca imediata; Todos/Pendentes/Compartilhados; filtros adicionais
por natureza, origem, categoria com descendentes, modalidade, situação e projeto.
Seleção múltipla para efetivar/excluir operações autorizadas, com confirmação.

Cadastro e detalhe em painel lateral. O formulário inicia com o essencial;
geração, rateio e opções aparecem sob demanda. Tablet usa esta interface e
mantém os campos essenciais quando reduzido, com detalhe acessível por toque.

## Smartphones

Estrutura própria: resumo compacto, busca, chips, linha do tempo por dia e
cartões de lançamentos. Novo lançamento fixo na base, seleção explícita e ações
secundárias em painel inferior. O formulário e o detalhe ocupam a tela inteira.

A interface é escolhida ao abrir e não é trocada durante rotação; o rascunho
permanece. Compartilha regras e dados de demonstração com a interface maior.

## Regras e diferenças em relação ao código atual

O estudo considerou `Lancamentos_Controller.js`, `Lancamentos_Model.js`,
`Lancamentos_View.html`, `Recorrencias_Controller.js`, `Index.html` e os contratos
já homologados de Contas/Cartões. Esta rodada não consulta nem altera o banco.

1. A rotina atual recebe visualmente **valor de cada parcela**, calcula o total e
   gera parcelas mensais. A proposta segue RQ-GER-04: informar **valor total**,
   quantidade e periodicidade, com prévia dos valores/datas e residual na primeira.
2. O legado tem recorrências automáticas/manuais, projeções e intervalo
   personalizado. A proposta de RQ-GER-07/09 demonstra conjunto finito gerado de
   uma vez e somente as sete periodicidades. Migração/conciliação dos conjuntos
   existentes depende da etapa conectada; nada foi reclassificado nesta prévia.
3. Fixa/variável fica independente da modalidade. A categoria é única no
   formulário e não é imposta a outros participantes.
4. Pagamentos de fatura e acertos aparecem identificados como movimentos
   especiais de transferência; sua manutenção continua no domínio de origem.
   Não se duplicam compras, pagamentos ou transferências nos resultados.
5. A compra no cartão mantém a competência da fatura e o modelo homologado de
   titular/adicionais. Na prévia, o período de compras considera essa competência;
   a linha mostra a data da compra e o detalhe explica a fatura correspondente.
   Na integração, preservar também o contexto recebido da tela de Faturas.
6. O documento antigo RQ-CON-04/05 previa saldo inicial dentro de receitas/despesas
   e exclusão direta. A base Contas homologada implementa **Saldo Inicial** especial,
   fora do resultado operacional e mantido em Contas. A prévia preserva essa
   regra atual e o vínculo da conta; não altera silenciosamente o módulo aprovado.
   Caso se queira retomar literalmente aqueles itens, revisar a decisão antes
   de conectar os novos indicadores e ações do saldo inicial.
7. Minha participação mostra a parte econômica do usuário, inclusive em rateios
   com aprovação pendente. Fluxo de caixa mostra receitas/despesas efetivadas nas
   contas do autor, sem considerar compras no cartão como saída bancária imediata.
   Transferências, saldo inicial e acertos não viram resultado operacional.
   Esse resumo não pretende substituir o extrato/saldo de uma conta.

## O que é real nesta entrega

- HTML/CSS/JavaScript executável e independente de bibliotecas externas.
- Dois templates distintos e regras locais de datas/centavos/geração/rateio.
- Cadastro, edição, exclusão e Desfazer alteram **somente a memória da prévia**.
- O menu provisório abre um frame isolado, sem origem compartilhada, token de
  sessão, ponte de Apps Script ou chamadas financeiras reais. Apenas o acesso
  ao menu exige a sessão normal do aplicativo.
- O formulário de período substitui visualmente o filtro externo enquanto a
  demonstração está aberta; ao sair, o filtro real reaparece, preservado.
- No HTML independente, preferência de período usa armazenamento local com
  prefixo exclusivo. No frame isolado, o texto informa que é demonstrativa.
- Busca, filtros e resumos trabalham com o mesmo recorte. Não há consulta de
  finanças de outros integrantes ou diretório público.
- Navegação lateral do arquivo independente é ilustrativa; o menu do aplicativo
  continua sendo a navegação real. Rotas de origem de movimentos especiais são
  explicadas no detalhe sem misturar registros fictícios com os dados reais.

Não foram implementados backend de Lançamentos novo, migrações, notificações
persistentes, tokens de aprovação, convite/e-mail, pagamentos reais ou garantias
de concorrência. As prévias de aprovação usam estados em memória e não substituem
a autorização que a etapa conectada deve aplicar no servidor.

Os limites de 240 parcelas, 120 meses e até 200 linhas na tabela de prévia são
proteções da demonstração; não constituem novos requisitos de produto.

## Roteiro de avaliação

1. Compare Minha participação e Fluxo de caixa; abra o rateio recebido do almoço.
2. Aprove com sua categoria ou solicite correção com justificativa. A decisão de
   outro participante não é dada automaticamente pelo usuário atual.
3. Em Novo lançamento, use histórico ou favorito e confira o valor vazio/focado.
4. Cadastre conta/subcategoria pelo botão +; confira os campos preservados.
5. Experimente R$ 100,00 em três parcelas, com início em 31/01: R$ 33,34, R$ 33,33,
   R$ 33,33 em 31/01, 28/02 e 31/03. Divida entre três pessoas e ajuste uma parte.
6. Recorrente, início 15/01, três meses, mensal: três ocorrências até 15/03;
   15/04 é o término exclusivo. Experimente as outras periodicidades.
7. Abra uma ocorrência e teste os alcances de edição/exclusão e Desfazer.
8. Confira origem/destino na transferência e a identificação dos movimentos
   especiais. Troque período, busque e use filtros e seleção múltipla.
9. O conjunto fictício Assinatura de música termina hoje e oferece renovação com
   revisão de duração; não altera nem renova automaticamente o histórico.
10. Repita em celular/tablet, inclusive girando o aparelho com formulário aberto.

Código independente: [lancamentos.html](prototipos/lancamentos.html).
O mesmo conteúdo é publicado por `Lancamentos_Prototipo_Demo.html` no menu
**Lançamentos (protótipo)**, mantendo Lançamentos atual até homologação posterior.

Verificação reproduzível: `python tests/lancamentos-prototipo-browser.py`.
Publicação e limites da conferência remota serão registrados em
`docs/lancamentos-prototipo-publicacao.json`.
