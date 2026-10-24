# Reinício a partir da versão em produção

Data: 24/10/2026.

## Decisão

O usuário decidiu reiniciar o trabalho a partir da primeira geração do sistema
em produção e concentrar os próximos ajustes na experiência de uso. Informou o
novo projeto Apps Script e confirmou o Supabase `wcczkultokrypdfimbsh`.

## Preservação e importação

- O commit anterior `3d8259f9bf53d61d23a811cd70eb417e43bd64b4` foi preservado na branch remota `archive/pre-v1-reset-2026-10-24`.
- Foi criada também uma cópia local de recuperação por Git bundle, fora do repositório ativo.
- A versão 32 do novo projeto, descrita como “Mukirana 1.9 - escopo pessoal nos cards financeiros”, foi baixada separadamente.
- Os 49 arquivos da versão imutável coincidem com o conteúdo atual do editor.
- A base ativa foi substituída por esses arquivos, sem alterações funcionais no código importado.
- A configuração clasp foi vinculada ao novo projeto e a documentação foi refeita para esta base.

O histórico Git foi preservado para recuperação; o conteúdo antigo foi retirado
da branch principal. O antigo levantamento e seus status não descrevem as
funcionalidades desta versão e precisam ser reavaliados quando forem relevantes
para uma solicitação atual.

## Banco confirmado

A conexão pelo conector Supabase permitiu consultar o catálogo do projeto
`wcczkultokrypdfimbsh`. Há 17 tabelas públicas, incluindo usuários, contas,
categorias, lançamentos, rateios, cartões, faturas, projetos, orçamentos e
recorrências. Foram encontradas as quatro RPCs utilizadas por
`Supabase_Contexto.js`:

- `rpc_contexto_financeiro_mukirana`.
- `rpc_cadastros_mukirana`.
- `rpc_fatura_cartao_mukirana`.
- `rpc_recorrencias_mukirana`.

Não foram executadas migrações, sincronizações ou alterações de dados. As
propriedades e credenciais da produção não foram alteradas nem copiadas para o
Git. O acesso confirmado aqui é pelo conector, sem uso da credencial de ambiente
associada ao projeto anterior.

## Validação e limites

Os 49 arquivos importados foram conferidos por SHA-256 com a versão 32. Passou a
verificação de sintaxe dos 33 arquivos JavaScript do backend e dos 14 blocos de
scripts internos das páginas HTML, sem executar as funções. A configuração clasp
seleciona somente os 49 arquivos da aplicação; a documentação fica fora do push.
A verificação dos arquivos não encontrou credenciais incorporadas ao código.

O manifesto usa V8 e fuso `America/Sao_Paulo`. A publicação web existente exige login Google;
a requisição sem sessão foi direcionada à autenticação. Esse resultado não
substitui uma verificação funcional autenticada.

Uma tentativa de executar somente `obterStatusBancoMukirana` pela Execution API
foi recusada por permissão/configuração de execução. Não foram criadas novas
implantações nem alteradas permissões para contornar essa limitação. Leitura de
código pelo clasp e consultas de catálogo pelo conector funcionaram.

Esta rodada prepara a base. Os testes e a homologação das mudanças de UX serão
definidos conforme os fluxos que forem efetivamente alterados.
