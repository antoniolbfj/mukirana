# Rateios: filtro da modal e totais explícitos

O card de Rateios já enviava o período global para a modal. A tabela principal
aplicava esse período, mas Acertos e aprovações renderizava os metadados completos
do histórico. A falha foi reproduzida com as views/controllers reais e PostgreSQL
fictício: em setembro a tabela principal tinha os três lançamentos esperados,
enquanto a seção mostrava quatro acertos em vez de dois e sete grupos de
aprovação em vez de três.

## Filtro

A seção e seu contador agora seguem o mês global: somente o mês sem Saldo anterior;
com a checkbox marcada, histórico até o fim do mês escolhido. Usa a data da ponta
própria do acerto; quando ela ainda não existe, usa a data registrada pela outra
pessoa. Um recebimento próprio em agosto de um pagamento feito em julho aparece
em agosto para o credor. Períodos vazios mostram um estado vazio explícito.

Aprovações de conjuntos aparecem quando alguma ocorrência pertence ao recorte.
O valor e a quantidade na lista consideram somente essas ocorrências. A revisão
mantém o conjunto completo e seu aviso: a decisão abrange todas as ocorrências,
inclusive fora do período visível. A lista não transforma uma aprovação de
conjunto em decisões individuais.

A filtragem é de apresentação. Os metadados completos autorizados permanecem
internos para localizar o pagamento existente, preservar a proteção contra
recebimento duplicado e manter o saldo bilateral correto. A correção não apaga
registros nem muda os cálculos financeiros já publicados.

## Três valores em destaque

- **Total de despesas rateadas:** sua parte nas despesas pagas por outras pessoas,
  dentro do recorte global. Sua parte de uma despesa que você mesmo pagou não é
  tratada como dívida com outra pessoa.
- **Total pago:** saídas próprias de acertos ativos registradas no recorte,
  inclusive pagamentos aguardando confirmação do credor. Pagamento de fatura já
  vinculado conta uma vez; reconhecimento sem caixa não vira outro pagamento.
  Acertos recusados/cancelados ficam fora desse total, com explicação na tela.
- **Saldo devedor:** soma das posições a pagar por pessoa até o fim do mês global,
  incluindo saldo anterior, receitas compartilhadas e compensações. Identificado
  como posição, distinto dos movimentos dos dois primeiros valores. Zero indica
  Sem valor pendente.

A receber e Total recebido no período ficam separados. A composição acessível
mostra despesas pagas para outras pessoas, receitas a receber/repassar e quitações
históricas sem caixa. Estas quitações não são apresentadas como novo dinheiro
pago. Acertos ainda sem a própria saída ficam identificados separadamente.
Créditos com uma pessoa não quitam dívidas com outra automaticamente.

Computador/tablet usa três cards; smartphone usa um resumo próprio em linhas,
com os mesmos critérios e valores. Claro/Escuro/Sépia preservados. Gravações e
confirmações continuam recarregando os dados e atualizando os indicadores.

## Verificação e publicação

21 verificações de regras dos totais e 63 regressões de Rateios aprovadas. Os
seis cenários da modal passaram nas nove combinações dispositivo/tema (54 casos):
mês, histórico, mês futuro com obrigações, mês vazio e datas distintas de
pagamento/recebimento. Incluem contagem/valor por ocorrência filtrada e revisão
do conjunto inteiro. Sete bundles passaram na análise de sintaxe; layouts foram
conferidos visualmente com dados fictícios.

Somente `Lancamentos_Novo_Regras.js` e `Rateios_Novo_Client.html` mudaram no runtime.
Não há migração, consulta ou escrita financeira em produção nesta rodada.
O Supabase permanece com a migração de proteção do aceite v13. Homologação de uso
continua separada dos testes locais. Produção e avaliação publicadas na **versão60**,
com os 74 arquivos baixados da versão imutável em diretório independente e
conferidos por bytes/SHA-256 com o commit `44a8433`. Os endereços existentes foram
preservados e exigem login Google; HTTP não substitui o teste autenticado. Ver `rateios-filtro-totais-publicacao.json`,
`rateios-filtro-totais-verificacao-v60.json` e `rateios-filtro-totais-fontes-v60.json`.
