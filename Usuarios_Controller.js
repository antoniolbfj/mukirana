/**
 * Módulo: Usuarios_Controller.gs
 * Responsabilidade:
 * - Aplicar regras de acesso do módulo de usuários.
 * - Proteger dados sensíveis, especialmente Senha/PIN.
 * - Garantir que permissões venham da sessão validada no servidor.
 *
 * Observação importante:
 * A senha/PIN ainda está armazenada em texto puro na planilha, conforme arquitetura atual.
 * Este módulo reduz a exposição da senha na interface, mas a migração para hash de senha
 * deve ser tratada em etapa própria para não quebrar o login existente.
 */

/**
 * Lista usuários de forma segura para a interface.
 *
 * Regras:
 * - Administrador visualiza todos os usuários.
 * - Usuário comum visualiza apenas o próprio registro.
 * - Senha/PIN nunca é retornada na listagem.
 *
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {Array<Object>} Lista sanitizada de usuários.
 */
function obterListaUsuarios(tokenSessao) {
  const medidor = criarMedidorPerformance_("Usuarios.obterLista");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoUsuariosController_(sessao, medidor);
  });

  let listaFiltrada = [];

  listaFiltrada = medirEtapaPerformance_(medidor, "filtrar_acesso", function() {
    if (sessao.papel === 'Administrador') {
      return contexto.usuariosTodos;
    }

    return contexto.usuariosTodos.filter(function(u) {
      return lancNormalizarIdUsuario_(u.ID_Usuario) === sessao.id ||
        ehPapelUsuarioVirtual_(u.Papel);
    });
  });

  const lista = listaFiltrada.map(function(u) {
    return sanitizarUsuarioParaListagem_(u);
  });

  registrarContagemPerformance_(medidor, "usuariosTodos", contexto.usuariosTodos.length);
  registrarContagemPerformance_(medidor, "usuariosRetornados", lista.length);
  finalizarPerformance_(medidor);

  return lista;
}


/**
 * Monta o contexto enxuto para a tela de usuários.
 *
 * Em Supabase, usa o RPC leve de cadastros para buscar usuários no mesmo padrão
 * de desempenho dos demais cadastros. A sanitização continua acontecendo antes
 * de devolver dados para a interface.
 *
 * @param {Object} sessao Sessão validada.
 * @param {Object} medidorPerformance Medidor do fluxo.
 * @returns {Object} Contexto com usuários.
 */
function montarContextoUsuariosController_(sessao, medidorPerformance) {
  const idLogado = lancNormalizarIdUsuario_(sessao.id);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoCadastrosSupabaseRpc_ === "function"
      ? obterContextoCadastrosSupabaseRpc_(idLogado, false)
      : null;
  });

  return {
    usuariosTodos: medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
      return contextoRpc && contextoRpc.usuariosTodos
        ? contextoRpc.usuariosTodos
        : listarUsuariosModel();
    })
  };
}

/**
 * Busca um usuário específico para edição.
 *
 * Regras:
 * - Administrador pode carregar qualquer usuário.
 * - Usuário comum só pode carregar o próprio perfil.
 * - Senha/PIN nunca é retornada; campo de senha na View fica em branco.
 *
 * @param {string} idUsuarioAlvo ID_Usuario do registro a editar.
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {Object} Usuário sanitizado para edição.
 */
function obterUsuarioParaEdicao(idUsuarioAlvo, tokenSessao) {
  const medidor = criarMedidorPerformance_("Usuarios.obterParaEdicao");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idAlvo = lancNormalizarIdUsuario_(idUsuarioAlvo);

  if (!idAlvo) {
    throw new Error("Usuário não informado para edição.");
  }

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoUsuariosController_(sessao, medidor);
  });
  const usuario = medirEtapaPerformance_(medidor, "buscar_usuario", function() {
    return (contexto.usuariosTodos || []).find(function(item) {
      return lancNormalizarIdUsuario_(item.ID_Usuario) === idAlvo;
    }) || null;
  });

  if (!usuario) {
    throw new Error("Usuário não encontrado.");
  }

  const ehProprioUsuario = idAlvo === sessao.id;
  const souAdmin = sessao.papel === 'Administrador';
  const ehUsuarioVirtual = ehPapelUsuarioVirtual_(usuario.Papel);

  if (!souAdmin && !ehProprioUsuario && !ehUsuarioVirtual) {
    throw new Error("Acesso Negado: você só pode editar o seu próprio perfil.");
  }

  registrarContagemPerformance_(medidor, "usuariosTodos", contexto.usuariosTodos.length);
  finalizarPerformance_(medidor);

  return sanitizarUsuarioParaListagem_(usuario);
}

/**
 * Cria ou atualiza um usuário.
 *
 * Regras de segurança:
 * - Apenas Administrador cria novos usuários.
 * - Usuário comum só edita o próprio perfil.
 * - Usuário comum não altera e-mail, papel ou status.
 * - Em edição, linha da planilha é redescoberta pelo servidor.
 * - Senha/PIN em branco, durante edição, preserva a senha atual.
 * - E-mail deve ser único.
 *
 * @param {Object} dadosFormulario Dados vindos da View.
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarUsuario(dadosFormulario, tokenSessao) {
  const medidor = criarMedidorPerformance_("Usuarios.processarSalvar");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoUsuariosController_(sessao, medidor);
  });
  const usuarios = contexto.usuariosTodos;

  validarDadosBasicosUsuario_(dadosFormulario);

  const idInformado = lancNormalizarIdUsuario_(dadosFormulario.ID_Usuario);
  const isEdicao = !!idInformado;
  const souAdmin = sessao.papel === 'Administrador';

  let usuarioOriginal = null;
  let linhaConfiavel = null;
  let ativoConfiavel = true;
  let idUsuarioFinal = idInformado || Utilities.getUuid();

  if (isEdicao) {
    usuarioOriginal = usuarios.find(function(u) {
      return lancNormalizarIdUsuario_(u.ID_Usuario) === idInformado;
    });

    if (!usuarioOriginal) {
      throw new Error("Usuário original não encontrado.");
    }

    const ehProprioUsuario = idInformado === sessao.id;

    const ehUsuarioVirtual = ehPapelUsuarioVirtual_(usuarioOriginal.Papel);

    if (!souAdmin && !ehProprioUsuario && !ehUsuarioVirtual) {
      throw new Error("Acesso Negado: você só pode atualizar o seu próprio perfil.");
    }

    linhaConfiavel = usuarioOriginal._linhaPlanilha;
    ativoConfiavel = normalizarBooleanoUsuario_(usuarioOriginal.Ativo);
  }

  let nomeFinal = dadosFormulario.Nome.toString().trim();
  let emailFinal = dadosFormulario.Email ? dadosFormulario.Email.toString().trim().toLowerCase() : "";
  let papelFinal = dadosFormulario.Papel ? dadosFormulario.Papel.toString().trim() : "Usuário";
  let temaFinal = dadosFormulario.Preferencia_Tema ? dadosFormulario.Preferencia_Tema.toString().trim() : "Claro";
  let senhaFinal = dadosFormulario.Senha ? dadosFormulario.Senha.toString().trim() : "";

  if (!souAdmin && !isEdicao) {
    papelFinal = "Usu\u00e1rio Virtual";
  }

  validarPapelUsuario_(papelFinal);
  validarTemaUsuario_(temaFinal);

  /**
   * Usuário comum não pode alterar e-mail nem papel.
   * Mesmo que manipule o HTML/localStorage, o servidor restaura os valores confiáveis.
   */
  if (isEdicao && !souAdmin && !ehPapelUsuarioVirtual_(usuarioOriginal.Papel)) {
    emailFinal = usuarioOriginal.Email.toString().trim().toLowerCase();
    papelFinal = usuarioOriginal.Papel || "Usuário";
  }

  /**
   * Senha/PIN em branco preserva a senha atual em edição.
   * Para novo usuário, a senha/PIN é obrigatória.
   */
  if (isEdicao && !souAdmin && ehPapelUsuarioVirtual_(usuarioOriginal.Papel)) {
    papelFinal = "Usu\u00e1rio Virtual";
  }

  if (isEdicao && !senhaFinal) {
    senhaFinal = usuarioOriginal.Senha || "";
  }

  if (ehPapelUsuarioVirtual_(papelFinal)) {
    emailFinal = emailFinal || gerarEmailTecnicoUsuarioVirtual_(idUsuarioFinal);
    senhaFinal = senhaFinal || Utilities.getUuid();
  }

  if (!isEdicao && !senhaFinal) {
    throw new Error("A senha/PIN é obrigatória para cadastrar novo usuário.");
  }

  validarEmailUnicoUsuario_(usuarios, emailFinal, idUsuarioFinal);

  let usuario = {
    ID_Usuario: idUsuarioFinal,
    Nome: nomeFinal,
    Email: emailFinal,
    Papel: papelFinal,
    Preferencia_Tema: temaFinal,
    Ativo: ativoConfiavel,
    Senha: senhaFinal,
    _linhaPlanilha: linhaConfiavel
  };

  medirEtapaPerformance_(medidor, "salvar_usuario", function() {
    salvarUsuarioModel(usuario);
  });
  registrarContagemPerformance_(medidor, "usuariosTodos", usuarios.length);
  finalizarPerformance_(medidor);

  return "Usuário salvo com sucesso!";
}

/**
 * Alterna status de um usuário.
 *
 * Regras:
 * - Apenas Administrador pode ativar/inativar usuários.
 * - Administrador não pode inativar o próprio usuário logado.
 * - A linha da planilha é obtida no servidor pelo ID_Usuario.
 *
 * @param {string} idUsuarioAlvo ID do usuário que terá o status alterado.
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function alternarStatusUsuario(idUsuarioAlvo, tokenSessao) {
  const medidor = criarMedidorPerformance_("Usuarios.alternarStatus");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });

  const idAlvo = lancNormalizarIdUsuario_(idUsuarioAlvo);

  if (!idAlvo) {
    throw new Error("Usuário não informado.");
  }

  if (idAlvo === sessao.id) {
    throw new Error("Você não pode inativar o próprio usuário logado.");
  }

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoUsuariosController_(sessao, medidor);
  });
  const usuarioAlvo = medirEtapaPerformance_(medidor, "buscar_usuario", function() {
    return (contexto.usuariosTodos || []).find(function(usuario) {
      return lancNormalizarIdUsuario_(usuario.ID_Usuario) === idAlvo;
    }) || null;
  });

  if (!usuarioAlvo) {
    throw new Error("Usuário não encontrado.");
  }

  if (sessao.papel !== 'Administrador' && !ehPapelUsuarioVirtual_(usuarioAlvo.Papel)) {
    throw new Error("Acesso Negado: você só pode ativar ou inativar usuários virtuais.");
  }

  const novoStatus = !normalizarBooleanoUsuario_(usuarioAlvo.Ativo);

  medirEtapaPerformance_(medidor, "alterar_status", function() {
    alterarStatusUsuarioModel(
      typeof bancoUsaSupabase === "function" && bancoUsaSupabase()
        ? idAlvo
        : usuarioAlvo._linhaPlanilha,
      novoStatus
    );
  });
  registrarContagemPerformance_(medidor, "usuariosTodos", contexto.usuariosTodos.length);
  finalizarPerformance_(medidor);

  return novoStatus ? "Usuário ativado." : "Usuário inativado.";
}

/**
 * Atualiza rapidamente o tema do próprio usuário logado.
 *
 * Esta função é mantida para uso futuro ou atalhos de interface.
 * O ID do usuário não é aceito pelo front-end; vem da sessão.
 *
 * @param {string} novoTema Tema desejado: Claro ou Escuro.
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {boolean} True quando a atualização é concluída.
 */
function atualizarTemaRapido(novoTema, tokenSessao) {
  const medidor = criarMedidorPerformance_("Usuarios.atualizarTemaRapido");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });

  validarTemaUsuario_(novoTema);

  const usuario = medirEtapaPerformance_(medidor, "buscar_usuario", function() {
    return buscarUsuarioPorIdController_(sessao.id);
  });

  if (!usuario) {
    throw new Error("Usuário da sessão não encontrado.");
  }

  let usuarioAtualizado = {
    ID_Usuario: usuario.ID_Usuario,
    Nome: usuario.Nome,
    Email: usuario.Email,
    Papel: usuario.Papel,
    Preferencia_Tema: novoTema,
    Ativo: normalizarBooleanoUsuario_(usuario.Ativo),
    Senha: usuario.Senha,
    _linhaPlanilha: usuario._linhaPlanilha
  };

  medirEtapaPerformance_(medidor, "salvar_usuario", function() {
    salvarUsuarioModel(usuarioAtualizado);
  });
  finalizarPerformance_(medidor);

  return true;
}


function buscarUsuarioPorIdController_(idUsuario) {
  const id = lancNormalizarIdUsuario_(idUsuario);

  if (!id) {
    return null;
  }

  if (typeof buscarUsuarioPorIdModel === "function") {
    return buscarUsuarioPorIdModel(id);
  }

  return listarUsuariosModel().find(function(u) {
    return lancNormalizarIdUsuario_(u.ID_Usuario) === id;
  }) || null;
}

/**
 * Remove a senha/PIN antes de devolver dados para a interface.
 *
 * @param {Object} usuario Registro completo vindo do Model.
 * @returns {Object} Registro seguro para o front-end.
 */
function sanitizarUsuarioParaListagem_(usuario) {
  return {
    _linhaPlanilha: usuario._linhaPlanilha,
    ID_Usuario: usuario.ID_Usuario || "",
    Nome: usuario.Nome || "",
    Email: usuario.Email || "",
    Papel: usuario.Papel || "Usuário",
    Preferencia_Tema: usuario.Preferencia_Tema || "Claro",
    Ativo: normalizarBooleanoUsuario_(usuario.Ativo)
  };
}


function ehPapelUsuarioVirtual_(papel) {
  return normalizarTextoUsuario_(papel).indexOf("Virtual") !== -1;
}


function normalizarTextoUsuario_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function gerarEmailTecnicoUsuarioVirtual_(idUsuario) {
  const id = lancNormalizarIdUsuario_(idUsuario) || Utilities.getUuid();
  return "virtual-" + id + "@mukirana.local";
}

/**
 * Valida campos básicos antes de criar/editar usuário.
 *
 * @param {Object} dados Dados do formulário.
 */
function validarDadosBasicosUsuario_(dados) {
  if (!dados) {
    throw new Error("Dados do usuário não recebidos.");
  }

  if (!dados.Nome || dados.Nome.toString().trim() === "") {
    throw new Error("O nome do usuário é obrigatório.");
  }

  const ehVirtual = ehPapelUsuarioVirtual_(dados.Papel);
  const email = dados.Email ? dados.Email.toString().trim().toLowerCase() : "";

  if (!ehVirtual && !email) {
    throw new Error("O e-mail do usuário é obrigatório.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
}

/**
 * Valida se o papel informado pertence ao conjunto permitido.
 *
 * @param {string} papel Papel informado no formulário.
 */
function validarPapelUsuario_(papel) {
  const papeisPermitidos = ["Administrador", "Usuário", "Usuário Virtual"];

  if (papeisPermitidos.indexOf(papel) === -1) {
    throw new Error("Papel de usuário inválido.");
  }
}

/**
 * Valida se o tema informado pertence ao conjunto permitido.
 *
 * @param {string} tema Tema informado no formulário.
 */
function validarTemaUsuario_(tema) {
  const temasPermitidos = ["Claro", "Escuro"];

  if (temasPermitidos.indexOf(tema) === -1) {
    throw new Error("Tema inválido.");
  }
}

/**
 * Impede duplicidade de e-mail entre usuários.
 *
 * @param {Array<Object>} usuarios Lista completa de usuários.
 * @param {string} email Email normalizado.
 * @param {string} idUsuarioAtual ID do usuário atual, usado para ignorar o próprio registro em edição.
 */
function validarEmailUnicoUsuario_(usuarios, email, idUsuarioAtual) {
  const duplicado = usuarios.find(function(u) {
    const emailAtual = u.Email ? u.Email.toString().trim().toLowerCase() : "";
    const idAtual = lancNormalizarIdUsuario_(u.ID_Usuario);

    return emailAtual === email && idAtual !== idUsuarioAtual;
  });

  if (duplicado) {
    throw new Error("Já existe um usuário cadastrado com este e-mail.");
  }
}

/**
 * Normaliza valores booleanos vindos da planilha.
 *
 * @param {*} valor Valor original.
 * @returns {boolean} Valor normalizado.
 */
function normalizarBooleanoUsuario_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}

/**
 * Normaliza IDs de usuário para comparação segura.
 *
 * @param {*} valor Valor original.
 * @returns {string} ID normalizado.
 */
function lancNormalizarIdUsuario_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}
