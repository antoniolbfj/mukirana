/**
 * Módulo: Rateios_Model.gs
 * Responsabilidade:
 * - Ler e gravar dados da aba RATEIOS.
 * - Oferecer operações em lote para reduzir chamadas à planilha.
 *
 * Estrutura da aba RATEIOS:
 * A ID_Rateio
 * B ID_Lancamento
 * C ID_Usuario_Responsavel
 * D ID_Usuario_Credor
 * E Valor_Rateado
 * F Percentual
 * G Status
 * H Criado_Por_ID
 * I Data_Criacao
 * J Alterado_Por_ID
 * K Data_Alteracao
 * L Observacao
 * M Modo_Rateio
 */


/**
 * Lista todos os rateios cadastrados.
 *
 * @returns {Array<Object>} Lista de rateios.
 */
function listarRateiosModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarRateiosSupabaseModel_();
  }

  const aba = obterAbaRateiosModel_();
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) {
    return [];
  }

  const dados = aba.getRange(1, 1, ultimaLinha, 13).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Rateio: normalizarTextoRateioModel_(linha[0]),
      ID_Lancamento: normalizarTextoRateioModel_(linha[1]),
      ID_Usuario_Responsavel: normalizarTextoRateioModel_(linha[2]),
      ID_Usuario_Credor: normalizarTextoRateioModel_(linha[3]),
      Valor_Rateado: normalizarNumeroRateioModel_(linha[4]),
      Percentual: normalizarNumeroRateioModel_(linha[5]),
      Status: normalizarTextoRateioModel_(linha[6]),
      Criado_Por_ID: normalizarTextoRateioModel_(linha[7]),
      Data_Criacao: normalizarDataHoraRateioModel_(linha[8]),
      Alterado_Por_ID: normalizarTextoRateioModel_(linha[9]),
      Data_Alteracao: normalizarDataHoraRateioModel_(linha[10]),
      Observacao: normalizarTextoRateioModel_(linha[11]),
      Modo_Rateio: normalizarModoRateioModel_(linha[12])
    });
  }

  return registros;
}


/**
 * Lista rateios de um lançamento específico.
 *
 * @param {string} idLancamento ID do lançamento.
 * @returns {Array<Object>} Rateios do lançamento.
 */
function listarRateiosPorLancamentoModel(idLancamento) {
  const id = normalizarTextoRateioModel_(idLancamento);

  if (!id) {
    return [];
  }

  return listarRateiosModel().filter(function(rateio) {
    return rateio.ID_Lancamento === id;
  });
}


/**
 * Substitui os rateios pendentes de um lançamento por novos rateios.
 *
 * Estratégia de integridade:
 * - Rateios pendentes antigos são marcados como Cancelado.
 * - Rateios acertados são preservados.
 * - Novos rateios são inseridos em lote.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {Array<Object>} novosRateios Novos rateios já validados.
 * @param {string} idUsuarioAlteracao ID do usuário responsável pela alteração.
 */
function substituirRateiosPendentesDoLancamentoModel(idLancamento, novosRateios, idUsuarioAlteracao) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return substituirRateiosPendentesDoLancamentoSupabaseModel_(idLancamento, novosRateios, idUsuarioAlteracao);
  }

  const aba = obterAbaRateiosModel_();
  const id = normalizarTextoRateioModel_(idLancamento);
  const usuarioAlteracao = normalizarTextoRateioModel_(idUsuarioAlteracao);
  const agora = new Date().toLocaleString("pt-BR");

  if (!id) {
    throw new Error("ID do lançamento não informado para salvar rateios.");
  }

  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha > 1) {
    const dados = aba.getRange(1, 1, ultimaLinha, 13).getValues();

    for (let i = 1; i < dados.length; i++) {
      const idLancamentoLinha = normalizarTextoRateioModel_(dados[i][1]);
      const statusLinha = normalizarTextoRateioModel_(dados[i][6]);

      if (idLancamentoLinha === id && statusLinha === "Pendente") {
        const linhaReal = i + 1;

        aba.getRange(linhaReal, 7).setValue("Cancelado");
        aba.getRange(linhaReal, 10).setValue(usuarioAlteracao);
        aba.getRange(linhaReal, 11).setValue(agora);
      }
    }
  }

  if (!novosRateios || novosRateios.length === 0) {
    return;
  }

  const linhasNovas = novosRateios.map(function(rateio) {
    return [
      rateio.ID_Rateio,
      rateio.ID_Lancamento,
      rateio.ID_Usuario_Responsavel,
      rateio.ID_Usuario_Credor,
      rateio.Valor_Rateado,
      rateio.Percentual,
      rateio.Status,
      rateio.Criado_Por_ID,
      rateio.Data_Criacao,
      rateio.Alterado_Por_ID,
      rateio.Data_Alteracao,
      rateio.Observacao,
      normalizarModoRateioModel_(rateio.Modo_Rateio)
    ];
  });

  const linhaInicial = aba.getLastRow() + 1;

  aba.getRange(linhaInicial, 1, linhasNovas.length, 13).setValues(linhasNovas);
}


/**
 * Cancela rateios pendentes de um lançamento.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {string} idUsuarioAlteracao ID do usuário responsável pela alteração.
 */
function cancelarRateiosPendentesDoLancamentoModel(idLancamento, idUsuarioAlteracao) {
  substituirRateiosPendentesDoLancamentoModel(idLancamento, [], idUsuarioAlteracao);
}


/**
 * Substitui fisicamente todos os rateios de um lançamento por novos vínculos.
 *
 * Esta função é usada quando o lançamento muda de contexto, participantes ou
 * deixa de ser rateado. Diferente da regra antiga de cancelamento, os vínculos
 * antigos são removidos da aba RATEIOS para evitar que continuem dando acesso
 * ao lançamento para usuários que não participam mais do rateio.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {Array<Object>} novosRateios Novos rateios já validados.
 * @param {string} idUsuarioAlteracao ID do usuário responsável pela alteração. Mantido por compatibilidade/auditoria futura.
 */
function substituirRateiosDoLancamentoModel(idLancamento, novosRateios, idUsuarioAlteracao) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return substituirRateiosDoLancamentoSupabaseModel_(idLancamento, novosRateios, idUsuarioAlteracao);
  }

  excluirRateiosDoLancamentoModel(idLancamento);
  inserirRateiosEmLoteModel_(novosRateios || []);
}


/**
 * Insere rateios em lote na aba RATEIOS.
 *
 * @param {Array<Object>} rateios Rateios prontos para gravação.
 */
function inserirRateiosEmLoteModel_(rateios) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return inserirRateiosEmLoteSupabaseModel_(rateios);
  }

  if (!rateios || rateios.length === 0) {
    return;
  }

  const aba = obterAbaRateiosModel_();

  const linhasNovas = rateios.map(function(rateio) {
    return [
      rateio.ID_Rateio,
      rateio.ID_Lancamento,
      rateio.ID_Usuario_Responsavel,
      rateio.ID_Usuario_Credor,
      rateio.Valor_Rateado,
      rateio.Percentual,
      rateio.Status,
      rateio.Criado_Por_ID,
      rateio.Data_Criacao,
      rateio.Alterado_Por_ID,
      rateio.Data_Alteracao,
      rateio.Observacao,
      normalizarModoRateioModel_(rateio.Modo_Rateio)
    ];
  });

  const linhaInicial = aba.getLastRow() + 1;
  aba.getRange(linhaInicial, 1, linhasNovas.length, 13).setValues(linhasNovas);
}


/**
 * Altera o status de um rateio específico.
 *
 * @param {number} linhaPlanilha Linha real do rateio.
 * @param {string} novoStatus Novo status.
 * @param {string} idUsuarioAlteracao ID do usuário que alterou.
 */
function alterarStatusRateioModel(linhaPlanilha, novoStatus, idUsuarioAlteracao) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return alterarStatusRateioSupabaseModel_(linhaPlanilha, novoStatus, idUsuarioAlteracao);
  }

  const aba = obterAbaRateiosModel_();
  const linha = parseInt(linhaPlanilha, 10);
  const status = normalizarStatusRateioModel_(novoStatus);

  if (isNaN(linha) || linha <= 1) {
    throw new Error("Linha inválida para alteração de status do rateio.");
  }

  aba.getRange(linha, 7).setValue(status);
  aba.getRange(linha, 10).setValue(idUsuarioAlteracao);
  aba.getRange(linha, 11).setValue(new Date().toLocaleString("pt-BR"));
}




/**
 * Exclui definitivamente todos os rateios vinculados a um lançamento.
 *
 * @param {string} idLancamento ID do lançamento.
 */
function excluirRateiosDoLancamentoModel(idLancamento) {
  excluirRateiosPorLancamentosModel([idLancamento]);
}


/**
 * Exclui definitivamente todos os rateios vinculados a uma lista de lançamentos.
 *
 * Estratégia:
 * - Coleta as linhas antes de excluir.
 * - Remove em ordem decrescente para não deslocar índices da planilha.
 *
 * @param {Array<string>} idsLancamentos IDs dos lançamentos.
 */
function excluirRateiosPorLancamentosModel(idsLancamentos) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return excluirRateiosPorLancamentosSupabaseModel_(idsLancamentos);
  }

  const aba = obterAbaRateiosModel_();
  const ids = {};

  (idsLancamentos || []).forEach(function(idLancamento) {
    const id = normalizarTextoRateioModel_(idLancamento);
    if (id) ids[id] = true;
  });

  if (Object.keys(ids).length === 0) {
    return;
  }

  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) {
    return;
  }

  const dados = aba.getRange(1, 1, ultimaLinha, 13).getValues();
  const linhasParaExcluir = [];

  for (let i = 1; i < dados.length; i++) {
    const idLancamentoLinha = normalizarTextoRateioModel_(dados[i][1]);

    if (ids[idLancamentoLinha]) {
      linhasParaExcluir.push(i + 1);
    }
  }

  linhasParaExcluir
    .sort(function(a, b) { return b - a; })
    .forEach(function(linhaPlanilha) {
      aba.deleteRow(linhaPlanilha);
    });
}


function listarRateiosSupabaseModel_() {
  return supabaseSelecionar(
    "rateios",
    "select=id_rateio,id_lancamento,id_usuario_responsavel,id_usuario_credor,valor_rateado,percentual,status,criado_por_id,alterado_por_id,observacao,modo_rateio,created_at,updated_at&order=created_at.asc"
  ).map(function(item, indice) {
    return montarRateioPlanilhaAPartirSupabase_(item, indice);
  });
}


function substituirRateiosPendentesDoLancamentoSupabaseModel_(idLancamento, novosRateios, idUsuarioAlteracao) {
  const id = normalizarTextoRateioModel_(idLancamento);
  const usuarioAlteracao = normalizarTextoRateioModel_(idUsuarioAlteracao);
  const agora = new Date().toISOString();

  if (!id) {
    throw new Error("ID do lancamento nao informado para salvar rateios no Supabase.");
  }

  supabaseAtualizar(
    "rateios",
    "id_lancamento=eq." + encodeURIComponent(id) + "&status=eq.Pendente",
    {
      status: "Cancelado",
      alterado_por_id: usuarioAlteracao || null,
      updated_at: agora
    }
  );

  inserirRateiosEmLoteSupabaseModel_(novosRateios || []);
}


function substituirRateiosDoLancamentoSupabaseModel_(idLancamento, novosRateios, idUsuarioAlteracao) {
  excluirRateiosDoLancamentoSupabaseModel_(idLancamento);
  inserirRateiosEmLoteSupabaseModel_(novosRateios || []);
}


function inserirRateiosEmLoteSupabaseModel_(rateios) {
  const lista = (rateios || []).filter(function(rateio) {
    return normalizarTextoRateioModel_(rateio.ID_Rateio) && normalizarTextoRateioModel_(rateio.ID_Lancamento);
  });

  if (lista.length === 0) {
    return;
  }

  const registros = lista.map(function(rateio) {
    return {
      id_rateio: rateio.ID_Rateio,
      id_lancamento: rateio.ID_Lancamento,
      id_usuario_responsavel: rateio.ID_Usuario_Responsavel,
      id_usuario_credor: rateio.ID_Usuario_Credor,
      valor_rateado: normalizarNumeroRateioModel_(rateio.Valor_Rateado),
      percentual: normalizarNumeroRateioModel_(rateio.Percentual),
      status: normalizarStatusRateioModel_(rateio.Status),
      criado_por_id: rateio.Criado_Por_ID,
      alterado_por_id: rateio.Alterado_Por_ID || null,
      observacao: rateio.Observacao || null,
      modo_rateio: normalizarModoRateioModel_(rateio.Modo_Rateio),
      created_at: converterDataHoraSupabase_(rateio.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(rateio.Data_Alteracao)
    };
  });

  supabaseInserir("rateios", registros, "resolution=merge-duplicates,return=representation");
}


function alterarStatusRateioSupabaseModel_(linhaOuIdRateio, novoStatus, idUsuarioAlteracao) {
  const idRateio = obterIdRateioParaAlteracaoSupabase_(linhaOuIdRateio);

  if (!idRateio) {
    throw new Error("Rateio nao encontrado para alteracao de status no Supabase.");
  }

  supabaseAtualizar(
    "rateios",
    "id_rateio=eq." + encodeURIComponent(idRateio),
    {
      status: normalizarStatusRateioModel_(novoStatus),
      alterado_por_id: idUsuarioAlteracao || null,
      updated_at: new Date().toISOString()
    }
  );
}


function excluirRateiosDoLancamentoSupabaseModel_(idLancamento) {
  excluirRateiosPorLancamentosSupabaseModel_([idLancamento]);
}


function excluirRateiosPorLancamentosSupabaseModel_(idsLancamentos) {
  (idsLancamentos || [])
    .map(function(idLancamento) {
      return normalizarTextoRateioModel_(idLancamento);
    })
    .filter(function(idLancamento) {
      return Boolean(idLancamento);
    })
    .forEach(function(idLancamento) {
      supabaseExcluir("rateios", "id_lancamento=eq." + encodeURIComponent(idLancamento));
    });
}


function obterIdRateioParaAlteracaoSupabase_(linhaOuIdRateio) {
  const texto = normalizarTextoRateioModel_(linhaOuIdRateio);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const rateio = listarRateiosSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return rateio ? rateio.ID_Rateio : "";
}


function montarRateioPlanilhaAPartirSupabase_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Rateio: item.id_rateio || "",
    ID_Lancamento: item.id_lancamento || "",
    ID_Usuario_Responsavel: item.id_usuario_responsavel || "",
    ID_Usuario_Credor: item.id_usuario_credor || "",
    Valor_Rateado: normalizarNumeroRateioModel_(item.valor_rateado),
    Percentual: normalizarNumeroRateioModel_(item.percentual),
    Status: item.status || "",
    Criado_Por_ID: item.criado_por_id || "",
    Data_Criacao: item.created_at || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Alteracao: item.updated_at || "",
    Observacao: item.observacao || "",
    Modo_Rateio: normalizarModoRateioModel_(item.modo_rateio)
  };
}


/**
 * Obtém a aba RATEIOS e valida sua existência.
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Aba RATEIOS.
 */
function obterAbaRateiosModel_() {
  const banco = conectarBanco();
  const aba = banco.getSheetByName("RATEIOS");

  if (!aba) {
    throw new Error("Aba RATEIOS não encontrada na planilha.");
  }

  return aba;
}


/**
 * Normaliza texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Texto normalizado.
 */
function normalizarTextoRateioModel_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


/**
 * Normaliza modo de rateio.
 *
 * @param {*} valor Valor original.
 * @returns {string} Modo válido.
 */
function normalizarModoRateioModel_(valor) {
  const modo = normalizarTextoRateioModel_(valor);
  const permitidos = ["Igual", "Valor", "Percentual"];

  return permitidos.indexOf(modo) === -1 ? "Valor" : modo;
}


/**
 * Normaliza status de rateio.
 *
 * @param {*} valor Valor original.
 * @returns {string} Status válido.
 */
function normalizarStatusRateioModel_(valor) {
  const status = normalizarTextoRateioModel_(valor);
  const permitidos = ["Pendente", "Acertado", "Cancelado"];

  if (permitidos.indexOf(status) === -1) {
    throw new Error("Status de rateio inválido.");
  }

  return status;
}


/**
 * Normaliza número.
 *
 * @param {*} valor Valor original.
 * @returns {number} Número normalizado.
 */
function normalizarNumeroRateioModel_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


/**
 * Normaliza data/hora para texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Data/hora textual.
 */
function normalizarDataHoraRateioModel_(valor) {
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
