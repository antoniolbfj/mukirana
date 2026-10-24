/**
 * Modulo: Projetos_Controller.gs
 * Responsabilidade:
 * - Aplicar regras de negocio do modulo de projetos.
 * - Filtrar projetos com base na sessao validada no servidor.
 * - Garantir que o front-end nunca defina permissoes, dono ou linha da planilha.
 */


/**
 * Cria ou atualiza um projeto.
 *
 * Regras:
 * - Apenas o criador ou um Administrador pode editar dados gerais.
 * - Apenas o criador pode alterar o compartilhamento.
 * - O criador original, status e linha real sao preservados em edicao.
 * - Usuarios compartilhados precisam existir, estar ativos e nao podem incluir_ o criador.
 *
 * @param {Object} dadosFormulario Dados enviados pela View.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarProjeto(dadosFormulario, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const contexto = montarContextoProjetosController_(sessao);

    validarDadosBasicosProjetoController_(dadosFormulario);

    const idInformado = normalizarTextoProjetoController_(dadosFormulario.ID_Projeto);
    const isEdicao = !!idInformado;
    const idProjeto = idInformado || Utilities.getUuid();
    const nomeProjeto = normalizarTextoProjetoController_(dadosFormulario.Nome);

    let linhaConfiavel = null;
    let criadoPorConfiavel = contexto.idLogado;
    let statusConfiavel = true;
    let compartilhamentoOriginal = {
      Compartilhado: false,
      Usuarios_Compartilhados: ""
    };

    if (isEdicao) {
      const projetoOriginal = buscarProjetoPorIdController_(idProjeto, contexto.projetosTodos);
      const donoOriginal = normalizarTextoProjetoController_(projetoOriginal.Criado_Por);
      const podeEditarDadosGerais = donoOriginal === contexto.idLogado ||
        contexto.papelLogado === "Administrador";

      if (!podeEditarDadosGerais) {
        throw new Error("Acesso negado: apenas o criador ou um Administrador pode editar este projeto.");
      }

      linhaConfiavel = projetoOriginal._linhaPlanilha;
      criadoPorConfiavel = donoOriginal || contexto.idLogado;
      statusConfiavel = normalizarBooleanoProjetoController_(projetoOriginal.Status);
      compartilhamentoOriginal = {
        Compartilhado: normalizarBooleanoProjetoController_(projetoOriginal.Compartilhado),
        Usuarios_Compartilhados: normalizarListaIdsProjetoController_(projetoOriginal.Usuarios_Compartilhados)
      };
    }

    validarNomeProjetoUnicoController_(
      contexto.projetosTodos,
      idProjeto,
      contexto.idLogado,
      nomeProjeto,
      contexto.papelLogado
    );

    const ehCriador = criadoPorConfiavel === contexto.idLogado;
    const compartilhadoInformado = normalizarBooleanoProjetoController_(dadosFormulario.Compartilhado);
    const idsCompartilhadosInformados = compartilhadoInformado
      ? normalizarListaIdsProjetoController_(dadosFormulario.Usuarios_Compartilhados)
      : "";

    if (ehCriador) {
      validarCompartilhamentoProjetoController_(
        idsCompartilhadosInformados,
        criadoPorConfiavel,
        contexto.mapaUsuariosAtivos
      );
    } else {
      validarCompartilhamentoInalteradoProjetoController_(
        compartilhadoInformado,
        idsCompartilhadosInformados,
        compartilhamentoOriginal
      );
    }

    const projeto = {
      ID_Projeto: idProjeto,
      Nome: nomeProjeto,
      Orcamento_Teto: normalizarOrcamentoProjetoController_(dadosFormulario.Orcamento_Teto),
      Compartilhado: ehCriador ? compartilhadoInformado : compartilhamentoOriginal.Compartilhado,
      Usuarios_Compartilhados: ehCriador
        ? idsCompartilhadosInformados
        : compartilhamentoOriginal.Usuarios_Compartilhados,
      Status: statusConfiavel,
      Criado_Por: criadoPorConfiavel,
      _linhaPlanilha: linhaConfiavel
    };

    salvarProjetoModel_(projeto);

    return isEdicao ? "Projeto atualizado com sucesso!" : "Projeto criado com sucesso!";

  } finally {
    lock.releaseLock();
  }
}


/**
 * Lista projetos acessiveis ao usuario logado.
 *
 * @param {string} tokenSessao Token de sessao.
 * @returns {Array<Object>} Projetos acessiveis.
 */
function obterListaProjetos(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("Projetos.obterLista");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const intervalo = medirEtapaPerformance_(medidor, "normalizar_periodo", function() {
    return typeof normalizarIntervaloMesesConsolidadoController_ === "function"
      ? normalizarIntervaloMesesConsolidadoController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia), filtros && filtros.Mes_Final, true)
      : { Mes_Inicial: "", Mes_Final: "" };
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoProjetosController_(sessao, medidor);
  });
  const consolidadoPeriodo = medirEtapaPerformance_(medidor, "montar_consolidado_periodo", function() {
    return montarConsolidadoPeriodoProjetosController_(sessao, intervalo, contexto.projetosTodos, medidor, filtros);
  });

  const lista = medirEtapaPerformance_(medidor, "montar_lista", function() {
    return contexto.projetosTodos
      .filter(function(projeto) {
        return contexto.papelLogado === "Administrador" ||
          usuarioPodeVisualizarProjetoController_(projeto, contexto.idLogado);
      })
      .map(function(projeto) {
        const idProjeto = normalizarTextoProjetoController_(projeto.ID_Projeto);
        return enriquecerProjetoParaViewController_(projeto, contexto, consolidadoPeriodo[idProjeto]);
      });
  });

  registrarContagemPerformance_(medidor, "projetosTodos", contexto.projetosTodos.length);
  registrarContagemPerformance_(medidor, "usuariosAtivos", contexto.usuariosAtivos.length);
  registrarContagemPerformance_(medidor, "projetosRetornados", lista.length);
  finalizarPerformance_(medidor);

  return lista;
}


function montarConsolidadoPeriodoProjetosController_(sessao, intervalo, projetosBase, medidorPerformance, filtros) {
  const inicio = intervalo && intervalo.Mes_Inicial ? intervalo.Mes_Inicial : "";
  const fim = intervalo && intervalo.Mes_Final ? intervalo.Mes_Final : "";
  const idLogado = normalizarTextoProjetoController_(sessao.id);
  const considerarHistoricoAnterior = !filtros || filtros.Considerar_Historico_Anterior !== false;
  const inicioConsolidacao = considerarHistoricoAnterior ? "" : inicio;
  const fimConsolidacao = fim || inicio;
  const contextoFinanceiro = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_financeiro", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, fim || inicio, true)
      : null;
  });
  const contexto = contextoFinanceiro
    ? montarContextoConsolidadosAPartirBase_(sessao, contextoFinanceiro, null, "RPC")
    : montarContextoConsolidadosAPartirBase_(sessao, null, null, "MODELS");
  const mapa = {};
  const lancamentosPeriodo = obterLancamentosVisiveisConsolidadosController_(contexto).filter(function(lancamento) {
    return !!normalizarTextoProjetoController_(lancamento.ID_Projeto) &&
      mesReferenciaEstaNoIntervaloConsolidadoController_(
        normalizarTextoConsolidadoController_(lancamento.Mes_Referencia),
        inicioConsolidacao,
        fimConsolidacao
      );
  });
  const lancamentosVisiveis = obterLancamentosVisiveisConsolidadosController_(contexto);
  const rateiosPorLancamento = typeof agruparRateiosConsolidadosController_ === "function"
    ? agruparRateiosConsolidadosController_(contexto.rateiosTodos || [])
    : {};

  (projetosBase || []).forEach(function(projeto) {
    const idProjeto = normalizarTextoProjetoController_(projeto.ID_Projeto);
    mapa[idProjeto] = montarConsolidadoVazioProjetoController_(projeto, {
      Mes_Inicial: inicio,
      Mes_Final: fim,
      Considerar_Historico_Anterior: considerarHistoricoAnterior
    });
    mapa[idProjeto]._ParticipantesPorId = montarMapaParticipantesProjetoController_(projeto, contexto);
    mapa[idProjeto].Detalhes_Geral = montarResumoGeralProjetoController_(projeto, contexto);
  });

  lancamentosPeriodo.forEach(function(lancamento) {
    const idProjeto = normalizarTextoProjetoController_(lancamento.ID_Projeto);
    const consolidado = mapa[idProjeto];

    if (!consolidado) {
      return;
    }

    const tipo = normalizarChaveNomeProjetoController_(lancamento.Tipo);
    const valor = normalizarNumeroProjetoController_(lancamento.Valor_Total);

    if (tipo === "receita") {
      consolidado.Receitas += valor;
      consolidado.Resultado += valor;
      consolidado.Quantidade_Lancamentos += 1;
    } else if (tipo === "despesa") {
      consolidado.Despesas += valor;
      consolidado.Realizado += valor;
      consolidado.Resultado -= valor;
      consolidado.Quantidade_Lancamentos += 1;
    } else if (tipo === "transferencia") {
      consolidado.Transferencias += valor;
      consolidado.Quantidade_Transferencias += 1;
      consolidado.Quantidade_Lancamentos += 1;
    }

    somarResponsabilidadeLancamentoProjetoController_(consolidado, lancamento, contexto, rateiosPorLancamento);
    somarParticipantesLancamentoProjetoController_(consolidado, lancamento, contexto, rateiosPorLancamento);
  });

  lancamentosVisiveis.forEach(function(lancamento) {
    const idProjeto = normalizarTextoProjetoController_(lancamento.ID_Projeto);
    const consolidado = mapa[idProjeto];

    if (consolidado) {
      somarLancamentoFuturoProjetoController_(consolidado, lancamento);
      somarLancamentoResumoProjetoController_(consolidado.Detalhes_Geral, lancamento);
      somarLancamentoFuturoProjetoController_(consolidado.Detalhes_Geral, lancamento);
      somarParticipantesLancamentoProjetoController_(consolidado.Detalhes_Geral, lancamento, contexto, rateiosPorLancamento);
    }
  });

  Object.keys(mapa).forEach(function(idProjeto) {
    const consolidado = mapa[idProjeto];
    consolidado.Receitas = arredondarConsolidadoController_(consolidado.Receitas);
    consolidado.Despesas = arredondarConsolidadoController_(consolidado.Despesas);
    consolidado.Transferencias = arredondarConsolidadoController_(consolidado.Transferencias);
    consolidado.Realizado = arredondarConsolidadoController_(consolidado.Realizado);
    consolidado.Resultado = arredondarConsolidadoController_(consolidado.Resultado);
    consolidado.Responsabilidade_Receitas = arredondarConsolidadoController_(consolidado.Responsabilidade_Receitas);
    consolidado.Responsabilidade_Despesas = arredondarConsolidadoController_(consolidado.Responsabilidade_Despesas);
    consolidado.Responsabilidade_Transferencias_Entrada = arredondarConsolidadoController_(consolidado.Responsabilidade_Transferencias_Entrada);
    consolidado.Responsabilidade_Transferencias_Saida = arredondarConsolidadoController_(consolidado.Responsabilidade_Transferencias_Saida);
    consolidado.Responsabilidade_Transferencias = arredondarConsolidadoController_(
      consolidado.Responsabilidade_Transferencias_Entrada - consolidado.Responsabilidade_Transferencias_Saida
    );
    consolidado.Responsabilidade_Resultado = arredondarConsolidadoController_(
      consolidado.Responsabilidade_Receitas -
      consolidado.Responsabilidade_Despesas +
      consolidado.Responsabilidade_Transferencias
    );
    consolidado.Disponivel = consolidado.Teto > 0
      ? arredondarConsolidadoController_(Math.max(0, consolidado.Teto - consolidado.Realizado))
      : 0;
    consolidado.Excedido = consolidado.Teto > 0
      ? arredondarConsolidadoController_(Math.max(0, consolidado.Realizado - consolidado.Teto))
      : 0;
    consolidado.Percentual_Utilizado = consolidado.Teto > 0
      ? arredondarConsolidadoController_((consolidado.Realizado / consolidado.Teto) * 100)
      : 0;
    finalizarResumoFuturoProjetoController_(consolidado.Lancamentos_Futuros);
    consolidado.Participantes = finalizarParticipantesProjetoController_(consolidado._ParticipantesPorId);
    delete consolidado._ParticipantesPorId;
    finalizarResumoGeralProjetoController_(consolidado.Detalhes_Geral);
  });

  return mapa;
}


function montarResumoGeralProjetoController_(projeto, contexto) {
  return {
    Teto: normalizarNumeroProjetoController_(projeto && projeto.Orcamento_Teto),
    Realizado: 0,
    Disponivel: normalizarNumeroProjetoController_(projeto && projeto.Orcamento_Teto),
    Excedido: 0,
    Percentual_Utilizado: 0,
    Receitas: 0,
    Despesas: 0,
    Transferencias: 0,
    Resultado: 0,
    Quantidade_Lancamentos: 0,
    Quantidade_Transferencias: 0,
    Lancamentos_Futuros: {
      Quantidade: 0,
      Proxima_Data: "",
      Receitas: 0,
      Despesas: 0,
      Transferencias: 0,
      Resultado: 0
    },
    Participantes: [],
    _ParticipantesPorId: montarMapaParticipantesProjetoController_(projeto, contexto)
  };
}


function somarLancamentoResumoProjetoController_(resumo, lancamento) {
  const tipo = normalizarChaveNomeProjetoController_(lancamento.Tipo);
  const valor = normalizarNumeroProjetoController_(lancamento.Valor_Total);

  if (tipo === "receita") {
    resumo.Receitas += valor;
    resumo.Resultado += valor;
    resumo.Quantidade_Lancamentos += 1;
  } else if (tipo === "despesa") {
    resumo.Despesas += valor;
    resumo.Realizado += valor;
    resumo.Resultado -= valor;
    resumo.Quantidade_Lancamentos += 1;
  } else if (tipo === "transferencia") {
    resumo.Transferencias += valor;
    resumo.Quantidade_Transferencias += 1;
    resumo.Quantidade_Lancamentos += 1;
  }
}


function finalizarResumoGeralProjetoController_(resumo) {
  resumo.Receitas = arredondarConsolidadoController_(resumo.Receitas);
  resumo.Despesas = arredondarConsolidadoController_(resumo.Despesas);
  resumo.Transferencias = arredondarConsolidadoController_(resumo.Transferencias);
  resumo.Realizado = arredondarConsolidadoController_(resumo.Realizado);
  resumo.Resultado = arredondarConsolidadoController_(resumo.Resultado);
  resumo.Disponivel = resumo.Teto > 0
    ? arredondarConsolidadoController_(Math.max(0, resumo.Teto - resumo.Realizado))
    : 0;
  resumo.Excedido = resumo.Teto > 0
    ? arredondarConsolidadoController_(Math.max(0, resumo.Realizado - resumo.Teto))
    : 0;
  resumo.Percentual_Utilizado = resumo.Teto > 0
    ? arredondarConsolidadoController_((resumo.Realizado / resumo.Teto) * 100)
    : 0;
  finalizarResumoFuturoProjetoController_(resumo.Lancamentos_Futuros);
  resumo.Participantes = finalizarParticipantesProjetoController_(resumo._ParticipantesPorId);
  delete resumo._ParticipantesPorId;
}


function somarLancamentoFuturoProjetoController_(consolidado, lancamento) {
  const referencia = obterReferenciaFuturaLancamentoProjetoController_(lancamento);

  if (!referencia) {
    return;
  }

  const tipo = normalizarChaveNomeProjetoController_(lancamento.Tipo);
  const valor = normalizarNumeroProjetoController_(lancamento.Valor_Total);
  const resumo = consolidado.Lancamentos_Futuros;

  resumo.Quantidade += 1;

  if (!resumo.Proxima_Data || referencia < resumo.Proxima_Data) {
    resumo.Proxima_Data = referencia;
  }

  if (tipo === "receita") {
    resumo.Receitas += valor;
  } else if (tipo === "despesa") {
    resumo.Despesas += valor;
  } else if (tipo === "transferencia") {
    resumo.Transferencias += valor;
  }
}


function obterReferenciaFuturaLancamentoProjetoController_(lancamento) {
  const hoje = gerarDataHojeProjetoController_();
  const mesAtual = hoje.substring(0, 7);
  const dataOcorrencia = normalizarTextoProjetoController_(lancamento.Data_Ocorrencia);
  const mesReferencia = normalizarTextoProjetoController_(lancamento.Mes_Referencia);

  if (/^\d{4}-\d{2}-\d{2}$/.test(dataOcorrencia) && dataOcorrencia > hoje) {
    return dataOcorrencia;
  }

  if (!dataOcorrencia && /^\d{4}-\d{2}$/.test(mesReferencia) && mesReferencia > mesAtual) {
    return mesReferencia + "-01";
  }

  return "";
}


function finalizarResumoFuturoProjetoController_(resumo) {
  resumo.Receitas = arredondarConsolidadoController_(resumo.Receitas);
  resumo.Despesas = arredondarConsolidadoController_(resumo.Despesas);
  resumo.Transferencias = arredondarConsolidadoController_(resumo.Transferencias);
  resumo.Resultado = arredondarConsolidadoController_(resumo.Receitas - resumo.Despesas);
}


function montarMapaParticipantesProjetoController_(projeto, contexto) {
  const mapa = {};
  const idCriador = normalizarTextoProjetoController_(projeto && projeto.Criado_Por);

  if (idCriador) {
    mapa[idCriador] = criarResumoParticipanteProjetoController_(idCriador, contexto);
  }

  normalizarListaIdsProjetoController_(projeto && projeto.Usuarios_Compartilhados)
    .split(",")
    .forEach(function(idUsuario) {
      const id = normalizarTextoProjetoController_(idUsuario);

      if (id && !mapa[id]) {
        mapa[id] = criarResumoParticipanteProjetoController_(id, contexto);
      }
    });

  return mapa;
}


function criarResumoParticipanteProjetoController_(idUsuario, contexto) {
  const usuario = buscarUsuarioParticipanteProjetoController_(idUsuario, contexto);

  return {
    ID_Usuario: normalizarTextoProjetoController_(idUsuario),
    Nome: usuario ? usuario.nome : "Usuario",
    Email: usuario ? usuario.email : "",
    Receitas: 0,
    Despesas: 0,
    Transferencias_Entrada: 0,
    Transferencias_Saida: 0,
    Transferencias: 0,
    Resultado: 0,
    Quantidade_Lancamentos: 0
  };
}


function buscarUsuarioParticipanteProjetoController_(idUsuario, contexto) {
  const id = normalizarTextoProjetoController_(idUsuario);
  const usuarioCadastro = contexto && contexto.mapaUsuariosAtivos ? contexto.mapaUsuariosAtivos[id] : null;

  if (usuarioCadastro) {
    return usuarioCadastro;
  }

  const usuarioFinanceiro = (contexto && contexto.usuariosTodos || []).find(function(usuario) {
    return normalizarTextoProjetoController_(usuario.ID_Usuario || usuario.id_usuario || usuario.id) === id;
  });

  if (!usuarioFinanceiro) {
    return null;
  }

  return {
    id: id,
    nome: normalizarTextoProjetoController_(usuarioFinanceiro.Nome || usuarioFinanceiro.nome) || "Usuario",
    email: normalizarTextoProjetoController_(usuarioFinanceiro.Email || usuarioFinanceiro.email),
    papel: normalizarTextoProjetoController_(usuarioFinanceiro.Papel || usuarioFinanceiro.papel)
  };
}


function obterResumoParticipanteProjetoController_(consolidado, idUsuario, contexto) {
  const id = normalizarTextoProjetoController_(idUsuario);

  if (!id) {
    return null;
  }

  if (!consolidado._ParticipantesPorId[id]) {
    consolidado._ParticipantesPorId[id] = criarResumoParticipanteProjetoController_(id, contexto);
  }

  return consolidado._ParticipantesPorId[id];
}


function somarParticipantesLancamentoProjetoController_(consolidado, lancamento, contexto, rateiosPorLancamento) {
  const tipo = normalizarChaveNomeProjetoController_(lancamento.Tipo);
  const idLancamento = normalizarTextoProjetoController_(lancamento.ID_Lancamento);
  const valor = normalizarNumeroProjetoController_(lancamento.Valor_Total);
  const rateios = (rateiosPorLancamento[idLancamento] || []).filter(function(rateio) {
    return normalizarTextoProjetoController_(rateio.Status) !== "Cancelado";
  });

  if (tipo === "receita" || tipo === "despesa") {
    if (rateios.length > 0) {
      rateios.forEach(function(rateio) {
        const participante = obterResumoParticipanteProjetoController_(
          consolidado,
          rateio.ID_Usuario_Responsavel,
          contexto
        );

        if (!participante) {
          return;
        }

        somarValorResumoParticipanteProjetoController_(
          participante,
          tipo,
          normalizarNumeroProjetoController_(rateio.Valor_Rateado)
        );
      });

      return;
    }

    const idResponsavel = obterIdUsuarioResponsavelLancamentoProjetoController_(lancamento, contexto);
    const participante = obterResumoParticipanteProjetoController_(consolidado, idResponsavel, contexto);

    if (participante) {
      somarValorResumoParticipanteProjetoController_(participante, tipo, valor);
    }

    return;
  }

  if (tipo === "transferencia") {
    const idOrigem = obterIdUsuarioContaProjetoController_(contexto, lancamento.ID_Origem);
    const idDestino = obterIdUsuarioContaProjetoController_(contexto, lancamento.ID_Destino);
    const participanteOrigem = obterResumoParticipanteProjetoController_(consolidado, idOrigem, contexto);
    const participanteDestino = obterResumoParticipanteProjetoController_(consolidado, idDestino, contexto);

    if (participanteOrigem) {
      participanteOrigem.Transferencias_Saida += valor;
      participanteOrigem.Quantidade_Lancamentos += 1;
    }

    if (participanteDestino) {
      participanteDestino.Transferencias_Entrada += valor;
      participanteDestino.Quantidade_Lancamentos += 1;
    }
  }
}


function somarValorResumoParticipanteProjetoController_(participante, tipo, valor) {
  if (!participante || valor === 0) {
    return;
  }

  if (tipo === "receita") {
    participante.Receitas += valor;
  } else if (tipo === "despesa") {
    participante.Despesas += valor;
  }

  participante.Quantidade_Lancamentos += 1;
}


function obterIdUsuarioResponsavelLancamentoProjetoController_(lancamento, contexto) {
  const ehCartao = typeof ehTipoOrigemCartaoConsolidadoController_ === "function"
    ? ehTipoOrigemCartaoConsolidadoController_(lancamento.Tipo_Origem)
    : normalizarChaveNomeProjetoController_(lancamento.Tipo_Origem) === "cartao";

  if (ehCartao) {
    const cartao = (contexto.cartoesTodos || []).find(function(item) {
      return normalizarTextoProjetoController_(item.ID_Cartao) === normalizarTextoProjetoController_(lancamento.ID_Origem);
    });

    return cartao ? normalizarTextoProjetoController_(cartao.ID_Usuario) : "";
  }

  return obterIdUsuarioContaProjetoController_(contexto, lancamento.ID_Origem) ||
    normalizarTextoProjetoController_(lancamento.Criado_Por_ID);
}


function obterIdUsuarioContaProjetoController_(contexto, idConta) {
  const conta = (contexto.contasTodas || []).find(function(item) {
    return normalizarTextoProjetoController_(item.ID_Conta) === normalizarTextoProjetoController_(idConta);
  });

  return conta ? normalizarTextoProjetoController_(conta.ID_Usuario) : "";
}


function finalizarParticipantesProjetoController_(participantesPorId) {
  return Object.keys(participantesPorId || {})
    .map(function(idUsuario) {
      const participante = participantesPorId[idUsuario];
      participante.Receitas = arredondarConsolidadoController_(participante.Receitas);
      participante.Despesas = arredondarConsolidadoController_(participante.Despesas);
      participante.Transferencias_Entrada = arredondarConsolidadoController_(participante.Transferencias_Entrada);
      participante.Transferencias_Saida = arredondarConsolidadoController_(participante.Transferencias_Saida);
      participante.Transferencias = arredondarConsolidadoController_(
        participante.Transferencias_Entrada - participante.Transferencias_Saida
      );
      participante.Resultado = arredondarConsolidadoController_(
        participante.Receitas - participante.Despesas + participante.Transferencias
      );
      return participante;
    })
    .sort(function(a, b) {
      return (b.Despesas + b.Receitas + Math.abs(b.Transferencias)) -
        (a.Despesas + a.Receitas + Math.abs(a.Transferencias));
    });
}


function somarResponsabilidadeLancamentoProjetoController_(consolidado, lancamento, contexto, rateiosPorLancamento) {
  const tipo = normalizarChaveNomeProjetoController_(lancamento.Tipo);

  if (tipo === "receita" || tipo === "despesa") {
    const valorIndividual = typeof obterValorIndividualLancamentoConsolidadoController_ === "function"
      ? normalizarNumeroProjetoController_(obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento))
      : normalizarNumeroProjetoController_(lancamento.Valor_Total);

    if (valorIndividual === 0) {
      return;
    }

    if (tipo === "receita") {
      consolidado.Responsabilidade_Receitas += valorIndividual;
    } else {
      consolidado.Responsabilidade_Despesas += valorIndividual;
    }

    consolidado.Responsabilidade_Quantidade_Lancamentos += 1;
    return;
  }

  if (tipo === "transferencia" && typeof calcularImpactoTransferenciaUsuarioConsolidadoController_ === "function") {
    const impacto = calcularImpactoTransferenciaUsuarioConsolidadoController_(lancamento, contexto) || {};
    const entrada = normalizarNumeroProjetoController_(impacto.entrada);
    const saida = normalizarNumeroProjetoController_(impacto.saida);

    if (entrada === 0 && saida === 0) {
      return;
    }

    consolidado.Responsabilidade_Transferencias_Entrada += entrada;
    consolidado.Responsabilidade_Transferencias_Saida += saida;
    consolidado.Responsabilidade_Quantidade_Lancamentos += 1;
  }
}


function montarConsolidadoVazioProjetoController_(projeto, intervalo) {
  return {
    Mes_Inicial: intervalo && intervalo.Mes_Inicial ? intervalo.Mes_Inicial : "",
    Mes_Final: intervalo && intervalo.Mes_Final ? intervalo.Mes_Final : "",
    Considerar_Historico_Anterior: intervalo && intervalo.Considerar_Historico_Anterior !== false,
    Teto: normalizarNumeroProjetoController_(projeto && projeto.Orcamento_Teto),
    Realizado: 0,
    Disponivel: normalizarNumeroProjetoController_(projeto && projeto.Orcamento_Teto),
    Excedido: 0,
    Percentual_Utilizado: 0,
    Receitas: 0,
    Despesas: 0,
    Transferencias: 0,
    Resultado: 0,
    Quantidade_Lancamentos: 0,
    Quantidade_Transferencias: 0,
    Responsabilidade_Receitas: 0,
    Responsabilidade_Despesas: 0,
    Responsabilidade_Transferencias_Entrada: 0,
    Responsabilidade_Transferencias_Saida: 0,
    Responsabilidade_Transferencias: 0,
    Responsabilidade_Resultado: 0,
    Responsabilidade_Quantidade_Lancamentos: 0,
    Lancamentos_Futuros: {
      Quantidade: 0,
      Proxima_Data: "",
      Receitas: 0,
      Despesas: 0,
      Transferencias: 0,
      Resultado: 0
    },
    Participantes: []
  };
}


/**
 * Lista usuarios visiveis para a equipe do projeto.
 *
 * Regras:
 * - Criador recebe todos os usuarios ativos compartilhaves.
 * - Participante recebe apenas criador e demais membros da equipe.
 * - Administrador pode consultar, mas nao substitui a regra de criador do compartilhamento.
 *
 * @param {string} idProjeto ID do projeto.
 * @param {string} tokenSessao Token de sessao.
 * @returns {Object} Permissao e usuarios visiveis.
 */
function obterUsuariosCompartilhaveisProjeto(idProjeto, tokenSessao) {
  const medidor = criarMedidorPerformance_("Projetos.obterUsuariosCompartilhaveis");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoProjetosController_(sessao, medidor);
  });
  const id = normalizarTextoProjetoController_(idProjeto);
  let retorno = null;

  if (!id) {
    retorno = {
      podeAlterarCompartilhamento: true,
      usuarios: contexto.usuariosAtivos
        .filter(function(usuario) {
          return usuario.id !== contexto.idLogado && usuario.papel !== "Administrador";
        })
    };

    return finalizarUsuariosCompartilhaveisProjetoController_(medidor, contexto, retorno);
  }

  const projeto = buscarProjetoPorIdController_(id, contexto.projetosTodos);

  if (
    contexto.papelLogado !== "Administrador" &&
    !usuarioPodeVisualizarProjetoController_(projeto, contexto.idLogado)
  ) {
    throw new Error("Acesso negado: voce nao tem permissao para visualizar a equipe deste projeto.");
  }

  const idCriador = normalizarTextoProjetoController_(projeto.Criado_Por);
  const podeAlterar = idCriador === contexto.idLogado;

  if (podeAlterar) {
    retorno = {
      podeAlterarCompartilhamento: true,
      usuarios: contexto.usuariosAtivos
        .filter(function(usuario) {
          return usuario.id !== idCriador && usuario.papel !== "Administrador";
        })
    };

    return finalizarUsuariosCompartilhaveisProjetoController_(medidor, contexto, retorno);
  }

  retorno = {
    podeAlterarCompartilhamento: false,
    usuarios: listarMembrosVisiveisProjetoController_(projeto, contexto)
  };

  return finalizarUsuariosCompartilhaveisProjetoController_(medidor, contexto, retorno);
}


function finalizarUsuariosCompartilhaveisProjetoController_(medidor, contexto, retorno) {
  registrarContagemPerformance_(medidor, "projetosTodos", contexto.projetosTodos.length);
  registrarContagemPerformance_(medidor, "usuariosAtivos", contexto.usuariosAtivos.length);
  registrarContagemPerformance_(medidor, "usuariosRetornados", retorno.usuarios.length);
  finalizarPerformance_(medidor);

  return retorno;
}


/**
 * Alterna status de um projeto entre em andamento e concluido.
 *
 * @param {string} idProjeto ID do projeto.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function alternarStatusProjeto(idProjeto, tokenSessao) {
  const medidor = criarMedidorPerformance_("Projetos.alternarStatus");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoProjetosController_(sessao, medidor);
  });
  const id = normalizarTextoProjetoController_(idProjeto);

  if (!id) {
    throw new Error("Projeto nao informado.");
  }

  const projeto = medirEtapaPerformance_(medidor, "buscar_projeto", function() {
    return buscarProjetoPorIdController_(id, contexto.projetosTodos);
  });
  const dono = normalizarTextoProjetoController_(projeto.Criado_Por);
  const podeAlterar = dono === contexto.idLogado || contexto.papelLogado === "Administrador";

  if (!podeAlterar) {
    throw new Error("Acesso negado: apenas o criador ou um Administrador pode alterar este projeto.");
  }

  const novoStatus = !normalizarBooleanoProjetoController_(projeto.Status);

  if (!novoStatus) {
    const bloqueiosConclusao = medirEtapaPerformance_(medidor, "validar_pendencias_conclusao", function() {
      return obterBloqueiosConclusaoProjetoController_(id);
    });

    if (bloqueiosConclusao.mensagens.length > 0) {
      throw new Error("Nao e possivel concluir este projeto: " + bloqueiosConclusao.mensagens.join(" "));
    }
  }

  medirEtapaPerformance_(medidor, "alterar_status", function() {
    alterarStatusProjetoModel_(
      typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_() ? id : projeto._linhaPlanilha,
      novoStatus
    );
  });
  finalizarPerformance_(medidor);

  return novoStatus ? "Projeto reativado com sucesso." : "Projeto concluido com sucesso.";
}


function obterBloqueiosConclusaoProjetoController_(idProjeto) {
  const lancamentosFuturos = obterResumoLancamentosFuturosProjetoController_(idProjeto);
  const recorrencias = obterResumoRecorrenciasProjetoController_(idProjeto);
  const mensagens = [];

  if (lancamentosFuturos.quantidade > 0) {
    mensagens.push(
      "existem " +
      lancamentosFuturos.quantidade +
      " lancamento(s) futuro(s) vinculado(s), com o mais proximo em " +
      lancamentosFuturos.proximaData +
      "."
    );
  }

  if (recorrencias.quantidade > 0) {
    mensagens.push(
      "existem " +
      recorrencias.quantidade +
      " recorrencia(s) cadastrada(s) associada(s) ao projeto."
    );
  }

  return {
    mensagens: mensagens,
    lancamentosFuturos: lancamentosFuturos,
    recorrencias: recorrencias
  };
}


function obterResumoLancamentosFuturosProjetoController_(idProjeto) {
  const id = normalizarTextoProjetoController_(idProjeto);
  const lancamentos = typeof listarLancamentosModel_ === "function" ? listarLancamentosModel_() : [];
  let quantidade = 0;
  let proximaData = "";

  (lancamentos || []).forEach(function(lancamento) {
    if (normalizarTextoProjetoController_(lancamento.ID_Projeto) !== id) {
      return;
    }

    const referencia = obterReferenciaFuturaLancamentoProjetoController_(lancamento);

    if (!referencia) {
      return;
    }

    quantidade += 1;

    if (!proximaData || referencia < proximaData) {
      proximaData = referencia;
    }
  });

  return {
    quantidade: quantidade,
    proximaData: proximaData || "data futura"
  };
}


function obterResumoRecorrenciasProjetoController_(idProjeto) {
  const id = normalizarTextoProjetoController_(idProjeto);
  const recorrencias = typeof listarRecorrenciasModel_ === "function" ? listarRecorrenciasModel_() : [];
  let quantidade = 0;

  (recorrencias || []).forEach(function(recorrencia) {
    if (normalizarTextoProjetoController_(recorrencia.ID_Projeto) === id) {
      quantidade += 1;
    }
  });

  return {
    quantidade: quantidade
  };
}


function gerarDataHojeProjetoController_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function montarContextoProjetosController_(sessao, medidorPerformance) {
  const idLogado = normalizarTextoProjetoController_(sessao.id);
  const papelLogado = normalizarTextoProjetoController_(sessao.papel);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoCadastrosSupabaseRpc_ === "function"
      ? obterContextoCadastrosSupabaseRpc_(idLogado, false)
      : null;
  });
  const projetosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_projetos", function() {
    return contextoRpc ? contextoRpc.projetosTodos : listarProjetosModel_();
  });
  const usuariosAtivos = medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
    return contextoRpc
      ? listarUsuariosAtivosProjetoAPartirBaseController_(contextoRpc.usuariosTodos)
      : listarUsuariosAtivosProjetoController_();
  });

  return {
    idLogado: idLogado,
    papelLogado: papelLogado,
    projetosTodos: projetosTodos,
    usuariosAtivos: usuariosAtivos,
    mapaUsuariosAtivos: montarMapaUsuariosAtivosProjetoController_(usuariosAtivos)
  };
}


function listarUsuariosAtivosProjetoAPartirBaseController_(usuarios) {
  return (usuarios || [])
    .filter(function(usuario) {
      return normalizarBooleanoProjetoController_(usuario.Ativo);
    })
    .map(function(usuario) {
      return {
        id: normalizarTextoProjetoController_(usuario.ID_Usuario),
        nome: normalizarTextoProjetoController_(usuario.Nome) || "Usuário",
        email: normalizarTextoProjetoController_(usuario.Email),
        papel: normalizarTextoProjetoController_(usuario.Papel)
      };
    });
}


function validarDadosBasicosProjetoController_(dados) {
  if (!dados) {
    throw new Error("Dados do projeto nao recebidos.");
  }

  if (!normalizarTextoProjetoController_(dados.Nome)) {
    throw new Error("O nome do projeto e obrigatorio.");
  }
}


function validarCompartilhamentoProjetoController_(listaIds, idCriador, mapaUsuariosAtivos) {
  const ids = normalizarListaIdsProjetoController_(listaIds)
    .split(",")
    .filter(function(id) {
      return !!id;
    });

  ids.forEach(function(idUsuario) {
    if (idUsuario === idCriador) {
      throw new Error("O criador do projeto nao deve ser listado como participante compartilhado.");
    }

    if (!mapaUsuariosAtivos[idUsuario]) {
      throw new Error("Um dos usuarios selecionados para compartilhamento nao existe ou esta inativo.");
    }
  });
}


function validarCompartilhamentoInalteradoProjetoController_(compartilhadoInformado, idsInformados, original) {
  const compartilhadoOriginal = normalizarBooleanoProjetoController_(original.Compartilhado);
  const listaOriginal = normalizarListaIdsProjetoController_(original.Usuarios_Compartilhados);
  const listaInformada = compartilhadoInformado ? normalizarListaIdsProjetoController_(idsInformados) : "";

  if (compartilhadoInformado !== compartilhadoOriginal || listaInformada !== listaOriginal) {
    throw new Error("Acesso negado: apenas o criador do projeto pode alterar o compartilhamento.");
  }
}


function validarNomeProjetoUnicoController_(projetos, idProjetoAtual, idUsuario, nome, papelUsuario) {
  const nomeNormalizado = normalizarChaveNomeProjetoController_(nome);

  const duplicado = (projetos || []).some(function(projeto) {
    const outroProjeto = normalizarTextoProjetoController_(projeto.ID_Projeto) !== idProjetoAtual;
    const mesmoNome = normalizarChaveNomeProjetoController_(projeto.Nome) === nomeNormalizado;
    const acessivel = papelUsuario === "Administrador" ||
      usuarioPodeVisualizarProjetoController_(projeto, idUsuario);

    return outroProjeto && mesmoNome && acessivel;
  });

  if (duplicado) {
    throw new Error("Ja existe um projeto com este nome entre os projetos que voce acessa.");
  }
}


function usuarioPodeVisualizarProjetoController_(projeto, idUsuario) {
  const id = normalizarTextoProjetoController_(idUsuario);
  const dono = normalizarTextoProjetoController_(projeto.Criado_Por);

  if (dono === id) {
    return true;
  }

  if (!normalizarBooleanoProjetoController_(projeto.Compartilhado)) {
    return false;
  }

  return listaTextoContemIdProjetoController_(projeto.Usuarios_Compartilhados, id);
}


function enriquecerProjetoParaViewController_(projeto, contexto, consolidadoPeriodo) {
  const idCriador = normalizarTextoProjetoController_(projeto.Criado_Por);
  const ehCriador = idCriador === contexto.idLogado;
  const podeEditar = ehCriador || contexto.papelLogado === "Administrador";
  const criador = contexto.mapaUsuariosAtivos[idCriador] || null;

  return {
    ID_Projeto: normalizarTextoProjetoController_(projeto.ID_Projeto),
    Nome: normalizarTextoProjetoController_(projeto.Nome),
    Orcamento_Teto: normalizarOrcamentoProjetoController_(projeto.Orcamento_Teto),
    Compartilhado: normalizarBooleanoProjetoController_(projeto.Compartilhado),
    Usuarios_Compartilhados: normalizarListaIdsProjetoController_(projeto.Usuarios_Compartilhados),
    Status: normalizarBooleanoProjetoController_(projeto.Status),
    Criado_Por: idCriador,
    Nome_Criador: criador ? criador.nome : "Usuario",
    Eh_Criador: ehCriador,
    Pode_Editar: podeEditar,
    Pode_Alterar_Compartilhamento: ehCriador,
    Consolidado_Periodo: consolidadoPeriodo || montarConsolidadoVazioProjetoController_(projeto, {}),
    Mensagem_Acesso: ehCriador
      ? "Voce e o criador deste projeto e pode gerenciar o compartilhamento."
      : "Voce participa deste projeto em modo de consulta da equipe. Apenas o criador pode alterar o compartilhamento."
  };
}


function listarMembrosVisiveisProjetoController_(projeto, contexto) {
  const ids = {};
  const lista = [];
  const idCriador = normalizarTextoProjetoController_(projeto.Criado_Por);

  ids[idCriador] = true;

  normalizarListaIdsProjetoController_(projeto.Usuarios_Compartilhados)
    .split(",")
    .forEach(function(idUsuario) {
      if (idUsuario) ids[idUsuario] = true;
    });

  Object.keys(ids).forEach(function(idUsuario) {
    const usuario = contexto.mapaUsuariosAtivos[idUsuario];

    if (usuario) {
      lista.push({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel
      });
    }
  });

  return lista;
}


function buscarProjetoPorIdController_(idProjeto, projetos) {
  const id = normalizarTextoProjetoController_(idProjeto);
  const projeto = (projetos || []).find(function(item) {
    return normalizarTextoProjetoController_(item.ID_Projeto) === id;
  });

  if (!projeto) {
    throw new Error("Projeto nao encontrado.");
  }

  return projeto;
}


function listarUsuariosAtivosProjetoController_() {
  if (typeof listarUsuariosModel_ !== "function") {
    return [];
  }

  return listarUsuariosModel_()
    .filter(function(usuario) {
      return normalizarBooleanoProjetoController_(usuario.Ativo);
    })
    .map(function(usuario) {
      return {
        id: normalizarTextoProjetoController_(usuario.ID_Usuario),
        nome: normalizarTextoProjetoController_(usuario.Nome) || "Usuario",
        email: normalizarTextoProjetoController_(usuario.Email),
        papel: normalizarTextoProjetoController_(usuario.Papel)
      };
    });
}


function montarMapaUsuariosAtivosProjetoController_(usuarios) {
  const mapa = {};

  (usuarios || []).forEach(function(usuario) {
    if (usuario.id) {
      mapa[usuario.id] = usuario;
    }
  });

  return mapa;
}


function listaTextoContemIdProjetoController_(listaTexto, idBuscado) {
  const id = normalizarTextoProjetoController_(idBuscado);

  if (!id) return false;

  return normalizarListaIdsProjetoController_(listaTexto)
    .split(",")
    .some(function(item) {
      return item === id;
    });
}


function normalizarListaIdsProjetoController_(valor) {
  if (valor === null || valor === undefined) return "";

  const origem = Array.isArray(valor) ? valor : valor.toString().split(",");
  const usados = {};
  const ids = [];

  origem.forEach(function(item) {
    const id = normalizarTextoProjetoController_(item);

    if (!id || usados[id]) return;

    usados[id] = true;
    ids.push(id);
  });

  return ids.join(",");
}


function normalizarOrcamentoProjetoController_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number") return valor < 0 ? "" : valor;

  const numero = parseFloat(valor.toString().replace(/\./g, "").replace(",", "."));
  return isNaN(numero) || numero < 0 ? "" : numero;
}


function normalizarNumeroProjetoController_(valor) {
  const numero = normalizarOrcamentoProjetoController_(valor);
  return numero === "" ? 0 : numero;
}


function normalizarTextoProjetoController_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function normalizarBooleanoProjetoController_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}


function normalizarChaveNomeProjetoController_(valor) {
  return normalizarTextoProjetoController_(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
