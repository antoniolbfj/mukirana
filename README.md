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

Cartões foi implementado no menu provisório **Cartões (novo)**, com duas interfaces
dedicadas e dados reais. O acesso **Cartões** atual permanece até a homologação.
[Entrega e testes de Cartões](docs/cartoes-entrega.md). A paleta global será revista após a
remodelagem das telas.

[Produção com Contas homologada — versão 34](https://script.google.com/macros/s/AKfycbwGr4qlPunBsone1CXhlbNhHHL_4TeqERmgFtAHrE7HbOPu6baECBQFEsyCRM18tJSz/exec).
O endereço usado anteriormente para avaliar a nova tela também abre a versão 34.
