/**
 * Módulo Global: App_Main.gs
 * Responsabilidade: Ponto de entrada do aplicativo Mukirana e configurações globais.
 */

// Constantes Globais do Sistema
const CONFIG_SISTEMA = {
  NOME_APP: "Mukirana",
  PASTA_RAIZ: "App Mukirana",
  NOME_BANCO_DADOS: "bd_app_mukirana",
  ID_ICONE_DRIVE: "1nTuZhntAqev5aN9pyDISRZkqYh1DYoax" // Cole apenas o ID da imagem do Google Drive aqui
};

/**
 * Função obrigatória do Google Apps Script para renderizar a interface web.
 */
function doGet(e) {
  try {
    // Tenta montar a interface normalmente
    let html = HtmlService.createTemplateFromFile('Index');

    html.urlIconeDinamico = "https://drive.google.com/uc?export=view&id=" + CONFIG_SISTEMA.ID_ICONE_DRIVE;

    return html.evaluate()
      .setTitle(CONFIG_SISTEMA.NOME_APP)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  } catch (erro) {
    // SE O SERVIDOR QUEBRAR, ELE DESENHA O ERRO NA TELA EM VEZ DE FICAR EM BRANCO!
    let telaDeErro = `
      <div style="padding: 50px; font-family: sans-serif; text-align: center; background-color: #F8F9FA; height: 100vh;">
        <h1 style="color: #D32F2F;">⚠️ Erro Fatal no Servidor</h1>
        <p style="font-size: 18px; color: #555;">O Google Apps Script não conseguiu montar a página inicial.</p>
        <div style="background: #FFFFFF; padding: 25px; border-radius: 8px; margin-top: 20px; color: #333; display: inline-block; text-align: left; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-left: 5px solid #D32F2F;">
          <h3 style="margin-top: 0;">Motivo do Erro:</h3>
          <code style="font-size: 16px; color: #D32F2F;">${erro.message}</code>
        </div>
      </div>
    `;
    return HtmlService.createHtmlOutput(telaDeErro);
  }
}

/**
 * Função utilitária para injetar arquivos HTML parciais dentro do principal.
 * @param {string} nomeArquivo - O nome do arquivo .html a ser incluído.
 * @returns {string} - O conteúdo bruto do arquivo lido.
 */
function incluir_(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}

/**
 * Roteador principal do sistema
 */
function obterHtmlDaTela(nomeTela, tokenSessao) {
  try {
    // A tela de Login é pública.
    // Todas as outras exigem sessão válida no servidor.
    if (nomeTela !== 'Login') {
      obterSessaoObrigatoria(tokenSessao);
    }

    if (nomeTela === 'Usuarios') return incluir_('Usuarios_View');
    // Contas homologada; a rota anterior fica como alias para acessos já abertos.
    if (nomeTela === 'Contas' || nomeTela === 'ContasNova') return HtmlService.createTemplateFromFile('Contas_Nova_View').evaluate().getContent();
    if (nomeTela === 'Cartoes') return incluir_('Cartoes_View');
    if (nomeTela === 'Categorias') return incluir_('Categorias_View');
    if (nomeTela === 'Dashboard') return incluir_('Dashboard_View');
    if (nomeTela === 'FaturasCartao') return incluir_('Faturas_Cartao_View');
    if (nomeTela === 'Orcamentos') return incluir_('Orcamentos_View');
    if (nomeTela === 'Recorrencias') return incluir_('Recorrencias_View');
    if (nomeTela === 'Login') return incluir_('Login_View');
    if (nomeTela === 'Projetos') return incluir_('Projetos_View');
    if (nomeTela === 'Lancamentos') return incluir_('Lancamentos_View');

    return "<div style='padding: 30px;'><h2>Em construção: " + nomeTela + "</h2></div>";

  } catch (erro) {
    throw new Error("Erro ao carregar a tela '" + nomeTela + "': " + erro.message);
  }
}
