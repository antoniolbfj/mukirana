/**
 * Módulo: Usuarios_Model.gs
 * Responsabilidade:
 * - Ler e gravar registros da aba USUARIOS.
 * - Manter a ordem física das colunas do banco de dados.
 *
 * Ordem esperada das colunas:
 * A: ID_Usuario
 * B: Nome
 * C: Email
 * D: Papel
 * E: Preferencia_Tema
 * F: Ativo
 * G: Senha
 */

/**
 * Lista todos os usuários da aba USUARIOS.
 *
 * Observação:
 * Esta função retorna os dados brutos, inclusive Senha/PIN.
 * Portanto, deve ser usada apenas no servidor. Controllers devem sanitizar
 * qualquer retorno enviado para o front-end.
 *
 * @returns {Array<Object>} Lista completa de usuários.
 */
function listarUsuariosModel_() {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return listarUsuariosSupabaseModel_();
  }

  return consultarTabela_('USUARIOS');
}


function buscarUsuarioPorIdModel_(idUsuario) {
  const id = idUsuario === null || idUsuario === undefined ? "" : idUsuario.toString().trim();

  if (!id) {
    return null;
  }

  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    const registros = supabaseSelecionar_(
      "usuarios",
      "select=id_usuario,nome,email,papel,preferencia_tema,ativo,senha_pin&id_usuario=eq." + encodeURIComponent(id) + "&limit=1"
    );

    return registros.length > 0 ? montarUsuarioPlanilhaAPartirSupabase_(registros[0], 0) : null;
  }

  const usuarios = listarUsuariosModel_();
  return usuarios.find(function(usuario) {
    return usuario.ID_Usuario && usuario.ID_Usuario.toString().trim() === id;
  }) || null;
}


function buscarUsuarioPorEmailModel_(emailUsuario) {
  const email = emailUsuario === null || emailUsuario === undefined ? "" : emailUsuario.toString().trim().toLowerCase();

  if (!email) {
    return null;
  }

  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    const registros = supabaseSelecionar_(
      "usuarios",
      "select=id_usuario,nome,email,papel,preferencia_tema,ativo,senha_pin&email=eq." + encodeURIComponent(email) + "&limit=1"
    );

    return registros.length > 0 ? montarUsuarioPlanilhaAPartirSupabase_(registros[0], 0) : null;
  }

  const usuarios = listarUsuariosModel_();
  return usuarios.find(function(usuario) {
    return usuario.Email && usuario.Email.toString().trim().toLowerCase() === email;
  }) || null;
}

/**
 * Salva usuário novo ou atualiza usuário existente.
 *
 * @param {Object} usuario Objeto de usuário já validado pelo Controller.
 * @returns {string} ID_Usuario salvo.
 */
function salvarUsuarioModel_(usuario) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    const idSupabase = salvarUsuarioSupabaseModel_(usuario);
    invalidarCacheUsuarioModel_(idSupabase);
    return idSupabase;
  }

  let banco = conectarBanco_();
  let aba = banco.getSheetByName('USUARIOS');

  if (!aba) {
    throw new Error("Aba USUARIOS não encontrada na planilha.");
  }

  let dadosVetor = [
    usuario.ID_Usuario,
    usuario.Nome,
    usuario.Email,
    usuario.Papel,
    usuario.Preferencia_Tema,
    usuario.Ativo,
    usuario.Senha
  ];

  if (usuario._linhaPlanilha) {
    aba.getRange(usuario._linhaPlanilha, 1, 1, 7).setValues([dadosVetor]);
  } else {
    aba.appendRow(dadosVetor);
  }

  invalidarCacheUsuarioModel_(usuario.ID_Usuario);
  return usuario.ID_Usuario;
}

/**
 * Altera o status Ativo/Inativo de um usuário.
 *
 * @param {number} linhaPlanilha Linha real do usuário na planilha.
 * @param {boolean} statusAtivo Novo status.
 */
function alterarStatusUsuarioModel_(linhaPlanilha, statusAtivo) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    const idSupabase = alterarStatusUsuarioSupabaseModel_(linhaPlanilha, statusAtivo);
    invalidarCacheUsuarioModel_(idSupabase);
    return idSupabase;
  }

  let banco = conectarBanco_();
  let aba = banco.getSheetByName('USUARIOS');

  if (!aba) {
    throw new Error("Aba USUARIOS não encontrada na planilha.");
  }

  let linha = parseInt(linhaPlanilha, 10);

  if (isNaN(linha) || linha <= 1) {
    throw new Error("Linha inválida para alteração de status do usuário.");
  }

  aba.getRange(linha, 6).setValue(statusAtivo);

  const idUsuario = aba.getRange(linha, 1).getValue();
  invalidarCacheUsuarioModel_(idUsuario);
}


function listarUsuariosSupabaseModel_() {
  return supabaseSelecionar_(
    "usuarios",
    "select=id_usuario,nome,email,papel,preferencia_tema,ativo,senha_pin&order=nome.asc"
  ).map(function(item, indice) {
    return montarUsuarioPlanilhaAPartirSupabase_(item, indice);
  });
}


function salvarUsuarioSupabaseModel_(usuario) {
  const idUsuario = usuario.ID_Usuario || Utilities.getUuid();
  const registro = {
    id_usuario: idUsuario,
    nome: usuario.Nome,
    email: usuario.Email,
    papel: usuario.Papel,
    preferencia_tema: usuario.Preferencia_Tema || "Claro",
    ativo: usuario.Ativo === true,
    senha_pin: usuario.Senha === null || usuario.Senha === undefined ? "" : usuario.Senha.toString(),
    updated_at: new Date().toISOString()
  };

  supabaseInserir_("usuarios", registro, "resolution=merge-duplicates,return=representation");

  return idUsuario;
}


function alterarStatusUsuarioSupabaseModel_(linhaOuIdUsuario, statusAtivo) {
  const idUsuario = obterIdUsuarioParaAlteracaoSupabase_(linhaOuIdUsuario);

  if (!idUsuario) {
    throw new Error("Usuario nao encontrado para alteracao de status no Supabase.");
  }

  supabaseAtualizar_(
    "usuarios",
    "id_usuario=eq." + encodeURIComponent(idUsuario),
    {
      ativo: statusAtivo === true,
      updated_at: new Date().toISOString()
    }
  );

  return idUsuario;
}


function invalidarCacheUsuarioModel_(idUsuario) {
  if (typeof invalidarDadosUsuarioSessao_ === "function") {
    invalidarDadosUsuarioSessao_(idUsuario);
  }
}


function obterIdUsuarioParaAlteracaoSupabase_(linhaOuIdUsuario) {
  const texto = linhaOuIdUsuario === null || linhaOuIdUsuario === undefined ? "" : linhaOuIdUsuario.toString().trim();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const usuarios = listarUsuariosSupabaseModel_();
  const usuario = usuarios.find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return usuario ? usuario.ID_Usuario : "";
}


function montarUsuarioPlanilhaAPartirSupabase_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Usuario: item.id_usuario || "",
    Nome: item.nome || "",
    Email: item.email || "",
    Papel: item.papel || "",
    Preferencia_Tema: item.preferencia_tema || "Claro",
    Ativo: item.ativo === true,
    Senha: item.senha_pin || ""
  };
}
