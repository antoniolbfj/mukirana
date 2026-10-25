# Painel oficial — semáforo, patrimônio e rateios

Autorização de 25/10/2026: implementar o protótipo refinado e tornar o painel
oficial. O acesso existente **Painel geral**, que também abre após o login,
recebe esta atualização. Mantidos o endereço de produção e os demais módulos.

**Publicado em produção e avaliação na versão45**, com 72 fontes idênticas ao
commit `29d680a`, conferidas por clonagem da versão imutável. Somente os três
arquivos de runtime do Painel diferem da v44. Publicação autorizada e concluída;
homologação de uso ainda pendente.

## Comportamento

- Títulos maiores e mais destacados, três temas e estruturas próprias para
  computador/tablet e smartphone. No smartphone, o mês de referência fica acima
  dos dois meses vizinhos. Os atalhos mensais continuam alterando o período global.
- Resultados e posições usam semáforo com estado escrito. Despesa: verde abaixo
  de 80% do teto, amarelo de 80% a 100%, vermelho acima do teto. Receita: verde
  quando atinge o mínimo, amarelo de 80% até menos de 100%, vermelho abaixo de 80%.
  Limites verificados com centavos exatos. Sem meta, nenhum alerta de meta é criado.
  Comprometimento usa a despesa fixa contra a receita fixa e só recebe cor quando
  há classificação suficiente e receita fixa; preservadas as mensagens anteriores.
- Disponível em Consumo, saldo dos cartões e patrimônio atual permanecem com
  detalhes e acesso às contas. Crédito negativo continua representando dívida;
  sua ausência de saldo positivo não se confunde com limite disponível.
- **Saldo do rateio** é um card inteiro clicável, inclusive por teclado, que abre
  a tela existente de Rateios e acertos. Mostra líquido, total a pagar/receber,
  aprovações e acertos a conferir. É acumulado, independente do período. A dívida
  com uma pessoa não é quitada pelo crédito com outra. Não aumenta Ainda posso gastar.
- **Evolução patrimonial** ocupa uma seção com toda a largura útil do painel.
  Padrão: mês anterior, mês de referência e próximo. Semestral: janeiro–junho ou
  julho–dezembro. Anual: janeiro–dezembro. Referência é o mês final global, ou o
  mês corrente quando não houver final. Filtro Todas/conta mostra somente contas
  próprias classificadas como Investimento, incluindo inativas com seu histórico.
  Nenhuma conta desse tipo: explicar a ausência e oferecer acesso a Contas.
- O gráfico conserva filtros durante a interação sem novas consultas nem alterar
  o período global ou o saldo operacional. Meses selecionáveis por toque/teclado
  e tabela acessível. Preferência de tema continua local por usuário/navegador.

## Patrimônio e projeções

Histórico mensal: saldo acumulado de movimentos **efetivados** até o fechamento.
Mês corrente: efetivados até hoje. Futuro: movimentos registrados, pendentes e
previsões de recorrências existentes até o final do mês. Não gerar lançamentos
para desenhar o gráfico, nem presumir rendimentos ou uma taxa de crescimento.
Valores futuros aparecem em tracejado e com rótulo Projetado.

Saldo inicial entra uma vez como movimento. Transferências são consideradas
pela ponta da conta de investimento: uma transferência entre investimentos do
mesmo usuário se anula no total, mas permanece no filtro de cada conta. Aportes,
resgates, rendimentos e custos registrados afetam o saldo. Variação patrimonial
não equivale à rentabilidade. A diferença ao lado do valor compara o último com
o primeiro mês visível e pode incluir projeções.

As somas e os valores exibidos usam centavos exatos; apenas as coordenadas do SVG
e os rótulos compactos dos eixos usam aproximação visual. A série é construída
no controller autenticado, pela identidade da sessão, sem incluir carteiras de
outros titulares, mesmo quando há acesso compartilhado a uma conta.

## Escopo técnico e validação

Sem migração ou escrita no banco de produção. Reutilizados os contratos RPC e
projeções já existentes; alteração de apresentação e leitura/consolidação do
Painel. Lançamentos, acertos, permissões, autenticação e temas conservam seus
fluxos. Não reintroduzir a separação participação/fluxo de caixa: o resultado
continua R−D±transferências; categorias/metas continuam pelas participações pessoais,
com acertos excluídos do consumo para evitar duplicidade.

Verificações reproduzíveis:

1. `node tests/painel-v6-patrimonio.cjs`: datas, centavos, estados e séries.
2. `MUKIRANA_TEST_DB=rateios_v4_browser python tests/rateios-v4-upgrade.py` prepara
   exclusivamente o PostgreSQL fictício local; recria somente esse banco de teste.
3. `MUKIRANA_TEST_DB=rateios_v4_browser node tests/painel-v5-integration.cjs` valida
   a correção anterior de participações.
4. `MUKIRANA_TEST_DB=rateios_v4_browser node tests/painel-v6-integration.cjs` cria
   contas fictícias e concilia a série com os saldos de Contas. Confere privacidade,
   sessão, transferências, recorrências sem gravação e contas inativas.
5. `MUKIRANA_TEST_DB=rateios_v4_browser python tests/painel-v6-browser.py` verifica
   as interfaces reais nos três temas e dispositivos, filtros sem RPC, navegação,
   período/saldo, contraste, teclado, detalhes, largura e rotação.
6. Regressões `painel-v4-regras.cjs`, `painel-v5-participacoes.cjs`,
   `contas-v2-backend.cjs`, `rateios-v4-backend.cjs` e sintaxe/whitespace.

Os testes de navegador usam os controllers reais com PostgreSQL fictício. A
homologação com dados e conta Google reais continua sendo uma etapa de uso.
Versão, commit, implantações e conferência das fontes estão registrados em
`painel-oficial-publicacao.json` e `painel-oficial-fontes-v45.json`.

As nove combinações de dispositivo/tema passaram, com conferência visual adicional
do App diretamente em navegador. A captura da moldura com iframe opaco apresenta
falhas intermitentes de pintura no Chromium headless; os controles e valores
foram conferidos no iframe, e as imagens complementares usam o App real com o
mesmo backend fictício. O teste de teclado mantém Enter pressionado até concluir
a navegação, soltando-o na tela de destino, para evitar a corrida da automação
ao remover o iframe durante o evento. Nenhuma adaptação de produto foi feita
somente para esses testes.
