# Revisão de implementação dos requisitos — Mukirana

Data: 24/10/2026. Versão do produto: **v0.5.0**, incluindo a rodada de parcelamentos e recorrências.

Base: “Mukirana — Especificação de Requisitos do Produto — v0.1”, de 19/10/2026,
mais as decisões explícitas posteriores do usuário. A comparação usa código,
SQL, registros de validação e consulta de metadados do Supabase.

## Leitura do status

- **Implementado**: comportamento disponível no escopo atual; não significa que todo módulo futuro relacionado esteja pronto.
- **Parcial**: parte do requisito existe, mas há comportamento explícito pendente.
- **A implementar**: a funcionalidade ainda não está disponível.
- **Diretriz contínua**: orientação de produto/processo, mantida durante o desenvolvimento; não é uma entrega isolada encerrável.
- **Substituído**: decisão posterior do usuário mudou a tecnologia originalmente descrita.

**Homologação é separada da implementação.** Contas, Categorias e Lançamentos
únicos têm homologação explícita no histórico. A correção que integrou
Transferências a Meus lançamentos foi publicada e validada tecnicamente, mas ainda
não recebeu homologação explícita. Autenticação e fundação estão funcionais. Parcelamentos/recorrências foram
implementados e validados tecnicamente nesta rodada e aguardam homologação explícita.

## Visão por funcionalidade

| Assunto | Já disponível | Ainda falta |
| --- | --- | --- |
| Autenticação | Código por e-mail, sessão persistente, revogação e autorização por proprietário | Manter a proteção nas próximas entregas |
| Contas | Três tipos, cadastro/edição/exclusão protegida, saldo inicial especial e saldos derivados | Integração com operações compartilhadas futuras |
| Categorias | Tabela única, categoria/subcategoria, nomes únicos por nível, reorganização e proteções | Relatórios agregados e classificação automática das participações de rateio |
| Lançamentos | Receitas/despesas únicas, parceladas e recorrentes; campos completos, fixa/variável, criação rápida e datas futuras | Rateios |
| Transferências próprias | Tipo de lançamento na lista/formulário comuns, origem/destino, edição/exclusão completas | Homologação explícita da correção publicada |
| Período | Mês atual, meses vizinhos, datas livres, memória durante navegação e intervalos abertos | Preferência global salva, períodos relativos persistentes e três cartões iniciais |
| Saldos e indicadores | Saldo atual, projeção e receitas/despesas/resultado básicos | Patrimônio em Investimento, movimentação líquida, resumo operacional, quanto posso gastar e análises fixa/variável |
| Parcelamentos/recorrências | Grupos lógicos, prévia, geração, centavos exatos, escopos individuais/coletivos e renovação | Homologação explícita da rodada |
| Histórico/favoritos | — | Sugestões pessoais e modelos independentes, com valor vazio ao reutilizar |
| Grupos/convites | Identidade individual já existe | Grupos, integrantes, convites, elegibilidade, privacidade e regras de saída/exclusão |
| Aprovações/rateios/acertos | — | Solicitações, decisões, participações, obrigações e liquidações entre usuários |
| Metas | — | Cadastro, regras hierárquicas e acompanhamento visual |
| Relatórios | — | Motor configurável, apresentação interativa, PDF e planilha |
| UX e qualidade | Telas funcionais, responsividade básica, temas e testes | Refinamento de UX ao final, acessibilidade/compatibilidade ampliadas e medições de capacidade |

## Decisões posteriores incorporadas

| Decisão do usuário | Situação |
| --- | --- |
| Supabase/PostgreSQL no lugar de Google Sheets | Implementada; texto tecnológico da v0.1 precisa refletir a stack atual |
| Uma tabela para categorias e subcategorias, permitindo níveis futuros | Implementada; dois níveis na interface atual não são uma pendência desta versão |
| Não permitir nomes repetidos no mesmo nível | Implementada por usuário e profundidade da hierarquia |
| Reorganizar categorias sem mudar o vínculo dos lançamentos | Implementada com IDs/FKs estáveis |
| Categorias reservadas indisponíveis para cadastro/escolha manual e visíveis somente quando usadas | Implementada para os vínculos atuais; automação de categorias de rateios depende do módulo futuro |
| Transferência é um tipo de lançamento, integrado a Meus lançamentos | Corrigida/publicada na versão 6; aguardando homologação explícita |
| Construir funcionalidades e banco antes do refinamento de UX | Diretriz vigente; acabamento de UX fica para a etapa final |

## Banco atual

Consulta de metadados em 24/10/2026 confirmou oito tabelas privadas, todas com RLS:

| Tabela | Finalidade |
| --- | --- |
| `users` | Identidade individual |
| `login_challenges` | Desafios de código temporário |
| `sessions` | Sessões e revogação |
| `accounts` | Contas e atributos do saldo inicial |
| `categories` | Árvore individual de categorias/subcategorias |
| `transactions` | Receitas, despesas, ocorrências geradas e saldo inicial |
| `transaction_groups` | Vínculo/configuração original, versão e renovação dos conjuntos |
| `transfers` | Transferências próprias como operação única |

A view privada `account_movements` reúne os movimentos para calcular saldos.
O backend comum expõe os tipos em Meus lançamentos, na mesma lista e formulário.

O banco está construído para essas entregas. Ainda não há estruturas dos módulos
pendentes, como favoritos, grupos/convites, aprovações,
participações/obrigações, metas e preferência de período. A modelagem desses
módulos deve continuar incremental. Há também uma pendência técnica documentada:
consolidar uma instalação reprodutível do banco vazio, pois as fundações de
autenticação/contas precedem as migrações registradas no repositório e algumas
instalações foram feitas pelo SQL Editor.

## Delimitação das entregas existentes

1. **Histórico e Favoritos:** faltam sugestões de preenchimento e modelos reutilizáveis do RQ-RAP; a consulta de lançamentos já existe.
2. **Disponível para gastar:** depende da definição PEN-04 e dos indicadores operacionais. O saldo projetado atual é a posição acumulada da conta até uma data.
3. **Investimentos:** o cadastro da conta está disponível; faltam patrimônio, movimentação líquida e exclusão padrão no resumo operacional.
4. **Aprovações:** o mecanismo RQ-APR ainda precisa ser construído. A versão de registro atual atende ao controle de alterações concorrentes.
5. **Acertos entre pessoas:** faltam obrigações bilaterais, aprovação do credor e efeitos provisórios; a transferência própria já está disponível.
6. **Relatórios por categoria:** falta o motor/visualização. A consulta atual já agrega lançamentos diretos e descendentes da categoria selecionada.

## Questões de requisitos que ainda precisam de decisão

| Item | Situação |
| --- | --- |
| PEN-01 — repertório e fórmulas do motor de relatórios | Em aberto |
| PEN-02 — hierarquia de metas mínimas de receitas | Em aberto |
| PEN-03 — redistribuição automática de participações | Em aberto; precisa fechar centavos e manter participações positivas |
| PEN-04 — cálculo de quanto ainda posso gastar | Em aberto |
| PEN-05 — desenho do armazenamento e capacidade | Reformulado para Supabase; modelo atual construído, próximos módulos/capacidade ainda em evolução |
| PEN-06 — viabilidade de OTP/sessão | Base implementada e validada; controles de validade, reenvio, tentativas e revogação disponíveis |
| PEN-07 — bibliotecas/gráficos/exportação | Interface atual definida; gráficos e exportação ainda serão decididos em suas entregas |
| PEN-08 — cenários extremos de correções/rejeições de aprovações | Em aberto, vinculado aos módulos compartilhados |

## Exclusões deliberadas preservadas

Não são faltas da versão atual: compartilhamento de contas/categorias, diretório
público de usuários, consolidação das finanças privadas de todos os membros,
senhas tradicionais, catálogo de produtos de investimento, fatura/limite
automáticos de cartão, recorrência infinita, SQL livre sem decisão posterior,
histórico de tokens de aprovação substituídos, histórico temporal de tipo da
conta e bloqueio de lançamentos por descumprimento de metas.

## Ordem sugerida para o restante

1. Homologar as entregas publicadas de Transferências e de Parcelamentos/Recorrências.
2. Histórico e favoritos.
3. Grupos e convites.
4. Mecanismo comum de aprovações e rateios.
5. Obrigações bilaterais e acertos.
6. Metas financeiras, resolvendo as pendências de receitas.
7. Completar a preferência global de período e os três cartões iniciais antes de concluir os indicadores.
8. Painel/indicadores e motor de relatórios, resolvendo o cálculo de disponível para gastar e as exportações.
9. Completar as verificações de desempenho/capacidade, compatibilidade e instalação do banco vazio.
10. Refinamento de UX, conforme a prioridade definida pelo usuário.

Período salvo, histórico/favoritos e metas podem ter sua ordem ajustada por
independência/dependências. A ordem segue o levantamento e não inicia uma nova
implementação sem a rodada correspondente.

## Matriz completa por código

A matriz inclui todos os códigos RQ e CA identificados no levantamento. Os
estados não devem virar um percentual simples de avanço: uma regra pequena de
cadastro e o motor de relatórios têm esforços muito diferentes.

Códigos cobertos: **152**.

### Visão e escopo

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-VIS-01 | Diretriz contínua | A utilização individual será plena, sem obrigatoriedade de criar ou integrar grupos. | Diretriz aplicada ao desenvolvimento incremental; os módulos individuais atuais não exigem grupo. A versão completa ainda não está finalizada. |
| RQ-VIS-02 | A implementar | Um mesmo usuário poderá participar simultaneamente de vários grupos de integrantes. | Múltiplos grupos por usuário dependem do módulo de grupos. |
| RQ-VIS-03 | Diretriz contínua | O produto deverá privilegiar simplicidade, autonomia do usuário, registros fiéis à realidade e explicações claras sobre impactos de alterações. | Diretriz aplicada ao desenvolvimento incremental; os módulos individuais atuais não exigem grupo. A versão completa ainda não está finalizada. |
| RQ-VIS-04 | Diretriz contínua | O levantamento inicial está encerrado; requisitos poderão ser revisitados ou adicionados quando houver necessidade concreta durante o desenvolvimento incremental. | Diretriz aplicada ao desenvolvimento incremental; os módulos individuais atuais não exigem grupo. A versão completa ainda não está finalizada. |

### Princípios transversais

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-PRN-01 | Parcial | Dados financeiros individuais são privados; pertencer a um grupo não transfere propriedade nem acesso a contas, categorias, saldos, lançamentos ou indicadores particulares. | Isolamento dos dados individuais implementado. As regras adicionais de privacidade entre membros de grupos ainda dependem dos compartilhamentos. |
| RQ-PRN-02 | A implementar | Rateios e acertos não poderão duplicar receitas, despesas nem saldos em consolidações. Diferenciar desembolso/recebimento efetivo de responsabilidade econômica. | Rateios e acertos ainda não existem; sua consolidação econômica/financeira será implementada nesses módulos. |
| RQ-PRN-03 | Implementado | Operações que exigem consistência entre registros deverão ser processadas integralmente ou não produzir efeitos parciais inconsistentes. | Gravações atuais de contas/saldo inicial e transferências são atômicas; versões e travas protegem alterações concorrentes. |
| RQ-PRN-04 | Diretriz contínua | Preferir mecanismos comuns para problemas semelhantes, preservando regras específicas por tipo de operação. Não criar exigências ou fluxos complexos sem benefício demonstrado. | Acesso ao banco centralizado e mecanismos comuns de sessão, lançamento, período e valores; manter nas próximas entregas. |
| RQ-PRN-05 | Parcial | Valores monetários e rateios deverão fechar em centavos; erros de arredondamento não poderão fazer a soma divergir do valor original. | Centavos inteiros e totais exatos implementados. Divisão de parcelas com resíduo na primeira implementada. Redistribuição e arredondamento de rateios ainda faltam. |
| RQ-PRN-06 | Diretriz contínua | Não pressupor significado financeiro a partir do texto de nomes de categoria, descrição ou grupo; a organização semântica é decidida pelo usuário. | Os nomes não determinam significado financeiro. Classificações automáticas usam chaves de sistema explícitas. |

### Usuários, grupos e convites

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-GRP-01 | Parcial | Cada usuário mantém identidade e dados próprios, independentemente de participar ou não de grupos. | Identidade e dados individuais já existem; a participação em grupos ainda não foi implementada. |
| RQ-GRP-02 | A implementar | Um grupo reúne integrantes sem impor relação familiar, papel financeiro conjunto ou número fixo de participantes. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-03 | A implementar | Apenas o criador do grupo pode convidar novos integrantes ou remover participantes. Essa atribuição administrativa não dá acesso às finanças privadas. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-04 | A implementar | Convites são encaminhados a endereços de e-mail e exigem aceitação do convidado. A pessoa pode criar uma conta Mukirana após receber o convite e só então aceitá-lo. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-05 | A implementar | Convite pendente ou recusado não cria participação ativa nem autoriza compartilhamentos. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-06 | A implementar | Depois do ingresso, integrantes ativos podem visualizar nome e e-mail dos demais membros daquele grupo; não haverá diretório público/pesquisa livre de todos os usuários cadastrados. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-07 | A implementar | Qualquer combinação de membros ativos de um mesmo grupo pode propor rateios, independentemente de quem enviou convites ou criou o grupo; cada rateio continua exigindo aprovação própria. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-08 | A implementar | O autor de um rateio poderá selecionar integrantes elegíveis de todos os grupos de que participa, inclusive pessoas de grupos diferentes na mesma operação. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-09 | A implementar | Somente integrantes com vínculo autorizado de grupo compartilhado com o autor podem ser selecionados; não será possível procurar nem incluir usuários sem convite aceito. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-10 | A implementar | Um rateio é visível exclusivamente ao autor e aos participantes envolvidos. Outros integrantes do(s) grupo(s), inclusive criadores não envolvidos, não podem visualizar sua existência ou detalhes. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-11 | A implementar | As obrigações pertencem aos usuários envolvidos, não aos grupos; grupos estabelecem vínculos de compartilhamento e não se tornam proprietários das dívidas. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-12 | A implementar | Integrante não criador poderá sair de um grupo somente se não possuir nenhuma obrigação financeira pendente nem aprovações/acertos/pagamentos pendentes com quaisquer usuários; a restrição vale globalmente para a saída de qualquer grupo. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-13 | A implementar | A remoção de integrante pelo criador observará as mesmas condições de regularização; saída ou remoção preservará integralmente participações, lançamentos e histórico financeiro anterior. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-14 | A implementar | O criador não poderá sair de seu grupo: para encerrar o vínculo, precisará excluir o grupo. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |
| RQ-GRP-15 | A implementar | A exclusão do grupo dependerá da ausência de obrigações e operações financeiras pendentes dos participantes e da remoção prévia dos demais integrantes; registros financeiros históricos não serão apagados. | Módulo de grupos, integrantes, convites, elegibilidade e regras de saída/exclusão ainda não implementado. |

### Contas financeiras

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-CON-01 | Parcial | Cada conta pertence a um único usuário e pode ser utilizada pelo proprietário em operações individuais ou relacionadas a diferentes grupos sem duplicação do cadastro. | Conta individual com proprietário único implementada. Uso em operações relacionadas a grupos será integrado quando esses módulos existirem. |
| RQ-CON-02 | Implementado | Tipos iniciais: Consumo (dinheiro disponível), Investimento (patrimônio guardado) e Cartão de Crédito (agrupador de gastos para conferência manual). | Tipos Consumo, Investimento e Cartão disponíveis. |
| RQ-CON-03 | Implementado | Conta admite nome, tipo e saldo inicial opcional. O saldo inicial gera um lançamento financeiro especial associado à conta. | Nome, tipo e saldo inicial opcional; movimentação especial gerada atomicamente. |
| RQ-CON-04 | Implementado | O saldo inicial será contabilizado como lançamento financeiro comum nos indicadores de receitas/despesas, conforme decisão expressa, mesmo podendo distorcer os números do período de implantação. | Saldo inicial positivo/negativo participa dos totais de receitas/despesas. |
| RQ-CON-05 | Implementado | O saldo inicial será alterado pelo cadastro de Conta, não diretamente na listagem; sua exclusão na listagem retira o valor do cadastro, sem excluir a conta. | Edição do saldo inicial pela conta; exclusão na lista limpa o valor e preserva a conta. |
| RQ-CON-06 | Implementado | Conta com qualquer movimentação vinculada (inclusive saldo inicial e transferências) não pode ser excluída; conta sem movimentações pode ser excluída. Quando bloqueada, oferecer renomeação. | Qualquer movimentação, inclusive saldo inicial ou transferência futura, bloqueia exclusão; renomeação oferecida. |
| RQ-CON-07 | Implementado | Nome e tipo da conta podem ser alterados mesmo com histórico. Alterar tipo requer orientação prévia sobre impactos em indicadores e relatórios. | Nome e tipo podem ser alterados; mudança de tipo exige ciência do efeito retroativo. |
| RQ-CON-08 | Implementado | O tipo atual da conta aplica-se retroativamente à interpretação de todos os períodos: não haverá histórico temporal de tipos anteriores. | A conta guarda apenas seu tipo atual, aplicável às consultas; não há histórico temporal de tipos. |
| RQ-CON-09 | Implementado | Saldos devem ser derivados das movimentações, evitando valores inconsistentes mantidos manualmente em paralelo. | Saldos calculados da view de movimentos, incluindo receitas, despesas e as duas pontas das transferências. |
| RQ-CON-10 | Implementado | Conta Cartão de Crédito pode ter saldo negativo; pagamento da fatura será transferência comum de Consumo para Cartão, sem registrar nova despesa. | Saldo negativo permitido; pagamento de cartão por transferência sem nova despesa. |
| RQ-CON-11 | Implementado | Contas de Investimento não representam catálogo de produtos financeiros. Aportes/resgates são transferências; rendimentos são receitas comuns. | Investimento é tipo de conta; aporte/resgate por transferência e rendimento por receita comum. |

### Saldos

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-SAL-01 | Implementado | Resultado do período = receitas menos despesas datadas no intervalo filtrado, sem incorporar movimentações anteriores; transferências não entram como receita/despesa. | Resultado do período usa receitas menos despesas nas datas filtradas; transferências têm efeito zero. |
| RQ-SAL-02 | Implementado | Saldo atual da conta = posição acumulada das movimentações efetivas até a data atual. | Saldo atual acumula movimentos até hoje no fuso America/Sao_Paulo. |
| RQ-SAL-03 | Implementado | Saldo projetado da conta = posição acumulada do histórico até a data final do filtro, incluindo movimentos futuros previstos até essa data; difere do resultado restrito ao período. | Projeção acumula o histórico até o fim do filtro, incluindo previsões; não é limitada pela data inicial. |
| RQ-SAL-04 | A implementar | A visão principal de patrimônio apresenta o saldo acumulado atual somente das contas de Investimento; saldos Consumo não integram esse patrimônio. | Falta o indicador próprio de patrimônio em Investimento e a consulta de sua movimentação líquida no período. |
| RQ-SAL-05 | A implementar | O usuário poderá consultar a movimentação líquida das contas de Investimento dentro do período (aportes − retiradas + rendimentos), distinta do patrimônio acumulado. | Falta o indicador próprio de patrimônio em Investimento e a consulta de sua movimentação líquida no período. |

### Categorias e subcategorias

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-CAT-01 | Implementado | Cada usuário possui estrutura individual de classificação; não existe catálogo compartilhado obrigatório entre integrantes. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-02 | Implementado | Uma única entidade conceitual Categoria suporta categorias principais e subordinadas por referência à categoria superior. A interface inicial terá categoria/subcategoria, sem impedir aprofundamento futuro. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-03 | Implementado | Uma mesma categoria poderá classificar receitas e despesas. Subcategorias são opcionais, e é permitido lançar diretamente na categoria principal mesmo com filhas cadastradas. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-04 | Implementado | A tela de lançamentos terá um único seletor de categoria, permitindo escolher categoria principal ou subcategoria; o vínculo hierárquico será conhecido pelo sistema. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-05 | Parcial | Relatórios por categoria principal agregarão lançamentos diretos e lançamentos de todas as subcategorias subordinadas. | Filtro de categoria principal já inclui lançamentos diretos e descendentes; relatórios e agrupamentos por categoria ainda faltam. |
| RQ-CAT-06 | Implementado | O usuário pode renomear categorias e reorganizar hierarquias, incluindo promover filhas a principais ou inverter relações; o backend impedirá apenas árvores inconsistentes/circulares. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-07 | Implementado | Categoria/subcategoria com lançamentos vinculados não pode ser excluída; informar motivo e oferecer renomeação. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-08 | Implementado | Categoria sem lançamentos pode ser excluída se não possuir subcategorias dependentes. Se possuir, o usuário deve reorganizá-las explicitamente antes da exclusão. | Cadastro individual em tabela única; dois níveis na interface, nomes únicos por nível, seletor único, reorganização sem trocar IDs, prevenção de ciclos e proteção de exclusões com vínculos/dependentes. |
| RQ-CAT-09 | A implementar | Participações de rateios ainda não classificadas pelo destinatário recebem classificação temporária reservada 'Aguardando Categorização', distinta do status 'Aguardando aprovação'. | Proteção de nomes/categorias reservados já existe, mas atribuição automática a participações de rateio aguarda esse módulo. |

### Lançamentos

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-LAN-01 | Implementado | Cada receita/despesa armazena pelo menos identificação, usuário responsável, natureza, descrição, valor, data, conta, categoria selecionada, classificação fixa/variável e modalidade. | Campos e regras de receitas/despesas implementados, com datas futuras, categoria obrigatória e criação rápida contextual. Transferência usa o mesmo formulário/lista, com origem/destino e sem categoria. |
| RQ-LAN-02 | Parcial | Modalidades mutuamente exclusivas: Único (padrão), Parcelado e Recorrente. Rateio é uma característica independente e pode coexistir com qualquer modalidade. | Modalidades Único, Parcelado e Recorrente implementadas; rateio independente ainda pendente. |
| RQ-LAN-03 | Implementado | Receitas e despesas exigem classificação em categoria; transferências convencionais não exigem categoria. | Campos e regras de receitas/despesas implementados, com datas futuras, categoria obrigatória e criação rápida contextual. Transferência usa o mesmo formulário/lista, com origem/destino e sem categoria. |
| RQ-LAN-04 | Implementado | Fixa significa ocorrência regular e duradoura, independentemente de oscilações no valor; variável refere-se à entrada/saída sem esse compromisso de continuidade. O conceito aplica-se a receita e despesa. | Campos e regras de receitas/despesas implementados, com datas futuras, categoria obrigatória e criação rápida contextual. Transferência usa o mesmo formulário/lista, com origem/destino e sem categoria. |
| RQ-LAN-05 | Implementado | Classificação fixa/variável não se deduz obrigatoriamente da modalidade Recorrente. Por exemplo, energia mensal pode ser despesa fixa ainda que o valor mude. | Campos e regras de receitas/despesas implementados, com datas futuras, categoria obrigatória e criação rápida contextual. Transferência usa o mesmo formulário/lista, com origem/destino e sem categoria. |
| RQ-LAN-06 | Implementado | Lançamentos com datas futuras afetam análises e saldos projetados das respectivas datas, mas não antecipam o saldo atual de conta. | Campos e regras de receitas/despesas implementados, com datas futuras, categoria obrigatória e criação rápida contextual. Transferência usa o mesmo formulário/lista, com origem/destino e sem categoria. |
| RQ-LAN-07 | Implementado | Durante o cadastro do lançamento haverá criação rápida contextual de conta (nome e tipo), categoria (nome) ou subcategoria (nome e categoria-pai), sem perder os dados já digitados; novo item fica selecionado. | Campos e regras de receitas/despesas implementados, com datas futuras, categoria obrigatória e criação rápida contextual. Transferência usa o mesmo formulário/lista, com origem/destino e sem categoria. |

### Parcelamentos e recorrências

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-GER-01 | Implementado | Um Grupo de Lançamentos possui identificador próprio, natureza (receita/despesa) e modalidade (parcelado/recorrente); não é movimentação financeira e não tem valor financeiro independente. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-02 | Implementado | Cada ocorrência gerada é um lançamento financeiro individual completo, com identificador, data, valor e demais atributos próprios; o grupo fornece vínculo lógico para operações coletivas. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-03 | Implementado | O total atualizado do grupo é derivado da soma das ocorrências. Alteração individual afeta somente a ocorrência (e suas participações, se rateada), mas atualiza o total agregado visível ao usuário. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-04 | Implementado | No parcelamento, informar valor total, quantidade, data inicial e periodicidade; gerar todas as parcelas antecipadamente. Centavos residuais da divisão ficam na primeira parcela. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-05 | Implementado | O valor total inicialmente informado não trava os valores posteriores: cada parcela pode ser editada livremente sem redistribuir diferenças às demais. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-06 | Implementado | Edição em lote: somente ocorrência selecionada, da selecionada até a última ou todas. Exclusão em lote: todas, da selecionada até a última ou da primeira até a selecionada. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-07 | Implementado | Na recorrência, informar duração determinada em meses, periodicidade, descrição e valor; gerar todas as ocorrências antecipadamente. Não haverá recorrência infinita. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-08 | Implementado | Na data prevista da última ocorrência recorrente, apresentar notificação interna oferecendo renovação e nova duração/configuração; não notificar já na data de criação do conjunto. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-09 | Implementado | Periodicidades disponíveis: semanal (7 dias), quinzenal (15 dias), mensal, bimestral, trimestral, semestral e anual. Não há periodicidades personalizadas nesta versão. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-10 | Implementado | Para frequências baseadas em meses/anos, quando o dia âncora não existir no mês destino, usar o último dia desse mês sem perder o dia original como âncora para ocorrências seguintes. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |
| RQ-GER-11 | Implementado | Parcelamentos e recorrências são mecanismos para gerar lançamentos em lote, não mecanismos de bloqueio de alterações/exclusões posteriores. | Implementado na v0.5.0: grupos lógicos, prévia, geração antecipada, sete periodicidades, dia âncora, totais derivados, escopos coletivos e renovação. Exclusão individual e término exclusivo confirmados pelo usuário. Validação: 61 verificações SQL, cinco cenários concorrentes e 18 fluxos novos de interface. |

### Histórico e favoritos

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-RAP-01 | A implementar | Ao digitar descrições de novos lançamentos, oferecer sugestões baseadas no histórico pessoal do usuário, recuperando informações reutilizáveis. | Não há sugestões baseadas no histórico nem modelos favoritos independentes. A lista de lançamentos existente não é essa funcionalidade. |
| RQ-RAP-02 | A implementar | Permitir criação voluntária de modelos favoritos de lançamentos, independentes do histórico, para reutilização futura. | Não há sugestões baseadas no histórico nem modelos favoritos independentes. A lista de lançamentos existente não é essa funcionalidade. |
| RQ-RAP-03 | A implementar | Ao selecionar histórico ou favorito, preencher descrição, categoria, conta e classificação disponíveis; preservar liberdade de edição de todos os campos. | Não há sugestões baseadas no histórico nem modelos favoritos independentes. A lista de lançamentos existente não é essa funcionalidade. |
| RQ-RAP-04 | A implementar | O campo Valor deve ficar vazio e receber foco imediatamente após selecionar sugestão ou modelo, para digitação rápida e salvamento com poucas interações. | Não há sugestões baseadas no histórico nem modelos favoritos independentes. A lista de lançamentos existente não é essa funcionalidade. |
| RQ-RAP-05 | A implementar | Sugestões e modelos não são lançamentos financeiros, não produzem saldos e não significam recorrência programada. | Não há sugestões baseadas no histórico nem modelos favoritos independentes. A lista de lançamentos existente não é essa funcionalidade. |

### Rateios

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-RAT-01 | A implementar | Receitas e despesas podem ser rateadas; transferências convencionais não se dividem em rateio. O lançamento financeiro original pertence apenas ao integrante que efetivamente pagou ou recebeu. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-02 | A implementar | A operação original movimenta exclusivamente a conta do pagador/recebedor efetivo; participações dos demais geram obrigações econômicas provisionadas, sem alterar seus saldos bancários até o acerto. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-03 | A implementar | Participações econômicas já impactam indicadores individuais, mesmo enquanto a aprovação e a categorização estão pendentes; distinguir os resultados econômicos do fluxo de caixa real. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-04 | A implementar | Cada participante escolhe a própria categoria ou subcategoria ao aprovar o rateio; a categoria do autor não é imposta aos demais. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-05 | A implementar | Distribuição inicial igualitária entre autor e demais selecionados; o autor poderá personalizar livremente por valor monetário ou percentual. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-06 | A implementar | A soma das participações deve igualar exatamente o valor total e toda pessoa incluída precisa ter participação estritamente positiva; não permitir sobras, excedentes ou participações zeradas. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-07 | A implementar | O sistema deverá automatizar ao máximo a redistribuição quando valor ou percentual de um integrante mudar, preservando a soma exata; centavos residuais de uma divisão igualitária são atribuídos ao autor. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-08 | A implementar | Cada participante deve aprovar ou rejeitar a participação, com justificativa obrigatória em toda rejeição; correções e reenvios seguem mecanismo comum de aprovação. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-09 | A implementar | Qualquer alteração em rateio antes ou depois de aprovações exige nova aprovação de todos os participantes, inclusive dos que haviam aprovado. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-10 | A implementar | Quando parcelamentos ou recorrências forem rateados, haverá aprovação e categorização unificadas por participante para o conjunto; alterações em qualquer ocorrência exigem nova aprovação coletiva. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-11 | A implementar | Excluir rateio também depende de aprovação de todos; enquanto pendente, o lançamento original e seus impactos permanecem ativos. Rejeição não cancela automaticamente o lançamento. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-12 | A implementar | Consolidação individual atribui a cada pessoa somente sua participação econômica. Consolidação compartilhada, quando aplicável à operação, conta a receita/despesa original uma única vez e não inclui acertos como novo resultado. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |
| RQ-RAT-13 | A implementar | Somente autor e participantes do rateio visualizam a operação. Não há exposição financeira para outros membros do grupo nem acesso cruzado às contas. | Não há distribuição de participações, obrigações econômicas, categorização individual ou aprovações de rateios. |

### Aprovações

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-APR-01 | A implementar | Eventos que demandam aprovação geram uma solicitação identificada por token/versão, associada à operação financeira ou convite pertinente. | Não há mecanismo de solicitações/tokens/decisões de aprovação. Versão de registro para concorrência não substitui aprovação de participantes. |
| RQ-APR-02 | A implementar | Uma operação mantém apenas sua solicitação de aprovação vigente. Novo evento substitui token anterior (aprovado, pendente ou rejeitado) e invalida todas as decisões antigas daquela operação. | Não há mecanismo de solicitações/tokens/decisões de aprovação. Versão de registro para concorrência não substitui aprovação de participantes. |
| RQ-APR-03 | A implementar | Tokens anteriores e seus históricos de decisões não precisam ser preservados nesta versão; isso não autoriza apagar registros financeiros históricos necessários à integridade. | Não há mecanismo de solicitações/tokens/decisões de aprovação. Versão de registro para concorrência não substitui aprovação de participantes. |
| RQ-APR-04 | A implementar | O mecanismo reutilizável determina participantes, decisões e justificativas. Cada domínio determina seus próprios efeitos financeiros nos estados pendente, aprovado ou rejeitado. | Não há mecanismo de solicitações/tokens/decisões de aprovação. Versão de registro para concorrência não substitui aprovação de participantes. |
| RQ-APR-05 | A implementar | Uma aprovação antiga ou feita com token substituído jamais poderá produzir efeitos sobre a versão vigente. | Não há mecanismo de solicitações/tokens/decisões de aprovação. Versão de registro para concorrência não substitui aprovação de participantes. |

### Transferências próprias

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-TRF-01 | Implementado | Transferir entre contas próprias representa uma única operação com saída da origem e entrada no destino, de mesmo valor e sinais opostos. | Uma operação gera duas pontas opostas, editadas/excluídas juntas; não altera receitas/despesas. Integrada a Meus lançamentos na versão 6. Correção publicada ainda sem homologação explícita do usuário. |
| RQ-TRF-02 | Implementado | Editar a transferência uma vez atualiza de modo consistente ambas as movimentações vinculadas; não será permitido manter somente metade da operação. | Uma operação gera duas pontas opostas, editadas/excluídas juntas; não altera receitas/despesas. Integrada a Meus lançamentos na versão 6. Correção publicada ainda sem homologação explícita do usuário. |
| RQ-TRF-03 | Implementado | Transferências comuns não são receitas nem despesas e não deverão duplicar resultados; entre contas próprias, o efeito consolidado é zero. | Uma operação gera duas pontas opostas, editadas/excluídas juntas; não altera receitas/despesas. Integrada a Meus lançamentos na versão 6. Correção publicada ainda sem homologação explícita do usuário. |

### Obrigações e acertos

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-ACE-01 | A implementar | Obrigações entre dois integrantes formam saldo líquido bilateral contínuo: receitas, despesas e pagamentos se compensam, podendo inverter quem é o devedor. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-02 | A implementar | Acerto de rateio é uma transferência especial iniciada pelo devedor e aprovada pelo credor, e não nova receita/despesa. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-03 | A implementar | Ao registrar o acerto, a saída da conta do devedor é lançada e o saldo devido é reduzido provisoriamente; a entrada na conta do credor só acontece após aprovação dele. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-04 | A implementar | Se o credor rejeitar o acerto, a redução da dívida é revertida imediatamente, mas a saída registrada pelo pagador permanece até que ele corrija ou exclua o pagamento rejeitado. Rejeição exige justificativa. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-05 | A implementar | Acertos podem ser parciais ou totais em qualquer momento, independentemente do mês de origem dos rateios; compromissos remanescentes continuam compondo a dívida líquida. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-06 | A implementar | O valor sugerido inicialmente para pagar corresponde à dívida líquida acumulada até o mês corrente, inclusive, independentemente do filtro temporal global. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-07 | A implementar | O usuário pode antecipar pagamentos de obrigações futuras já registradas, até o limite da dívida líquida total presente e futura. Não é permitido criar saldo credor pagando mais do que se deve. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-08 | A implementar | Pagamentos registrados e ainda em aprovação devem ser considerados na validação para impedir acertos simultâneos que ultrapassem a dívida total disponível. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |
| RQ-ACE-09 | A implementar | Acertos não entram novamente em totais de receitas, despesas ou categorias, embora seus efeitos de caixa atualizem as contas apropriadas. | Transferência própria existe; obrigações bilaterais e pagamentos entre usuários com aprovação ainda não. |

### Metas

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-MET-01 | A implementar | Metas são opcionais por categoria ou subcategoria. Despesas usam limite máximo e receitas usam objetivo mínimo; sem período de vigência próprio. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-02 | A implementar | Meta serve exclusivamente para monitoramento visual, orientação e alertas na tela; jamais bloqueia lançamento financeiro real quando um objetivo for descumprido. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-03 | A implementar | Indicadores de metas acompanham dinamicamente o filtro temporal global e alterações em lançamentos e nos valores das metas; não exigem cálculo histórico paralelo. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-04 | A implementar | Ao selecionar uma subcategoria para configurar meta, carregar a categoria principal e todas as suas subcategorias para edição contextual. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-05 | A implementar | Para despesas, a meta da categoria principal é o teto do conjunto: inclui lançamentos diretamente na principal e em todas as subcategorias, com ou sem metas próprias. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-06 | A implementar | Metas máximas das subcategorias são subtetos adicionais, e não reservas obrigatórias. A soma dos subtetos configurados não pode superar o teto manual da categoria principal. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-07 | A implementar | Se o usuário informar subteto em uma subcategoria sem meta na principal, preencher automaticamente a meta principal com valor suficiente. Se já houver teto manual maior, preservá-lo; não elevar automaticamente um teto manual incompatível. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-08 | A implementar | Definir meta somente na categoria principal não preenche automaticamente metas das filhas. A diferença entre teto principal e subtetos não é reservada obrigatoriamente a subcategoria alguma. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |
| RQ-MET-09 | A implementar | Receitas utilizam a mesma estrutura hierárquica, substituindo teto máximo por objetivo mínimo, com monitoramento do total e dos objetivos específicos. | Não há cadastro, hierarquia, indicadores ou alertas de metas. |

### Filtro temporal

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-FIL-01 | Implementado | Haverá um único filtro temporal global compartilhado pelas telas relevantes; não desenvolver filtros de período independentes por tela. | Objeto global de período compartilhado para as telas relevantes e reutilizável pelos próximos módulos. |
| RQ-FIL-02 | Implementado | Filtro padrão: mês corrente. O filtro selecionado permanece durante a navegação na sessão. | Mês atual como padrão; seleção mantida em memória durante navegação no aplicativo. |
| RQ-FIL-03 | A implementar | O usuário pode salvar explicitamente uma única preferência global de período; sem salvamento, novo acesso utiliza mês corrente ou a última preferência já salva. | Não há preferência global de período salva por usuário no banco. |
| RQ-FIL-04 | Parcial | Aceitar períodos relativos (mês anterior, atual, próximo, últimos 15 dias etc.) ou absolutos (datas fixas). Preferências relativas continuam relativas ao calendário no acesso futuro. | Mês anterior/atual/próximo e datas absolutas disponíveis. Faltam preferência relativa persistente e ampliação dos períodos relativos, como últimos 15 dias. |
| RQ-FIL-05 | Implementado | Só data inicial: intervalo até hoje; só data final: desde o começo do histórico; ambas: intervalo exato. | Só início significa até hoje; só fim significa desde o início do histórico; ambos definem intervalo exato. |
| RQ-FIL-06 | A implementar | O resumo inicial mostrará simultaneamente cartões dos meses anterior, atual e seguinte; clicar em um cartão ajusta o filtro global temporariamente, sem salvar automaticamente a preferência. | A página inicial ainda não tem os três cartões dos meses anterior, atual e seguinte. |

### Indicadores

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-IND-01 | Parcial | Resumo inicial deve destacar receitas, despesas, resultado do período e perspectiva de quanto resta para gastar depois de pagamentos e investimentos, respeitando as definições de saldo/resultado. | Receitas, despesas e resultado aparecem em Meus lançamentos. Faltam o painel inicial e quanto ainda posso gastar após pagamentos/investimentos. |
| RQ-IND-02 | A implementar | Contas de Investimento ficam fora do resumo operacional de consumo por padrão, com opção de incluí-las; patrimônio acumulado é apresentado em indicador próprio. | Não há exclusão padrão de Investimento no resumo operacional, opção própria de inclusão nem indicador separado de patrimônio. Os totais atuais seguem os filtros e podem incluir contas de Investimento. |
| RQ-IND-03 | Parcial | Apresentar valores líquidos, considerando entradas, saídas, devoluções e acertos sem duplicidade. | Totais/saldos básicos e efeito zero das transferências implementados. Tratamento completo de responsabilidades econômicas, devoluções e acertos ainda depende dos módulos financeiros restantes. |
| RQ-IND-04 | Parcial | Relatórios individuais incluem somente dados particulares do usuário e suas participações econômicas em rateios. Não há, nesta versão, acesso a consolidados privados de outros integrantes só por compartilharem grupo. | Dados atuais são restritos ao proprietário; relatórios e participações econômicas em rateios ainda não existem. |
| RQ-IND-05 | Parcial | Disponibilizar análises de despesas/receitas fixas e variáveis, inclusive percentual de comprometimento das receitas fixas por despesas fixas no período selecionado. | Classificação e filtros fixa/variável disponíveis; faltam análises dedicadas e percentual de comprometimento das receitas fixas. |

### Motor de relatórios

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-REL-01 | A implementar | Disponibilizar motor genérico para o usuário selecionar campos, dimensões, agrupamentos, cálculos e parâmetros de apresentação, com máximo controle possível sem exigir conhecimento técnico. | Não há motor configurável, dashboard de relatórios ou exportação PDF/planilha consistente. |
| RQ-REL-02 | A implementar | O mesmo relatório deverá poder ser apresentado interativamente na aplicação (dashboard), exportado como PDF profissional e como planilha tabular. | Não há motor configurável, dashboard de relatórios ou exportação PDF/planilha consistente. |
| RQ-REL-03 | A implementar | Resultados numéricos devem permanecer consistentes entre dashboard, PDF e planilha, inclusive tratamento de datas, rateios, categorias e acertos. | Não há motor configurável, dashboard de relatórios ou exportação PDF/planilha consistente. |
| RQ-REL-04 | A implementar | O motor obedecerá sempre aos limites de privacidade individuais e não permitirá consultar finanças particulares de terceiros. | Não há motor configurável, dashboard de relatórios ou exportação PDF/planilha consistente. |

### Autenticação e sessões

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-AUT-01 | Implementado | Não armazenar senhas de usuários. Autenticar por código temporário de seis dígitos enviado ao endereço de e-mail cadastrado. | OTP por e-mail sem senha, uso único/validade/limites, sessão persistente, saída atual/todos os dispositivos e autorização pelo token no backend. |
| RQ-AUT-02 | Implementado | O código é de uso único, validade curta e sujeito a controles de tentativas/reenvio; a implementação não deverá expor usuários por respostas de login. | OTP por e-mail sem senha, uso único/validade/limites, sessão persistente, saída atual/todos os dispositivos e autorização pelo token no backend. |
| RQ-AUT-03 | Implementado | Após autenticação válida, criar sessão persistente por navegador/dispositivo, sem exigir novo código ao reabrir o aplicativo em condições normais. | OTP por e-mail sem senha, uso único/validade/limites, sessão persistente, saída atual/todos os dispositivos e autorização pelo token no backend. |
| RQ-AUT-04 | Implementado | O usuário escolherá entre 'Sair deste dispositivo' (revogar a sessão atual) e 'Sair de todos os dispositivos' (revogar suas sessões ativas). | OTP por e-mail sem senha, uso único/validade/limites, sessão persistente, saída atual/todos os dispositivos e autorização pelo token no backend. |
| RQ-AUT-05 | Implementado | A sessão poderá ser revogada em situações excepcionais de segurança; exclusão dos dados locais do navegador pode exigir novo login. | OTP por e-mail sem senha, uso único/validade/limites, sessão persistente, saída atual/todos os dispositivos e autorização pelo token no backend. |
| RQ-AUT-06 | Implementado | Todas as operações protegidas do backend identificarão o usuário pela sessão válida e verificarão autorização e propriedade dos registros, nunca apenas pelo e-mail ou ID enviados pela interface. | OTP por e-mail sem senha, uso único/validade/limites, sessão persistente, saída atual/todos os dispositivos e autorização pelo token no backend. |

### Tecnologia

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-TEC-01 | Implementado | Frontend em HTML/CSS/JavaScript e backend Google Apps Script; adotar bibliotecas e frameworks livres/gratuitos quando agregarem qualidade e produtividade. | HTML/CSS/JavaScript e Google Apps Script em uso. |
| RQ-TEC-02 | Substituído por decisão posterior | Persistência em uma planilha Google dedicada exclusivamente ao Mukirana; usuários finais nunca terão acesso direto à planilha. Todas as leituras/gravações serão mediadas pelo backend. | A persistência em Google Sheets foi substituída expressamente por Supabase/PostgreSQL; acesso continua mediado pelo backend. |
| RQ-TEC-03 | Substituído por decisão posterior | Firebase/Firestore e Firebase Authentication não integram a stack desta versão, substituídos por Google Sheets e autenticação própria por e-mail. | A stack vigente usa Supabase/PostgreSQL e autenticação própria por e-mail, sem Firebase e sem Supabase Auth. A referência a Google Sheets ficou superada. |
| RQ-TEC-04 | Implementado | Código e recursos de desenvolvimento deverão ser organizados para trabalho incremental por módulos, com Git/GitHub quando configurados; bibliotecas específicas não estão definitivamente selecionadas. | Código modular, Git/GitHub, clasp, testes e versões/implantações do Apps Script em uso. |

### Requisitos não funcionais

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-NFR-01 | Parcial | Projetar desempenho desde a primeira linha: minimizar chamadas a serviços, ler/gravar em lote, processar em memória quando vantajoso, usar cache seletivo e controlar concorrência de gravações. | Há paginação, índices, operações transacionais e controle de concorrência. A listagem unificada compõe até duas RPCs; cache seletivo e avaliação de desempenho com volume real continuam pendentes. |
| RQ-NFR-02 | Implementado | Centralizar o acesso aos dados e as regras financeiras, reduzindo repetição de lógica entre módulos e facilitando eventual migração de armazenamento. | DAOs/RPCs, sessão, valores, período e regras de saldos centralizados para o escopo atual. |
| RQ-NFR-03 | Parcial | Interfaces responsivas, acessíveis por navegador em Windows, Android e Linux, com operações frequentes rápidas, formulários concisos e feedback de processamento e validação. | Interfaces funcionais/responsivas e feedback implementados; testes desktop/celular em Chromium. Faltam refinamento de UX, auditoria completa de acessibilidade e validação ampliada em dispositivos/navegadores. |
| RQ-NFR-04 | Implementado | Não confiar em validações somente de interface. O backend deverá aplicar regras financeiras, permissões, prevenção de duplicidade e verificações de integridade. | Backend/PostgreSQL validam sessão, propriedade, integridade, valores, dependências e versões; não dependem só da interface. |
| RQ-NFR-05 | Parcial | Tratar limites operacionais do Apps Script, da planilha e do envio de e-mails como restrições de capacidade, medindo desempenho e consumo de recursos conforme o crescimento. | Quota de e-mail e limites/reenvios tratados. Faltam medições sistemáticas de capacidade, latência e consumo em escala, agora considerando Supabase. |

### Processo de desenvolvimento

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| RQ-DEV-01 | Diretriz contínua | Desenvolver por sprints verticais de funcionalidades completas, com requisitos, modelagem mínima, interface, backend, persistência, testes e integração na mesma entrega. | Processo incremental com requisitos, modelagem mínima por módulo, implementação, testes e homologação; continuará ao longo do produto. |
| RQ-DEV-02 | Diretriz contínua | Priorizar módulos com menores dependências, sem modelar o banco inteiro antecipadamente; manter visão mínima dos contratos entre módulos para evitar retrabalho. | Processo incremental com requisitos, modelagem mínima por módulo, implementação, testes e homologação; continuará ao longo do produto. |
| RQ-DEV-03 | Implementado | Primeira sprint funcional: Contas Financeiras. Preparação mínima anterior: estrutura Apps Script/Sheets, autenticação e acesso seguro à planilha. | Fundação, autenticação e Contas entregues antes dos demais módulos, com Supabase substituindo a persistência originalmente descrita. |
| RQ-DEV-04 | Diretriz contínua | O avanço pedagógico segue pequenas etapas explicadas, exercícios e verificação de entendimento/funcionamento. Requisitos adicionais podem ser refinados durante a execução. | Processo incremental com requisitos, modelagem mínima por módulo, implementação, testes e homologação; continuará ao longo do produto. |

### Critérios de aceitação — Contas financeiras

| Código | Status | Requisito do levantamento | Evidência / pendência |
| --- | --- | --- | --- |
| CA-CON-01 | Implementado | Usuário autenticado cadastra conta de Consumo, Investimento ou Cartão com nome e saldo inicial opcional. | Critérios do módulo de Contas atendidos, incluindo saldo inicial integrado, proteção de exclusão e concorrência das operações atuais. |
| CA-CON-02 | Implementado | O saldo inicial produz movimentação especial associada à conta e participa dos indicadores conforme a regra acordada. | Critérios do módulo de Contas atendidos, incluindo saldo inicial integrado, proteção de exclusão e concorrência das operações atuais. |
| CA-CON-03 | Implementado | O usuário consulta suas próprias contas e saldos derivados, sem visualizar informações de outros usuários. | Critérios do módulo de Contas atendidos, incluindo saldo inicial integrado, proteção de exclusão e concorrência das operações atuais. |
| CA-CON-04 | Implementado | O usuário renomeia conta, altera tipo com aviso de impacto retroativo e ajusta saldo inicial no local correto. | Critérios do módulo de Contas atendidos, incluindo saldo inicial integrado, proteção de exclusão e concorrência das operações atuais. |
| CA-CON-05 | Implementado | Uma conta sem lançamentos é excluível; uma conta com lançamentos é protegida e apresenta explicação. | Critérios do módulo de Contas atendidos, incluindo saldo inicial integrado, proteção de exclusão e concorrência das operações atuais. |
| CA-CON-06 | Implementado | Leituras e escritas são agrupadas sempre que possível, com testes de consistência e concorrência relevantes ao módulo. | Critérios do módulo de Contas atendidos, incluindo saldo inicial integrado, proteção de exclusão e concorrência das operações atuais. |

## Referências de implementação

- `authentication/AuthService.js`, `AuthDomain.js`, `AuthDao.js`: autenticação/sessões.
- `accounts/AccountService.js`, `AccountDomain.js` e `generated/App.html`: contas e aviso de alteração de tipo.
- `categories/CategoryService.js`, `CategoryClient.html` e migrações de categorias: cadastro/hierarquia/proteções.
- `transactions/EntryService.js`, `EntryDomain.js`, `TransactionClient.html`: lançamento unificado, filtros e paginação.
- `transactions/TransactionDomain.js`, `TransactionService.js`: receitas/despesas únicas e contratos.
- `transfers/TransferService.js` e `supabase/pending/enable_own_account_transfers.sql`: operação financeira já instalada.
- `web/FinanceClient.html`: valores, datas e período em memória.
- `supabase/migrations` e scripts aplicados em `supabase/pending`: regras, sessões próprias, FKs e funções.
- `docs/lancamentos-unicos.md`, `docs/transferencias.md`, `supabase/README.md`: histórico de decisões/validação.
- `tests/backend.test.cjs`, `entries.test.cjs`, `browser_test.py`, `transfers_browser_test.py` e `supabase/checks`: evidências de verificação das entregas anteriores.

## Atualização desta rodada

Parcelamentos e recorrências saíram da lista de implementação pendente. O banco
foi migrado e validado. A lista atual a ser reescrita em cada encerramento está
em `pendencias-requisitos.md`; ela mantém rateios como parte ainda pendente de
RQ-LAN-02. A homologação da entrega atual continua separada da implementação.
