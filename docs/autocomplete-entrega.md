# Histórico como exemplo, sem favoritos

Rodada de 26/10/2026. Registro de publicação em `autocomplete-publicacao.json`.
Homologação autenticada pelo usuário permanece pendente.

Favoritos foram retirados dos formulários de Lançamentos, nos layouts de
computador/tablet e smartphone, inclusive nas modais contextuais. Não há mais
atalhos de favoritos nem a checkbox **Guardar como favorito**. Estilos, eventos
e estado de formulário associados foram removidos.

O campo **Descrição** conserva o autocompletar pelo histórico do próprio usuário,
com sugestões do mesmo tipo de lançamento. Selecionar um exemplo reaproveita
descrição, conta acessível/ativa, categoria ativa e classificação. O valor fica
em branco e recebe o foco; a nova data e situação são preservadas. O histórico
continua disponível mesmo quando o exemplo pertence a outro mês do filtro.

A fronteira autenticada ignora o campo antigo `favorite` e deixa de construir
alterações de favoritos. As respostas principal e contextual retornam uma lista
vazia de favoritos para compatibilidade com sessões antigas. Os dados e tabelas
anteriores ficam preservados e sem uso na interface; não houve migração nem
escrita no banco de produção. Os lançamentos financeiros e seus cálculos mantêm
as regras anteriores.

## Validação

- 17 verificações focadas em PostgreSQL local: flag antiga ignorada, quantidade
  de favoritos preservada, somente um lançamento financeiro, repetição idempotente,
  histórico sem valor, exemplo fora do mês selecionado, contexto e privacidade.
- 39 regressões atuais do hub aprovadas: lote, concorrência, saldos, categorias
  pessoais, aprovações e catálogo.
- Nove combinações de dispositivo/tema aprovadas. Autocompletar via Tab/Enter,
  preenchimento de metadados, valor em branco/foco, data/situação preservadas,
  ausência dos controles de favoritos e largura da interface conferidos. Também
  conferidas modais de Contas nos três dispositivos em Sépia.
- Sintaxe de sete bundles renderizados e verificação de espaços aprovadas.

O teste histórico completo `lancamentos-v3-backend.cjs` para antes do trecho de
favoritos por uma expectativa antiga de ausência da participação na lista do
convidado. A mesma falha foi reproduzida na fonte anterior v56, sem as alterações
desta rodada. A participação já é exibida por decisão posterior; essa revisão
geral do teste legado não integra a mudança. O trecho de favoritos foi atualizado
para a funcionalidade desativada. As verificações focadas e as regressões atuais
acima passaram separadamente, usando apenas dados fictícios locais.

Recarregar a página após a publicação para obter os formulários atualizados.
