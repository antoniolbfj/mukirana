/**
 * Módulo: Lancamentos_Model.gs
 * Responsabilidade:
 * - Interagir diretamente com a aba LANCAMENTOS.
 * - Manter o contrato de 23 colunas usado pelo banco de dados.
 * - Dar suporte a lançamentos parcelados por meio de ID_Grupo_Parcela,
 *   Numero_Parcela e Total_Parcelas.
 *
 * Colunas da aba LANCAMENTOS:
 * 1. ID_Lancamento
 * 2. Tipo
 * 3. Descricao
 * 4. Valor_Total
 * 5. Data_Ocorrencia
 * 6. Mes_Referencia
 * 7. ID_Categoria
 * 8. Tipo_Origem
 * 9. ID_Origem
 * 10. ID_Destino
 * 11. ID_Projeto
 * 12. Email_Autor
 * 13. Status
 * 14. Criado_Por_ID
 * 15. Data_Criacao
 * 16. Alterado_Por_ID
 * 17. Data_Alteracao
 * 18. ID_Grupo_Parcela
 * 19. Numero_Parcela
 * 20. Total_Parcelas
 * 21. ID_Recorrencia_Origem
 * 22. Modo_Recorrencia_Origem
 * 23. Data_Ocorrencia_Recorrencia
 */


/**
 * Lista todos os lançamentos cadastrados.
 *
 * @returns {Array<Object>} Lançamentos da planilha.
 */
function listarLancamentosModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarLancamentosSupabaseModel_();
  }

  const aba = obterAbaLancamentosModel_();
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) {
    return [];
  }

  const dados = aba.getRange(1, 1, ultimaLinha, 23).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Lancamento: lancLimparTexto_(linha[0]),
      Tipo: lancLimparTexto_(linha[1]),
      Descricao: lancLimparTexto_(linha[2]),
      Valor_Total: lancNormalizarNumero_(linha[3]),
      Data_Ocorrencia: lancNormalizarDataParaInput_(linha[4]),
      Mes_Referencia: lancNormalizarMesReferencia_(linha[5], linha[4]),
      ID_Categoria: lancLimparTexto_(linha[6]),
      Tipo_Origem: lancLimparTexto_(linha[7]),
      ID_Origem: lancLimparTexto_(linha[8]),
      ID_Destino: lancLimparTexto_(linha[9]),
      ID_Projeto: lancLimparTexto_(linha[10]),
      Email_Autor: lancLimparTexto_(linha[11]),
      Status: lancLimparTexto_(linha[12]),
      Criado_Por_ID: lancLimparTexto_(linha[13]),
      Data_Criacao: lancNormalizarDataHoraParaTexto_(linha[14]),
      Alterado_Por_ID: lancLimparTexto_(linha[15]),
      Data_Alteracao: lancNormalizarDataHoraParaTexto_(linha[16]),
      ID_Grupo_Parcela: lancLimparTexto_(linha[17]),
      Numero_Parcela: lancNormalizarInteiro_(linha[18]),
      Total_Parcelas: lancNormalizarInteiro_(linha[19]),
      ID_Recorrencia_Origem: lancLimparTexto_(linha[20]),
      Modo_Recorrencia_Origem: lancLimparTexto_(linha[21]),
      Data_Ocorrencia_Recorrencia: lancLimparTexto_(linha[22])
    });
  }

  return registros;
}


/**
 * Cria ou atualiza um lançamento.
 *
 * @param {Object} lanc Lançamento validado pelo Controller.
 * @returns {string} ID do lançamento salvo.
 */
function salvarLancamentoModel(lanc) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarLancamentoSupabaseModel_(lanc);
  }

  const aba = obterAbaLancamentosModel_();
  const vetor = montarVetorLancamentoModel_(lanc);

  if (lanc._linhaPlanilha) {
    aba.getRange(lanc._linhaPlanilha, 1, 1, 23).setValues([vetor]);
  } else {
    aba.appendRow(vetor);
  }

  return lanc.ID_Lancamento;
}


/**
 * Salva vários lançamentos em uma única operação lógica.
 *
 * Estratégia:
 * - Novos lançamentos consecutivos são inseridos em bloco.
 * - Atualizações continuam usando a linha real preservada pelo Model.
 *
 * @param {Array<Object>} lancamentos Lançamentos validados pelo Controller.
 * @returns {Array<string>} IDs dos lançamentos salvos.
 */
function salvarLancamentosEmLoteModel(lancamentos) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarLancamentosEmLoteSupabaseModel_(lancamentos);
  }

  const aba = obterAbaLancamentosModel_();
  const lista = Array.isArray(lancamentos) ? lancamentos : [];
  const novos = [];
  const ids = [];

  lista.forEach(function(lanc) {
    ids.push(lanc.ID_Lancamento);

    if (lanc._linhaPlanilha) {
      aba.getRange(lanc._linhaPlanilha, 1, 1, 23).setValues([montarVetorLancamentoModel_(lanc)]);
    } else {
      novos.push(montarVetorLancamentoModel_(lanc));
    }
  });

  if (novos.length > 0) {
    const linhaInicial = aba.getLastRow() + 1;
    aba.getRange(linhaInicial, 1, novos.length, 23).setValues(novos);
  }

  return ids;
}


/**
 * Monta o vetor de gravação da aba LANCAMENTOS.
 *
 * @param {Object} lanc Lançamento normalizado.
 * @returns {Array<*>} Linha pronta para escrita.
 */
function montarVetorLancamentoModel_(lanc) {
  return [
    lanc.ID_Lancamento,
    lanc.Tipo,
    lanc.Descricao,
    lanc.Valor_Total,
    lanc.Data_Ocorrencia,
    lanc.Mes_Referencia,
    lanc.ID_Categoria,
    lanc.Tipo_Origem,
    lanc.ID_Origem,
    lanc.ID_Destino || "",
    lanc.ID_Projeto,
    lanc.Email_Autor,
    lanc.Status,
    lanc.Criado_Por_ID,
    lanc.Data_Criacao,
    lanc.Alterado_Por_ID,
    lanc.Data_Alteracao,
    lanc.ID_Grupo_Parcela || "",
    lanc.Numero_Parcela || "",
    lanc.Total_Parcelas || "",
    lanc.ID_Recorrencia_Origem || "",
    lanc.Modo_Recorrencia_Origem || "",
    lanc.Data_Ocorrencia_Recorrencia || ""
  ];
}


/**
 * Exclui definitivamente um lançamento.
 *
 * @param {number} linhaPlanilha Linha real do lançamento na planilha.
 */
function excluirLancamentoModel(linhaPlanilha) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return excluirLancamentoSupabaseModel_(linhaPlanilha);
  }

  const aba = obterAbaLancamentosModel_();
  const linha = parseInt(linhaPlanilha, 10);

  if (isNaN(linha) || linha <= 1) {
    throw new Error("Linha inválida para exclusão de lançamento.");
  }

  aba.deleteRow(linha);
}




/**
 * Exclui definitivamente vários lançamentos pelas linhas reais.
 *
 * As linhas são removidas em ordem decrescente para evitar deslocamento
 * durante a exclusão lógica em lote.
 *
 * @param {Array<number>} linhasPlanilha Linhas reais na aba LANCAMENTOS.
 */
function excluirLancamentosPorLinhasModel(linhasPlanilha) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return excluirLancamentosPorLinhasSupabaseModel_(linhasPlanilha);
  }

  const aba = obterAbaLancamentosModel_();
  const linhas = (linhasPlanilha || [])
    .map(function(linhaPlanilha) {
      const linha = parseInt(linhaPlanilha, 10);

      if (isNaN(linha) || linha <= 1) {
        throw new Error("Linha inválida para exclusão de lançamento.");
      }

      return linha;
    })
    .sort(function(a, b) {
      return b - a;
    });

  linhas.forEach(function(linha) {
    aba.deleteRow(linha);
  });
}


function listarLancamentosSupabaseModel_() {
  return supabaseSelecionar(
    "lancamentos",
    "select=id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,id_categoria,tipo_origem,id_origem,id_destino,id_projeto,email_autor,status,criado_por_id,alterado_por_id,id_grupo_parcela,numero_parcela,total_parcelas,id_recorrencia_origem,modo_recorrencia_origem,data_ocorrencia_recorrencia,created_at,updated_at&order=data_ocorrencia.asc"
  ).map(function(item, indice) {
    return montarLancamentoPlanilhaAPartirSupabase_(item, indice);
  });
}


function salvarLancamentoSupabaseModel_(lanc) {
  const idLancamento = lanc.ID_Lancamento || Utilities.getUuid();
  const registro = montarRegistroLancamentoSupabase_(Object.assign({}, lanc, { ID_Lancamento: idLancamento }));

  supabaseInserir("lancamentos", registro, "resolution=merge-duplicates,return=representation");

  return idLancamento;
}


function salvarLancamentosEmLoteSupabaseModel_(lancamentos) {
  const lista = Array.isArray(lancamentos) ? lancamentos : [];
  const registros = [];
  const ids = [];

  lista.forEach(function(lanc) {
    const idLancamento = lanc.ID_Lancamento || Utilities.getUuid();
    ids.push(idLancamento);
    registros.push(montarRegistroLancamentoSupabase_(Object.assign({}, lanc, { ID_Lancamento: idLancamento })));
  });

  if (registros.length > 0) {
    supabaseInserir("lancamentos", registros, "resolution=merge-duplicates,return=representation");
  }

  return ids;
}


function excluirLancamentoSupabaseModel_(linhaOuIdLancamento) {
  const idLancamento = obterIdLancamentoParaAlteracaoSupabase_(linhaOuIdLancamento);

  if (!idLancamento) {
    throw new Error("Lancamento nao encontrado para exclusao no Supabase.");
  }

  supabaseExcluir("lancamentos", "id_lancamento=eq." + encodeURIComponent(idLancamento));
}


function excluirLancamentosPorLinhasSupabaseModel_(linhasPlanilha) {
  (linhasPlanilha || []).forEach(function(linhaOuIdLancamento) {
    excluirLancamentoSupabaseModel_(linhaOuIdLancamento);
  });
}


function montarRegistroLancamentoSupabase_(lanc) {
  const agora = new Date().toISOString();

  return {
    id_lancamento: lanc.ID_Lancamento,
    tipo: lanc.Tipo,
    descricao: lanc.Descricao,
    valor_total: lancNormalizarNumero_(lanc.Valor_Total),
    data_ocorrencia: converterDataSupabase_(lanc.Data_Ocorrencia),
    mes_referencia: converterDataSupabase_(lanc.Mes_Referencia || lanc.Data_Ocorrencia),
    id_categoria: lanc.ID_Categoria || null,
    tipo_origem: lanc.Tipo_Origem,
    id_origem: lanc.ID_Origem,
    id_destino: lanc.ID_Destino || null,
    id_projeto: lanc.ID_Projeto || null,
    email_autor: lanc.Email_Autor || null,
    status: lanc.Status,
    criado_por_id: lanc.Criado_Por_ID,
    alterado_por_id: lanc.Alterado_Por_ID || null,
    id_grupo_parcela: lanc.ID_Grupo_Parcela || null,
    numero_parcela: lanc.Numero_Parcela || null,
    total_parcelas: lanc.Total_Parcelas || null,
    id_recorrencia_origem: lanc.ID_Recorrencia_Origem || null,
    modo_recorrencia_origem: lanc.Modo_Recorrencia_Origem || null,
    data_ocorrencia_recorrencia: converterDataSupabase_(lanc.Data_Ocorrencia_Recorrencia),
    created_at: converterDataHoraSupabase_(lanc.Data_Criacao) || agora,
    updated_at: converterDataHoraSupabase_(lanc.Data_Alteracao)
  };
}


function montarLancamentoPlanilhaAPartirSupabase_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Lancamento: item.id_lancamento || "",
    Tipo: item.tipo || "",
    Descricao: item.descricao || "",
    Valor_Total: lancNormalizarNumero_(item.valor_total),
    Data_Ocorrencia: lancNormalizarDataParaInput_(item.data_ocorrencia),
    Mes_Referencia: lancNormalizarMesReferencia_(item.mes_referencia, item.data_ocorrencia),
    ID_Categoria: item.id_categoria || "",
    Tipo_Origem: item.tipo_origem || "",
    ID_Origem: item.id_origem || "",
    ID_Destino: item.id_destino || "",
    ID_Projeto: item.id_projeto || "",
    Email_Autor: item.email_autor || "",
    Status: item.status || "",
    Criado_Por_ID: item.criado_por_id || "",
    Data_Criacao: item.created_at || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Alteracao: item.updated_at || "",
    ID_Grupo_Parcela: item.id_grupo_parcela || "",
    Numero_Parcela: lancNormalizarInteiro_(item.numero_parcela),
    Total_Parcelas: lancNormalizarInteiro_(item.total_parcelas),
    ID_Recorrencia_Origem: item.id_recorrencia_origem || "",
    Modo_Recorrencia_Origem: item.modo_recorrencia_origem || "",
    Data_Ocorrencia_Recorrencia: item.data_ocorrencia_recorrencia || ""
  };
}


function obterIdLancamentoParaAlteracaoSupabase_(linhaOuIdLancamento) {
  const texto = lancLimparTexto_(linhaOuIdLancamento);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const lancamento = listarLancamentosSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return lancamento ? lancamento.ID_Lancamento : "";
}


/**
 * Obtém a aba LANCAMENTOS e valida sua existência.
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Aba LANCAMENTOS.
 */
function obterAbaLancamentosModel_() {
  const banco = conectarBanco();
  const aba = banco.getSheetByName("LANCAMENTOS");

  if (!aba) {
    throw new Error("Aba LANCAMENTOS não encontrada no banco de dados.");
  }

  garantirEstruturaLancamentosModel_(aba);
  return aba;
}


function garantirEstruturaLancamentosModel_(aba) {
  const cabecalhosEsperados = [
    "ID_Lancamento",
    "Tipo",
    "Descricao",
    "Valor_Total",
    "Data_Ocorrencia",
    "Mes_Referencia",
    "ID_Categoria",
    "Tipo_Origem",
    "ID_Origem",
    "ID_Destino",
    "ID_Projeto",
    "Email_Autor",
    "Status",
    "Criado_Por_ID",
    "Data_Criacao",
    "Alterado_Por_ID",
    "Data_Alteracao",
    "ID_Grupo_Parcela",
    "Numero_Parcela",
    "Total_Parcelas",
    "ID_Recorrencia_Origem",
    "Modo_Recorrencia_Origem",
    "Data_Ocorrencia_Recorrencia"
  ];
  const cabecalhosTransicao = [
    "ID_Lancamento",
    "Tipo",
    "Descricao",
    "Valor_Total",
    "Data_Ocorrencia",
    "Mes_Referencia",
    "ID_Categoria",
    "Tipo_Origem",
    "ID_Origem",
    "ID_Destino",
    "ID_Projeto",
    "Email_Autor",
    "Status",
    "Criado_Por_ID",
    "Data_Criacao",
    "Alterado_Por_ID",
    "Data_Alteracao",
    "ID_Grupo_Parcela",
    "Numero_Parcela",
    "Total_Parcelas"
  ];
  const cabecalhosAntigos = [
    "ID_Lancamento",
    "Tipo",
    "Descricao",
    "Valor_Total",
    "Data_Ocorrencia",
    "Mes_Referencia",
    "ID_Categoria",
    "Tipo_Origem",
    "ID_Origem",
    "ID_Projeto",
    "Email_Autor",
    "Status",
    "Criado_Por_ID",
    "Data_Criacao",
    "Alterado_Por_ID",
    "Data_Alteracao",
    "ID_Grupo_Parcela",
    "Numero_Parcela",
    "Total_Parcelas"
  ];

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();

  if (ultimaLinha === 0 || ultimaColuna === 0) {
    aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
    return;
  }

  const cabecalhosAtuais = aba.getRange(1, 1, 1, Math.max(ultimaColuna, cabecalhosEsperados.length)).getValues()[0];

  if (lancCabecalhosIguais_(cabecalhosAtuais, cabecalhosEsperados)) {
    return;
  }

  if (lancCabecalhosIguais_(cabecalhosAtuais, cabecalhosTransicao)) {
    migrarLancamentosParaEstruturaAtual_(aba, ultimaLinha, cabecalhosTransicao.length, function(linha) {
      return [
        linha[0],
        linha[1],
        linha[2],
        linha[3],
        linha[4],
        linha[5],
        linha[6],
        linha[7],
        linha[8],
        linha[9],
        linha[10],
        linha[11],
        linha[12],
        linha[13],
        linha[14],
        linha[15],
        linha[16],
        linha[17],
        linha[18],
        linha[19],
        "",
        "",
        ""
      ];
    }, cabecalhosEsperados);
    return;
  }

  if (lancCabecalhosIguais_(cabecalhosAtuais, cabecalhosAntigos)) {
    migrarLancamentosParaEstruturaAtual_(aba, ultimaLinha, cabecalhosAntigos.length, function(linha) {
      return [
        linha[0],
        linha[1],
        linha[2],
        linha[3],
        linha[4],
        linha[5],
        linha[6],
        linha[7],
        linha[8],
        "",
        linha[9],
        linha[10],
        linha[11],
        linha[12],
        linha[13],
        linha[14],
        linha[15],
        linha[16],
        linha[17],
        linha[18],
        "",
        "",
        ""
      ];
    }, cabecalhosEsperados);
    return;
  }

  throw new Error("A aba LANCAMENTOS possui uma estrutura incompatível. Revise os cabeçalhos antes de continuar.");
}


function lancCabecalhosIguais_(atuais, esperados) {
  if (!atuais || !esperados || atuais.length < esperados.length) {
    return false;
  }

  return esperados.every(function(nome, indice) {
    return lancLimparTexto_(atuais[indice]) === nome;
  });
}


function migrarLancamentosParaEstruturaAtual_(aba, ultimaLinha, totalColunasOrigem, transformadorLinha, cabecalhosEsperados) {
  if (ultimaLinha <= 1) {
    aba.clear();
    aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
    return;
  }

  const dadosOrigem = aba.getRange(1, 1, ultimaLinha, totalColunasOrigem).getValues();
  const dadosMigrados = [cabecalhosEsperados];

  for (let i = 1; i < dadosOrigem.length; i++) {
    dadosMigrados.push(transformadorLinha(dadosOrigem[i]));
  }

  aba.clear();
  aba.getRange(1, 1, dadosMigrados.length, cabecalhosEsperados.length).setValues(dadosMigrados);
}


/**
 * Normaliza data para input HTML yyyy-MM-dd.
 *
 * @param {*} valor Valor original.
 * @returns {string} Data normalizada.
 */
function lancNormalizarDataParaInput_(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  const texto = valor.toString().trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const dataBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (dataBr) {
    return dataBr[3] + "-" + dataBr[2] + "-" + dataBr[1];
  }

  return texto;
}


/**
 * Normaliza mês de referência para yyyy-MM.
 *
 * Observação:
 * - Algumas planilhas podem guardar Mes_Referencia como Date.
 * - A tela e o Controller filtram por yyyy-MM, então o Model padroniza o retorno.
 *
 * @param {*} mesReferencia Valor da coluna Mes_Referencia.
 * @param {*} dataOcorrencia Valor da coluna Data_Ocorrencia para fallback.
 * @returns {string} Mês normalizado.
 */
function lancNormalizarMesReferencia_(mesReferencia, dataOcorrencia) {
  const mesDireto = lancExtrairMesReferenciaDeValor_(mesReferencia);

  if (mesDireto) {
    return mesDireto;
  }

  return lancExtrairMesReferenciaDeValor_(dataOcorrencia);
}


/**
 * Extrai yyyy-MM de Date ou texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Mês yyyy-MM ou vazio.
 */
function lancExtrairMesReferenciaDeValor_(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );
  }

  const texto = valor.toString().trim();

  if (/^\d{4}-\d{2}$/.test(texto)) {
    return texto;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.substring(0, 7);
  }

  const dataBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (dataBr) {
    return dataBr[3] + "-" + dataBr[2];
  }

  return "";
}


/**
 * Normaliza data/hora para texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Data/hora textual.
 */
function lancNormalizarDataHoraParaTexto_(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      "dd/MM/yyyy HH:mm:ss"
    );
  }

  return valor.toString();
}


/**
 * Normaliza número.
 *
 * @param {*} valor Valor original.
 * @returns {number} Número normalizado.
 */
function lancNormalizarNumero_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  if (typeof valor === "number") {
    return valor;
  }

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


/**
 * Normaliza inteiro positivo usado em metadados de parcelamento.
 *
 * @param {*} valor Valor original.
 * @returns {number|string} Inteiro positivo ou string vazia.
 */
function lancNormalizarInteiro_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";

  const numero = parseInt(valor, 10);

  if (isNaN(numero) || numero <= 0) {
    return "";
  }

  return numero;
}


/**
 * Normaliza texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Texto normalizado.
 */
function lancLimparTexto_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}
