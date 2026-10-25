# Contas: tipos e integração com Cartões

Atualização para avaliação no menu provisório **Contas (tipos)**, rota
`ContasTipos`. Contas e Cartões homologados continuam como acessos principais.
Há templates próprios para computador/tablet e smartphone, preservados na rotação.
A paleta global não foi revista.

## Requisitos atendidos

| Requisitos | Comportamento |
| --- | --- |
| CON-01/02/03 | Consumo, Investimento e Cartão de Crédito; proprietário único e saldo inicial especial opcional. Compartilhamentos existentes de contas bancárias foram preservados. |
| Decisão atual de Crédito | Uma conta vinculada por grupo de Cartões existente. Compras continuam com os mesmos cartões e pagamentos continuam com os mesmos IDs; nenhum movimento foi copiado. |
| CON-04/05 | Na interface nova e no resumo global, inicial positivo conta como receita e negativo como despesa. Alterar pelo cadastro; excluir o especial em Lançamentos zera o cadastro, preservando a conta. |
| CON-06 | Conta com movimentações, mesmo zerada ou só com inicial/transferência, não é excluível; oferecer renomear. Conta vazia pode ser excluída; vínculos com recorrências/acertos também são protegidos. Excluir crédito vazio remove seus instrumentos vazios, com aviso. |
| CON-07/08 | Nome e classificação podem mudar com histórico; novo tipo exige confirmação e vale retroativamente. O vínculo de faturamento é preservado. |
| CON-09/SAL-02 | Atual deriva somente de movimentos efetivados até hoje, independentemente do período escolhido. Nenhum saldo acumulado paralelo é gravado. |
| CON-10 | Pagamento de fatura em Lançamentos é transferência de Consumo para Crédito, com mês da fatura. Um registro em pagamentos_faturas, saída e entrada projetadas; sem uma segunda despesa. |
| CON-11/SAL-04/05 | Investimento separado de disponível em Consumo; patrimônio atual próprio e movimento líquido do período. Aportes/resgates como transferências e rendimentos como receitas, sem catálogo de produtos. |
| SAL-01/03 | Resultado datado no período, atual acumulado e projeção acumulada até o fim são distintos. Pendentes e recorrências previstas entram na projeção. |

Consumo e Investimento podem ser cadastrados diretamente. Para Crédito, o formulário
reutiliza o cartão já existente, conforme decisão do usuário. Não cria crédito
independente ou funde dois históricos bancários. Contas vinculadas podem ser
reclassificadas entre os três tipos mantendo seu grupo; contas bancárias isoladas
alternam Consumo/Investimento. Essa restrição evita duplicar o cadastro de crédito.
As contas bancárias antigas receberam Consumo como padrão; classificar explicitamente
as que são investimentos, sem dedução automática pelo nome.

## Coerência financeira e privacidade

- Uma conta ligada ao grupo agrega compras dos cartões físicos e os pagamentos já
  existentes. O adicional continua consultando somente seus lançamentos em Cartões;
  não recebe o saldo privado do titular em Contas.
- O adicional mantém pagamento com conta acessível de Consumo. Categoria/nome dos
  cartões físicos e competência histórica permanecem nos registros originais.
- O recorte de Lançamentos usa data de ocorrência, inclusive nas compras de cartão.
  A competência permanece a referência específica da fatura. Não reclassifica o histórico.
- Um inicial negativo de crédito entra na dívida da competência de sua data; o
  inicial positivo representa crédito. Resumo da fatura identifica esse valor.
- Pagamentos respeitam o aberto da fatura, inclusive em concorrência entre atores.
  Uma redução posterior de compra pode gerar crédito, preservando o comportamento
  do módulo homologado. Pagamento ligado a acerto mantém sua proteção.
- Faturas usa somente contas de Consumo como origem, impedindo pagar a conta de
  crédito com ela própria. Inativação/restauração da conta vinculada acompanha o grupo.

## Verificação e limites

Migração `contas_v3_types_linked_credit`: uma ligação por grupo, colunas aditivas,
RPCs service_role, RLS sem acesso direto do navegador e operações com recibo de
repetição. A migração compara hashes de todas as contas antigas, lançamentos e
pagamentos e aborta se alguma informação anterior mudar.

Testados: instalação vazia e upgrade sobre base local populada; autorização,
centavos, três tipos, aviso retroativo, saldo atual/projetado/período, crédito
inicial na fatura, transferência de pagamento, exclusão vazia/protegida, perda de
resposta, aprovações e rollback. Concorrência contra exclusão e dois pagamentos
competindo pela mesma fatura. Navegadores de computador, tablet e smartphone,
rotação e navegação com barra global; regressões de Lançamentos, Contas e Cartões.
29 ASSERTs próprios e os testes transacionais anteriores são revertidos com ROLLBACK.
Não houve criação de finanças reais para testar nem login remoto como usuário final.

O Dashboard principal ainda usa o cálculo e a apresentação antigos. Sua substituição
será proposta em seguida; os números do painel antigo não representam a nova
separação de Consumo/Crédito/Investimento. Publicação registrada em
`contas-tipos-publicacao.json`; homologação ainda pendente.

## Conferência remota

Aplicada em `wcczkultokrypdfimbsh`, versão de migração **20261025013311**.
17 contas anteriores preservadas; 7 vínculos de Crédito acrescentados (24 contas).
Mantidos os 1.092 lançamentos e 22 pagamentos, com hashes idênticos nas colunas
anteriores à migração. Os 29 ASSERTs passaram no Supabase dentro de ROLLBACK.
Advisor sem WARN: apenas INFO esperado de
[RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
nas tabelas com acesso exclusivo pelo servidor (13 anteriores e 1 nova).
