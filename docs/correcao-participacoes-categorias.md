# Participações em categorias e metas

Regra confirmada pelo usuário: cada participação é receita/despesa pessoal para
categorização e metas. A dívida a acertar é a consolidação bilateral dessas
participações e acertos. Restaurante de R$ 200 dividido 50/50 significa R$ 100 em
Alimentação para cada usuário, inclusive para quem não pagou a conta original.

A consolidação agora substitui o original rateado pela própria participação,
inclui as partes pagas/recebidas por outras pessoas e usa a categoria privada de
cada participante. Sem categoria, apresenta Aguardando Categorização. Acertos são
excluídos desta apuração de consumo, mesmo quando vinculados a lançamento existente
com categoria. O consumo permanece na data original; pagamento em outro mês não
cria novo gasto. Hierarquia e metas de receitas/despesas usam a mesma consolidação.
O detalhe por categoria apresenta os itens pessoais que explicam seu total.

Movimentos financeiros, saldos de contas, cálculo R−D±transferências da barra
principal, patrimônio, dívidas e APIs de escrita permanecem com suas regras.
Uma participação não cria movimento bancário na conta alheia. A consulta de rateios
apenas ganhou situação, classificação e tipo da origem para aplicar corretamente
o recorte de Investimento, sem expor a conta/categoria privada de outra pessoa.

Migração de leitura `20261025113552_rateios_v5_personal_categories.sql` aplicada no
Supabase wcczkultokrypdfimbsh. 31 ASSERTs remotos passaram em ROLLBACK sem persistir
testes. Hashes antes/depois idênticos: lançamentos f103f87353113e552b244a7269d613fb;
participações ed6aee0131807ecd6810e227c67076b9; acertos ee65f1fbdd4f33d1e5c4a45700df7792.

Testes locais: exemplos 50/50, receita, categoria pendente, hierarquia/metas,
pagamento parcial/recebimento e acerto em outro mês, titular sem parte, Investimento,
centavos grandes, 60 verificações de integração anteriores e navegador com os
layouts reais em computador/tablet/smartphone. Reprodução: painel-v5-participacoes.cjs,
painel-v5-integration.cjs, rateios-v5.sql e suítes v4.

A etapa seguinte de UX é visual, em commit separado, sem alterações adicionais
nos controllers, regras financeiras ou migrações.
