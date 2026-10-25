# UX e temas — entrega

Produção e avaliação publicadas na **versão 44**, com 72 arquivos idênticos ao
commit `059abf1`, conferidos por clonagem da versão imutável.

A correção de participações foi concluída primeiro, no commit 86ff85e e na versão
imutável 42. Esta etapa seguinte moderniza somente apresentação e preferência
visual: nenhum controller, modelo, regra financeira, contrato de escrita, sessão
ou migração recebeu alterações adicionais. A comparação dos arquivos `.js` e
`supabase/` com o commit da correção é vazia.

## Aparência e componentes

Três temas completos — Claro, Escuro e Sépia — com tokens comuns de fundo,
superfície, texto, borda, destaque, sucesso, aviso, erro e foco. Tipografia comum,
valores tabulares, cartões mais leves, componentes de formulário consistentes,
contraste e movimento reduzido. Imagens mantêm suas cores originais.

Computadores amplos têm navegação lateral estável. Tablets usam a navegação
recolhível. Smartphones mantêm seus templates dedicados, gaveta e formulários de
tela inteira/folha inferior; as áreas seguras são respeitadas. Período e saldo
continuam na região global; filtros, dados e duas opções de saída não mudam.

Seletores de tema ficam na barra e no menu. O perfil orienta a usar esse seletor;
o campo antigo permanece preservado internamente, sem oferecer duas opções
concorrentes na interface. A escolha é salva para o usuário
**neste navegador**; permanece após navegação e recarregamento. A preferência do
perfil existente é usada quando não há escolha local. O tema Sépia não amplia o
enum do banco nem altera APIs de usuário; esta preferência visual não é sincronizada
entre dispositivos. Ao trocar usuário, a escolha de outro usuário não é aplicada.

Painel e Lançamentos isolados recebem somente o nome validado do tema, com
verificação da janela remetente. Credenciais permanecem no contêiner. Trocar tema
não chama RPC, não recarrega dados e não recria formulários. Labels residuais de
protótipo/avaliação foram removidos dos cartões homologados.

As telas legadas recebem a paleta e os estilos comuns. Seus fluxos de cadastro,
autenticação, permissões e regras existentes não foram reescritos nesta etapa.
Relatórios por e-mail também não foram alterados.

## Proposta, protótipo e validação

- [Proposta](proposta-ux-tres-temas.md).
- [Protótipo HTML interativo](prototipos/ux-temas.html), independente e com dados
  fictícios identificados. Demonstra os temas, navegação e detalhes em layouts
  próprios; não se conecta ao banco.
- `tests/ux-temas-browser.py`: nove combinações de dispositivo/tema, usando as
  interfaces e controllers reais e o PostgreSQL fictício. Verifica as telas de
  Painel, Contas, Cartões e Lançamentos; preferência por usuário; fallback do
  perfil; navegação/reload; sincronização de iframe; teclado; contraste mínimo de
  texto 4,5:1; preenchimento e rotação; saída/rascunho; valores iguais; ausência de
  RPC ao trocar tema, de overflow de página e de erros JavaScript.
- As regras de categorias corrigidas passaram novamente após a etapa visual.
  Sintaxe de todos os arquivos JS/HTML validada. Arquivos com CRLF mantêm esse
  formato; a conferência de whitespace usa `git -c core.whitespace=cr-at-eol diff --check`.
- Homologação de uso com a conta Google continua pendente. O teste HTTP do Apps
  Script confirma o acesso à página de autenticação; não equivale a navegar no
  sistema com uma sessão Google real.

Reprodução local: `MUKIRANA_TEST_DB=rateios_v4_browser python tests/ux-temas-browser.py`.
Preparação do PostgreSQL fictício em `tests/rateios-v4-upgrade.py`; a migração v5 é
aplicada após a base v4. Publicação, commits e hashes estão em `ux-categorias-publicacao.json`.
