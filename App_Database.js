/**
 * Módulo Global: App_Database.gs
 * Responsabilidade: Conectar o sistema à planilha e fornecer ferramentas universais de leitura e escrita.
 */

/**
 * Estabelece a conexão com o arquivo do banco de dados no Google Drive.
 * @returns {Spreadsheet} O objeto da planilha de banco de dados.
 */
function conectarBanco() {
  // CONFIG_SISTEMA é importada automaticamente do App_Main.gs
  let nomeArquivo = CONFIG_SISTEMA.NOME_BANCO_DADOS;
  let arquivos = DriveApp.getFilesByName(nomeArquivo);
  
  if (arquivos.hasNext()) {
    let arquivo = arquivos.next();
    return SpreadsheetApp.openById(arquivo.getId());
  } else {
    throw new Error("Erro fatal: Banco de dados '" + nomeArquivo + "' não localizado no Google Drive.");
  }
}

/**
 * Lê todos os registros de uma tabela (aba) e converte em um array de objetos (JSON).
 * Transforma magicamente os cabeçalhos (linha 1) nas propriedades de cada registro.
 * @param {string} nomeTabela - O nome da aba na planilha (ex: 'CATEGORIAS').
 * @returns {Array<Object>} Lista de registros formatada para consumo do sistema.
 */
function consultarTabela(nomeTabela) {
  let banco = conectarBanco();
  let aba = banco.getSheetByName(nomeTabela);
  
  if (!aba) {
    throw new Error("Erro de Arquitetura: Tabela '" + nomeTabela + "' não existe no banco de dados.");
  }
  
  let dadosBrutos = aba.getDataRange().getValues();
  
  // Se a tabela possui apenas a linha de cabeçalho, retorna uma lista vazia
  if (dadosBrutos.length <= 1) return [];
  
  let cabecalhos = dadosBrutos[0];
  let registros = [];
  
  // O loop inicia em 1 para pular a linha de títulos
  for (let i = 1; i < dadosBrutos.length; i++) {
    let linha = dadosBrutos[i];
    let registroBase = {};
    
    for (let j = 0; j < cabecalhos.length; j++) {
      let nomeColuna = cabecalhos[j];
      registroBase[nomeColuna] = linha[j];
    }
    
    // Injeta o número real da linha da planilha (útil para futuras atualizações/edições)
    registroBase['_linhaPlanilha'] = i + 1; 
    
    registros.push(registroBase);
  }
  
  return registros;
}