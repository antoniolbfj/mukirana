# Refinamento para smartphones — Painel e Lançamentos

Rodada de 26/10/2026. Registro de publicação em `ux-mobile-publicacao.json`.
Homologação de uso pelo usuário permanece pendente.

No **Painel**, os três cards de meses viram um único card **Visão dos meses**,
sem carrossel. Mês anterior, selecionado/atual e próximo conservam seus valores
previstos, receitas, despesas, efeito de rateios e cores acompanhadas de texto.
O mês de referência recebe destaque. Cada mês continua clicável e a indicação
de mês isolado ou saldo anterior segue a checkbox global existente.

Em **Lançamentos**, o card passa a ter descrição completa e ações no topo,
valor/situação em uma faixa própria e dados identificados abaixo: conta/cartão,
categoria, data completa e competência quando diferente da ocorrência. Nomes
longos quebram em linhas, sem reticências ou sobreposição. Seleção, edição direta
e ações de rateio mantêm espaço próprio e alvos de toque de pelo menos 44 px.
O mesmo card é usado nas modais contextuais que já abrem a lista.

As alterações estão restritas aos templates, estilos e renderização da interface
de smartphone. Cálculos, controllers, modelos, permissões, preferências, contratos
de dados, cores dos três temas e interface de computador/tablet são preservados.
Nenhuma migração ou operação no banco de produção integra esta rodada.

## Verificação

- Nove combinações de dispositivo/tema no teste existente de escopo global,
  incluindo navegação, valores preservados e mês/histórico: aprovadas.
- Seis cenários adicionais de smartphone: 320, 390 e 430 px, três temas e
  orientação horizontal. Descrições longas, texto sem espaços, contas/categorias
  extensas, edição/cancelamento, seleção, menu de ações e expansão de rateio
  conferidos sem cortes ou transbordamento dos cards. Dados fictícios locais,
  com adaptação de textos só no navegador; nenhuma gravação.
- Painel e Lançamentos comparados antes/depois em 1180 e 820 px: capturas
  idênticas pixel a pixel, usando as mesmas respostas fictícias.
- Inspeção visual direta dos dois cards nos três temas; sintaxe de sete bundles
  renderizados e verificação de espaços aprovadas.

Os testes usam Chromium e PostgreSQL local. O acesso publicado exige conta Google;
verificar a tela de autenticação não substitui a homologação autenticada no
aparelho do usuário. Recarregar a página após a publicação para testar o novo UX.
