# Proposta da nova tela de Contas

Data: 24/10/2026. Estado: proposta aprovada para implementação; tela conectada implementada e aguardando homologação.
A entrega e a validação da aplicação estão em [contas-entrega.md](contas-entrega.md).

O usuário definiu simplicidade, rapidez, objetividade e uma experiência limpa.
Também definiu que o saldo inicial deve ser um lançamento especial chamado
“Saldo Inicial da Conta [nome da conta]”. A criação por menu provisório e a troca
da tela principal somente após homologação permanecem como processo de entrega.
O usuário também definiu como obrigatório construir uma interface dedicada a
computadores/tablets e outra especialmente construída para smartphones.
As demais regras descritas aqui são recomendações para avaliação.

## Material para avaliar

- [Prévia para computadores e tablets](prototipos/contas-grandes.html).
- [Prévia para smartphones](prototipos/contas-smartphone.html).
- [Entrada com seleção automática da interface](prototipos/contas.html).
- [Lista em desktop](prototipos/contas-desktop.png).
- [Cadastro com saldo inicial](prototipos/contas-cadastro.png).
- [Lista no celular](prototipos/contas-mobile.png).
- [Cadastro no celular](prototipos/contas-mobile-cadastro.png).
- [Interface grande no tablet](prototipos/contas-tablet.png).
- [Menu de ações do smartphone](prototipos/contas-mobile-acoes.png).

O protótipo contém dados fictícios e funciona somente na memória do navegador.
Pode-se buscar, filtrar, cadastrar, editar, informar saldo positivo/negativo,
escolher participantes, consultar lançamentos, inativar e desfazer. Recarregar
restaura os exemplos. Não usa sessão, Apps Script ou Supabase e não representa
uma medição de desempenho da aplicação real.

Passaram 12 verificações de navegador, cobrindo separadamente as duas interfaces,
cadastro/edição do saldo especial, permissões de consulta, ações próprias,
inativação/Desfazer, rascunho preservado na rotação, tablets em ambas as orientações
e as prévias independentes, sem erros JavaScript. Essa verificação não substitui
os testes de integração futuros com Apps Script e Supabase.

## Duas interfaces dedicadas — obrigatório

Cada interface tem estrutura própria de listagem, formulário e histórico. A
interface de smartphone inclui navegação e menu de ações próprios. Os templates
são distintos; somente o correspondente ao modo escolhido é montado no documento.
As prévias independentes permitem avaliar cada interface diretamente.

| Experiência | Computadores e tablets | Smartphones |
| --- | --- | --- |
| Lista | Linhas alinhadas para comparar contas e valores | Cartões próprios, com nome, saldo e acesso aos lançamentos |
| Ação principal | Nova conta no cabeçalho | Nova conta na área inferior, ao alcance do polegar |
| Filtro de status | Seletor compacto junto à busca | Botões Ativas / Todas / Inativas com área de toque |
| Ações da conta | Menu junto à linha | Painel de ações que abre pela parte inferior |
| Cadastro/edição | Painel lateral, mantendo a lista como contexto | Tela inteira com Voltar no topo e uma ação principal de salvar na base |
| Saldo inicial | Valor e data lado a lado | Campos em sequência, valor destacado e escolha de sinal com botões de toque |
| Compartilhamento | Seleção dentro do painel lateral | Seleção em linhas maiores, apropriadas para toque |
| Histórico | Painel lateral | Tela inteira com navegação de retorno |
| Interação | Mouse/teclado e controles de toque adequados ao tablet | Uso por toque, teclado apropriado ao campo e proteção das áreas de rolagem |

O desenho de computadores/tablets se adapta à orientação e ao espaço desses
dispositivos. O desenho de smartphone mantém sua própria navegação ao rotacionar,
preservando os dados já preenchidos. A seleção automática considera identificação
do dispositivo e modo de interação; as prévias explícitas fixam a interface para
avaliação. Na implementação conectada, validar a seleção nos dispositivos suportados.

Compartilhar contratos, validações, permissões, regras financeiras, estado dos
dados e identidade visual. A escolha da interface é uma apresentação do mesmo
cadastro e não participa da autorização. O menu provisório de Contas deve abrir
a interface apropriada, e ambas precisam ser avaliadas antes da troca da tela principal.

## Lista: uma leitura rápida

Um cabeçalho com “Contas” e ação principal “Nova conta”. Uma faixa de resumo
mostra saldo atual e previsão até uma data explícita. Os totais acompanham as
contas da lista e isso é informado junto do valor; compartilhadas são identificadas.

Abaixo, busca imediata por nome/proprietário e filtro Ativas / Todas / Inativas.
Ativas é o padrão. Usar o período global existente na implementação, sem repetir
campos de período na tela. O protótipo fixa outubro/2026 para demonstrar o desenho.

Cada linha exibe somente:

1. Nome e identificação curta: individual/compartilhada e proprietário.
2. Saldo atual em destaque e previsão em texto secundário.
3. “Ver lançamentos” e menu de ações secundárias, conforme permissão.

O saldo inicial sai da coluna principal e passa a aparecer no histórico e no
cadastro. No smartphone, a listagem é construída como cartões próprios, com
hierarquia e ações de toque, sem rolagem horizontal.
Textos de ajuda e previsões detalhadas ficam perto da informação ou na abertura
dos lançamentos. A pessoa não precisa ler um texto introdutório longo para agir.

“Saldo atual” significa movimentos efetivos datados até hoje. A previsão soma o
que está previsto até o limite escolhido, sem duplicar ocorrências efetivadas.
Ao consultar períodos históricos, o rótulo deve mudar para “Saldo em [data]”.
A mudança dessa semântica em relação à tela antiga deve ser validada com os
cálculos e os filtros, conforme o estudo técnico.

## Cadastro e edição

Computadores e tablets usam um formulário lateral, mantendo a lista como
contexto. Smartphones usam formulário próprio em tela inteira: navegação de
retorno no topo, campos em sequência e salvamento na parte inferior. O campo
inicial é o nome; saldo inicial e compartilhamento são seções opcionais nas duas
interfaces, abertas quando utilizadas.

- Foco no primeiro campo, validação junto ao formulário e valor em reais.
- Valor positivo ou negativo por escolha explícita; a cor não é o único sinal.
- Compartilhamento: busca/seleção de participantes carregada somente ao abrir a seção.
- Ação principal Criar conta / Salvar alterações e ação Cancelar.
- Ao editar o saldo inicial, mostrar o lançamento e a consequência da alteração antes de salvar.
- Em falha de gravação real, preservar o preenchimento e permitir nova tentativa sem duplicação.
- Inativação reversível com aviso e ação Desfazer; restauração pelo filtro de inativas.
- Participante consulta e usa a conta conforme as permissões existentes; só o dono altera cadastro, saldo inicial e compartilhamento.

O protótipo usa dois participantes fictícios para demonstrar a seleção. Os
estados de gravação remota e pesquisa de participantes serão implementados
quando a tela for conectada.

## Saldo inicial como lançamento especial

Recomendo as seguintes regras:

| Item | Comportamento proposto |
| --- | --- |
| Descrição | Automática e exata: `Saldo Inicial da Conta [nome da conta]` |
| Valor | Saldo positivo ou negativo; sem valor/zero não gera movimento financeiro |
| Data | Data a que o saldo se refere; sugerir hoje para uma nova conta e permitir correção |
| Conta | Vínculo estável com a conta, independente do nome da descrição |
| Unicidade | No máximo um lançamento de saldo inicial vigente por conta |
| Efeito financeiro | Compõe saldo e patrimônio a partir da data informada |
| Receitas/despesas | Fica fora dos totais operacionais, orçamento e resultado de receitas menos despesas |
| Classificação | Identificação interna especial; sem categoria manual, rateio, parcelamento ou recorrência |
| Edição | Atualiza o mesmo lançamento, preservando seu ID, sem gerar outro |
| Renomear conta | Atualiza a descrição automática, preservando o vínculo e o ID |
| Remover saldo inicial | Remove seu efeito financeiro; mantém conta e demais lançamentos |
| Acesso | Proprietário altera; demais acessos seguem as permissões de consulta |

Na lista de lançamentos, deve aparecer com identificação “Saldo inicial”. A ação
de ajuste encaminha ao cadastro da conta para que ambos permaneçam coerentes.
O formulário comum de lançamento não oferece a criação manual desse registro.
Datas futuras passam a afetar o saldo quando chegarem, compondo antes a previsão.

Exemplo: conta Carteira com R$ 180,00 em 01/10 gera **Saldo Inicial da Conta
Carteira**, no valor de R$ 180,00. O saldo da conta aumenta em R$ 180,00 e o total
de receitas continua inalterado. Se corrigir o saldo para R$ 150,00, o mesmo
lançamento passa a R$ 150,00.

## Contas existentes e compatibilidade

O usuário definiu que a migração usa a data do lançamento mais antigo de cada
conta, incluindo transferências recebidas. Sem lançamentos, usa a data de criação
do cadastro, no fuso America/Sao_Paulo. Essa decisão substitui a questão pendente
da proposta inicial. A conversão foi aplicada e conferida em 24/10/2026.

A implementação precisa assegurar:

- Migração que possa ser retomada sem gerar dois saldos iniciais para a mesma conta.
- Um único efeito financeiro: não somar o campo antigo e o novo lançamento.
- Conta, lançamento e participantes gravados de forma atômica e com verificação de edição concorrente.
- Compatibilidade com as operações da tela antiga durante a avaliação da nova.
- Coerência em Contas, Dashboard, Lançamentos, relatórios e demais cálculos que hoje leem o campo antigo.
- Conferência dos saldos antes/depois, incluindo contas inativas, compartilhadas e valores negativos.

A coluna antiga não deve ser descartada antes de adaptar e verificar todos os
consumidores. A etapa visual pode ser avaliada antes de converter dados reais.
A migração aplicada e os testes estão documentados na entrega. Os arquivos de protótipo continuam sendo demonstrações locais com dados fictícios.

## Rapidez e componentes

Separar consulta da lista/resumo de dados necessários somente ao formulário.
Buscar somente informações autorizadas e úteis à tela, evitando carregar os
pacotes amplos de cadastros e bloquear a lista pela consulta de participantes.
Reutilizar os resultados já carregados para busca e status quando isso couber
no volume de contas. Na aplicação real, medir tempo até a primeira lista útil e
tempo de gravação em vez de presumir ganho apenas pela mudança visual.

Componentes por interface: busca, filtro de status, linha comparativa ou cartão,
menu junto à linha ou painel inferior, formulário lateral ou tela inteira.
Compartilhar controles básicos de entrada monetária, escolha de sinal, data, seleção de pessoas,
prévia do lançamento, estados de carregamento/erro/vazio e aviso com Desfazer.
Manter navegação por teclado, foco e contraste nos estados relevantes.

O acesso real deve incluir o tratamento da autorização identificado no estudo;
uma View nova não resolve sozinha funções públicas/RPCs com permissões amplas.

## Entrega proposta

1. Avaliar a aparência, os fluxos e as regras acima por este protótipo.
2. Ajustar a proposta e definir a data dos saldos legados e o escopo dos pontos técnicos.
3. Implementar as duas interfaces conectadas por “Contas (nova)”, com componentes e funções isolados da tela atual.
4. Validar permissões, gravações, migração/compatibilidade, filtros, saldos e navegação em computadores, tablets e smartphones, incluindo rotação e dados preenchidos.
5. Depois da homologação explícita, substituir a tela principal e retirar o menu provisório.
