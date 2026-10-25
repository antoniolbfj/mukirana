# Lançamentos como tela central — proposta de refinamento

25/10/2026. Base conferida: produção/avaliação v47, commit de fontes `863243f`.
Proposta aprovada pelo usuário. Implementação e implantação autorizadas na rodada atual.
Decisão posterior: Projetos deixa de existir como funcionalidade; categorias e subcategorias
organizam os assuntos. Preservar referências históricas, sem conversão automática.

## Decisões do usuário

- Mostrar contas de Patrimônio no filtro. Na classificação vigente, correspondem
  às contas de Investimento; não é necessário renomear o tipo persistido.
- O seletor de contas contém todas as contas cadastradas às quais a pessoa tem
  acesso: Consumo, Crédito e Investimento, inclusive inativas identificadas e contas
  sem movimentos no período. Não expor contas privadas de terceiros.
- O valor em destaque corresponde ao período global e à combinação de filtros
  ativos. A resposta do usuário substitui a sugestão de destacar saldo acumulado:
  calcular Receitas − Despesas + transferências recebidas − transferências enviadas
  do recorte selecionado. Uma seleção de conta limita o mesmo cálculo àquela conta.
- Incluir ou alterar um movimento recalcula lista e valor no próprio contexto,
  preservando filtros. Nenhum saldo paralelo é gravado.
- Oferecer operações em lote, incluindo categorização.
- Permitir edição no próprio lançamento e ordenação pelos cabeçalhos da tabela.
- Manter interfaces dedicadas para computador/tablet e smartphone, com os três temas.

## Diagnóstico da implementação vigente

`Saldo_Global_Client.html` exclui linhas de Investimento por padrão; a preferência
atual depende da caixa “Incluir Investimento no resultado”. Mesmo com a preferência
ativa, `renderFilters` em `Lancamentos_Novo_Client.html` monta contas por facetas
dos movimentos, em vez de usar o cadastro completo. Uma conta sem movimento no
recorte desaparece do seletor.

A mesma tela normaliza filtros removendo combinações sem resultados. Para atender
à nova decisão, a conta selecionada precisa permanecer mesmo quando a lista está
vazia; os demais campos continuam oferecendo escolhas coerentes com o contexto.
Escolher uma conta vazia não deve automaticamente selecionar outra conta.

O valor global já segue filtros, mas depende do conjunto restrito de linhas acima.
A recarga compartilhada após gravações existe e deve ser preservada, incluindo a
correção da Fatura na v47. O lote atual permite efetivar/excluir. A ordenação é fixa
por data, e a edição abre exclusivamente o painel. Categorização em lote exige
tratar tanto os lançamentos próprios quanto as categorias pessoais dos rateios,
preservando permissões e os fluxos existentes de aprovação.

## Proposta dos seis ajustes

1. **Todas as contas no filtro:** agrupamento por Consumo, Crédito e Investimento/
   Patrimônio; busca por nome, indicação de inativa e manutenção de contas vazias.
   A lista completa é uma exceção expressa à regra anterior das facetas dependentes.
   Uma conta inativa pode ser consultada, mas só contas permitidas recebem novos
   lançamentos. Retirar a necessidade de habilitar Investimento para consultá-lo.
2. **Saldo do filtro sempre visível:** destacar o valor na barra global e explicitar
   conta/escopo e período. Ao tocar no valor, ver receitas, despesas e entradas/saídas
   de transferência que o compõem. Busca e filtros continuam aplicando uma fórmula
   única; não confundir esse resultado com o saldo atual acumulado da tela de Contas.
3. **Atualização no próprio contexto:** após salvar, editar ou executar lote,
   atualizar movimentos e valor sem mudar filtros ou período. Se o lançamento
   deixar de corresponder ao filtro, comunicar que foi salvo e saiu daquele recorte.
4. **Lote com categorização:** seleção por lançamento e de todo o recorte, contador
   de operações e prévia do alcance. Categorias/subcategorias válidas para a natureza
   selecionada; naturezas incompatíveis recebem explicação antes da aplicação.
   Transferências, saldos iniciais e acertos mantêm suas classificações especiais.
   Categoria pessoal de rateio altera somente a própria parte. Duplicidade visual
   das duas pontas de transferência não multiplica a operação. Preservar versões,
   permissões e gravação consistente, sem aplicação parcial silenciosa.
5. **Edição direta:** no computador/tablet, ativar a célula de descrição, data,
   valor, categoria, conta ou situação com clique/toque e indicação de edição.
   Enter salva, Esc cancela; erro conserva o preenchimento e informa o motivo.
   No smartphone, expandir o próprio cartão com os campos rápidos e Salvar/Cancelar.
   Painel completo continua disponível para recorrências, parcelas, rateios e
   detalhes especiais. Alterações de conjunto mostram alcance antes de gravar;
   alterações financeiras de rateios respeitam as aprovações existentes.
6. **Ordenação:** cabeçalhos de data, descrição, categoria, conta, valor e situação
   alternam crescente/decrescente com indicação visual e `aria-sort`. Valor ordena
   numericamente por centavos com sinal; data usa a ocorrência. Smartphone oferece
   “Ordenar por” com os mesmos critérios, sem depender de uma tabela reduzida.

## Complementos sugeridos para avaliação

- **Visões salvas por usuário:** guardar explicitamente filtros/ordenação, com
  atalhos como A categorizar, Pendentes e uma conta favorita. Não salvar alterações
  automaticamente nem substituir a preferência mensal global.
- **Barra de seleção fixa:** manter quantidade selecionada e ações acessíveis
  durante a rolagem; incluir categorização e fixa/variável. Projetos foi retirado da proposta por decisão posterior.
- **Navegação por teclado:** Tab entre células, Enter para confirmar e atalho de
  busca, com foco preservado após salvar. Smartphones mantêm controles por toque.
- **Contexto do lançamento:** ações rápidas para abrir fatura, conjunto de parcelas
  ou rateio relacionado, preservando o período e o retorno à lista.

Esses complementos são propostas, não funcionalidades já entregues nesta rodada.

## Critérios de avaliação

Conferir conta de Investimento e conta sem movimentos no seletor, conta inativa
consultável, privacidade de terceiros, resultado zero no recorte vazio, manutenção
da conta selecionada, soma dos dois lados da transferência e valores após salvar.
Testar edição concorrente, erro de gravação, categorização individual/em lote e
rateios com categoria privada. Validar ordenação de valores negativos e positivos,
datas, acentos e empates estáveis, além de teclado e toque nos três temas e nas
duas interfaces. Não usar dados financeiros reais para gerar movimentos de teste.
