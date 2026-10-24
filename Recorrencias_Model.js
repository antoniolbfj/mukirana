/**
 * Módulo: Recorrencias_Model.gs
 * Responsabilidade:
 * - Ler e gravar a aba RECORRENCIAS.
 * - Ler e gravar a aba RECORRENCIAS_RATEIOS.
 * - Migrar estruturas antigas quando a aba ainda estiver vazia ou sem dados úteis.
 */


/**
 * Lista todas as recorrências cadastradas.
 *
 * @returns {Array<Object>} Recorrências da planilha.
 */
function listarRecorrenciasModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarRecorrenciasSupabaseModel_();
  }

  const aba = obterAbaRecorrenciasModel_();
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) {
    return [];
  }

  const dados = aba.getRange(1, 1, ultimaLinha, 22).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Recorrencia: recNormalizarTextoModel_(linha[0]),
      ID_Usuario: recNormalizarTextoModel_(linha[1]),
      Descricao: recNormalizarTextoModel_(linha[2]),
      Tipo: recNormalizarTextoModel_(linha[3]),
      Valor_Base: recNormalizarNumeroModel_(linha[4]),
      Data_Inicio: recNormalizarDataModel_(linha[5]),
      Periodicidade_Tipo: recNormalizarTextoModel_(linha[6]),
      Intervalo_Dias: recNormalizarInteiroModel_(linha[7]),
      Modo_Geracao: recNormalizarTextoModel_(linha[8]),
      Status_Recorrencia: recNormalizarTextoModel_(linha[9]),
      Tipo_Origem: recNormalizarTextoModel_(linha[10]),
      ID_Origem: recNormalizarTextoModel_(linha[11]),
      ID_Destino: recNormalizarTextoModel_(linha[12]),
      ID_Categoria: recNormalizarTextoModel_(linha[13]),
      ID_Projeto: recNormalizarTextoModel_(linha[14]),
      Status_Lancamento: recNormalizarTextoModel_(linha[15]),
      Observacao: recNormalizarTextoModel_(linha[16]),
      Info_Bloqueio: recNormalizarTextoModel_(linha[17]),
      Data_Criacao: recNormalizarDataHoraModel_(linha[18]),
      Data_Alteracao: recNormalizarDataHoraModel_(linha[19]),
      Criado_Por_ID: recNormalizarTextoModel_(linha[20]),
      Alterado_Por_ID: recNormalizarTextoModel_(linha[21])
    });
  }

  return registros;
}


/**
 * Salva uma recorrência nova ou existente.
 *
 * @param {Object} recorrencia Recorrência validada pelo Controller.
 * @returns {string} ID salvo.
 */
function salvarRecorrenciaModel(recorrencia) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarRecorrenciaSupabaseModel_(recorrencia);
  }

  const aba = obterAbaRecorrenciasModel_();
  const vetor = montarVetorRecorrenciaModel_(recorrencia);

  if (recorrencia._linhaPlanilha) {
    aba.getRange(recorrencia._linhaPlanilha, 1, 1, 22).setValues([vetor]);
  } else {
    aba.appendRow(vetor);
  }

  return recorrencia.ID_Recorrencia;
}


/**
 * Lista as linhas de rateio configuradas em recorrências.
 *
 * @returns {Array<Object>} Itens de rateio das recorrências.
 */
function listarRecorrenciasRateiosModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarRecorrenciasRateiosSupabaseModel_();
  }

  const aba = obterAbaRecorrenciasRateiosModel_();
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) {
    return [];
  }

  const dados = aba.getRange(1, 1, ultimaLinha, 10).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Recorrencia_Rateio: recNormalizarTextoModel_(linha[0]),
      ID_Recorrencia: recNormalizarTextoModel_(linha[1]),
      ID_Usuario_Responsavel: recNormalizarTextoModel_(linha[2]),
      Valor_Rateado: recNormalizarNumeroModel_(linha[3]),
      Percentual: recNormalizarNumeroModel_(linha[4]),
      Observacao: recNormalizarTextoModel_(linha[5]),
      Modo_Rateio: recNormalizarTextoModel_(linha[6]),
      Data_Criacao: recNormalizarDataHoraModel_(linha[7]),
      Data_Alteracao: recNormalizarDataHoraModel_(linha[8]),
      Criado_Por_ID: recNormalizarTextoModel_(linha[9])
    });
  }

  return registros;
}


/**
 * Substitui fisicamente o conjunto de participantes de rateio de uma recorrência.
 *
 * @param {string} idRecorrencia ID da recorrência.
 * @param {Array<Object>} itens Itens já validados pelo Controller.
 */
function substituirRecorrenciasRateiosModel(idRecorrencia, itens) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return substituirRecorrenciasRateiosSupabaseModel_(idRecorrencia, itens);
  }

  const aba = obterAbaRecorrenciasRateiosModel_();
  const id = recNormalizarTextoModel_(idRecorrencia);

  if (!id) {
    throw new Error("ID da recorrência não informado para salvar o rateio.");
  }

  const existentes = listarRecorrenciasRateiosModel()
    .filter(function(item) {
      return item.ID_Recorrencia === id;
    })
    .map(function(item) {
      return item._linhaPlanilha;
    })
    .sort(function(a, b) {
      return b - a;
    });

  existentes.forEach(function(linhaPlanilha) {
    aba.deleteRow(linhaPlanilha);
  });

  if (!itens || itens.length === 0) {
    return;
  }

  const linhas = itens.map(function(item) {
    return [
      item.ID_Recorrencia_Rateio,
      item.ID_Recorrencia,
      item.ID_Usuario_Responsavel,
      item.Valor_Rateado,
      item.Percentual,
      item.Observacao,
      item.Modo_Rateio,
      item.Data_Criacao,
      item.Data_Alteracao,
      item.Criado_Por_ID
    ];
  });

  const linhaInicial = aba.getLastRow() + 1;
  aba.getRange(linhaInicial, 1, linhas.length, 10).setValues(linhas);
}


function listarRecorrenciasOcorrenciasModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarRecorrenciasOcorrenciasSupabaseModel_();
  }

  return [];
}


function marcarOcorrenciaRecorrenciaComoGeradaModel(ocorrencia) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return marcarOcorrenciaRecorrenciaComoGeradaSupabaseModel_(ocorrencia);
  }

  return ocorrencia;
}


/**
 * Persiste lancamento, rateios e ocorrencia como uma unica unidade logica.
 *
 * No Supabase a gravacao e delegada a uma RPC transacional. Na planilha, o
 * LockService do Controller serializa a operacao e os metadados gravados no
 * lancamento preservam a idempotencia pelo mecanismo legado.
 */
function gerarOcorrenciaRecorrenciaModel(lancamento, ocorrencia, rateios, idUsuarioExecucao) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return gerarOcorrenciaRecorrenciaSupabaseModel_(lancamento, ocorrencia, rateios, idUsuarioExecucao);
  }

  salvarLancamentoModel(lancamento);
  marcarOcorrenciaRecorrenciaComoGeradaModel(ocorrencia);

  if (rateios && rateios.length > 0) {
    substituirRateiosPendentesDoLancamentoModel(lancamento.ID_Lancamento, rateios, idUsuarioExecucao);
  }

  return {
    id_lancamento: lancamento.ID_Lancamento,
    id_recorrencia: ocorrencia.ID_Recorrencia,
    data_prevista: ocorrencia.Data_Ocorrencia
  };
}


function gerarOcorrenciaRecorrenciaSupabaseModel_(lancamento, ocorrencia, rateios, idUsuarioExecucao) {
  const registrosRateio = (rateios || []).map(function(item) {
    return {
      id_rateio: item.ID_Rateio || Utilities.getUuid(),
      id_usuario_responsavel: item.ID_Usuario_Responsavel,
      id_usuario_credor: item.ID_Usuario_Credor,
      valor_rateado: recNormalizarNumeroModel_(item.Valor_Rateado),
      percentual: recNormalizarNumeroModel_(item.Percentual),
      status: item.Status || "Pendente",
      criado_por_id: item.Criado_Por_ID || idUsuarioExecucao,
      alterado_por_id: item.Alterado_Por_ID || null,
      observacao: item.Observacao || null,
      modo_rateio: item.Modo_Rateio || null,
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao)
    };
  });

  return supabaseRpc("gerar_ocorrencia_recorrencia", {
    p_id_recorrencia: ocorrencia.ID_Recorrencia,
    p_data_prevista: converterDataSupabase_(ocorrencia.Data_Ocorrencia),
    p_data_lancamento: converterDataSupabase_(lancamento.Data_Ocorrencia),
    p_mes_referencia: converterDataSupabase_(lancamento.Mes_Referencia || lancamento.Data_Ocorrencia),
    p_email_autor: lancamento.Email_Autor || null,
    p_executado_por: idUsuarioExecucao,
    p_modo_geracao: lancamento.Modo_Recorrencia_Origem || "Manual",
    p_id_lancamento: lancamento.ID_Lancamento,
    p_rateios: registrosRateio
  });
}


function listarRecorrenciasSupabaseModel_() {
  return supabaseSelecionar(
    "recorrencias",
    "select=id_recorrencia,id_usuario,descricao,tipo,valor_base,data_inicio,periodicidade_tipo,intervalo_dias,modo_geracao,status_recorrencia,tipo_origem,id_origem,id_destino,id_categoria,id_projeto,status_lancamento,observacao,info_bloqueio,created_at,updated_at,criado_por_id,alterado_por_id&order=data_inicio.asc"
  ).map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Recorrencia: item.id_recorrencia || "",
      ID_Usuario: item.id_usuario || "",
      Descricao: item.descricao || "",
      Tipo: item.tipo || "",
      Valor_Base: recNormalizarNumeroModel_(item.valor_base),
      Data_Inicio: recNormalizarDataModel_(item.data_inicio),
      Periodicidade_Tipo: item.periodicidade_tipo || "",
      Intervalo_Dias: recNormalizarInteiroModel_(item.intervalo_dias),
      Modo_Geracao: item.modo_geracao || "",
      Status_Recorrencia: item.status_recorrencia || "",
      Tipo_Origem: item.tipo_origem || "",
      ID_Origem: item.id_origem || "",
      ID_Destino: item.id_destino || "",
      ID_Categoria: item.id_categoria || "",
      ID_Projeto: item.id_projeto || "",
      Status_Lancamento: item.status_lancamento || "",
      Observacao: item.observacao || "",
      Info_Bloqueio: item.info_bloqueio || "",
      Data_Criacao: item.created_at || "",
      Data_Alteracao: item.updated_at || "",
      Criado_Por_ID: item.criado_por_id || "",
      Alterado_Por_ID: item.alterado_por_id || ""
    };
  });
}


function listarRecorrenciasOcorrenciasSupabaseModel_() {
  try {
    return supabaseSelecionar(
      "recorrencias_ocorrencias",
      "select=id_recorrencia_ocorrencia,id_recorrencia,data_ocorrencia,id_lancamento_gerado,status,observacao,criado_por_id,alterado_por_id,created_at,updated_at&order=data_ocorrencia.asc"
    ).map(function(item, indice) {
      return montarRecorrenciaOcorrenciaPlanilhaAPartirSupabase_(item, indice);
    });
  } catch (erro) {
    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_RECORRENCIAS_OCORRENCIAS_FALLBACK",
      mensagem: erro && erro.message ? erro.message : erro
    }));
    return [];
  }
}


function marcarOcorrenciaRecorrenciaComoGeradaSupabaseModel_(ocorrencia) {
  const registro = {
    id_recorrencia_ocorrencia: ocorrencia.ID_Recorrencia_Ocorrencia || Utilities.getUuid(),
    id_recorrencia: ocorrencia.ID_Recorrencia,
    data_ocorrencia: converterDataSupabase_(ocorrencia.Data_Ocorrencia),
    id_lancamento_gerado: ocorrencia.ID_Lancamento_Gerado || null,
    status: "Gerada",
    observacao: ocorrencia.Observacao || null,
    criado_por_id: ocorrencia.Criado_Por_ID,
    alterado_por_id: ocorrencia.Alterado_Por_ID || null,
    created_at: converterDataHoraSupabase_(ocorrencia.Data_Criacao) || new Date().toISOString(),
    updated_at: converterDataHoraSupabase_(ocorrencia.Data_Alteracao)
  };

  const inseridos = supabaseInserirComConflito(
    "recorrencias_ocorrencias",
    registro,
    "id_recorrencia,data_ocorrencia",
    "resolution=merge-duplicates,return=representation"
  );

  return montarRecorrenciaOcorrenciaPlanilhaAPartirSupabase_(inseridos[0] || registro, 0);
}


function montarRecorrenciaOcorrenciaPlanilhaAPartirSupabase_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Recorrencia_Ocorrencia: item.id_recorrencia_ocorrencia || "",
    ID_Recorrencia: item.id_recorrencia || "",
    Data_Ocorrencia: recNormalizarDataModel_(item.data_ocorrencia),
    ID_Lancamento_Gerado: item.id_lancamento_gerado || "",
    Status: item.status || "",
    Observacao: item.observacao || "",
    Criado_Por_ID: item.criado_por_id || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || ""
  };
}


function salvarRecorrenciaSupabaseModel_(recorrencia) {
  const idRecorrencia = recorrencia.ID_Recorrencia || Utilities.getUuid();
  const agora = new Date().toISOString();

  supabaseInserir("recorrencias", {
    id_recorrencia: idRecorrencia,
    id_usuario: recorrencia.ID_Usuario,
    descricao: recorrencia.Descricao,
    tipo: recorrencia.Tipo,
    valor_base: recNormalizarNumeroModel_(recorrencia.Valor_Base),
    data_inicio: converterDataSupabase_(recorrencia.Data_Inicio),
    periodicidade_tipo: recorrencia.Periodicidade_Tipo,
    intervalo_dias: recorrencia.Intervalo_Dias || null,
    modo_geracao: recorrencia.Modo_Geracao,
    status_recorrencia: recorrencia.Status_Recorrencia,
    tipo_origem: recorrencia.Tipo_Origem,
    id_origem: recorrencia.ID_Origem,
    id_destino: recorrencia.ID_Destino || null,
    id_categoria: recorrencia.ID_Categoria || null,
    id_projeto: recorrencia.ID_Projeto || null,
    status_lancamento: recorrencia.Status_Lancamento,
    observacao: recorrencia.Observacao || null,
    info_bloqueio: recorrencia.Info_Bloqueio || null,
    criado_por_id: recorrencia.Criado_Por_ID,
    alterado_por_id: recorrencia.Alterado_Por_ID || null,
    created_at: converterDataHoraSupabase_(recorrencia.Data_Criacao) || agora,
    updated_at: converterDataHoraSupabase_(recorrencia.Data_Alteracao)
  }, "resolution=merge-duplicates,return=representation");

  return idRecorrencia;
}


function listarRecorrenciasRateiosSupabaseModel_() {
  return supabaseSelecionar(
    "recorrencias_rateios",
    "select=id_recorrencia_rateio,id_recorrencia,id_usuario_responsavel,valor_rateado,percentual,observacao,modo_rateio,created_at,updated_at,criado_por_id&order=created_at.asc"
  ).map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Recorrencia_Rateio: item.id_recorrencia_rateio || "",
      ID_Recorrencia: item.id_recorrencia || "",
      ID_Usuario_Responsavel: item.id_usuario_responsavel || "",
      Valor_Rateado: recNormalizarNumeroModel_(item.valor_rateado),
      Percentual: recNormalizarNumeroModel_(item.percentual),
      Observacao: item.observacao || "",
      Modo_Rateio: item.modo_rateio || "",
      Data_Criacao: item.created_at || "",
      Data_Alteracao: item.updated_at || "",
      Criado_Por_ID: item.criado_por_id || ""
    };
  });
}


function substituirRecorrenciasRateiosSupabaseModel_(idRecorrencia, itens) {
  const id = recNormalizarTextoModel_(idRecorrencia);

  if (!id) {
    throw new Error("ID da recorrencia nao informado para salvar o rateio no Supabase.");
  }

  supabaseExcluir("recorrencias_rateios", "id_recorrencia=eq." + encodeURIComponent(id));

  if (!itens || itens.length === 0) {
    return;
  }

  const registros = itens.map(function(item) {
    return {
      id_recorrencia_rateio: item.ID_Recorrencia_Rateio || Utilities.getUuid(),
      id_recorrencia: id,
      id_usuario_responsavel: item.ID_Usuario_Responsavel,
      valor_rateado: recNormalizarNumeroModel_(item.Valor_Rateado),
      percentual: recNormalizarNumeroModel_(item.Percentual),
      observacao: item.Observacao || null,
      modo_rateio: item.Modo_Rateio || null,
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao),
      criado_por_id: item.Criado_Por_ID
    };
  });

  supabaseInserir("recorrencias_rateios", registros, "resolution=merge-duplicates,return=representation");
}


function obterAbaRecorrenciasModel_() {
  const banco = conectarBanco();
  let aba = banco.getSheetByName("RECORRENCIAS");

  if (!aba) {
    aba = banco.insertSheet("RECORRENCIAS");
  }

  garantirEstruturaRecorrenciasModel_(aba);
  return aba;
}


function obterAbaRecorrenciasRateiosModel_() {
  const banco = conectarBanco();
  let aba = banco.getSheetByName("RECORRENCIAS_RATEIOS");

  if (!aba) {
    aba = banco.insertSheet("RECORRENCIAS_RATEIOS");
  }

  garantirEstruturaRecorrenciasRateiosModel_(aba);
  return aba;
}


function garantirEstruturaRecorrenciasModel_(aba) {
  const cabecalhosEsperados = [
    "ID_Recorrencia",
    "ID_Usuario",
    "Descricao",
    "Tipo",
    "Valor_Base",
    "Data_Inicio",
    "Periodicidade_Tipo",
    "Intervalo_Dias",
    "Modo_Geracao",
    "Status_Recorrencia",
    "Tipo_Origem",
    "ID_Origem",
    "ID_Destino",
    "ID_Categoria",
    "ID_Projeto",
    "Status_Lancamento",
    "Observacao",
    "Info_Bloqueio",
    "Data_Criacao",
    "Data_Alteracao",
    "Criado_Por_ID",
    "Alterado_Por_ID"
  ];
  const cabecalhosAntigos = [
    "ID_Recorrencia",
    "Descricao",
    "Valor_Base",
    "Tipo_Comportamento",
    "Dia_Vencimento",
    "ID_Categoria",
    "Conta_Padrao_ID",
    "Divisao_Padrao",
    "Ativo"
  ];

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();

  if (ultimaLinha === 0 || ultimaColuna === 0) {
    aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
    return;
  }

  const cabecalhosAtuais = aba.getRange(1, 1, 1, Math.max(ultimaColuna, cabecalhosEsperados.length)).getValues()[0];

  if (recCabecalhosIguaisModel_(cabecalhosAtuais, cabecalhosEsperados)) {
    return;
  }

  if (recCabecalhosIguaisModel_(cabecalhosAtuais, cabecalhosAntigos)) {
    if (ultimaLinha <= 1) {
      aba.clear();
      aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
      return;
    }

    throw new Error("A aba RECORRENCIAS possui dados em estrutura antiga. Revise a migração antes de continuar.");
  }

  throw new Error("A aba RECORRENCIAS possui uma estrutura incompatível. Revise os cabeçalhos antes de continuar.");
}


function garantirEstruturaRecorrenciasRateiosModel_(aba) {
  const cabecalhosEsperados = [
    "ID_Recorrencia_Rateio",
    "ID_Recorrencia",
    "ID_Usuario_Responsavel",
    "Valor_Rateado",
    "Percentual",
    "Observacao",
    "Modo_Rateio",
    "Data_Criacao",
    "Data_Alteracao",
    "Criado_Por_ID"
  ];
  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();

  if (ultimaLinha === 0 || ultimaColuna === 0) {
    aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
    return;
  }

  const cabecalhosAtuais = aba.getRange(1, 1, 1, Math.max(ultimaColuna, cabecalhosEsperados.length)).getValues()[0];

  if (recCabecalhosIguaisModel_(cabecalhosAtuais, cabecalhosEsperados)) {
    return;
  }

  if (ultimaLinha <= 1) {
    aba.clear();
    aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
    return;
  }

  throw new Error("A aba RECORRENCIAS_RATEIOS possui uma estrutura incompatível. Revise os cabeçalhos antes de continuar.");
}


function montarVetorRecorrenciaModel_(recorrencia) {
  return [
    recorrencia.ID_Recorrencia,
    recorrencia.ID_Usuario,
    recorrencia.Descricao,
    recorrencia.Tipo,
    recorrencia.Valor_Base,
    recorrencia.Data_Inicio,
    recorrencia.Periodicidade_Tipo,
    recorrencia.Intervalo_Dias || "",
    recorrencia.Modo_Geracao,
    recorrencia.Status_Recorrencia,
    recorrencia.Tipo_Origem,
    recorrencia.ID_Origem,
    recorrencia.ID_Destino || "",
    recorrencia.ID_Categoria || "",
    recorrencia.ID_Projeto || "",
    recorrencia.Status_Lancamento,
    recorrencia.Observacao || "",
    recorrencia.Info_Bloqueio || "",
    recorrencia.Data_Criacao,
    recorrencia.Data_Alteracao || "",
    recorrencia.Criado_Por_ID,
    recorrencia.Alterado_Por_ID || ""
  ];
}


function recCabecalhosIguaisModel_(atuais, esperados) {
  if (!atuais || !esperados || atuais.length < esperados.length) {
    return false;
  }

  return esperados.every(function(nome, indice) {
    return recNormalizarTextoModel_(atuais[indice]) === nome;
  });
}


function recNormalizarTextoModel_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function recNormalizarNumeroModel_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


function recNormalizarInteiroModel_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";

  const numero = parseInt(valor, 10);
  return isNaN(numero) || numero <= 0 ? "" : numero;
}


function recNormalizarDataModel_(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const texto = valor.toString().trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const dataBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return dataBr ? (dataBr[3] + "-" + dataBr[2] + "-" + dataBr[1]) : texto;
}


function recNormalizarDataHoraModel_(valor) {
  if (!valor) return "";

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  }

  return valor.toString();
}
