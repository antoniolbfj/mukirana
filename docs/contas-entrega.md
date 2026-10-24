# Entrega da nova tela de Contas

24/10/2026. Implementação autorizada pelo usuário, com menu provisório e duas
interfaces próprias. Homologada pelo usuário nesta conversa e promovida ao acesso principal Contas.

## Funcionamento

- Computadores/tablets: linhas comparativas, formulário e histórico em painel lateral.
- Smartphones: cartões, ações na base, formulário e histórico em tela inteira.
- Lista rápida independente da consulta de participantes e do cálculo de recorrências.
- Busca imediata, filtros de status, compartilhamento por nome/e-mail, mensagens de erro com rascunho preservado, inativação/restauração e Desfazer.
- Somente o proprietário altera cadastro, saldo inicial e participantes. Demais acessos mantêm as regras de consulta da base.
- Saldo atual soma os movimentos registrados até hoje (ou até o fim do período histórico). Mantém a regra existente para registros pendentes datados. Previsão inclui os registros futuros e recorrências ainda não geradas até a data mostrada.

## Banco e compatibilidade

Projeto confirmado: `wcczkultokrypdfimbsh`. Migração registrada no servidor:
`20261024163611_accounts_v2_opening_balance_ledger`.
O arquivo foi iniciado pela CLI e recebeu o identificador efetivo registrado
pelo MCP ao aplicar a mesma migração.

Um lançamento `Saldo Inicial` para cada conta com valor diferente de zero:
`Saldo Inicial da Conta [nome da conta]`, positivo ou negativo. Vínculo único
pela conta; edição e renomeação mantêm o ID do lançamento. Zerar o saldo inicial
remove somente esse lançamento. A criação manual no formulário comum é bloqueada.

A data foi definida pelo usuário: a mais antiga em `lancamentos`, tanto na origem
quanto no destino da conta. Sem movimentos, usa `created_at` em America/Sao_Paulo.
Saldos futuros entram no saldo na data informada e antes disso na previsão.
A lista global de Lançamentos identifica o registro especial e encaminha sua
edição ao cadastro de Contas. Receitas, despesas, orçamento e rateios não recebem
esse valor. Consolidados e evolução patrimonial respeitam sua data.

`contas.saldo_inicial` fica como espelho de compatibilidade com a tela e a versão
anteriores. Contextos financeiros legados excluem os lançamentos especiais,
evitando somar o espelho e o lançamento. Triggers sincronizam também as gravações
legadas. Novas gravações reúnem conta, saldo inicial e participantes na mesma
transação, com versão esperada e recibo da última operação para repetição segura.

A migração verifica hashes dos registros preexistentes dentro da transação e
aborta se contas, lançamentos comuns, faturas ou participantes forem alterados.
A conferência posterior confirmou **17 contas, 14 saldos iniciais, 1.078
lançamentos anteriores e 22 pagamentos de fatura**, sem divergências.
Não é necessário executar SQL manualmente.

## Autorização e validação

As APIs novas exigem sessão; o usuário vem da sessão, nunca do formulário.
DTOs retornam somente os campos necessários. Funções de modelo, acesso genérico
ao banco e diagnósticos foram tornadas internas no Apps Script. Nenhuma chave
foi incluída no HTML ou no Git. As RPCs são exclusivas do backend `service_role`;
foram retiradas as permissões públicas das RPCs antigas.

O advisor de segurança deixou de apresentar os avisos de execução pública das
funções privilegiadas. Restam quatro informações de
[RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy):
`contas`, `contas_compartilhamentos`, `lancamentos` e a preexistente `acertos_rateios`.
É intencional para a sessão própria do Apps Script: acesso direto dos papéis
`anon`/`authenticated` negado e acesso autorizado pelo backend. Não usar `auth.uid()`
como se esta aplicação usasse Supabase Auth.

Validações concluídas:

- Sintaxe de todos os JS e scripts HTML; contratos, sessão, isolamento do ator,
  dinheiro em centavos, datas, listas seguras e proteção do lançamento especial.
- 32 verificações SQL, localmente e no Supabase como `service_role`, em transação
  desfeita: compartilhamento, permissões, saldos, transferência nas duas pontas,
  pagamentos de fatura, paginação, edição, zero, renomeação, conflitos, repetição,
  sincronização legada e ACLs.
- Migração local em PostgreSQL 17 com saldo positivo, negativo, zero, transferência
  recebida e fallback de data; preservação dos registros anteriores.
- Concorrência real: repetição de criação, duas edições, edição/status e nomes
  concorrentes. Somente operações compatíveis são aceitas.
- Navegador Chromium com ponte Apps Script simulada: desktop, tablet e smartphone;
  busca, cadastro, saldo negativo, erro/repetição sem novo ID, participantes,
  histórico, inativação/Desfazer, rotação e descarte da tela na navegação.
- Integração visual com os estilos e estrutura existentes e cálculos de patrimônio
  antes/depois da data do saldo, sem gerar receitas/despesas.

A validação de navegador usa dados fictícios. A navegação remota autenticada
na conta Google e a homologação com dados reais devem ser feitas pelo usuário.
Não foram enviados e-mails nem executadas rotinas de relatórios.

## Publicação inicial — versão 33

Publicada a **versão 33** em uma nova [implantação de avaliação](https://script.google.com/macros/s/AKfycbxg6KevdfXzs3WucB23XtRzIg_px8HyQZxjqze8Iwtsegit6XFsjmpZUSFQv9qR7LRJ/exec).
Acesse com a conta Google e abra **Contas (nova)** no menu lateral.

O código foi enviado ao GitHub (`main`, implementação `0cb85a7`, ajuste final
`4b32934`) e os 55 arquivos foram enviados pelo clasp. A versão imutável 33 foi
baixada novamente: todos os arquivos correspondem byte a byte ao código local.
Hashes e identificadores estão em [contas-publicacao.json](contas-publicacao.json).
Na entrega inicial, a versão 32 permaneceu no endereço de produção, e a versão 33
trazia o menu provisório para avaliação. O usuário homologou a tela posteriormente;
a promoção abaixo substitui aquele estado inicial. A URL exige autenticação Google.

O compilador do Apps Script rejeitou literais BigInt na primeira tentativa de
envio. O backend passou a usar soma decimal textual exata para agregados e números
seguros para valores individuais limitados pelo schema. A implementação foi
verificada com valores acima do limite seguro de Number e o push final passou.
O navegador usa inteiros BigInt e os contratos transportam centavos como texto.

## Homologação e promoção

O usuário homologou a nova tela e determinou sua permanência como principal.
O menu **Contas** passa a renderizar as duas interfaces aprovadas; o item
**Contas (nova)** foi removido. O atalho do saldo inicial nos Lançamentos abre
**Contas**. A rota anterior continua como alias de compatibilidade para páginas
já abertas, sem menu público duplicado. Promoção publicada na **versão 34**, código `f329b73`, na
[implantação principal](https://script.google.com/macros/s/AKfycbwGr4qlPunBsone1CXhlbNhHHL_4TeqERmgFtAHrE7HbOPu6baECBQFEsyCRM18tJSz/exec).
O endereço usado para avaliar a versão 33 também foi atualizado para a versão 34,
para preservar o acesso que o usuário já utilizava. Os 55 arquivos foram baixados
da versão imutável 34 e conferidos byte a byte. [Registro da promoção](contas-promocao.json).
Não houve alteração de banco ou da paleta nesta promoção.
