# Mukirana

Base de trabalho reiniciada em 24/10/2026 a partir do sistema existente em
produção, descrito na implantação como **Mukirana 1.9**. A orientação atual é
aprimorar sua experiência de uso a partir dessa versão.

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

Contas possui duas interfaces próprias (computadores/tablets e smartphones), foi
homologada e passou a ser o acesso principal **Contas**, sem menu provisório.
O saldo inicial é um lançamento especial; a migração foi aplicada no Supabase.
[Entrega de Contas](docs/contas-entrega.md).

Cartões foi homologado e promovido ao acesso principal **Cartões**, com duas
interfaces dedicadas e dados reais. O menu provisório foi removido.
[Entrega e testes](docs/cartoes-entrega.md) e [registro da promoção](docs/cartoes-promocao.json).
A paleta global será revista após a remodelagem das telas.

[Produção com Contas e Cartões homologados — versão 36](https://script.google.com/macros/s/AKfycbwGr4qlPunBsone1CXhlbNhHHL_4TeqERmgFtAHrE7HbOPu6baECBQFEsyCRM18tJSz/exec).
O endereço antigo de avaliação de Contas permanece na versão 34 e não é a produção.

[Avaliar Lançamentos — menu Lançamentos (novo)](https://script.google.com/macros/s/AKfycbwfdVNi6mnDWpkDUbYVAYvMj_MbfCWtbcyptd_5MlgreYnI20xp3L-CPWsz1cB6DXzS/exec).
Implementação conectada, com interfaces dedicadas, período/saldo globais e fórmula
única R−D±transferências. A tela principal atual permanece até homologação.
[Entrega e verificação](docs/lancamentos-entrega.md). O protótipo independente
permanece como histórico em `docs/prototipos/lancamentos.html`.

Contas ampliada para avaliação no menu **Contas (tipos)**: Consumo, Investimento e
Crédito ligado aos cartões existentes, saldos atuais/projetados e patrimônio
separados. [Requisitos e testes](docs/contas-tipos-entrega.md). A tela principal
homologada permanece até a aprovação da atualização.

[Proposta do novo Painel geral](docs/proposta-dashboard.md), com os contratos
financeiros desta base e prévias próprias para computador/tablet e smartphone.
O Dashboard principal será substituído após a avaliação e implementação conectada.
