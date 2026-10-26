# Mukirana

Base de trabalho reiniciada em 24/10/2026 a partir do sistema existente em
produção, descrito na implantação como **Mukirana 1.9**. A orientação atual é
aprimorar sua experiência de uso a partir dessa versão.

## Rodada atual

Mês global com saldo anterior opcional, rateios na própria lista, categoria pessoal
padrão e cadastro vinculado à fatura aberta. Contas e Painel abrem Lançamentos em
modal; o Painel inclui Saldo das contas e cards em uma ou duas colunas.

O Painel segue cinco linhas e o saldo devedor do rateio respeita o fim do mês
escolhido. **Ainda posso gastar** agora desconta os compromissos de rateio,
sem repetir o desconto quando o pagamento é registrado. As subcategorias
começam pelo nome para permitir a busca pelo teclado. Produção/avaliação: v54.
A disponibilidade respeita o mesmo escopo em todas as telas e inclui as previsões
de recebimento dos rateios. Saldo anterior controla mês/histórico também nos
cards e nos rateios. Transferências previstas integram as projeções de Contas.
Ver [resultado global e filtro](docs/saldo-global-entrega.md),
[disponibilidade e teclado](docs/disponivel-rateios-entrega.md),
[correção do Painel](docs/painel-periodo-entrega.md) e
[entrega anterior](docs/lancamentos-contextos-entrega.md),
[publicação vigente](docs/saldo-global-publicacao.json) e
[pendências vigentes](docs/pendencias-requisitos.md). Homologação de uso permanece
pendente; os acessos principais foram atualizados por autorização do usuário.

## Origem

- Apps Script: `1ySSYm83KZiFi_1nT-cgsPFtN8in5lvHQocl856b0XzLz303USM-c-2Fd`.
- Versão imutável importada: **32**, com 49 arquivos originais.
- Supabase confirmado pelo usuário: **`wcczkultokrypdfimbsh`**.
- API do banco: `https://wcczkultokrypdfimbsh.supabase.co`.
- [Implantação existente](https://script.google.com/macros/s/AKfycbwGr4qlPunBsone1CXhlbNhHHL_4TeqERmgFtAHrE7HbOPu6baECBQFEsyCRM18tJSz/exec), com acesso exigindo conta Google.

O código da versão 32 foi comparado com o conteúdo atual do editor Apps Script:
os 49 arquivos são idênticos. Os hashes de origem estão em
[docs/base-producao.json](docs/base-producao.json).

## Organização

Os arquivos do Apps Script ficam na raiz. `App_Main.js` contém a entrada web e o
roteamento, `Index.html` monta a interface e os arquivos `*_Controller.js`,
`*_Model.js` e `*_View.html` organizam as funcionalidades existentes.
`Global_Assets.html` e `Global_Estilos.html` concentram recursos comuns.

`Database_Service.js` seleciona a fonte de dados. `Supabase_Service.js` centraliza
o acesso server-side e `Supabase_Contexto.js` reúne consultas por RPC.
O código de migração legado foi preservado como parte da base original.

## Configuração

O `.clasp.json` aponta para o projeto acima. A aplicação existente utiliza estas
propriedades privadas do script:

- `MUKIRANA_DATA_SOURCE`: `SUPABASE` para usar o banco confirmado.
- `MUKIRANA_SUPABASE_URL`: `https://wcczkultokrypdfimbsh.supabase.co`.
- `MUKIRANA_SUPABASE_SERVICE_KEY`: chave server-side do projeto correspondente.

As credenciais existentes da produção permanecem no Apps Script. O acesso ao banco
pelo conector Supabase foi confirmado por consultas de catálogo, sem alterações
em estrutura ou registros. A credencial de ambiente ligada ao projeto anterior
não deve ser usada com este banco.

## Histórico e próximos passos

O trabalho anterior está preservado na branch
[`archive/pre-v1-reset-2026-10-24`](https://github.com/antoniolbfj/mukirana/tree/archive/pre-v1-reset-2026-10-24).
Os arquivos, testes, migrações e pendências anteriores foram retirados da base
ativa. Nenhuma alteração foi publicada no Apps Script nesta importação.

Detalhes da preparação e limites da validação estão em
[docs/reinicio.md](docs/reinicio.md). O escopo vigente está em
[docs/pendencias-requisitos.md](docs/pendencias-requisitos.md).

## Remodelagem das telas

Os acessos principais passam a ser Painel geral, Lançamentos, Contas, Cartões,
Rateios e acertos e Metas, conforme autorização mais recente do usuário para
promover as novas interfaces e retirar as antigas. As demais telas da versão 1
continuam disponíveis até suas rodadas de revisão. Não há menus provisórios
concorrentes. A homologação dos recursos novos continua separada da publicação.

[Entrega da rodada: comportamento, banco e testes](docs/rateios-painel-entrega.md).
[Registro de publicação e hashes da versão](docs/rateios-painel-publicacao.json).
[Pendências vigentes](docs/pendencias-requisitos.md).

[Produção](https://script.google.com/macros/s/AKfycbwGr4qlPunBsone1CXhlbNhHHL_4TeqERmgFtAHrE7HbOPu6baECBQFEsyCRM18tJSz/exec)
e [avaliação](https://script.google.com/macros/s/AKfycbwfdVNi6mnDWpkDUbYVAYvMj_MbfCWtbcyptd_5MlgreYnI20xp3L-CPWsz1cB6DXzS/exec)
conservam seus endereços. As interfaces antigas estão em
`docs/archive/telas-anteriores-v40`, excluídas do push ao Apps Script. O protótipo
fictício permanece somente como documento histórico.

Contas e Cartões anteriores foram homologados. A ampliação de Contas inclui
Consumo, Investimento e Crédito ligado aos cartões existentes. Lançamentos usa
R−D±transferências; direitos e obrigações de rateio integram a previsão do disponível,
com saldo efetivo identificado separadamente. Acertos são
registrados pelas próprias pessoas como despesa/receita e vinculados uma única vez.
Patrimônio usa somente contas de Investimento. Cada tela nova tem estruturas
próprias para computadores/tablets e smartphones. Claro, Escuro e Sépia estão disponíveis na barra e no menu, com preferência por usuário neste navegador.

## Correção e UX com três temas

Entrega posterior concluída: rateios históricos de **julho a outubro/2026**
conciliados com os movimentos existentes, com reconhecimento especial dos antigos,
exclusão dos novos duplicados e ajustes de quitação sem movimento bancário.
Publicada na **versão46** (registro histórico). Ver
[conciliação](docs/conciliacao-rateios-entrega.md) e
[publicação](docs/conciliacao-rateios-publicacao.json).

Publicado em produção e avaliação na **versão45**: o **Painel geral oficial** recebe indicadores
em semáforo, títulos maiores, card de saldo do rateio com navegação e evolução
patrimonial em largura inteira, com filtros por conta e visões de três meses,
semestral e anual. O gráfico usa os movimentos das contas de Investimento, com
realizado e projeção identificados. Não há migração nesta rodada.
Ver [entrega](docs/painel-oficial-entrega.md),
[publicação](docs/painel-oficial-publicacao.json) e
[pendências vigentes](docs/pendencias-requisitos.md).

[Participações nas categorias e metas](docs/correcao-participacoes-categorias.md),
[proposta visual](docs/proposta-ux-tres-temas.md),
[protótipo HTML](docs/prototipos/ux-temas.html),
[entrega de UX](docs/ux-tres-temas-entrega.md) e
[publicação e conferência](docs/ux-categorias-publicacao.json).
A correção funcional precede a etapa visual; os backends permanecem idênticos
após a correção. Temas não alteram valores, permissões ou formulários preenchidos.
