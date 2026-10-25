/**
 * Modulo: Contas_Model.gs
 * Responsabilidade:
 * - Ler e gravar registros da aba CONTAS.
 * - Suportar contas próprias e contas compartilhadas.
 * - Manter a ordem fisica das 7 colunas do banco.
 *
 * Ordem esperada:
 * A ID_Conta
 * B ID_Usuario
 * C Nome_Conta
 * D Saldo_Inicial
 * E Ativa
 * F Compartilhada
 * G Usuarios_Compartilhados
 */


/**
 * Lista todas as contas cadastradas.
 *
 * @returns {Array<Object>} Contas da planilha.
 */
function listarContasModel_() {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return listarContasSupabaseModel_();
  }

  const banco = conectarBanco_();
  const aba = banco.getSheetByName("CONTAS");

  if (!aba) {
    throw new Error("Aba CONTAS nao encontrada na planilha.");
  }

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
      ID_Conta: normalizarTextoContaModel_(linha[0]),
      ID_Usuario: normalizarTextoContaModel_(linha[1]),
      Nome_Conta: normalizarTextoContaModel_(linha[2]),
      Saldo_Inicial: normalizarNumeroContaModel_(linha[3]),
      Ativa: normalizarBooleanoContaModel_(linha[4]),
      Compartilhada: normalizarBooleanoContaModel_(linha[5]),
      Usuarios_Compartilhados: normalizarListaIdsContaModel_(linha[6])
    });
  }

  return registros;
}


/**
 * Salva conta nova ou atualiza uma conta existente.
 *
 * @param {Object} conta Conta validada pelo Controller.
 * @returns {string} ID_Conta salvo.
 */
function salvarContaModel_(conta) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return salvarContaSupabaseModel_(conta);
  }

  const banco = conectarBanco_();
  const aba = banco.getSheetByName("CONTAS");

  if (!aba) {
    throw new Error("Aba CONTAS nao encontrada na planilha.");
  }

  const compartilhada = normalizarBooleanoContaModel_(conta.Compartilhada);
  const usuariosCompartilhados = compartilhada
    ? normalizarListaIdsContaModel_(conta.Usuarios_Compartilhados)
    : "";

  const dadosVetor = [
    conta.ID_Conta,
    conta.ID_Usuario,
    conta.Nome_Conta,
    conta.Saldo_Inicial,
    conta.Ativa,
    compartilhada,
    usuariosCompartilhados
  ];

  if (conta._linhaPlanilha) {
    aba.getRange(conta._linhaPlanilha, 1, 1, 7).setValues([dadosVetor]);
  } else {
    aba.appendRow(dadosVetor);
  }

  return conta.ID_Conta;
}


/**
 * Altera o status ativo/inativo da conta.
 *
 * @param {number} linhaPlanilha Linha real da conta.
 * @param {boolean} novoStatus Novo status.
 */
function alterarStatusContaModel_(linhaPlanilha, novoStatus) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return alterarStatusContaSupabaseModel_(linhaPlanilha, novoStatus);
  }

  const banco = conectarBanco_();
  const aba = banco.getSheetByName("CONTAS");

  if (!aba) {
    throw new Error("Aba CONTAS nao encontrada na planilha.");
  }

  const linha = parseInt(linhaPlanilha, 10);

  if (isNaN(linha) || linha <= 1) {
    throw new Error("Linha invalida para alteracao de status da conta.");
  }

  aba.getRange(linha, 5).setValue(novoStatus);
}


function listarContasSupabaseModel_() {
  const contas = supabaseSelecionar_(
    "contas",
    "select=id_conta,id_usuario,nome_conta,saldo_inicial,saldo_inicial_data,versao,tipo_conta_v3,id_grupo_cartao_v3,ativa,compartilhada&order=nome_conta.asc"
  );
  const compartilhamentos = supabaseSelecionar_(
    "contas_compartilhamentos",
    "select=id_conta,id_usuario,ativo,papel_na_conta&ativo=eq.true"
  );
  const mapaCompartilhamentos = {};

  compartilhamentos.forEach(function(item) {
    if (!mapaCompartilhamentos[item.id_conta]) {
      mapaCompartilhamentos[item.id_conta] = [];
    }

    if (item.papel_na_conta !== "Dono") {
      mapaCompartilhamentos[item.id_conta].push(item.id_usuario);
    }
  });

  return contas.map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Conta: item.id_conta || "",
      ID_Usuario: item.id_usuario || "",
      Nome_Conta: item.nome_conta || "",
      Tipo_Conta: item.tipo_conta_v3 || 'Consumo',
      ID_Grupo_Cartao_V3: item.id_grupo_cartao_v3 || '',
      Saldo_Inicial: normalizarNumeroContaModel_(item.saldo_inicial),
      Data_Saldo_Inicial: item.saldo_inicial_data || '',
      Versao: item.versao,
      Ativa: item.ativa === true,
      Compartilhada: item.compartilhada === true,
      Usuarios_Compartilhados: normalizarListaIdsContaModel_((mapaCompartilhamentos[item.id_conta] || []).join(","))
    };
  });
}


function salvarContaSupabaseModel_(conta) {
  const idConta = conta.ID_Conta || Utilities.getUuid();
  const compartilhada = normalizarBooleanoContaModel_(conta.Compartilhada);
  const usuariosCompartilhados = compartilhada
    ? normalizarListaIdsContaModel_(conta.Usuarios_Compartilhados)
    : "";

  supabaseInserir_("contas", {
    id_conta: idConta,
    id_usuario: conta.ID_Usuario,
    nome_conta: conta.Nome_Conta,
    saldo_inicial: normalizarNumeroContaModel_(conta.Saldo_Inicial),
    ativa: conta.Ativa === true,
    compartilhada: compartilhada,
    updated_at: new Date().toISOString()
  }, "resolution=merge-duplicates,return=representation");

  sincronizarCompartilhamentosContaSupabase_(idConta, conta.ID_Usuario, usuariosCompartilhados);

  return idConta;
}


function alterarStatusContaSupabaseModel_(linhaOuIdConta, novoStatus) {
  const idConta = obterIdContaParaAlteracaoSupabase_(linhaOuIdConta);

  if (!idConta) {
    throw new Error("Conta nao encontrada para alteracao de status no Supabase.");
  }

  supabaseAtualizar_(
    "contas",
    "id_conta=eq." + encodeURIComponent(idConta),
    {
      ativa: novoStatus === true,
      updated_at: new Date().toISOString()
    }
  );
}


function sincronizarCompartilhamentosContaSupabase_(idConta, idDono, usuariosCompartilhados) {
  const ids = normalizarListaIdsContaModel_([idDono, usuariosCompartilhados].join(","))
    .split(",")
    .filter(function(id) {
      return Boolean(id);
    });

  supabaseAtualizar_(
    "contas_compartilhamentos",
    "id_conta=eq." + encodeURIComponent(idConta),
    {
      ativo: false,
      updated_at: new Date().toISOString()
    }
  );

  const registros = ids.map(function(idUsuario) {
    return {
      id_compartilhamento: gerarUuidDeterministicoSupabase_("conta", idConta, idUsuario),
      id_conta: idConta,
      id_usuario: idUsuario,
      ativo: true,
      papel_na_conta: idUsuario === idDono ? "Dono" : "Participante",
      updated_at: new Date().toISOString()
    };
  });

  if (registros.length > 0) {
    supabaseInserir_("contas_compartilhamentos", registros, "resolution=merge-duplicates,return=representation");
  }
}


function obterIdContaParaAlteracaoSupabase_(linhaOuIdConta) {
  const texto = normalizarTextoContaModel_(linhaOuIdConta);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const conta = listarContasSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return conta ? conta.ID_Conta : "";
}


function normalizarTextoContaModel_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function normalizarNumeroContaModel_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


function normalizarBooleanoContaModel_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}


/**
 * Normaliza lista textual de IDs separados por vírgula.
 *
 * @param {*} valor Lista original.
 * @returns {string} Lista normalizada sem vazios e duplicidades.
 */
function normalizarListaIdsContaModel_(valor) {
  if (valor === null || valor === undefined) return "";

  const usados = {};
  const ids = valor
    .toString()
    .split(",")
    .map(function(item) {
      return item.trim();
    })
    .filter(function(id) {
      if (!id || usados[id]) return false;
      usados[id] = true;
      return true;
    });

  return ids.join(",");
}
