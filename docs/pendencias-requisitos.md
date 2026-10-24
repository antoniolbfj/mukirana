# Pendências da base atual — Mukirana

Atualizado em 24/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Estado atual

- Contas permanece homologada e principal, sem menu provisório.
- Cartões **homologado** e promovido ao acesso principal na **produção, versão 36**.
  Menu provisório retirado; interfaces próprias para computadores/tablets e smartphones.
- Cadastro, adicionais, busca/filtros, consulta por competência, navegação real para
  Fatura/Lançamentos, inativação/restauração e Desfazer conectados ao Supabase.
- Gravação atômica, versão concorrente, repetição segura, IDs/histórico preservados e
  competência histórica persistida. Resumo coerente com Fatura: registrado/pago/
  programado/previsto separados e visão parcial identificada para o adicional.
- Usuário confirmou: adicional continua registrando pagamentos com contas acessíveis.
- Migração aplicada e conferida; testes de banco, concorrência, backend e navegador
  concluídos. Detalhes em [cartoes-entrega.md](cartoes-entrega.md).
- Requisitos de Lançamentos revistos no documento v0.1 e conciliados com as decisões
  posteriores e a base homologada. Protótipo HTML/CSS/JavaScript com dados fictícios
  e duas interfaces na **avaliação, versão 37**, menu **Lançamentos (protótipo)**.
  Ver [proposta-lancamentos.md](proposta-lancamentos.md).

## Pendências vigentes

1. Avaliar e aprovar o protótipo de Lançamentos em computador/tablet e smartphone,
   incluindo fluxo único, geração, rateios, alcances coletivos e resumo financeiro.
2. Após aprovação, implementar Lançamentos conectado no menu provisório: adaptar
   os contratos existentes e completar diferenças de modalidade, geração finita,
   histórico/favoritos, cadastro contextual, aprovações e filtro global. Validar
   migração dos conjuntos atuais e regras de acesso/centavos/concorrência antes de
   substituir a tela em produção. O protótipo desta rodada não conclui esses requisitos.
3. Homologar a implementação conectada nas duas interfaces; só então promovê-la a
   principal e retirar o menu provisório de Lançamentos.
4. Escolher e remodelar as demais telas da base atual, incluindo Faturas/pagamentos
   em rodada própria. Compatibilidade de cálculos não equivale à remodelagem completa.
5. Ao concluir a remodelagem das telas, revisar e unificar a paleta de cores do sistema.

O backlog anterior ao reinício permanece arquivado; os requisitos de Lançamentos
foram retomados por pedido expresso nesta rodada, sem declarar ausentes os demais
módulos que já existem na base de produção. Diferenças do saldo inicial e das
recorrências antigas estão identificadas na proposta.
