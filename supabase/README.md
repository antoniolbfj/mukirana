# Banco de dados do Mukirana

Projeto Supabase: `thpqielkntwcbdycucfn`.

O diretório `migrations` contém a cópia da migração efetivamente registrada no
banco pelo MCP do Supabase, preservando versão, nome e instruções do histórico.

## Categorias e subcategorias

`mukirana_private.categories` usa uma única tabela de oito campos e uma relação
com ela mesma. `user_id` referencia `mukirana_private.users`, pois o Mukirana
possui autenticação própria por código de e-mail.

- IDs, proprietário, criação e chave de sistema são estáveis.
- Nomes são normalizados e únicos por usuário e profundidade calculada da árvore.
- A reorganização revalida também o nível dos descendentes e impede ciclos.
- A FK composta impede categoria superior de outro usuário e exclusões em cascata.
- A tabela suporta níveis adicionais; a interface e as RPCs atuais apresentam dois níveis.
- Alterações de uma mesma hierarquia são serializadas pela linha do proprietário,
  sem alterar seus valores cadastrais. Snapshots incompatíveis devem ser repetidos
  pelo chamador em caso de erro de serialização.
- Versão e timestamps são mantidos pelo banco.
- Registros de sistema são protegidos contra alterações e exclusão comuns.

RLS está habilitado e o acesso direto de PUBLIC, anon, authenticated e service_role
foi revogado, conforme o padrão das tabelas privadas existentes. Não há políticas
baseadas em auth.uid(), que não representa as sessões próprias do Mukirana.
O aviso informativo `rls_enabled_no_policy` do advisor é esperado nesse modelo de
negação de acesso direto.

A interface homologada está integrada à mesma sessão do aplicativo. Os dados de
categorias não são gravados no localStorage. As RPCs de consulta, gravação e exclusão
revalidam sessão/propriedade na transação e só podem ser chamadas por service_role.
A View recebe DTOs sem proprietário, timestamps internos ou credenciais.

As alterações usam versão esperada, ID estável e repetição idempotente quando a
resposta de uma gravação se perde. A trava do proprietário precede as travas de
categorias. Nomes reservados não podem ser usados no cadastro manual.

### Exclusão instalada e validada

A instalação manual da função `public.mukirana_categories_delete(text, uuid, integer)`
foi confirmada em 2026-10-23. O script original foi mantido em
`pending/enable_categories_delete.sql`, com o status atualizado. Essa instalação
foi feita pelo SQL Editor e não foi registrada como migração pelo MCP.

A consulta autenticada informa `deletionAvailable: true`. A interface da versão 3
libera Excluir ao atualizar a lista, sem necessidade de outro push ou implantação.
A função revalida sessão, proprietário e versão esperada; protege classificações
reservadas e categorias com subcategorias. O contrato para futuros vínculos com
lançamentos continua descrito abaixo.

Passaram 20 asserções reais de exclusão, disponibilidade, permissões, propriedade,
versão, dependências e sessões inválidas, revogadas ou expiradas. Todos os dados
de teste foram revertidos. O teste pode ser repetido com
`checks/categories_delete.sql`. A RPC também foi consultada pela API REST,
confirmando HTTP 200 e recusa de sessão ausente. A página publicada retornou HTTP
200 e contém a interface de exclusão. Não houve alterações no código publicado.

## Lançamentos únicos e saldos

`mukirana_private.transactions` possui FKs compostas de proprietário/conta e
proprietário/categoria com ON DELETE RESTRICT. O helper `category_link_count`
consulta vínculos reais. Contas com movimentações não podem ser excluídas;
categorias utilizadas também são protegidas. Os saldos atuais são derivados.

Os saldos iniciais estão integrados atomicamente ao ledger. A categoria automática
“Saldo inicial” (`opening_balance`) aparece somente quando usada e não pode ser
escolhida manualmente. Detalhes de datas, projeções, migração e concorrência estão
em `../docs/lancamentos-unicos.md`. As RPCs de Contas estão na revisão 2; a chamada
legada de gravação também passa pelo mesmo núcleo transacional.

As migrações de ledger, integração e projeção estão no histórico registrado.
`checks/single_transactions.sql` passou em 48 asserções reais com rollback de
fixtures; saldos iniciais existentes foram conferidos sem inconsistências.

Verificação: 22 cenários da tabela e 30 asserções das RPCs de consulta/gravação
passaram em subtransações revertidas, sem usuários ou categorias de teste restantes.
Também passaram 9 grupos de contratos/controller e 15 fluxos da interface em
desktop/mobile com ponte assíncrona simulada (incluindo o fluxo de exclusão).
O bloqueio de exclusão por dependência foi conferido no catálogo da FK. A auditoria
de segurança não apontou WARN/ERROR; o aviso informativo de RLS acima é esperado.
As verificações adicionais de exclusão estão documentadas na seção acima.

## Transferências entre contas próprias

A instalação manual de `pending/enable_own_account_transfers.sql` foi confirmada
em 24/10/2026. O arquivo permanece como registro aplicado e não deve ser executado
novamente. A instalação foi feita pelo SQL Editor após falhas técnicas do conector;
não há entrada correspondente no histórico de migrações MCP.

`transfers` representa uma operação única com origem/destino. A view privada
`account_movements`, com `security_invoker=true`, deriva duas pontas opostas e
reúne os lançamentos anteriores para calcular saldos atuais/projetados.
Transferências não entram em receitas, despesas ou categorias. Contas vinculadas
não podem ser excluídas. As RPCs estão na revisão 1, restritas a `service_role`.

Passaram 60 verificações de transferências e 48 de lançamentos no Supabase, todas
com rollback das fixtures e zero usuários de teste restantes. As quatro RPCs foram
conferidas também pela API REST. Os advisors não apontaram WARN/ERROR. Regras e
resultados completos estão em `../docs/transferencias.md`.
