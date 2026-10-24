/**
 * Modulo: Pagamentos_Faturas_Model.gs
 * Responsabilidade:
 * - Registrar e listar pagamentos de faturas de cartao.
 * - Manter pagamento de fatura separado de despesas, receitas e transferencias.
 */


function listarPagamentosFaturasModel_() {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return listarPagamentosFaturasSupabaseModel_();
  }

  return [];
}


function inserirPagamentoFaturaModel_(pagamento) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return inserirPagamentoFaturaSupabaseModel_(pagamento);
  }

  throw new Error("Pagamento de fatura esta disponivel apenas na fonte Supabase.");
}


function atualizarPagamentoFaturaModel_(pagamento) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return atualizarPagamentoFaturaSupabaseModel_(pagamento);
  }

  throw new Error("Edicao de pagamento de fatura esta disponivel apenas na fonte Supabase.");
}


function excluirPagamentoFaturaModel_(idPagamentoFatura) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return excluirPagamentoFaturaSupabaseModel_(idPagamentoFatura);
  }

  throw new Error("Exclusao de pagamento de fatura esta disponivel apenas na fonte Supabase.");
}


function listarPagamentosFaturasSupabaseModel_() {
  return supabaseSelecionar_(
    "pagamentos_faturas",
    "select=id_pagamento_fatura,id_grupo_cartao,id_conta,valor,data_pagamento,mes_referencia,status,observacao,criado_por_id,alterado_por_id,created_at,updated_at&order=data_pagamento.asc"
  ).map(function(item, indice) {
    return montarPagamentoFaturaPlanilhaAPartirSupabase_(item, indice);
  });
}


function inserirPagamentoFaturaSupabaseModel_(pagamento) {
  const registro = {
    id_pagamento_fatura: pagamento.ID_Pagamento_Fatura || Utilities.getUuid(),
    id_grupo_cartao: pagamento.ID_Grupo_Cartao,
    id_conta: pagamento.ID_Conta,
    valor: normalizarNumeroPagamentoFaturaModel_(pagamento.Valor),
    data_pagamento: pagamento.Data_Pagamento,
    mes_referencia: normalizarMesReferenciaPagamentoFaturaModel_(pagamento.Mes_Referencia),
    status: normalizarStatusPagamentoFaturaModel_(pagamento.Status),
    observacao: pagamento.Observacao || null,
    criado_por_id: pagamento.Criado_Por_ID,
    alterado_por_id: pagamento.Alterado_Por_ID || null,
    created_at: pagamento.Data_Criacao || new Date().toISOString(),
    updated_at: pagamento.Data_Alteracao || null
  };

  const inseridos = supabaseInserir_("pagamentos_faturas", registro, "return=representation");
  return montarPagamentoFaturaPlanilhaAPartirSupabase_(inseridos[0] || registro, 0);
}


function atualizarPagamentoFaturaSupabaseModel_(pagamento) {
  const id = pagamento && pagamento.ID_Pagamento_Fatura ? pagamento.ID_Pagamento_Fatura.toString().trim() : "";

  if (!id) {
    throw new Error("Pagamento de fatura nao informado para edicao.");
  }

  const registro = {
    id_grupo_cartao: pagamento.ID_Grupo_Cartao,
    id_conta: pagamento.ID_Conta,
    valor: normalizarNumeroPagamentoFaturaModel_(pagamento.Valor),
    data_pagamento: pagamento.Data_Pagamento,
    mes_referencia: normalizarMesReferenciaPagamentoFaturaModel_(pagamento.Mes_Referencia),
    status: normalizarStatusPagamentoFaturaModel_(pagamento.Status),
    observacao: pagamento.Observacao || null,
    alterado_por_id: pagamento.Alterado_Por_ID || null,
    updated_at: pagamento.Data_Alteracao || new Date().toISOString()
  };

  supabaseAtualizar_("pagamentos_faturas", "id_pagamento_fatura=eq." + encodeURIComponent(id), registro);

  return montarPagamentoFaturaPlanilhaAPartirSupabase_({
    id_pagamento_fatura: id,
    id_grupo_cartao: registro.id_grupo_cartao,
    id_conta: registro.id_conta,
    valor: registro.valor,
    data_pagamento: registro.data_pagamento,
    mes_referencia: registro.mes_referencia,
    status: registro.status,
    observacao: registro.observacao,
    alterado_por_id: registro.alterado_por_id,
    updated_at: registro.updated_at
  }, 0);
}


function excluirPagamentoFaturaSupabaseModel_(idPagamentoFatura) {
  const id = idPagamentoFatura ? idPagamentoFatura.toString().trim() : "";

  if (!id) {
    throw new Error("Pagamento de fatura nao informado para exclusao.");
  }

  supabaseExcluir_("pagamentos_faturas", "id_pagamento_fatura=eq." + encodeURIComponent(id));
}


function montarPagamentoFaturaPlanilhaAPartirSupabase_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Pagamento_Fatura: item.id_pagamento_fatura || "",
    ID_Grupo_Cartao: item.id_grupo_cartao || "",
    ID_Conta: item.id_conta || "",
    Valor: normalizarNumeroPagamentoFaturaModel_(item.valor),
    Data_Pagamento: normalizarDataPagamentoFaturaModel_(item.data_pagamento),
    Mes_Referencia: normalizarMesReferenciaPagamentoFaturaModel_(item.mes_referencia || item.data_pagamento),
    Status: normalizarStatusPagamentoFaturaModel_(item.status),
    Observacao: item.observacao || "",
    Criado_Por_ID: item.criado_por_id || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || ""
  };
}


function normalizarNumeroPagamentoFaturaModel_(valor) {
  if (typeof valor === "number") {
    return isNaN(valor) ? 0 : valor;
  }

  const texto = valor === null || valor === undefined
    ? ""
    : valor.toString().trim().replace(/\./g, "").replace(",", ".");
  const numero = parseFloat(texto);

  return isNaN(numero) ? 0 : numero;
}


function normalizarDataPagamentoFaturaModel_(valor) {
  if (!valor) {
    return "";
  }

  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const texto = valor.toString().trim();
  return texto.length >= 10 ? texto.substring(0, 10) : texto;
}


function normalizarMesReferenciaPagamentoFaturaModel_(valor) {
  const data = normalizarDataPagamentoFaturaModel_(valor);

  if (/^\d{4}-\d{2}$/.test(data)) {
    return data + "-01";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data.substring(0, 7) + "-01";
  }

  return data;
}


function normalizarStatusPagamentoFaturaModel_(valor) {
  const status = valor ? valor.toString().trim() : "Efetivado";
  return status === "Pendente" ? "Pendente" : "Efetivado";
}
