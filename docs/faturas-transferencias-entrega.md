# Atualização dos pagamentos de fatura em Lançamentos

O pagamento registrado em Faturas já é persistido uma única vez em
`pagamentos_faturas` e retornado como transferência especial `invoice-payment`.
A saída pertence à conta que pagou e a entrada à conta vinculada ao cartão.
Não criar uma segunda despesa nem copiar o pagamento para `lancamentos`.

## Causa e correção

A tela de Faturas atualizava seu próprio conteúdo após criar, editar ou excluir
um pagamento, mas mantinha o pacote antigo do store global. Ao navegar para
Lançamentos no mesmo período/sessão, a lista reutilizava aquele cache. A consulta
direta ao banco já continha os pagamentos reportados, com origem e destino válidos.

Os dois handlers de sucesso em `Faturas_Cartao_View.html` agora invalidam e
recarregam o store compartilhado. Um handler atende criação/edição; o outro,
exclusão. A invalidação ocorre antes da navegação e a recarga também atualiza a
barra global. Eventual erro na consulta não transforma um pagamento salvo em
falha de gravação: a consulta seguinte pode tentar novamente, sem recriar o
pagamento. As permissões e a persistência financeira continuam nos contratos
existentes. O comentário do modelo foi corrigido para documentar essa regra.

## Validação e publicação

`tests/faturas-transferencias-browser.py` percorre as views reais de Faturas e
Lançamentos com o store real e PostgreSQL 17 local. O gateway exclusivo de teste
executa os controllers/modelo existentes, adaptando apenas o transporte para o
banco fictício. Verifica criação, edição, mudança de situação, exclusão, os dois
sinais da transferência, soma zero conjunta e resultado por conta em computador,
tablet e smartphone, com cache previamente carregado e sem reload da página.

Para reproduzir a falha anterior, `MUKIRANA_TEST_BASELINE=1` retira somente a
correção do HTML renderizado, sem alterar os arquivos de produção.

```bash
MUKIRANA_TEST_DB=rateios_v4_browser python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_browser python tests/faturas-transferencias-browser.py
MUKIRANA_TEST_DB=rateios_v4_accounts python tests/rateios-v4-upgrade.py
MUKIRANA_TEST_DB=rateios_v4_accounts node tests/contas-tipos-backend.cjs
```

Não há migração nem escrita em dados financeiros de produção nesta rodada.
Os pagamentos existentes são preservados. A publicação e a conferência dos
arquivos imutáveis serão registradas em `faturas-transferencias-publicacao.json`.
Homologação de uso permanece com o usuário.
