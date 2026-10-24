/**
 * Módulo: Categorias_Controller.gs
 * Responsabilidade:
 * - Aplicar regras de negócio do módulo de categorias.
 * - Garantir privacidade por usuário e administração de categorias globais.
 * - Validar hierarquia, duplicidade, tipo e status com base na sessão do servidor.
 *
 * Funções públicas chamadas pelo front-end:
 * - processarSalvarCategoria(dadosFormulario, tokenSessao)
 * - obterListaCategorias(tokenSessao)
 * - alternarStatusCategoria(idCategoria, tokenSessao)
 */


/**
 * Cria ou atualiza uma categoria.
 *
 * Regras:
 * - Categoria precisa ter Nome e Tipo.
 * - Tipo deve ser Despesa, Receita ou Transferência.
 * - Usuário comum não cria nem transforma categoria em Global.
 * - Em edição, a linha da planilha é redescoberta pelo ID_Categoria.
 * - Apenas criador ou Administrador edita.
 * - Categoria não pode ser subcategoria dela mesma.
 * - Categoria pai precisa existir, estar ativa, ser acessível e ser do mesmo Tipo.
 *
 * @param {Object} dadosFormulario Dados enviados pela View.
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarCategoria(dadosFormulario, tokenSessao) {
  const medidor = criarMedidorPerformance_("Categorias.processarSalvar");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoCategoria_(sessao.id);
  const papelLogado = normalizarTextoCategoria_(sessao.papel) || "Usuário";

  validarDadosBasicosCategoria_(dadosFormulario);

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoCategoriasController_(sessao, medidor);
  });
  const todasCategorias = contexto.categoriasTodas;

  const idAtual = normalizarTextoCategoria_(dadosFormulario.ID_Categoria);
  const isEdicao = !!idAtual;

  let linhaConfiavel = null;
  let criadoPorConfiavel = idLogado;
  let statusConfiavel = true;

  if (isEdicao) {
    const categoriaOriginal = todasCategorias.find(function(categoria) {
      return normalizarTextoCategoria_(categoria.ID_Categoria) === idAtual;
    });

    if (!categoriaOriginal) {
      throw new Error("Categoria original não encontrada.");
    }

    const donoOriginal = normalizarTextoCategoria_(categoriaOriginal.Criado_Por);
    const ehDono = donoOriginal === idLogado;
    const souAdmin = papelLogado === "Administrador";

    if (!ehDono && !souAdmin) {
      throw new Error("Acesso Negado: apenas o criador ou um Administrador pode editar esta categoria.");
    }

    linhaConfiavel = categoriaOriginal._linhaPlanilha;
    criadoPorConfiavel = categoriaOriginal.Criado_Por || idLogado;
    statusConfiavel = normalizarBooleanoCategoria_(categoriaOriginal.Ativa);
  }

  const nomeFinal = normalizarTextoCategoria_(dadosFormulario.Nome);
  const tipoFinal = normalizarTextoCategoria_(dadosFormulario.Tipo);
  const idPaiFinal = normalizarTextoCategoria_(dadosFormulario.ID_Categoria_Pai);

  let globalFinal = (
    dadosFormulario.Global === true ||
    dadosFormulario.Global === "true" ||
    dadosFormulario.Global === "True" ||
    dadosFormulario.Global === 1
  );

  /**
   * Segurança:
   * Mesmo que o usuário comum manipule o HTML, o servidor impede categoria global.
   */
  if (papelLogado !== "Administrador") {
    globalFinal = false;
  }

  validarDuplicidadeCategoria_(todasCategorias, nomeFinal, idAtual, idLogado, papelLogado);
  validarHierarquiaCategoria_(todasCategorias, idAtual, idPaiFinal, tipoFinal, idLogado, papelLogado);

  const categoria = {
    ID_Categoria: idAtual || Utilities.getUuid(),
    Nome: nomeFinal,
    Tipo: tipoFinal,
    ID_Categoria_Pai: idPaiFinal,
    Global: globalFinal,
    Ativa: statusConfiavel,
    Criado_Por: criadoPorConfiavel,
    _linhaPlanilha: linhaConfiavel
  };

  medirEtapaPerformance_(medidor, "salvar_categoria", function() {
    salvarCategoriaModel(categoria);
  });

  registrarContagemPerformance_(medidor, "categoriasTodas", todasCategorias.length);
  finalizarPerformance_(medidor);

  return "Categoria salva com sucesso!";
}


/**
 * Lista categorias acessíveis ao usuário logado.
 *
 * Regras:
 * - Administrador visualiza todas as categorias.
 * - Usuário comum visualiza categorias globais e categorias próprias.
 *
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {Array<Object>} Lista de categorias acessíveis.
 */
function obterListaCategorias(tokenSessao) {
  const medidor = criarMedidorPerformance_("Categorias.obterLista");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoCategoria_(sessao.id);
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoCategoriasController_(sessao, medidor);
  });
  const categorias = medirEtapaPerformance_(medidor, "filtrar_acesso", function() {
    if (sessao.papel === "Administrador") {
      return contexto.categoriasTodas;
    }

    return contexto.categoriasTodas.filter(function(categoria) {
      const dono = normalizarTextoCategoria_(categoria.Criado_Por);
      const global = normalizarBooleanoCategoria_(categoria.Global);

      return global || dono === idLogado;
    });
  });

  registrarContagemPerformance_(medidor, "categoriasTodas", contexto.categoriasTodas.length);
  registrarContagemPerformance_(medidor, "categoriasRetornadas", categorias.length);
  finalizarPerformance_(medidor);

  return categorias;
}


/**
 * Monta o contexto enxuto para a tela de categorias.
 *
 * Em Supabase, usa o RPC leve de cadastros para evitar chamadas REST separadas.
 * Em fallback, preserva a leitura tradicional pelo Model.
 *
 * @param {Object} sessao Sessão validada.
 * @param {Object} medidorPerformance Medidor do fluxo.
 * @returns {Object} Contexto com categorias.
 */
function montarContextoCategoriasController_(sessao, medidorPerformance) {
  const idLogado = normalizarTextoCategoria_(sessao.id);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoCadastrosSupabaseRpc_ === "function"
      ? obterContextoCadastrosSupabaseRpc_(idLogado, false)
      : null;
  });

  return {
    categoriasTodas: medirEtapaPerformance_(medidorPerformance, "consulta_categorias", function() {
      return contextoRpc && contextoRpc.categoriasTodas
        ? contextoRpc.categoriasTodas
        : listarCategoriasModel();
    })
  };
}


/**
 * Alterna o status de uma categoria.
 *
 * Regras:
 * - Apenas criador ou Administrador pode alterar status.
 * - A linha da planilha é redescoberta pelo ID_Categoria.
 * - A View envia apenas o ID_Categoria; nunca envia linha nem status confiável.
 *
 * @param {string} idCategoria ID da categoria alvo.
 * @param {string} tokenSessao Token de sessão emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function alternarStatusCategoria(idCategoria, tokenSessao) {
  const medidor = criarMedidorPerformance_("Categorias.alternarStatus");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoCategoria_(sessao.id);
  const id = normalizarTextoCategoria_(idCategoria);

  if (!id) {
    throw new Error("Categoria não informada.");
  }

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoCategoriasController_(sessao, medidor);
  });
  const todasCategorias = contexto.categoriasTodas;

  const categoria = todasCategorias.find(function(item) {
    return normalizarTextoCategoria_(item.ID_Categoria) === id;
  });

  if (!categoria) {
    throw new Error("Categoria não encontrada.");
  }

  const dono = normalizarTextoCategoria_(categoria.Criado_Por);
  const ehDono = dono === idLogado;
  const souAdmin = sessao.papel === "Administrador";

  if (!ehDono && !souAdmin) {
    throw new Error("Acesso Negado: apenas o criador ou um Administrador pode alterar o status desta categoria.");
  }

  const novoStatus = !normalizarBooleanoCategoria_(categoria.Ativa);

  medirEtapaPerformance_(medidor, "alterar_status", function() {
    alterarStatusCategoriaModel(obterIdentificadorAlteracaoCategoria_(categoria), novoStatus);
  });

  registrarContagemPerformance_(medidor, "categoriasTodas", todasCategorias.length);
  finalizarPerformance_(medidor);

  return novoStatus ? "Categoria reativada com sucesso." : "Categoria inativada com sucesso.";
}


function obterIdentificadorAlteracaoCategoria_(categoria) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return normalizarTextoCategoria_(categoria.ID_Categoria);
  }

  return categoria._linhaPlanilha;
}


/**
 * Valida campos obrigatórios e domínio do Tipo.
 *
 * @param {Object} dados Dados enviados pela View.
 */
function validarDadosBasicosCategoria_(dados) {
  if (!dados) {
    throw new Error("Dados da categoria não recebidos.");
  }

  const nome = normalizarTextoCategoria_(dados.Nome);
  const tipo = normalizarTextoCategoria_(dados.Tipo);

  if (!nome) {
    throw new Error("O nome da categoria é obrigatório.");
  }

  if (!tipo) {
    throw new Error("O tipo da categoria é obrigatório.");
  }

  const tiposPermitidos = ["Despesa", "Receita", "Transferência"];

  if (tiposPermitidos.indexOf(tipo) === -1) {
    throw new Error("Tipo de categoria inválido.");
  }
}


/**
 * Impede duplicidade de categoria dentro da visão do usuário.
 *
 * @param {Array<Object>} categorias Lista completa de categorias.
 * @param {string} nome Nome final da categoria.
 * @param {string} idAtual ID da categoria em edição, se houver.
 * @param {string} idLogado ID do usuário logado.
 * @param {string} papelLogado Papel do usuário logado.
 */
function validarDuplicidadeCategoria_(categorias, nome, idAtual, idLogado, papelLogado) {
  const nomeLower = nome.toString().trim().toLowerCase();

  const duplicada = categorias.find(function(categoria) {
    const mesmoNome = categoria.Nome &&
      categoria.Nome.toString().trim().toLowerCase() === nomeLower;

    const idDiferente = normalizarTextoCategoria_(categoria.ID_Categoria) !== idAtual;

    const dono = normalizarTextoCategoria_(categoria.Criado_Por);
    const global = normalizarBooleanoCategoria_(categoria.Global);

    const visivelParaMim = (
      papelLogado === "Administrador" ||
      global ||
      dono === idLogado
    );

    return mesmoNome && idDiferente && visivelParaMim;
  });

  if (duplicada) {
    throw new Error('Já existe uma categoria cadastrada com o nome "' + nome + '".');
  }
}


/**
 * Valida a relação de hierarquia da categoria.
 *
 * Regras:
 * - Categoria não pode ser pai dela mesma.
 * - Categoria pai precisa existir.
 * - Categoria pai precisa estar ativa.
 * - Categoria pai precisa ser do mesmo tipo.
 * - Categoria pai precisa estar acessível ao usuário.
 *
 * @param {Array<Object>} categorias Lista completa de categorias.
 * @param {string} idAtual ID da categoria em edição.
 * @param {string} idPai ID da categoria pai.
 * @param {string} tipo Tipo da categoria.
 * @param {string} idLogado ID do usuário logado.
 * @param {string} papelLogado Papel do usuário logado.
 */
function validarHierarquiaCategoria_(categorias, idAtual, idPai, tipo, idLogado, papelLogado) {
  if (!idPai) return;

  if (idPai === idAtual) {
    throw new Error("Uma categoria não pode ser subcategoria dela mesma.");
  }

  const pai = categorias.find(function(categoria) {
    return normalizarTextoCategoria_(categoria.ID_Categoria) === idPai;
  });

  if (!pai) {
    throw new Error("Categoria pai não encontrada.");
  }

  if (!normalizarBooleanoCategoria_(pai.Ativa)) {
    throw new Error("A categoria pai precisa estar ativa.");
  }

  if (pai.Tipo !== tipo) {
    throw new Error("A categoria pai precisa ser do mesmo tipo da subcategoria.");
  }

  const donoPai = normalizarTextoCategoria_(pai.Criado_Por);
  const paiGlobal = normalizarBooleanoCategoria_(pai.Global);

  const paiAcessivel = (
    papelLogado === "Administrador" ||
    paiGlobal ||
    donoPai === idLogado
  );

  if (!paiAcessivel) {
    throw new Error("Categoria pai inacessível para este usuário.");
  }
}


/**
 * Normaliza texto para comparação segura.
 *
 * @param {*} valor Valor original.
 * @returns {string} Texto normalizado.
 */
function normalizarTextoCategoria_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


/**
 * Normaliza valores booleanos vindos da planilha.
 *
 * @param {*} valor Valor original.
 * @returns {boolean} Valor booleano normalizado.
 */
function normalizarBooleanoCategoria_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
