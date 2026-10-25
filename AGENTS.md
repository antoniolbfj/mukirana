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
- Contas e Cartões remodelados foram homologados pelo usuário e são os acessos principais; os menus provisórios desses módulos foram retirados. A rota CartoesNovo continua como alias.
- Revisar a paleta global somente depois de remodelar todas as telas, conforme orientação do usuário. Até lá, preservar a identidade visual disponível e concentrar as rodadas em estrutura, componentes e fluxos.

- No módulo de Cartões, o usuário confirmou que adicionais continuam podendo registrar pagamentos com contas acessíveis; a consulta continua restrita aos movimentos autorizados.
- Competência das compras registradas é persistida: alterar fechamento não reclassifica histórico; mudanças explícitas de data/origem recalculam a compra afetada.

- Após homologação explícita de Cartões, a produção foi promovida à versão 36, conferida byte a byte com o commit 4659a9b. A versão 35 era somente de avaliação; seus registros permanecem históricos. Ver docs/cartoes-promocao.json.
- Lançamentos conectado está no menu provisório LancamentosNovo para homologação. Manter o Lançamentos principal atual na produção versão 36 até aprovação explícita. Ver docs/lancamentos-entrega.md e docs/lancamentos-publicacao.json.
- Saldo “Ainda posso gastar” e período pertencem à barra global, visível nas telas. Filtros temporais são somente mensais, com preferência explícita e atalhos relativos; datas de lançamentos continuam diárias. A decisão mais recente substitui a separação participação/fluxo: uma fórmula Receitas − Despesas + transferências recebidas − transferências enviadas, aplicada aos filtros selecionados. Uma transferência persiste uma vez e gera duas projeções. Filtros dependentes não permitem combinações sem movimentos.
- Ao sair do formulário, oferecer somente “Sair” (descartar) ou “Sair e salvar rascunho”. Não guardar rascunho automaticamente. Retomada e preferência mensal são isoladas por usuário no navegador.
- Painel lateral em telas maiores usa campos compactos em colunas; smartphone conserva formulário próprio em tela inteira.
- Próxima rodada autorizada: completar Contas conforme CON-01 a CON-11 e SAL-01 a SAL-05, preservando a base homologada. O usuário confirmou vínculo de contas Cartão de Crédito aos cartões já existentes; não criar cadastros financeiros duplicados. Dashboard será uma rodada posterior.

- Contas foi ampliada no menu provisório ContasTipos: três tipos, crédito ligado a grupos existentes, atual/projetado/período distintos, patrimônio só Investimento, exclusão protegida e saldo inicial nos indicadores novos. Ver docs/contas-tipos-entrega.md. O tipo aplica-se retroativamente; não inferir investimento pelo nome de contas antigas.
- Decisão de cálculo atual: inicial especial integra receitas/despesas no novo resumo; sua exclusão individual em Lançamentos zera a conta sem apagá-la. A data de ocorrência rege o resultado; competência persistida continua específica da fatura. Pagamentos usam um único registro existente, projetado como transferência.
- Depois desta entrega, o usuário pediu revisão e proposta de Dashboard enxuto: Consumo+Crédito no operacional, Investimento no patrimônio. Preservar fórmula única, período global, privacidade e interfaces próprias; não substituir o painel antes da avaliação da proposta.

- Avaliação vigente: versão 40, 75 arquivos idênticos ao commit 9eb26ae; produção permanece 36. Ver docs/contas-tipos-publicacao.json. A proposta do Dashboard está em docs/proposta-dashboard.md e docs/prototipos/painel.html (dados fictícios, sem backend); ainda não foi implementada como painel conectado.
