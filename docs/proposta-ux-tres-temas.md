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
