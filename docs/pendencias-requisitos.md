# Pendências da base atual — Mukirana

Atualizado em 24/10/2026. Base: Mukirana 1.9, importada da versão 32,
com Supabase `wcczkultokrypdfimbsh`.

## Rodada de Contas

Implementadas duas interfaces dedicadas, computadores/tablets e smartphones,
conectadas ao banco no menu provisório **Contas (nova)**. A tela atual continua
no menu **Contas**. Implementados cadastro, edição, compartilhamento, busca,
filtros, histórico paginado, inativação/restauração e Desfazer.

Saldo inicial convertido em lançamento especial com vínculo estável, valor com
sinal, data e descrição automática. Data dos saldos existentes: lançamento mais
antigo de cada conta, incluindo transferências recebidas; sem movimentos, data
de criação do cadastro em São Paulo. Operações da nova tela são atômicas,
verificam versão concorrente e permitem repetir a última operação sem duplicar.
Cálculos adaptados para data e exclusão dos totais operacionais.

Migração aplicada no Supabase e reconciliada; testes de banco, autorização,
concorrência e navegador concluídos. Detalhes em [contas-entrega.md](contas-entrega.md).
Publicada a versão 33 para avaliação, com 55 arquivos conferidos byte a byte.
Implementação e publicação não substituem a homologação do usuário.

## Pendências vigentes

1. Homologar a nova tela de Contas nas duas interfaces, com os dados reais e a sessão Google do usuário; avaliar também as previsões e os saldos nos períodos utilizados.
2. Depois da homologação explícita, substituir o acesso principal de Contas pela nova tela e retirar o menu provisório.
3. Definir e priorizar a próxima tela da versão em produção a recriar.

O backlog da implementação anterior permanece arquivado com aquela versão.
Não representa funcionalidades ausentes da base atual.
