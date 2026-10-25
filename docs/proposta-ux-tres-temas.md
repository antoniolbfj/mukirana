# Proposta de UX — claro, escuro e sépia

Autorização: corrigir primeiro a consolidação dos rateios; depois criar proposta,
protótipo e implementar a modernização visual, preservando outras regras do código.
A correção funcional está no commit 86ff85e. Nesta etapa não alterar controllers,
modelos, autenticação, cálculos, permissões, contratos RPC nem tabelas.

## Direção visual

Um sistema visual comum para Painel, Lançamentos, Rateios, Metas, Contas, Cartões e
moldura das telas legadas. Fundos tranquilos, superfícies com bordas leves, números
alinhados, títulos claros, campos compactos em telas maiores e áreas de toque de
44 px no smartphone. Hierarquia: período e Ainda posso gastar sempre na barra;
conteúdo principal; ações contextuais. Detalhes continuam sob demanda.

| Tema | Fundo / superfície | Texto | Destaque |
| --- | --- | --- | --- |
| Claro | cinza muito claro / branco | grafite | verde petróleo |
| Escuro | carvão azulado / ardósia | branco suave | verde menta |
| Sépia | papel bege / marfim | castanho escuro | oliva |

Sinais de receita/despesa, avisos e erros têm cores semânticas próprias em cada
paleta e sempre mantêm texto/sinal. Seletores, formulários, tabelas, modais e
estados de foco usam os mesmos tokens; não aplicar filtros de inversão a imagens.

## Navegação e dispositivos

- Computadores amplos: navegação lateral estável, grupos discretos, item atual
  identificado, conteúdo com largura confortável e formulários em painel lateral.
- Tablets: navegação recolhível, layouts grandes compactos, sem tabelas comprimidas.
- Smartphones: conservar templates dedicados, navegação em gaveta e formulários em
  tela inteira/folha inferior. Tema acompanha rotação sem remontar formulários ou
  perder rascunhos, filtros e seleções. Considerar área segura e teclado virtual.
- Seletor de tema acessível na barra global e no menu, com três opções nomeadas;
  teclado e foco visível. Preferência visual por usuário neste navegador, aplicada
  ao recarregar e navegar, inclusive nos iframes isolados. Não mudar o cadastro de
  usuários nem o enum de temas do banco. O perfil legado continua com sua preferência
  existente; a escolha visual do navegador prevalece quando definida.

## Protótipo e implementação

`docs/prototipos/ux-temas.html` demonstra a moldura, painel e lançamentos, com
navegação, detalhes e seletor dos três temas. Dados fictícios explicitamente
identificados; não conectado ao banco. Usa os mesmos estilos e o mesmo cliente
de tema da implementação, para evitar divergência entre proposta e produto.

A aplicação usa estilos compartilhados e um cliente apenas visual. Iframes
recebem somente o nome validado do tema; credenciais e sessão permanecem no
contêiner. Mudar tema não chama RPC, não consulta o banco e não recarrega dados.
Não mudar a regra dos rascunhos nem introduzir uma nova opção de saída.

Validação: três temas em computador/tablet/smartphone, contraste de texto, foco e
teclado, navegação/reload, sincronização dos iframes, rotação com formulário aberto,
valores financeiros iguais antes/depois e nenhuma alteração de backend após a
correção. Publicação e homologação são estados separados.

## Refinamento do protótipo do painel — 25/10/2026

Solicitação posterior: indicadores em semáforo, evolução patrimonial filtrável em
largura inteira, card de saldo do rateio com navegação e títulos mais destacados.
O [protótipo interativo](prototipos/ux-temas.html) demonstra esses ajustes.
Posteriormente o usuário autorizou implementá-los e tornar o painel oficial;
ver [entrega conectada](painel-oficial-entrega.md) e o registro
`painel-oficial-publicacao.json`. A v44 descreve a rodada anterior.

- **Semáforo contextual:** resultado positivo/zerado/negativo e evolução
  crescente/estável/decrescente usam verde/amarelo/vermelho. Nas metas de despesa,
  a proposta é verde abaixo de 80% do teto, amarelo entre 80% e 100% inclusive e
  vermelho acima de 100%. Valores e estados escritos acompanham a cor. Os limites
  são visuais e não bloqueiam lançamentos. Despesas/valores a pagar têm sinal
  negativo ou rótulo; não tratar um gasto isolado como meta ultrapassada.
- **Evolução patrimonial:** seção própria com toda a largura útil do painel;
  considera somente contas de Investimento, com filtro Todas/Reserva/Objetivos
  no exemplo. Padrão: mês anterior, mês de referência e próximo. Semestral mostra
  janeiro–junho ou julho–dezembro, conforme o mês de referência; Anual mostra
  janeiro–dezembro do ano selecionado. O mês final do período global é a referência
  quando houver um intervalo. Trocar a visão/conta do gráfico não muda o período
  global nem os outros indicadores.
- **Leitura do gráfico:** realizado em linha contínua, projeção em tracejado;
  mês atual identificado como posição até a data de demonstração (25/10/2026).
  Meses anteriores são posições de fechamento e futuros são projeções fictícias.
  Botões mensais selecionáveis por toque/teclado e tabela com todos os valores.
  A diferença compara o último com o primeiro mês visível; inclui aportes e
  resgates, sem representar rentabilidade. Não há promessa de rendimento.
- **Saldo do rateio:** card inteiro clicável abre Rateios e acertos. No exemplo,
  R$ 200 a receber e R$ 100 a pagar geram saldo líquido de R$ 100 a receber.
  Obrigações entre pessoas diferentes continuam separadas; o saldo é acumulado,
  independente do período global, e não aumenta o saldo disponível para gastar.
- **Hierarquia:** títulos de cards com peso e tamanho maiores; computador/tablet
  têm grade própria e smartphone destaca o mês atual acima dos dois meses vizinhos.
  Gráfico ocupa toda a largura disponível em ambos os layouts. Claro/Escuro/Sépia
  mantidos, sem alteração dos estilos compartilhados do aplicativo.

Escopo da fase de prototipação: somente HTML e documentação, com dados fictícios.
Nenhuma chamada ao banco ou alteração de regra, controller, migração ou implantação.
A demonstração de consumo/metas/rateios conserva os exemplos de outubro enquanto
os filtros do patrimônio permitem explorar meses/anos e contas demonstrativas.
Validação em navegador: nove combinações de tema/dispositivo, filtros 3/6/12 meses,
virada de ano, semestres, contraste dos três sinais, largura, teclado e navegação.
