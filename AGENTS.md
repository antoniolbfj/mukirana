# Convenções do trabalho no Mukirana

- A base vigente é o sistema em produção Mukirana 1.9, importado da versão 32 do projeto Apps Script `1ySSYm83KZiFi_1nT-cgsPFtN8in5lvHQocl856b0XzLz303USM-c-2Fd`.
- O banco vigente é o projeto Supabase `wcczkultokrypdfimbsh`, confirmado pelo usuário. Identifique o projeto antes de qualquer operação remota.
- A orientação atual é aprimorar a experiência da versão existente. O escopo e as prioridades devem ser definidos a partir dessa base e dos pedidos atuais do usuário.
- É obrigatório construir duas interfaces dedicadas: uma para computadores/tablets e outra para smartphones, com estruturas, navegação e interações próprias. Compartilhar regras, serviços, dados e identidade visual; avaliar e homologar ambas. A escolha da interface não muda permissões nem regras financeiras.
- O desenvolvimento anterior está preservado em `archive/pre-v1-reset-2026-10-24`. Seu backlog não representa o estado funcional nem as prioridades desta base.
- Ao finalizar cada rodada, atualizar `docs/pendencias-requisitos.md` e reescrever na resposta as pendências vigentes, incluindo itens parcialmente atendidos.
- Distinguir implementação, publicação e homologação. Identificar a implantação de teste e a de produção antes de publicar.
- Recriar cada tela com uma rota e um menu provisórios para avaliação. Manter a tela atual como acesso principal até a homologação explícita do usuário; só então substituí-la pela nova e remover o menu provisório.
- Credenciais permanecem nas propriedades privadas do Apps Script ou no ambiente configurado. Não copiar chaves para arquivos versionados nem para HTML.
- Contas remodelada foi homologada pelo usuário e passa a ser a tela principal; Cartões está implementado no menu provisório Cartões (novo) e aguarda homologação.
- Revisar a paleta global somente depois de remodelar todas as telas, conforme orientação do usuário. Até lá, preservar a identidade visual disponível e concentrar as rodadas em estrutura, componentes e fluxos.

- No módulo de Cartões, o usuário confirmou que adicionais continuam podendo registrar pagamentos com contas acessíveis; a consulta continua restrita aos movimentos autorizados.
- Competência das compras registradas é persistida: alterar fechamento não reclassifica histórico; mudanças explícitas de data/origem recalculam a compra afetada.
