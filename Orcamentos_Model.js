/**
 * Módulo: Orcamentos_Model.gs
 * Responsabilidade:
 * - Ler e gravar os tetos de gasto por categoria na aba ORCAMENTOS.
 * - Manter um orçamento flexível por usuário, representado por várias linhas
 *   de categorias vinculadas.
 *
 * Colunas esperadas:
 * A ID_Orcamento
 * B ID_Usuario
 * C ID_Categoria
 * D Valor_Teto
 * E Ativo
 * F Data_Criacao
 * G Data_Alteracao
 */


/**
 * Lista todos os itens de orçamento.
 *
 * @returns {Array<Object>} Itens de orçamento.
 */
function listarOrcamentosModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarOrcamentosSupabaseModel_();
  }

  const aba = obterAbaOrcamentosModel_();
  garantirEstruturaOrcamentosModel_(aba);

  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) {
    return [];
  }

  const dados = aba.getRange(1, 1, ultimaLinha, 7).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Orcamento: normalizarTextoOrcamentoModel_(linha[0]),
      ID_Usuario: normalizarTextoOrcamentoModel_(linha[1]),
      ID_Categoria: normalizarTextoOrcamentoModel_(linha[2]),
      Valor_Teto: normalizarNumeroOrcamentoModel_(linha[3]),
      Ativo: normalizarBooleanoOrcamentoModel_(linha[4]),
      Data_Criacao: normalizarTextoOrcamentoModel_(linha[5]),
      Data_Alteracao: normalizarTextoOrcamentoModel_(linha[6])
    });
  }

  return registros;
}


/**
 * Salva um item de orçamento novo ou existente.
 *
 * @param {Object} item Item validado pelo Controller.
 * @returns {string} ID salvo.
 */
function salvarOrcamentoModel(item) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarOrcamentoSupabaseModel_(item);
  }

  const aba = obterAbaOrcamentosModel_();
  garantirEstruturaOrcamentosModel_(aba);

  const vetor = [
    item.ID_Orcamento,
    item.ID_Usuario,
    item.ID_Categoria,
    item.Valor_Teto,
    item.Ativo,
    item.Data_Criacao,
    item.Data_Alteracao
  ];

  if (item._linhaPlanilha) {
    aba.getRange(item._linhaPlanilha, 1, 1, 7).setValues([vetor]);
  } else {
    aba.appendRow(vetor);
  }

  return item.ID_Orcamento;
}


/**
 * Exclui fisicamente um item de orçamento.
 *
 * @param {number} linhaPlanilha Linha real na aba ORCAMENTOS.
 */
function excluirOrcamentoModel(linhaPlanilha) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return excluirOrcamentoSupabaseModel_(linhaPlanilha);
  }

  const aba = obterAbaOrcamentosModel_();
  const linha = parseInt(linhaPlanilha, 10);

  if (isNaN(linha) || linha <= 1) {
    throw new Error("Linha inválida para exclusão do item de orçamento.");
  }

  aba.deleteRow(linha);
}


function listarOrcamentosSupabaseModel_() {
  return supabaseSelecionar(
    "orcamentos",
    "select=id_orcamento,id_usuario,id_categoria,valor_teto,ativo,created_at,updated_at&order=created_at.asc"
  ).map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Orcamento: item.id_orcamento || "",
      ID_Usuario: item.id_usuario || "",
      ID_Categoria: item.id_categoria || "",
      Valor_Teto: normalizarNumeroOrcamentoModel_(item.valor_teto),
      Ativo: item.ativo === true,
      Data_Criacao: item.created_at || "",
      Data_Alteracao: item.updated_at || ""
    };
  });
}


function salvarOrcamentoSupabaseModel_(item) {
  const idOrcamento = item.ID_Orcamento || Utilities.getUuid();
  const agora = new Date().toISOString();
  const dataCriacao = normalizarDataHoraSupabaseOrcamentoModel_(item.Data_Criacao) || agora;
  const dataAlteracao = normalizarDataHoraSupabaseOrcamentoModel_(item.Data_Alteracao) || agora;

  supabaseInserir("orcamentos", {
    id_orcamento: idOrcamento,
    id_usuario: item.ID_Usuario,
    id_categoria: item.ID_Categoria,
    valor_teto: normalizarNumeroOrcamentoModel_(item.Valor_Teto),
    ativo: item.Ativo === true,
    created_at: dataCriacao,
    updated_at: dataAlteracao
  }, "resolution=merge-duplicates,return=representation");

  return idOrcamento;
}


function normalizarDataHoraSupabaseOrcamentoModel_(valor) {
  const texto = normalizarTextoOrcamentoModel_(valor);
  if (!texto) return "";

  if (/^\d{4}-\d{2}-\d{2}(?:T|\s)/.test(texto)) {
    return texto;
  }

  const dataBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dataBr) {
    const data = new Date(
      Number(dataBr[3]),
      Number(dataBr[2]) - 1,
      Number(dataBr[1]),
      Number(dataBr[4] || 0),
      Number(dataBr[5] || 0),
      Number(dataBr[6] || 0)
    );
    return isNaN(data.getTime()) ? "" : data.toISOString();
  }

  const dataGenerica = new Date(texto);
  return isNaN(dataGenerica.getTime()) ? "" : dataGenerica.toISOString();
}


function excluirOrcamentoSupabaseModel_(linhaOuIdOrcamento) {
  const idOrcamento = obterIdOrcamentoParaAlteracaoSupabase_(linhaOuIdOrcamento);

  if (!idOrcamento) {
    throw new Error("Item de orcamento nao encontrado para exclusao no Supabase.");
  }

  supabaseExcluir("orcamentos", "id_orcamento=eq." + encodeURIComponent(idOrcamento));
}


function obterIdOrcamentoParaAlteracaoSupabase_(linhaOuIdOrcamento) {
  const texto = normalizarTextoOrcamentoModel_(linhaOuIdOrcamento);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const item = listarOrcamentosSupabaseModel_().find(function(registro) {
    return registro._linhaPlanilha === linha;
  });

  return item ? item.ID_Orcamento : "";
}


function obterAbaOrcamentosModel_() {
  const banco = conectarBanco();
  let aba = banco.getSheetByName("ORCAMENTOS");

  if (!aba) {
    aba = banco.insertSheet("ORCAMENTOS");
  }

  return aba;
}


function garantirEstruturaOrcamentosModel_(aba) {
  const cabecalhosEsperados = [
    "ID_Orcamento",
    "ID_Usuario",
    "ID_Categoria",
    "Valor_Teto",
    "Ativo",
    "Data_Criacao",
    "Data_Alteracao"
  ];

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = Math.max(aba.getLastColumn(), cabecalhosEsperados.length);
  const cabecalhosAtuais = ultimaLinha >= 1
    ? aba.getRange(1, 1, 1, ultimaColuna).getValues()[0]
    : [];

  const estruturaCorreta = cabecalhosEsperados.every(function(nome, indice) {
    return normalizarTextoOrcamentoModel_(cabecalhosAtuais[indice]) === nome;
  });

  if (estruturaCorreta) {
    return;
  }

  if (ultimaLinha > 1) {
    throw new Error("A aba ORCAMENTOS possui dados em estrutura antiga. Atualize os cabeçalhos antes de usar o módulo.");
  }

  aba.clear();
  aba.getRange(1, 1, 1, cabecalhosEsperados.length).setValues([cabecalhosEsperados]);
}


function normalizarTextoOrcamentoModel_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function normalizarNumeroOrcamentoModel_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


function normalizarBooleanoOrcamentoModel_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
