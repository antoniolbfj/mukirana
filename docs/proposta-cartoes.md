# Proposta de remodelagem de Cartões

24/10/2026. Implementação homologada pelo usuário e promovida ao acesso principal
na produção, versão 36. Menu provisório removido. Registro em [cartoes-promocao.json](cartoes-promocao.json).
Detalhes em [cartoes-entrega.md](cartoes-entrega.md).
Base técnica: [estudo de código e banco](estudo-cartoes.md).
Contas foi homologada e promovida ao acesso principal nesta rodada.
A paleta global será revista **depois de remodelar todas as telas**, conforme o usuário.

## Ideia principal

Uma tela chamada **Cartões**, com uma linha ou bloco por fatura compartilhada.
O usuário identifica o cartão pelo nome que cadastrou, consulta os valores e abre
a fatura. Titular e adicionais ficam dentro desse contexto. Usar “grupo” apenas
onde ajudar a explicar o vínculo, sem obrigar a pessoa a entender a estrutura do banco.

[Prévia interativa](prototipos/cartoes.html) com interfaces dedicadas e dados fictícios.
Também é possível avaliar pelas imagens:
[computadores](prototipos/cartoes-desktop.png),
[tablet](prototipos/cartoes-tablet.png),
[smartphone](prototipos/cartoes-smartphone.png),
[cadastro em telas maiores](prototipos/cartoes-desktop-cadastro.png) e
[cadastro no celular](prototipos/cartoes-smartphone-cadastro.png).

O protótipo demonstra navegação e componentes; não consulta o Supabase nem salva
no Apps Script. As cores apenas reaproveitam a apresentação disponível.

## Computadores e tablets

- Cabeçalho compacto com **Cartões** e **Novo cartão**; período obtido da barra global.
- Resumo do recorte e seu escopo, sem somar limites/valores do mesmo grupo várias vezes.
- Busca imediata por nome e filtros de status (Ativos/Todos/Inativos) e papel
  (Todos/Sou titular/Sou adicional).
- Linhas com nome, papel, fechamento/vencimento, valor principal, indicação de
  previsão e ação **Ver fatura**. Menu secundário para editar/inativar/restaurar,
  conforme permissão.
- Expansão **Cartões vinculados** para titular/adicionais, status e atalho de
  lançamentos do cartão escolhido. Detalhes não competem com a comparação dos valores.
- Cadastro em painel lateral; fatura/lançamentos abrem mantendo o período e o retorno.
- Tablet usa esta interface, com alvos de toque de pelo menos 44 px e ajuste de
  colunas/espaçamento para ambas as orientações.

## Smartphones

Uma estrutura própria, não a tabela comprimida:

- Blocos verticais por fatura, com nome, papel, valor e botão **Ver fatura**.
- Busca e chips de filtro por toque. Papel/limite ficam subordinados ao valor consultado.
- **Novo cartão** fixo na base; ações secundárias em painel inferior.
- Detalhe em tela inteira: resumo, cartões vinculados e acesso aos movimentos.
- Cadastro em tela inteira, com Voltar no topo, campos em sequência e **Salvar**
  na base, sem perder o rascunho ao girar o aparelho.
- Teclado decimal para limite, seletores de dia, estados de erro junto dos campos,
  foco previsível e acessibilidade por teclado/leitor de tela nas duas interfaces.

## Cadastro mais curto

1. **Nome do cartão/fatura**, por exemplo “Principal”.
2. **Limite**, com máscara monetária e validação real de valor não negativo.
3. **Fecha dia / Vence dia**, com controles de 1–31. Não inferir vencimento completo
   ou regras de feriados que o modelo atual não guarda.
4. **Cartões adicionais**, seção opcional, com busca por nome/e-mail e pessoas
   selecionadas visíveis. Carregar candidatos somente ao abrir a seção.

Titular preenchido pela sessão e cartão próprio criado automaticamente. Ao retirar
um adicional, explicar que o cartão será inativado e que o histórico permanece.
Ao mudar fechamento, mostrar o impacto conhecido na competência; não recalcular
histórico silenciosamente como efeito colateral de um formulário moderno.

Salvar preserva o rascunho em falha. Inativar/restaurar usa estado explícito,
retorno imediato e **Desfazer**; histórico nunca é apagado por essa ação.

## Valores que a tela deve explicar

Recomendo um contrato comum à lista e à fatura, sujeito à avaliação desta proposta:

| Informação | O que deve significar |
| --- | --- |
| Registrado | Compras menos créditos/estornos já registrados no recorte, conforme a regra da base |
| Pago | Pagamentos válidos da mesma fatura e competência, com status tratado de forma explícita |
| Em aberto | Valor registrado ainda não coberto por esses pagamentos; créditos excedentes identificados separadamente |
| Previsto | Ocorrências ainda não geradas, separadas de compras registradas e sem duplicação |
| Limite | Configuração única do grupo, não limite adicional para cada usuário |
| Comprometimento no recorte | Indicador estimado, com escopo visível; não confirmação de saldo bancário do emissor |

Exemplo fictício: registrado R$ 1.840, pago R$ 440, em aberto R$ 1.400 e previsto
R$ 180. A tela mostra **R$ 1.400 em aberto**, com **+ R$ 180 previstos** em texto
secundário. Uma recorrência ainda não gerada não aparece como valor já pago/registrado.
Créditos e pagamentos não podem virar novas receitas/despesas por causa do resumo.

Para **titular**, apresentar o consolidado autorizado da fatura. Para **adicional**,
rotular **Seus lançamentos** quando o acesso for parcial; não abater pagamentos
globais do grupo desse subtotal pessoal e não mostrar valores de outros cartões.
A busca e os filtros nunca ampliam permissões.

Em intervalo de vários meses, usar **Total no período** e detalhe por competência;
não comparar o acumulado com um único limite mensal como se fosse disponibilidade
atual. A primeira versão pode omitir essa barra no modo de intervalo. Não calcular
“atrasada” apenas com um dia do mês sem definir uma data de vencimento válida.

## Agilidade e implementação proposta

A lista inicial retorna somente grupos e resumos autorizados. Usuários para
adicionais, cartões detalhados e movimentos são carregados sob demanda. Busca e
filtros locais aproveitam o que já está carregado. Erro de previsão não bloqueia
o cadastro ou a consulta; erro de saldo não deve ser exibido como zero.

Manter `grupos_cartoes` e `cartoes` separados: o banco atual já representa bem a
fatura compartilhada e o cartão usado em cada compra. Preservar todos os IDs,
lançamentos, parcelas, recorrências e pagamentos existentes. A restrição de um
cartão por usuário/grupo continua; não introduzir números, CVV ou múltiplos cartões
por usuário sem requisito específico.

Na etapa conectada, propor uma RPC de gravação atômica (grupo + cartões), versão
esperada e ID da operação para repetição segura, sem lock global de todas as
pessoas. Validar nome por titular e valor/dias no servidor e no banco. Reutilizar
os contratos de sessão e dinheiro exato adotados em Contas. As novas consultas
devem ter DTOs mínimos e autorização no servidor, com RLS/grants compatíveis com
esse acesso. Alterações de banco serão preparadas como migração e reconciliadas
quando a implementação for autorizada.

A tela de Fatura já permite pagamentos e consulta detalhada. Esta proposta mantém
esse acesso: remodelar pagamentos e toda a UX de Faturas é uma etapa própria.
Entretanto, a base do resumo precisa reconciliar os valores das duas telas para
que o novo Cartões não perpetue a divergência identificada. Regras de competência
histórica, pagamentos pendentes e visão parcial precisam ser explícitas nessa etapa.

## Critérios de avaliação

- Titular e adicional identificam rapidamente seu papel e o valor que podem consultar.
- Lista aparece sem esperar pesquisa de usuários ou todos os movimentos detalhados.
- Zero, carregamento, previsão indisponível e falha de consulta têm estados distintos.
- Lista/fatura usam os mesmos conceitos e o mesmo escopo para registrado/pago/previsto.
- Mês sem movimentos mantém o cadastro visível; inativo mantém histórico acessível.
- Recorrência gerada não duplica previsão; parcelas permanecem no cartão original.
- Cadastro, remoção de adicional, renomeação e status preservam IDs/histórico.
- Gravação repetida ou concorrente não duplica grupos nem deixa cartões parciais.
- Desktop, tablet nas duas orientações e celular em rotação têm navegação apropriada.

Após aprovação: conectar ambas as interfaces em **Cartões (novo)**, mantendo
**Cartões** atual até a homologação explícita. Somente então substituir o acesso
principal e retirar o menu provisório, seguindo o mesmo processo usado em Contas.

## Verificação da prévia

Verificada em Chromium para computador, tablet e smartphone: listagem e busca,
filtro por papel, consulta sem edição como adicional, cadastro com adicionais,
inativação/Desfazer e preservação do rascunho ao rotacionar o celular, sem erros
JavaScript ou rolagem horizontal. Isso valida a demonstração local, não o acesso
remoto autenticado nem o desempenho da futura implementação conectada.
