/**
 * Módulo: Cartoes_Model.gs
 * Responsabilidade:
 * - Interagir com GRUPOS_CARTOES e CARTOES.
 * - GRUPOS_CARTOES representa a fatura consolidada.
 * - CARTOES representa cartões físicos vinculados ao grupo.
 *
 * Modelo:
 * GRUPOS_CARTOES:
 * A ID_Grupo_Cartao
 * B ID_Titular
 * C Nome_Grupo
 * D Limite
 * E Dia_Fechamento
 * F Dia_Vencimento
 * G Ativo
 *
 * CARTOES:
 * A ID_Cartao
 * B ID_Grupo_Cartao
 * C ID_Usuario
 * D Nome_Cartao
 * E Tipo_Cartao
 * F Ativo
 */


/**
 * Lista grupos de cartões/faturas.
 *
 * @returns {Array<Object>} Grupos de cartões.
 */
function listarGruposCartoesModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarGruposCartoesSupabaseModel_();
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName('GRUPOS_CARTOES');

  if (!aba) {
    throw new Error("Aba GRUPOS_CARTOES não encontrada na planilha.");
  }

  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) return [];

  const dados = aba.getRange(1, 1, ultimaLinha, 7).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Grupo_Cartao: normalizarTextoCartao_(linha[0]),
      ID_Titular: normalizarTextoCartao_(linha[1]),
      Nome_Grupo: normalizarTextoCartao_(linha[2]),
      Limite: normalizarNumeroCartao_(linha[3]),
      Dia_Fechamento: linha[4],
      Dia_Vencimento: linha[5],
      Ativo: normalizarBooleanoCartao_(linha[6])
    });
  }

  return registros;
}


/**
 * Lista cartões físicos e enriquece cada cartão com dados do grupo/fatura.
 *
 * Esta função mantém compatibilidade com o módulo de Lançamentos:
 * - ID_Cartao identifica o cartão físico usado na compra.
 * - ID_Usuario identifica o usuário dono daquele cartão físico.
 * - ID_Grupo_Cartao identifica a fatura consolidada.
 *
 * @returns {Array<Object>} Cartões físicos enriquecidos.
 */
function listarCartoesModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarCartoesSupabaseModel_();
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName('CARTOES');

  if (!aba) {
    throw new Error("Aba CARTOES não encontrada na planilha.");
  }

  const grupos = listarGruposCartoesModel();
  const mapaGrupos = {};

  grupos.forEach(function(g) {
    mapaGrupos[g.ID_Grupo_Cartao] = g;
  });

  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= 1) return [];

  const dados = aba.getRange(1, 1, ultimaLinha, 6).getValues();
  const registros = [];

  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];

    if (!linha[0]) continue;

    const idGrupo = normalizarTextoCartao_(linha[1]);
    const grupo = mapaGrupos[idGrupo] || {};

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Cartao: normalizarTextoCartao_(linha[0]),
      ID_Grupo_Cartao: idGrupo,
      ID_Usuario: normalizarTextoCartao_(linha[2]),
      Nome_Cartao: normalizarTextoCartao_(linha[3]),
      Tipo_Cartao: normalizarTextoCartao_(linha[4]) || "Adicional",
      Ativo: normalizarBooleanoCartao_(linha[5]),

      ID_Titular: grupo.ID_Titular || "",
      Nome_Grupo: grupo.Nome_Grupo || "",
      Limite: grupo.Limite || 0,
      Dia_Fechamento: grupo.Dia_Fechamento || "",
      Dia_Vencimento: grupo.Dia_Vencimento || "",
      Grupo_Ativo: grupo.Ativo === true,

      /**
       * Compatibilidade semântica:
       * Um grupo é considerado compartilhado quando há mais de um cartão físico ativo.
       */
      Compartilhado: false,
      Usuarios_Compartilhados: ""
    });
  }

  return enriquecerCompartilhamentoCartoes_(registros);
}


/**
 * Salva grupo de cartão/fatura.
 *
 * @param {Object} grupo Grupo validado pelo Controller.
 * @returns {string} ID do grupo salvo.
 */
function salvarGrupoCartaoModel(grupo) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarGrupoCartaoSupabaseModel_(grupo);
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName('GRUPOS_CARTOES');

  if (!aba) {
    throw new Error("Aba GRUPOS_CARTOES não encontrada na planilha.");
  }

  const vetor = [
    grupo.ID_Grupo_Cartao,
    grupo.ID_Titular,
    grupo.Nome_Grupo,
    grupo.Limite,
    grupo.Dia_Fechamento,
    grupo.Dia_Vencimento,
    grupo.Ativo
  ];

  if (grupo._linhaPlanilha) {
    aba.getRange(grupo._linhaPlanilha, 1, 1, 7).setValues([vetor]);
  } else {
    aba.appendRow(vetor);
  }

  return grupo.ID_Grupo_Cartao;
}


/**
 * Salva cartão físico.
 *
 * @param {Object} cartao Cartão físico validado pelo Controller.
 * @returns {string} ID do cartão salvo.
 */
function salvarCartaoFisicoModel(cartao) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarCartaoFisicoSupabaseModel_(cartao);
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName('CARTOES');

  if (!aba) {
    throw new Error("Aba CARTOES não encontrada na planilha.");
  }

  const vetor = [
    cartao.ID_Cartao,
    cartao.ID_Grupo_Cartao,
    cartao.ID_Usuario,
    cartao.Nome_Cartao,
    cartao.Tipo_Cartao,
    cartao.Ativo
  ];

  if (cartao._linhaPlanilha) {
    aba.getRange(cartao._linhaPlanilha, 1, 1, 6).setValues([vetor]);
  } else {
    aba.appendRow(vetor);
  }

  return cartao.ID_Cartao;
}


/**
 * Altera status de um grupo de cartões/fatura.
 *
 * @param {number} linhaPlanilha Linha real na aba GRUPOS_CARTOES.
 * @param {boolean} novoStatus Novo status.
 */
function alterarStatusGrupoCartaoModel(linhaPlanilha, novoStatus) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return alterarStatusGrupoCartaoSupabaseModel_(linhaPlanilha, novoStatus);
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName('GRUPOS_CARTOES');

  if (!aba) {
    throw new Error("Aba GRUPOS_CARTOES não encontrada na planilha.");
  }

  aba.getRange(linhaPlanilha, 7).setValue(novoStatus);
}


/**
 * Altera status de um cartão físico.
 *
 * @param {number} linhaPlanilha Linha real na aba CARTOES.
 * @param {boolean} novoStatus Novo status.
 */
function alterarStatusCartaoFisicoModel(linhaPlanilha, novoStatus) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return alterarStatusCartaoFisicoSupabaseModel_(linhaPlanilha, novoStatus);
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName('CARTOES');

  if (!aba) {
    throw new Error("Aba CARTOES não encontrada na planilha.");
  }

  aba.getRange(linhaPlanilha, 6).setValue(novoStatus);
}


function listarGruposCartoesSupabaseModel_() {
  return supabaseSelecionar(
    "grupos_cartoes",
    "select=id_grupo_cartao,id_titular,nome_grupo,limite,dia_fechamento,dia_vencimento,ativo&order=nome_grupo.asc"
  ).map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Grupo_Cartao: item.id_grupo_cartao || "",
      ID_Titular: item.id_titular || "",
      Nome_Grupo: item.nome_grupo || "",
      Limite: normalizarNumeroCartao_(item.limite),
      Dia_Fechamento: item.dia_fechamento || "",
      Dia_Vencimento: item.dia_vencimento || "",
      Ativo: item.ativo === true
    };
  });
}


function listarCartoesSupabaseModel_() {
  const grupos = listarGruposCartoesSupabaseModel_();
  const mapaGrupos = {};

  grupos.forEach(function(grupo) {
    mapaGrupos[grupo.ID_Grupo_Cartao] = grupo;
  });

  const cartoes = supabaseSelecionar(
    "cartoes",
    "select=id_cartao,id_grupo_cartao,id_usuario,nome_cartao,tipo_cartao,ativo&order=nome_cartao.asc"
  ).map(function(item, indice) {
    const grupo = mapaGrupos[item.id_grupo_cartao] || {};

    return {
      _linhaPlanilha: indice + 2,
      ID_Cartao: item.id_cartao || "",
      ID_Grupo_Cartao: item.id_grupo_cartao || "",
      ID_Usuario: item.id_usuario || "",
      Nome_Cartao: item.nome_cartao || "",
      Tipo_Cartao: item.tipo_cartao || "Adicional",
      Ativo: item.ativo === true,
      ID_Titular: grupo.ID_Titular || "",
      Nome_Grupo: grupo.Nome_Grupo || "",
      Limite: grupo.Limite || 0,
      Dia_Fechamento: grupo.Dia_Fechamento || "",
      Dia_Vencimento: grupo.Dia_Vencimento || "",
      Grupo_Ativo: grupo.Ativo === true,
      Compartilhado: false,
      Usuarios_Compartilhados: ""
    };
  });

  return enriquecerCompartilhamentoCartoes_(cartoes);
}


function salvarGrupoCartaoSupabaseModel_(grupo) {
  const idGrupo = grupo.ID_Grupo_Cartao || Utilities.getUuid();

  supabaseInserir("grupos_cartoes", {
    id_grupo_cartao: idGrupo,
    id_titular: grupo.ID_Titular,
    nome_grupo: grupo.Nome_Grupo,
    limite: normalizarNumeroCartao_(grupo.Limite),
    dia_fechamento: parseInt(grupo.Dia_Fechamento, 10),
    dia_vencimento: parseInt(grupo.Dia_Vencimento, 10),
    ativo: grupo.Ativo === true,
    updated_at: new Date().toISOString()
  }, "resolution=merge-duplicates,return=representation");

  return idGrupo;
}


function salvarCartaoFisicoSupabaseModel_(cartao) {
  const idCartao = cartao.ID_Cartao || Utilities.getUuid();

  supabaseInserir("cartoes", {
    id_cartao: idCartao,
    id_grupo_cartao: cartao.ID_Grupo_Cartao,
    id_usuario: cartao.ID_Usuario,
    nome_cartao: cartao.Nome_Cartao,
    tipo_cartao: cartao.Tipo_Cartao || "Adicional",
    ativo: cartao.Ativo === true,
    updated_at: new Date().toISOString()
  }, "resolution=merge-duplicates,return=representation");

  return idCartao;
}


function alterarStatusGrupoCartaoSupabaseModel_(linhaOuIdGrupo, novoStatus) {
  const idGrupo = obterIdGrupoCartaoParaAlteracaoSupabase_(linhaOuIdGrupo);

  if (!idGrupo) {
    throw new Error("Grupo de cartao nao encontrado para alteracao de status no Supabase.");
  }

  supabaseAtualizar(
    "grupos_cartoes",
    "id_grupo_cartao=eq." + encodeURIComponent(idGrupo),
    {
      ativo: novoStatus === true,
      updated_at: new Date().toISOString()
    }
  );
}


function alterarStatusCartaoFisicoSupabaseModel_(linhaOuIdCartao, novoStatus) {
  const idCartao = obterIdCartaoParaAlteracaoSupabase_(linhaOuIdCartao);

  if (!idCartao) {
    throw new Error("Cartao nao encontrado para alteracao de status no Supabase.");
  }

  supabaseAtualizar(
    "cartoes",
    "id_cartao=eq." + encodeURIComponent(idCartao),
    {
      ativo: novoStatus === true,
      updated_at: new Date().toISOString()
    }
  );
}


function obterIdGrupoCartaoParaAlteracaoSupabase_(linhaOuIdGrupo) {
  const texto = normalizarTextoCartao_(linhaOuIdGrupo);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const grupo = listarGruposCartoesSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return grupo ? grupo.ID_Grupo_Cartao : "";
}


function obterIdCartaoParaAlteracaoSupabase_(linhaOuIdCartao) {
  const texto = normalizarTextoCartao_(linhaOuIdCartao);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const cartao = listarCartoesSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return cartao ? cartao.ID_Cartao : "";
}


/**
 * Enriquecer cartões com lista de usuários do mesmo grupo.
 *
 * @param {Array<Object>} cartoes Cartões físicos.
 * @returns {Array<Object>} Cartões enriquecidos.
 */
function enriquecerCompartilhamentoCartoes_(cartoes) {
  const mapaGrupoUsuarios = {};

  cartoes.forEach(function(c) {
    if (!mapaGrupoUsuarios[c.ID_Grupo_Cartao]) {
      mapaGrupoUsuarios[c.ID_Grupo_Cartao] = [];
    }

    if (c.Ativo) {
      mapaGrupoUsuarios[c.ID_Grupo_Cartao].push(c.ID_Usuario);
    }
  });

  return cartoes.map(function(c) {
    const usuariosGrupo = mapaGrupoUsuarios[c.ID_Grupo_Cartao] || [];

    c.Compartilhado = usuariosGrupo.length > 1;
    c.Usuarios_Compartilhados = usuariosGrupo
      .filter(function(idUsuario) {
        return idUsuario !== c.ID_Usuario;
      })
      .join(",");

    return c;
  });
}


/**
 * Normaliza texto para comparação segura.
 *
 * @param {*} valor Valor original.
 * @returns {string} Texto normalizado.
 */
function normalizarTextoCartao_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


/**
 * Normaliza número vindo da planilha.
 *
 * @param {*} valor Valor original.
 * @returns {number} Número normalizado.
 */
function normalizarNumeroCartao_(valor) {
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
 * Normaliza booleanos vindos da planilha.
 *
 * @param {*} valor Valor original.
 * @returns {boolean} Booleano normalizado.
 */
function normalizarBooleanoCartao_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
