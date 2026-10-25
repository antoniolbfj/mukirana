# Pendências da base atual — Mukirana

Atualizado em 25/10/2026. Supabase `wcczkultokrypdfimbsh`.

## Estado atual

Contas e Cartões remodelados foram homologados. A rodada atual promove a ampliação
de Contas, Lançamentos conectado, Rateios/Acertos, Painel geral e Metas aos acessos
principais, conforme autorização expressa para organizar menus e retirar telas
antigas. Publicação e versão estão em `rateios-painel-publicacao.json`.
Isso identifica implantação; não atribui homologação às funções novas.

Implementados: fórmula única R−D±transferências; período/saldo globais; filtros
dependentes; rascunho explícito; parcelamentos/recorrências finitas; três tipos de
contas e crédito vinculado aos cartões; responsável financeiro correto; rateios
com categoria privada persistente, revisão e reaprovação por conjunto; convites;
acertos agregados parciais em ambas as direções; limite concorrente e repetição
segura; patrimônio separado; painel conectado e metas mensais hierárquicas.
Ver [entrega e verificações](rateios-painel-entrega.md).

## Pendências vigentes

1. **Homologação:** avaliar as funcionalidades novas de Contas, Lançamentos,
   Rateios/Acertos, Painel e Metas em computador/tablet e smartphone. Os acessos já
   são principais por autorização do usuário; não aguardam outra promoção de menu.
2. **Classificação do histórico:** identificar quais contas antigas são de
   Investimento e revisar registros sem classificação fixa/variável e categorias
   pessoais pendentes. Não inferir pelo nome ou por ser recorrente/parcelado.
3. **Estornos e análises complementares:** desenhar correção/estorno explícito de
   acertos com ambas as pontas registradas, sem apagar a movimentação alheia;
   aprofundar devoluções e a análise comparativa de receitas/despesas fixas e
   variáveis (IND-05). O painel já sinaliza classificação insuficiente e calcula
   comprometimento quando há base completa; não entrega ainda todas essas análises.
4. **Relatórios configuráveis (REL-01 a REL-04):** concluir motor de campos,
   dimensões, agrupamentos e cálculos, apresentação interativa e exportações em PDF
   e planilha, usando a mesma consolidação e respeitando a privacidade. Não foi
   implementado como parte deste painel enxuto.
5. **Demais telas e requisitos da versão 1:** revisar e remodelar Faturas e seus
   pagamentos, Categorias, Recorrências legadas, Projetos e Usuários/autenticação,
   confrontando cada rotina existente com o documento vigente. São módulos
   existentes; a ausência de remodelagem não significa ausência funcional.
6. **Paleta global:** revisar após a remodelagem das demais telas.

As decisões posteriores do usuário substituem os modos participação/caixa e o
acerto tratado como transferência: cada pessoa registra sua própria despesa/receita
especial, e as pontas do mesmo acerto abatem a dívida uma única vez. Pagamentos de
fatura existentes preservam sua natureza e não ganham movimentos duplicados.

O backlog anterior ao reinício permanece arquivado. As recorrências antigas
conservam seu gerador e manutenção; as novas finitas usam conjuntos próprios,
com deduplicação das previsões históricas.
