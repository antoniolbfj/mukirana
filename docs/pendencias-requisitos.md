# Pendências da base atual — Mukirana

Atualizado em 24/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Concluído nesta rodada

- Contas permanece homologada e principal, sem menu provisório.
- Cartões implementado no menu provisório **Cartões (novo)**, com interfaces próprias
  para computadores/tablets e smartphones. **Cartões** atual mantido.
- Cadastro, adicionais, busca/filtros, consulta por competência, navegação real para
  Fatura/Lançamentos, inativação/restauração e Desfazer conectados ao Supabase.
- Gravação atômica, versão concorrente, repetição segura, IDs/histórico preservados e
  competência histórica persistida. Resumo coerente com Fatura: registrado/pago/
  programado/previsto separados e visão parcial identificada para o adicional.
- Usuário confirmou: adicional continua registrando pagamentos com contas acessíveis.
- Migração aplicada e conferida; testes de banco, concorrência, backend e navegador
  concluídos. Detalhes em [cartoes-entrega.md](cartoes-entrega.md).

## Pendências vigentes

1. Homologar Cartões (novo) nas duas interfaces, com dados reais: cadastro/adicionais,
   fechamento, valores por competência, previsões e pagamentos como titular/adicional.
2. Depois da homologação explícita, substituir o acesso principal de Cartões pela
   nova tela e retirar seu menu provisório.
3. Escolher e remodelar as demais telas da base atual, incluindo a UX detalhada de
   Faturas/pagamentos em rodada própria. A tela de Fatura recebeu compatibilidade
   dos cálculos/rótulos, mas ainda não foi remodelada nas duas interfaces dedicadas.
4. Ao concluir a remodelagem das telas, revisar e unificar a paleta de cores do sistema.

O backlog anterior ao reinício permanece arquivado e não define o que falta nesta base.
