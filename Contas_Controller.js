/**
 * Modulo: Contas_Controller.gs
 * Responsabilidade:
 * - Aplicar regras de negocio do cadastro de contas.
 * - Garantir privacidade por usuario com validacao sempre no servidor.
 * - Suportar contas próprias e contas compartilhadas.
 * - Bloquear nomes duplicados entre contas do mesmo proprietario.
 * - Informar a View sobre vinculos com lancamentos para orientar o usuario.
 */


/**
 * Lista contas acessiveis ao usuario logado.
 *
 * Regras:
 * - Dono visualiza e gerencia as próprias contas.
 * - Participante visualiza contas compartilhadas com ele em modo consulta.
 * - Conta inativa continua consultavel quando a View ativa o filtro de inativas.
 *
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {Array<Object>} Contas acessiveis com metadados para a View.
 */
function obterListaContas(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("Contas.obterLista");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoContaController_(sessao.id);
  const intervalo = medirEtapaPerformance_(medidor, "normalizar_periodo", function() {
    return typeof normalizarIntervaloMesesConsolidadoController_ === "function"
      ? normalizarIntervaloMesesConsolidadoController_(
          filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia),
          filtros && filtros.Mes_Final,
          true
        )
      : {
          Mes_Inicial: "",
          Mes_Final: ""
        };
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoListaContasController_(sessao, medidor);
  });
  const idsContasComLancamentos = medirEtapaPerformance_(medidor, "mapear_vinculos", function() {
    return mapearContasComLancamentosController_(contexto.lancamentos);
  });
  const consolidadoPeriodo = medirEtapaPerformance_(medidor, "montar_consolidado_periodo", function() {
    return montarConsolidadoPeriodoContasController_(sessao, intervalo, medidor, filtros);
  });

  const lista = medirEtapaPerformance_(medidor, "montar_lista", function() {
    return contexto.contas
      .filter(function(conta) {
        return usuarioPodeVisualizarContaController_(conta, idLogado);
      })
      .map(function(conta) {
        return montarContaParaViewController_(
          conta,
          idLogado,
          contexto.usuarios,
          idsContasComLancamentos,
          consolidadoPeriodo[normalizarTextoContaController_(conta.ID_Conta)] || null
        );
      });
  });

  registrarContagemPerformance_(medidor, "contasTodas", contexto.contas.length);
  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentos.length);
  registrarContagemPerformance_(medidor, "contasRetornadas", lista.length);
  finalizarPerformance_(medidor);

  return lista;
}


function montarConsolidadoPeriodoContasController_(sessao, intervalo, medidorPerformance, filtrosOriginais) {
  const inicio = intervalo && intervalo.Mes_Inicial ? intervalo.Mes_Inicial : "";
  const fim = intervalo && intervalo.Mes_Final ? intervalo.Mes_Final : "";
  const idLogado = normalizarTextoContaController_(sessao.id);
  const considerarHistoricoAnterior = !(filtrosOriginais && filtrosOriginais.Considerar_Historico_Anterior === false);
  const contextoFinanceiro = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_financeiro", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, fim || inicio, considerarHistoricoAnterior)
      : null;
  });
  const contexto = contextoFinanceiro
    ? montarContextoConsolidadosAPartirBase_(sessao, contextoFinanceiro, null, "RPC")
    : montarContextoConsolidadosAPartirBase_(sessao, null, null, "MODELS");
  const lancamentosVisiveis = obterLancamentosVisiveisConsolidadosController_(contexto);
  const contasConsolidadas = calcularContasConsolidadasController_(contexto, lancamentosVisiveis, {
    Mes_Referencia: fim || inicio || (typeof gerarMesAtualConsolidadoController_ === "function" ? gerarMesAtualConsolidadoController_() : ""),
    Considerar_Historico_Anterior: considerarHistoricoAnterior
  });
  const recorrenciasProgramadas = typeof gerarLancamentosProgramadosRecorrenciasConsolidadoController_ === "function"
    ? gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, {
        Mes_Inicial: inicio,
        Mes_Final: fim || inicio,
        Mes_Referencia: inicio || fim
      })
    : { lancamentos: [] };
  const lancamentosPeriodo = lancamentosVisiveis.filter(function(lancamento) {
    return mesReferenciaEstaNoIntervaloConsolidadoController_(
      normalizarTextoConsolidadoController_(lancamento.Mes_Referencia),
      inicio,
      fim
    );
  });
  const mapa = {};

  contasConsolidadas.forEach(function(conta) {
    mapa[normalizarTextoContaController_(conta.ID_Conta)] = {
      Saldo_Lancado: normalizarNumeroContaController_(conta.Saldo_Lancado),
      Saldo_Projetado: normalizarNumeroContaController_(conta.Saldo_Projetado),
      Receitas: 0,
      Despesas: 0,
      Transferencias_Entrada: 0,
      Transferencias_Saida: 0,
      Pagamentos_Faturas: 0,
      Resultado_Periodo: 0,
      Resultado_Periodo_Projetado: 0,
      Quantidade_Lancamentos: 0,
      Quantidade_Recorrencias_Programadas: 0,
      Total_Recorrencias_Programadas: 0,
      Recorrencias_Programadas: [],
      Mes_Inicial: inicio,
      Mes_Final: fim
    };
  });

  lancamentosPeriodo.forEach(function(lancamento) {
    const tipo = normalizarTextoContaController_(lancamento.Tipo);
    const tipoOrigem = normalizarTextoContaController_(lancamento.Tipo_Origem);
    const idOrigem = normalizarTextoContaController_(lancamento.ID_Origem);
    const idDestino = normalizarTextoContaController_(lancamento.ID_Destino);
    const valor = normalizarNumeroContaController_(lancamento.Valor_Total);

    if (tipo === "Receita" && tipoOrigem === "Conta" && mapa[idOrigem]) {
      mapa[idOrigem].Receitas += valor;
      mapa[idOrigem].Resultado_Periodo += valor;
      mapa[idOrigem].Quantidade_Lancamentos += 1;
    } else if (tipo === "Despesa" && tipoOrigem === "Conta" && mapa[idOrigem]) {
      mapa[idOrigem].Despesas += valor;
      mapa[idOrigem].Resultado_Periodo -= valor;
      mapa[idOrigem].Quantidade_Lancamentos += 1;
    } else if (tipo === "Transferência") {
      if (mapa[idOrigem]) {
        mapa[idOrigem].Transferencias_Saida += valor;
        mapa[idOrigem].Resultado_Periodo -= valor;
        mapa[idOrigem].Quantidade_Lancamentos += 1;
      }

      if (mapa[idDestino]) {
        mapa[idDestino].Transferencias_Entrada += valor;
        mapa[idDestino].Resultado_Periodo += valor;
        mapa[idDestino].Quantidade_Lancamentos += 1;
      }
    }
  });

  (contexto.pagamentosFaturasTodos || []).forEach(function(pagamento) {
    const mesPagamento = obterMesPagamentoFaturaContaController_(pagamento);
    const idConta = normalizarTextoContaController_(pagamento.ID_Conta);
    const valor = normalizarNumeroContaController_(pagamento.Valor);

    if (!mesReferenciaEstaNoIntervaloConsolidadoController_(mesPagamento, inicio, fim) || !mapa[idConta]) {
      return;
    }

    mapa[idConta].Pagamentos_Faturas += valor;
    mapa[idConta].Resultado_Periodo -= valor;
    mapa[idConta].Quantidade_Lancamentos += 1;
  });

  (recorrenciasProgramadas.lancamentos || []).forEach(function(lancamento) {
    registrarRecorrenciaProgramadaContaController_(mapa, lancamento);
  });

  Object.keys(mapa).forEach(function(idConta) {
    const consolidado = mapa[idConta];
    consolidado.Receitas = arredondarConsolidadoController_(consolidado.Receitas);
    consolidado.Despesas = arredondarConsolidadoController_(consolidado.Despesas);
    consolidado.Transferencias_Entrada = arredondarConsolidadoController_(consolidado.Transferencias_Entrada);
    consolidado.Transferencias_Saida = arredondarConsolidadoController_(consolidado.Transferencias_Saida);
    consolidado.Pagamentos_Faturas = arredondarConsolidadoController_(consolidado.Pagamentos_Faturas);
    consolidado.Resultado_Periodo = arredondarConsolidadoController_(consolidado.Resultado_Periodo);
    consolidado.Total_Recorrencias_Programadas = arredondarConsolidadoController_(consolidado.Total_Recorrencias_Programadas);
    consolidado.Resultado_Periodo_Projetado = arredondarConsolidadoController_(
      consolidado.Resultado_Periodo + consolidado.Total_Recorrencias_Programadas
    );
    consolidado.Saldo_Projetado = arredondarConsolidadoController_(
      consolidado.Saldo_Lancado + consolidado.Total_Recorrencias_Programadas
    );
  });

  return mapa;
}


function obterMesPagamentoFaturaContaController_(pagamento) {
  const dataPagamento = normalizarTextoContaController_(pagamento && pagamento.Data_Pagamento);

  if (/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return dataPagamento.substring(0, 7);
  }

  const mesReferencia = normalizarTextoContaController_(pagamento && pagamento.Mes_Referencia);

  if (/^\d{4}-\d{2}-\d{2}$/.test(mesReferencia)) {
    return mesReferencia.substring(0, 7);
  }

  return /^\d{4}-\d{2}$/.test(mesReferencia) ? mesReferencia : "";
}


function registrarRecorrenciaProgramadaContaController_(mapa, lancamento) {
  const tipo = normalizarTextoContaController_(lancamento.Tipo);
  const tipoOrigem = normalizarTextoContaController_(lancamento.Tipo_Origem);
  const idOrigem = normalizarTextoContaController_(lancamento.ID_Origem);
  const idDestino = normalizarTextoContaController_(lancamento.ID_Destino);
  const valor = normalizarNumeroContaController_(lancamento.Valor_Total);

  if (tipo === "Receita" && tipoOrigem === "Conta") {
    adicionarRecorrenciaProgramadaContaController_(mapa, idOrigem, lancamento, valor);
    return;
  }

  if (tipo === "Despesa" && tipoOrigem === "Conta") {
    adicionarRecorrenciaProgramadaContaController_(mapa, idOrigem, lancamento, -valor);
    return;
  }

  if (tipo === "Transferência") {
    adicionarRecorrenciaProgramadaContaController_(mapa, idOrigem, lancamento, -valor);
    adicionarRecorrenciaProgramadaContaController_(mapa, idDestino, lancamento, valor);
  }
}


function adicionarRecorrenciaProgramadaContaController_(mapa, idConta, lancamento, impacto) {
  const id = normalizarTextoContaController_(idConta);

  if (!id || !mapa[id]) {
    return;
  }

  mapa[id].Quantidade_Recorrencias_Programadas += 1;
  mapa[id].Total_Recorrencias_Programadas += impacto;
  mapa[id].Recorrencias_Programadas.push({
    ID_Lancamento: normalizarTextoContaController_(lancamento.ID_Lancamento),
    ID_Recorrencia_Origem: normalizarTextoContaController_(lancamento.ID_Recorrencia_Origem),
    Descricao: normalizarTextoContaController_(lancamento.Descricao),
    Tipo: normalizarTextoContaController_(lancamento.Tipo),
    Data_Ocorrencia: normalizarTextoContaController_(lancamento.Data_Ocorrencia),
    Mes_Referencia: normalizarTextoContaController_(lancamento.Mes_Referencia),
    Valor_Impacto: arredondarConsolidadoController_(impacto),
    Somente_Leitura: true
  });
}


function montarContextoListaContasController_(sessao, medidorPerformance) {
  const idLogado = normalizarTextoContaController_(sessao.id);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoCadastrosSupabaseRpc_ === "function"
      ? obterContextoCadastrosSupabaseRpc_(idLogado, true)
      : null;
  });

  return {
    contas: medirEtapaPerformance_(medidorPerformance, "consulta_contas", function() {
      return contextoRpc ? contextoRpc.contasTodas : listarContasModel();
    }),
    usuarios: medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
      return contextoRpc ? contextoRpc.usuariosTodos : typeof listarUsuariosModel === "function" ? listarUsuariosModel() : [];
    }),
    lancamentos: medirEtapaPerformance_(medidorPerformance, "consulta_lancamentos", function() {
      return contextoRpc ? contextoRpc.lancamentosVinculos : typeof listarLancamentosModel === "function" ? listarLancamentosModel() : [];
    })
  };
}


/**
 * Lista usuários ativos que podem ser vinculados a uma conta compartilhada.
 *
 * @param {string} idConta ID da conta em edição ou vazio.
 * @param {string} tokenSessao Token de sessão.
 * @returns {Object} Lista segura de usuários e permissão de gerenciamento.
 */
function obterUsuariosCompartilhaveisConta(idConta, tokenSessao) {
  const medidor = criarMedidorPerformance_("Contas.obterUsuariosCompartilhaveis");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoContaController_(sessao.id);
  const id = normalizarTextoContaController_(idConta);
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoCadastroContaController_(sessao, medidor, false);
  });

  let podeAlterarCompartilhamento = true;

  if (id) {
    const conta = buscarContaPorIdController_(id, contexto.contas);
    podeAlterarCompartilhamento = normalizarTextoContaController_(conta.ID_Usuario) === idLogado;
  }

  const retorno = {
    podeAlterarCompartilhamento: podeAlterarCompartilhamento,
    usuarios: contexto.usuarios
      .filter(function(usuario) {
        const ativo = normalizarBooleanoContaController_(usuario.Ativo);
        const idUsuario = normalizarTextoContaController_(usuario.ID_Usuario);
        return ativo && idUsuario && idUsuario !== idLogado;
      })
      .map(function(usuario) {
        return {
          id: normalizarTextoContaController_(usuario.ID_Usuario),
          nome: normalizarTextoContaController_(usuario.Nome),
          email: normalizarTextoContaController_(usuario.Email),
          papel: normalizarTextoContaController_(usuario.Papel)
        };
      })
  };

  registrarContagemPerformance_(medidor, "usuariosTodos", contexto.usuarios.length);
  registrarContagemPerformance_(medidor, "contasTodas", contexto.contas.length);
  registrarContagemPerformance_(medidor, "usuariosRetornados", retorno.usuarios.length);
  finalizarPerformance_(medidor);

  return retorno;
}


/**
 * Cria ou atualiza uma conta.
 *
 * Regras:
 * - Nome da conta e obrigatorio.
 * - Nome nao pode duplicar outra conta acessivel ao usuario.
 * - Apenas o dono edita dados e compartilhamentos da conta.
 * - Participantes podem consultar e lançar usando a conta, mas não alteram seu cadastro.
 *
 * @param {Object} dadosForm Dados enviados pela View.
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarConta(dadosForm, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const idLogado = normalizarTextoContaController_(sessao.id);

    validarDadosBasicosContaController_(dadosForm);

    const contexto = montarContextoCadastroContaController_(sessao, null, false);
    const contas = contexto.contas;
    const usuarios = contexto.usuarios;
    const idInformado = normalizarTextoContaController_(dadosForm.ID_Conta);
    const isEdicao = !!idInformado;
    const idConta = idInformado || Utilities.getUuid();
    const nome = normalizarTextoContaController_(dadosForm.Nome_Conta || dadosForm.Nome);
    const compartilhada = normalizarBooleanoContaController_(dadosForm.Compartilhada);
    const usuariosCompartilhados = compartilhada
      ? normalizarListaIdsContaController_(dadosForm.Usuarios_Compartilhados)
      : "";

    let linhaConfiavel = null;
    let statusConfiavel = true;
    let idDonoConfiavel = idLogado;

    if (isEdicao) {
      const contaOriginal = buscarContaPorIdController_(idConta, contas);

      if (normalizarTextoContaController_(contaOriginal.ID_Usuario) !== idLogado) {
        throw new Error("Acesso negado: apenas o proprietario pode editar esta conta.");
      }

      linhaConfiavel = contaOriginal._linhaPlanilha;
      statusConfiavel = normalizarBooleanoContaController_(contaOriginal.Ativa);
      idDonoConfiavel = normalizarTextoContaController_(contaOriginal.ID_Usuario);
    }

    validarNomeUnicoContaController_(contas, nome, idConta, idLogado);
    validarUsuariosCompartilhadosContaController_(usuariosCompartilhados, usuarios, idDonoConfiavel);

    const conta = {
      ID_Conta: idConta,
      ID_Usuario: idDonoConfiavel,
      Nome_Conta: nome,
      Saldo_Inicial: normalizarNumeroContaController_(dadosForm.Saldo_Inicial),
      Ativa: statusConfiavel,
      Compartilhada: compartilhada,
      Usuarios_Compartilhados: usuariosCompartilhados,
      _linhaPlanilha: linhaConfiavel
    };

    salvarContaModel(conta);

    return isEdicao ? "Conta atualizada com sucesso!" : "Conta criada com sucesso!";

  } finally {
    lock.releaseLock();
  }
}


/**
 * Alterna o status ativo/inativo de uma conta.
 *
 * @param {string} idConta ID da conta.
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function alternarStatusConta(idConta, tokenSessao) {
  const medidor = criarMedidorPerformance_("Contas.alternarStatus");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoContaController_(sessao.id);
  const id = normalizarTextoContaController_(idConta);

  if (!id) {
    throw new Error("Conta nao informada.");
  }

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoCadastroContaController_(sessao, medidor, true);
  });
  const conta = medirEtapaPerformance_(medidor, "buscar_conta", function() {
    return buscarContaPorIdController_(id, contexto.contas);
  });

  if (normalizarTextoContaController_(conta.ID_Usuario) !== idLogado) {
    throw new Error("Acesso negado: apenas o proprietario pode alterar o status desta conta.");
  }

  const novoStatus = !normalizarBooleanoContaController_(conta.Ativa);
  medirEtapaPerformance_(medidor, "alterar_status", function() {
    alterarStatusContaModel(
      typeof bancoUsaSupabase === "function" && bancoUsaSupabase() ? id : conta._linhaPlanilha,
      novoStatus
    );
  });

  if (novoStatus) {
    finalizarPerformance_(medidor);
    return "Conta restaurada com sucesso.";
  }

  const possuiLancamentos = medirEtapaPerformance_(medidor, "verificar_vinculos", function() {
    return contaPossuiLancamentosController_(id, contexto.lancamentos);
  });
  registrarContagemPerformance_(medidor, "lancamentosVinculos", contexto.lancamentos.length);
  finalizarPerformance_(medidor);

  return possuiLancamentos
    ? "Conta inativada com sucesso. Os lancamentos vinculados foram preservados para manter o historico e os calculos."
    : "Conta inativada com sucesso.";
}


function montarContextoCadastroContaController_(sessao, medidorPerformance, incluirVinculos) {
  const idLogado = normalizarTextoContaController_(sessao.id);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoCadastrosSupabaseRpc_ === "function"
      ? obterContextoCadastrosSupabaseRpc_(idLogado, incluirVinculos === true)
      : null;
  });

  return {
    contas: medirEtapaPerformance_(medidorPerformance, "consulta_contas", function() {
      return contextoRpc ? contextoRpc.contasTodas : listarContasModel();
    }),
    usuarios: medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
      return contextoRpc ? contextoRpc.usuariosTodos : typeof listarUsuariosModel === "function" ? listarUsuariosModel() : [];
    }),
    lancamentos: medirEtapaPerformance_(medidorPerformance, "consulta_lancamentos", function() {
      if (contextoRpc) {
        return contextoRpc.lancamentosVinculos || [];
      }

      return incluirVinculos === true && typeof listarLancamentosModel === "function"
        ? listarLancamentosModel()
        : [];
    })
  };
}


/**
 * Monta objeto seguro para a View.
 *
 * @param {Object} conta Conta original.
 * @param {string} idLogado ID do usuário logado.
 * @param {Array<Object>} usuarios Todos os usuários.
 * @param {Object} idsContasComLancamentos Mapa de vínculos.
 * @returns {Object} Conta segura para front-end.
 */
function montarContaParaViewController_(conta, idLogado, usuarios, idsContasComLancamentos, consolidadoPeriodo) {
  const idConta = normalizarTextoContaController_(conta.ID_Conta);
  const idDono = normalizarTextoContaController_(conta.ID_Usuario);
  const ehDono = idDono === idLogado;
  const compartilhada = normalizarBooleanoContaController_(conta.Compartilhada);
  const usuariosCompartilhados = normalizarListaIdsContaController_(conta.Usuarios_Compartilhados);
  const ehCompartilhadaComigo = !ehDono && listaTextoContemIdContaController_(usuariosCompartilhados, idLogado);
  const dono = buscarUsuarioContaController_(usuarios, idDono);

  return {
    _linhaPlanilha: conta._linhaPlanilha,
    ID_Conta: idConta,
    ID_Usuario: idDono,
    Nome_Conta: normalizarTextoContaController_(conta.Nome_Conta),
    Saldo_Inicial: normalizarNumeroContaController_(conta.Saldo_Inicial),
    Ativa: normalizarBooleanoContaController_(conta.Ativa),
    Compartilhada: compartilhada,
    Usuarios_Compartilhados: usuariosCompartilhados,
    Tem_Lancamentos: idsContasComLancamentos[idConta] === true,
    Eh_Dono: ehDono,
    Eh_Compartilhada_Comigo: ehCompartilhadaComigo,
    Pode_Editar: ehDono,
    Pode_Alterar_Status: ehDono,
    Pode_Gerenciar_Compartilhamento: ehDono,
    Nome_Dono: dono ? normalizarTextoContaController_(dono.Nome) : "Usuário não encontrado",
    Consolidado_Periodo: consolidadoPeriodo || null
  };
}


/**
 * Verifica se usuário pode visualizar uma conta.
 *
 * @param {Object} conta Conta.
 * @param {string} idUsuario ID do usuário.
 * @returns {boolean} True quando pode visualizar.
 */
function usuarioPodeVisualizarContaController_(conta, idUsuario) {
  const id = normalizarTextoContaController_(idUsuario);
  const dono = normalizarTextoContaController_(conta.ID_Usuario);

  if (dono === id) {
    return true;
  }

  if (!normalizarBooleanoContaController_(conta.Compartilhada)) {
    return false;
  }

  return listaTextoContemIdContaController_(conta.Usuarios_Compartilhados, id);
}


/**
 * Valida dados obrigatorios da conta.
 *
 * @param {Object} dados Dados recebidos.
 */
function validarDadosBasicosContaController_(dados) {
  if (!dados) {
    throw new Error("Dados da conta nao recebidos.");
  }

  const nome = normalizarTextoContaController_(dados.Nome_Conta || dados.Nome);

  if (!nome) {
    throw new Error("O nome da conta e obrigatorio.");
  }
}


/**
 * Bloqueia nomes duplicados entre contas do mesmo proprietario.
 *
 * @param {Array<Object>} contas Todas as contas.
 * @param {string} nome Nome desejado.
 * @param {string} idContaAtual ID da conta atual.
 * @param {string} idUsuarioDono ID do proprietário.
 */
function validarNomeUnicoContaController_(contas, nome, idContaAtual, idUsuarioLogado) {
  const nomeNormalizado = normalizarChaveNomeContaController_(nome);
  const idAtual = normalizarTextoContaController_(idContaAtual);
  const idLogado = normalizarTextoContaController_(idUsuarioLogado);

  const duplicada = (contas || []).some(function(conta) {
    const outraConta = normalizarTextoContaController_(conta.ID_Conta) !== idAtual;
    const mesmoNome = normalizarChaveNomeContaController_(conta.Nome_Conta) === nomeNormalizado;
    const acessivel = usuarioPodeVisualizarContaController_(conta, idLogado);

    return outraConta && mesmoNome && acessivel;
  });

  if (duplicada) {
    throw new Error("Ja existe uma conta com este nome entre as contas que voce acessa.");
  }
}


/**
 * Valida usuários compartilhados.
 *
 * @param {string} listaIds Lista de IDs separados por vírgula.
 * @param {Array<Object>} usuarios Lista de usuários.
 * @param {string} idDono ID do proprietário.
 */
function validarUsuariosCompartilhadosContaController_(listaIds, usuarios, idDono) {
  const ids = normalizarListaIdsContaController_(listaIds)
    .split(",")
    .map(function(id) { return id.trim(); })
    .filter(function(id) { return !!id; });

  const mapaUsuariosAtivos = {};

  (usuarios || []).forEach(function(usuario) {
    const id = normalizarTextoContaController_(usuario.ID_Usuario);
    if (id && normalizarBooleanoContaController_(usuario.Ativo)) {
      mapaUsuariosAtivos[id] = true;
    }
  });

  ids.forEach(function(idUsuario) {
    if (idUsuario === idDono) {
      throw new Error("O proprietario da conta nao deve ser listado como participante compartilhado.");
    }

    if (!mapaUsuariosAtivos[idUsuario]) {
      throw new Error("Um dos usuarios selecionados para compartilhamento nao existe ou esta inativo.");
    }
  });
}


/**
 * Busca conta por ID ou lanca erro.
 *
 * @param {string} idConta ID procurado.
 * @param {Array<Object>} contas Lista de contas.
 * @returns {Object} Conta encontrada.
 */
function buscarContaPorIdController_(idConta, contas) {
  const id = normalizarTextoContaController_(idConta);

  const conta = contas.find(function(item) {
    return normalizarTextoContaController_(item.ID_Conta) === id;
  });

  if (!conta) {
    throw new Error("Conta nao encontrada.");
  }

  return conta;
}


/**
 * Verifica se uma conta possui lancamentos vinculados.
 *
 * @param {string} idConta ID da conta.
 * @returns {boolean} True quando ha vinculo.
 */
function contaPossuiLancamentosController_(idConta, lancamentosPreCarregados) {
  if (!Array.isArray(lancamentosPreCarregados) && typeof listarLancamentosModel !== "function") {
    return false;
  }

  const lancamentos = Array.isArray(lancamentosPreCarregados)
    ? lancamentosPreCarregados
    : listarLancamentosModel();
  const mapa = mapearContasComLancamentosController_(lancamentos);
  return mapa[normalizarTextoContaController_(idConta)] === true;
}


/**
 * Mapeia contas usadas como origem em lancamentos.
 *
 * @param {Array<Object>} lancamentos Lancamentos do Model.
 * @returns {Object} Mapa de ID_Conta para true.
 */
function mapearContasComLancamentosController_(lancamentos) {
  const mapa = {};

  (lancamentos || []).forEach(function(lancamento) {
    if (normalizarTextoContaController_(lancamento.Tipo_Origem) === "Conta") {
      const idOrigem = normalizarTextoContaController_(lancamento.ID_Origem);

      if (idOrigem) {
        mapa[idOrigem] = true;
      }
    }
  });

  return mapa;
}


/**
 * Busca usuário por ID.
 *
 * @param {Array<Object>} usuarios Lista de usuários.
 * @param {string} idUsuario ID buscado.
 * @returns {Object|null} Usuário encontrado.
 */
function buscarUsuarioContaController_(usuarios, idUsuario) {
  const id = normalizarTextoContaController_(idUsuario);

  return (usuarios || []).find(function(usuario) {
    return normalizarTextoContaController_(usuario.ID_Usuario) === id;
  }) || null;
}


/**
 * Normaliza texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Texto normalizado.
 */
function normalizarTextoContaController_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


/**
 * Normaliza nome para comparacao de duplicidade.
 *
 * @param {*} valor Nome original.
 * @returns {string} Chave normalizada.
 */
function normalizarChaveNomeContaController_(valor) {
  return normalizarTextoContaController_(valor).toLowerCase();
}


/**
 * Normaliza numero vindo da View ou da planilha.
 *
 * @param {*} valor Valor original.
 * @returns {number} Numero normalizado.
 */
function normalizarNumeroContaController_(valor) {
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
 * Normaliza booleanos.
 *
 * @param {*} valor Valor original.
 * @returns {boolean} Booleano normalizado.
 */
function normalizarBooleanoContaController_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}


/**
 * Normaliza lista de IDs separados por vírgula.
 *
 * @param {*} valor Lista original.
 * @returns {string} Lista sem vazios e duplicidades.
 */
function normalizarListaIdsContaController_(valor) {
  if (valor === null || valor === undefined) return "";

  const usados = {};
  return valor
    .toString()
    .split(",")
    .map(function(item) { return item.trim(); })
    .filter(function(id) {
      if (!id || usados[id]) return false;
      usados[id] = true;
      return true;
    })
    .join(",");
}


/**
 * Verifica se lista textual contém ID exato.
 *
 * @param {*} listaTexto Lista separada por vírgula.
 * @param {string} idBuscado ID procurado.
 * @returns {boolean} True se contém.
 */
function listaTextoContemIdContaController_(listaTexto, idBuscado) {
  const id = normalizarTextoContaController_(idBuscado);

  if (!listaTexto || !id) return false;

  return listaTexto
    .toString()
    .split(",")
    .map(function(item) { return item.trim(); })
    .indexOf(id) !== -1;
}
