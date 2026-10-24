/**
 * Modulo: Recorrencias_Controller.gs
 * Responsabilidade:
 * - Controlar o cadastro de automacoes recorrentes.
 * - Validar compatibilidade com contas, cartoes, projetos e rateios.
 * - Gerar lancamentos manuais e automaticos sem alterar o historico ja criado.
 */


/**
 * Carrega o pacote completo da tela de recorrencias.
 *
 * @param {string} tokenSessao Token de sessao.
 * @param {Object} filtros Filtros opcionais da tela.
 * @returns {Object} Pacote da tela.
 */
function obterPacoteTelaRecorrencias(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("Recorrencias.obterPacoteTela");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const filtrosNormalizados = medirEtapaPerformance_(medidor, "normalizar_filtros", function() {
    return normalizarFiltrosRecorrenciasController_(filtros);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoRecorrenciasController_(sessao, medidor);
  });

  medirEtapaPerformance_(medidor, "sincronizar_status", function() {
    sincronizarStatusRecorrenciasDoUsuarioController_(contexto);
  });

  const recorrenciasDoUsuario = medirEtapaPerformance_(medidor, "montar_recorrencias", function() {
    return contexto.recorrenciasTodos
      .filter(function(item) {
        return normalizarTextoRecorrenciaController_(item.ID_Usuario) === contexto.idLogado;
      })
      .map(function(item) {
        return enriquecerRecorrenciaParaTelaController_(item, contexto);
      })
      .filter(function(item, indice, lista) {
        return deduplicarRecorrenciaPorIdController_(item, indice, lista);
      })
      .filter(function(item) {
        return aplicarFiltroRecorrenciaController_(item, filtrosNormalizados);
      })
      .sort(function(a, b) {
        return compararDataCriacaoRecorrenciaController_(b.Data_Criacao, a.Data_Criacao);
      });
  });
  const ocorrenciasPeriodo = medirEtapaPerformance_(medidor, "listar_ocorrencias_periodo", function() {
    return listarPendenciasManuaisTelaRecorrenciasController_(contexto, filtrosNormalizados.Data_Limite_Manual);
  });
  const resumo = medirEtapaPerformance_(medidor, "calcular_resumo", function() {
    return montarResumoRecorrenciasController_(recorrenciasDoUsuario, ocorrenciasPeriodo);
  });

  const pacote = {
    usuarioLogado: {
      id: contexto.idLogado,
      nome: contexto.nomeLogado
    },
    filtrosAplicados: filtrosNormalizados,
    recorrencias: recorrenciasDoUsuario,
    ocorrenciasManuais: ocorrenciasPeriodo,
    ocorrenciasPeriodo: ocorrenciasPeriodo,
    dependencias: {
      contas: contexto.contasAcessiveis,
      cartoes: contexto.cartoesAcessiveis,
      categorias: contexto.categoriasAcessiveis,
      projetos: contexto.projetosAcessiveis,
      usuarios: contexto.usuariosAtivosSanitizados
    },
    resumo: resumo
  };

  registrarContagemPerformance_(medidor, "recorrenciasTodos", contexto.recorrenciasTodos.length);
  registrarContagemPerformance_(medidor, "recorrenciasRetornadas", recorrenciasDoUsuario.length);
  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
  registrarContagemPerformance_(medidor, "rateiosTodos", contexto.rateiosTodos.length);
  registrarContagemPerformance_(medidor, "ocorrenciasPeriodo", ocorrenciasPeriodo.length);

  pacote._performance = finalizarPerformance_(medidor);
  return pacote;
}


/**
 * Salva uma recorrencia nova ou existente.
 *
 * @param {Object} dados Dados do formulario.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function salvarRecorrencia(dados, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const contexto = montarContextoRecorrenciasController_(sessao);
    const idRecorrencia = normalizarTextoRecorrenciaController_(dados && dados.ID_Recorrencia);
    const existente = idRecorrencia
      ? buscarRecorrenciaNoContextoController_(idRecorrencia, contexto)
      : null;

    if (existente && normalizarTextoRecorrenciaController_(existente.Status_Recorrencia) === "Inativa") {
      throw new Error("Recorrencias inativas nao podem ser editadas. Reative com nova data ou cadastre uma nova automacao.");
    }

    const recorrencia = montarRecorrenciaParaSalvarController_(dados, contexto, existente);
    const diagnostico = validarCompatibilidadeRecorrenciaController_(recorrencia, contexto, dados && dados.Participantes_Rateio);

    if (diagnostico.invalida) {
      throw new Error(diagnostico.mensagemGeral);
    }

    salvarRecorrenciaModel(recorrencia);
    salvarRateioRecorrenciaController_(recorrencia, dados, contexto);

    if (normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao) === "Automática") {
      garantirTriggerRecorrenciasAutomaticas_();
    }

    return existente
      ? "Recorrencia atualizada com sucesso. As proximas geracoes seguirao a nova configuracao."
      : "Recorrencia criada com sucesso.";

  } finally {
    lock.releaseLock();
  }
}


/**
 * Inativa uma recorrencia ativa/manual.
 *
 * @param {string} idRecorrencia ID da recorrencia.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function inativarRecorrencia(idRecorrencia, tokenSessao) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const contexto = montarContextoRecorrenciasController_(sessao);
  const recorrencia = buscarRecorrenciaNoContextoController_(idRecorrencia, contexto);

  validarAcessoRecorrenciaController_(recorrencia, contexto);

  if (normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia) === "Revisão necessária") {
    throw new Error("Recorrencias em revisao necessaria devem ser corrigidas antes de qualquer inativacao.");
  }

  recorrencia.Status_Recorrencia = "Inativa";
  recorrencia.Info_Bloqueio = "";
  recorrencia.Alterado_Por_ID = contexto.idLogado;
  recorrencia.Data_Alteracao = new Date().toLocaleString("pt-BR");

  salvarRecorrenciaModel(recorrencia);
  return "Recorrencia inativada com sucesso.";
}


/**
 * Reativa uma recorrencia inativa com nova data de inicio.
 *
 * @param {string} idRecorrencia ID da recorrencia.
 * @param {string} novaDataInicio Nova data yyyy-MM-dd.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function reativarRecorrencia(idRecorrencia, novaDataInicio, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const contexto = montarContextoRecorrenciasController_(sessao);
    const recorrencia = buscarRecorrenciaNoContextoController_(idRecorrencia, contexto);

    validarAcessoRecorrenciaController_(recorrencia, contexto);

    if (normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia) !== "Inativa") {
      throw new Error("Somente recorrencias inativas podem ser reativadas.");
    }

    validarDataInicioRecorrenciaController_(novaDataInicio);

    recorrencia.Data_Inicio = normalizarTextoRecorrenciaController_(novaDataInicio);
    recorrencia.Status_Recorrencia = "Ativa";
    recorrencia.Info_Bloqueio = "";
    recorrencia.Alterado_Por_ID = contexto.idLogado;
    recorrencia.Data_Alteracao = new Date().toLocaleString("pt-BR");

    salvarRecorrenciaModel(recorrencia);

    if (normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao) === "Automática") {
      garantirTriggerRecorrenciasAutomaticas_();
    }

    return "Recorrencia reativada com sucesso a partir da nova data informada.";

  } finally {
    lock.releaseLock();
  }
}


function alterarRecorrenciasEmLote(tokenSessao, dados) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const contexto = montarContextoRecorrenciasController_(sessao);
    const idsSelecionados = normalizarIdsRecorrenciasEmLoteController_(dados && dados.IDs_Recorrencias);
    const campo = normalizarTextoRecorrenciaController_(dados && dados.Campo);
    const configuracao = normalizarConfiguracaoLoteRecorrenciaController_(campo, dados);
    const agora = new Date().toLocaleString("pt-BR");
    const resumo = {
      campo: configuracao.rotuloCampo,
      valor: configuracao.rotuloValor,
      alteradas: 0,
      ignoradasMesmoValor: 0,
      ignoradasInacessiveis: 0,
      totalSelecionadas: idsSelecionados.length
    };

    if (idsSelecionados.length === 0) {
      throw new Error("Selecione ao menos uma recorrencia para alterar em lote.");
    }

    idsSelecionados.forEach(function(idRecorrencia) {
      const recorrencia = (contexto.recorrenciasTodos || []).find(function(item) {
        return normalizarTextoRecorrenciaController_(item.ID_Recorrencia) === idRecorrencia;
      });

      if (!recorrencia || normalizarTextoRecorrenciaController_(recorrencia.ID_Usuario) !== contexto.idLogado) {
        resumo.ignoradasInacessiveis += 1;
        return;
      }

      if (recorrenciaJaPossuiConfiguracaoLoteRecorrenciaController_(recorrencia, configuracao)) {
        resumo.ignoradasMesmoValor += 1;
        return;
      }

      aplicarConfiguracaoLoteRecorrenciaController_(recorrencia, configuracao);
      recorrencia.Alterado_Por_ID = contexto.idLogado;
      recorrencia.Data_Alteracao = agora;
      salvarRecorrenciaModel(recorrencia);
      resumo.alteradas += 1;
    });

    if (campo === "Modo_Geracao" && configuracao.valor === "Automática" && resumo.alteradas > 0) {
      garantirTriggerRecorrenciasAutomaticas_();
    }

    return montarMensagemAlteracaoLoteRecorrenciaController_(resumo);

  } finally {
    lock.releaseLock();
  }
}


function normalizarIdsRecorrenciasEmLoteController_(ids) {
  const lista = Array.isArray(ids) ? ids : [];
  const mapa = {};

  lista.forEach(function(id) {
    const idNormalizado = normalizarTextoRecorrenciaController_(id);

    if (idNormalizado) {
      mapa[idNormalizado] = true;
    }
  });

  return Object.keys(mapa);
}


function normalizarConfiguracaoLoteRecorrenciaController_(campo, dados) {
  if (campo === "Modo_Geracao") {
    const valor = normalizarModoGeracaoRecorrenciaController_(dados && dados.Valor);
    return {
      campo: campo,
      valor: valor,
      rotuloCampo: "Modo de geracao",
      rotuloValor: valor
    };
  }

  if (campo === "Periodicidade_Tipo") {
    const valorPeriodicidade = normalizarPeriodicidadeRecorrenciaController_(dados && dados.Valor);
    const intervalo = valorPeriodicidade === "Personalizada"
      ? normalizarIntervaloRecorrenciaController_(dados && dados.Intervalo_Dias)
      : "";

    if (valorPeriodicidade === "Personalizada" && (!intervalo || intervalo <= 0)) {
      throw new Error("Informe o intervalo em dias para aplicar periodicidade personalizada em lote.");
    }

    return {
      campo: campo,
      valor: valorPeriodicidade,
      intervalo: intervalo,
      rotuloCampo: "Periodicidade",
      rotuloValor: valorPeriodicidade === "Personalizada"
        ? "Personalizada a cada " + intervalo + " dia(s)"
        : "Mensal"
    };
  }

  if (campo === "Status_Lancamento") {
    const valorStatus = normalizarStatusLancamentoRecorrenciaController_(dados && dados.Valor);
    return {
      campo: campo,
      valor: valorStatus,
      rotuloCampo: "Status do lancamento gerado",
      rotuloValor: valorStatus
    };
  }

  throw new Error("Parametro de alteracao em lote invalido.");
}


function recorrenciaJaPossuiConfiguracaoLoteRecorrenciaController_(recorrencia, configuracao) {
  if (configuracao.campo === "Periodicidade_Tipo") {
    return normalizarTextoRecorrenciaController_(recorrencia.Periodicidade_Tipo) === configuracao.valor &&
      String(normalizarIntervaloRecorrenciaController_(recorrencia.Intervalo_Dias) || "") === String(configuracao.intervalo || "");
  }

  return normalizarTextoRecorrenciaController_(recorrencia[configuracao.campo]) === configuracao.valor;
}


function aplicarConfiguracaoLoteRecorrenciaController_(recorrencia, configuracao) {
  if (configuracao.campo === "Periodicidade_Tipo") {
    recorrencia.Periodicidade_Tipo = configuracao.valor;
    recorrencia.Intervalo_Dias = configuracao.intervalo || "";
    return;
  }

  recorrencia[configuracao.campo] = configuracao.valor;
}


function montarMensagemAlteracaoLoteRecorrenciaController_(resumo) {
  let mensagem = resumo.campo + " alterado para " + resumo.valor + ". " +
    resumo.alteradas + " recorrencia(s) atualizada(s).";

  if (resumo.ignoradasMesmoValor > 0) {
    mensagem += " " + resumo.ignoradasMesmoValor + " ja possuia(m) esse valor e nao foram alterada(s).";
  }

  if (resumo.ignoradasInacessiveis > 0) {
    mensagem += " " + resumo.ignoradasInacessiveis + " nao puderam ser alterada(s) por acesso ou inconsistencia.";
  }

  return mensagem;
}


/**
 * Carrega uma recorrencia para edicao com diagnostico detalhado.
 *
 * @param {string} idRecorrencia ID da recorrencia.
 * @param {string} tokenSessao Token de sessao.
 * @returns {Object} Dados completos para o formulario.
 */
function obterRecorrenciaParaEdicao(idRecorrencia, tokenSessao) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const contexto = montarContextoRecorrenciasController_(sessao);
  const recorrencia = buscarRecorrenciaNoContextoController_(idRecorrencia, contexto);

  validarAcessoRecorrenciaController_(recorrencia, contexto);

  if (normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia) === "Inativa") {
    throw new Error("Recorrencias inativas nao podem ser editadas. Use a reativacao com nova data ou crie uma nova automacao.");
  }

  const rateios = listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto);
  const diagnostico = diagnosticarRecorrenciaController_(recorrencia, contexto, rateios);

  return {
    recorrencia: clonarRecorrenciaController_(recorrencia),
    rateios: rateios,
    diagnostico: diagnostico
  };
}


/**
 * Gera lancamentos manuais selecionados pelo usuario.
 *
 * @param {Array<Object>} selecoes Lista de selecoes { ID_Recorrencia, Data_Ocorrencia }.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function gerarOcorrenciasManuaisRecorrencia(selecoes, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const contexto = montarContextoRecorrenciasController_(sessao);
    const itens = normalizarSelecoesGeracaoManualRecorrenciaController_(selecoes);

    if (itens.length === 0) {
      throw new Error("Selecione pelo menos uma ocorrencia manual para gerar.");
    }

    validarSelecoesManuaisEmLoteRecorrenciaController_(itens, contexto);

    itens.forEach(function(item) {
      gerarOcorrenciaRecorrenciaController_(item.recorrencia, item.dataOcorrencia, contexto, item.rateios);
    });

    return itens.length === 1
      ? "Ocorrencia manual gerada com sucesso."
      : (itens.length + " ocorrencias manuais foram geradas com sucesso.");

  } finally {
    lock.releaseLock();
  }
}


/**
 * Retorna os dados do proximo ciclo pendente para a geracao pontual.
 *
 * A data prevista identifica o ciclo da recorrencia. A data efetiva do
 * lancamento pode ser escolhida depois sem alterar a programacao futura.
 *
 * @param {string} idRecorrencia ID da recorrencia.
 * @param {string} tokenSessao Token de sessao.
 * @returns {Object} Dados seguros para o modal de confirmacao.
 */
function obterDadosGeracaoPontualRecorrencia(idRecorrencia, tokenSessao) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const contexto = montarContextoRecorrenciasController_(sessao);
  const recorrencia = buscarRecorrenciaNoContextoController_(idRecorrencia, contexto);

  validarAcessoRecorrenciaController_(recorrencia, contexto);
  validarRecorrenciaDisponivelParaGeracaoPontualController_(recorrencia, contexto);

  const dataPrevista = obterPrimeiraDataPendenteRecorrenciaController_(recorrencia, contexto);

  return {
    ID_Recorrencia: recorrencia.ID_Recorrencia,
    Descricao: recorrencia.Descricao,
    Valor_Base: recorrencia.Valor_Base,
    Modo_Geracao: recorrencia.Modo_Geracao,
    Data_Prevista: dataPrevista,
    Data_Sugerida: gerarDataHojeRecorrenciaController_()
  };
}


/**
 * Gera um unico lancamento com base no proximo ciclo pendente.
 *
 * A data prevista permanece como identidade do ciclo. A data informada pelo
 * usuario afeta somente o lancamento criado e nao altera a recorrencia.
 *
 * @param {string} idRecorrencia ID da recorrencia.
 * @param {string} dataPrevista Data original do ciclo yyyy-MM-dd.
 * @param {string} dataLancamento Data efetiva do lancamento yyyy-MM-dd.
 * @param {string} tokenSessao Token de sessao.
 * @returns {string} Mensagem de sucesso.
 */
function gerarOcorrenciaPontualRecorrencia(idRecorrencia, dataPrevista, dataLancamento, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const contexto = montarContextoRecorrenciasController_(sessao);
    const recorrencia = buscarRecorrenciaNoContextoController_(idRecorrencia, contexto);

    validarAcessoRecorrenciaController_(recorrencia, contexto);
    validarRecorrenciaDisponivelParaGeracaoPontualController_(recorrencia, contexto);

    const prevista = normalizarTextoRecorrenciaController_(dataPrevista);
    const proximaPendente = obterPrimeiraDataPendenteRecorrenciaController_(recorrencia, contexto);

    if (prevista !== proximaPendente) {
      throw new Error("Esta ocorrencia nao e mais a proxima pendente. Atualize a tela e tente novamente.");
    }

    const dataEfetiva = validarDataLancamentoPontualRecorrenciaController_(dataLancamento || prevista);
    const rateios = listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto);

    gerarOcorrenciaRecorrenciaController_(
      recorrencia,
      prevista,
      contexto,
      rateios,
      dataEfetiva,
      "Manual"
    );

    return dataEfetiva === prevista
      ? "Lancamento gerado com sucesso na data prevista."
      : "Lancamento gerado com sucesso na data escolhida, sem alterar a programacao da recorrencia.";

  } finally {
    lock.releaseLock();
  }
}


function validarRecorrenciaDisponivelParaGeracaoPontualController_(recorrencia, contexto) {
  if (normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia) !== "Ativa") {
    throw new Error("Somente recorrencias ativas podem gerar lancamentos. Reavalie ou reative a recorrencia antes de continuar.");
  }

  const rateios = listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto);
  const diagnostico = validarCompatibilidadeRecorrenciaController_(recorrencia, contexto, rateios);

  if (diagnostico.invalida) {
    marcarRecorrenciaComoRevisaoController_(recorrencia, diagnostico.mensagemGeral, contexto.idLogado);
    throw new Error(diagnostico.mensagemGeral);
  }
}


function validarDataLancamentoPontualRecorrenciaController_(valor) {
  const data = normalizarTextoRecorrenciaController_(valor);
  const partes = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new Error("Informe uma data valida para o lancamento no formato AAAA-MM-DD.");
  }

  const ano = parseInt(partes[1], 10);
  const mes = parseInt(partes[2], 10);
  const dia = parseInt(partes[3], 10);
  const conferida = new Date(ano, mes - 1, dia);

  if (conferida.getFullYear() !== ano || conferida.getMonth() !== mes - 1 || conferida.getDate() !== dia) {
    throw new Error("A data informada para o lancamento nao existe.");
  }

  return data;
}


/**
 * Rotina noturna para gerar recorrencias automaticas.
 *
 * @returns {string} Resumo da rotina.
 */
function executarRotinaRecorrenciasAutomaticas() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const usuarios = listarUsuariosModel().filter(function(usuario) {
      return normalizarBooleanoRecorrenciaController_(usuario.Ativo);
    });
    let totalGerado = 0;
    let totalRevisao = 0;
    const hoje = gerarDataHojeRecorrenciaController_();

    usuarios.forEach(function(usuario) {
      const contexto = montarContextoRecorrenciasPorUsuarioController_(usuario);
      sincronizarStatusRecorrenciasDoUsuarioController_(contexto);

      const automaticas = contexto.recorrenciasTodos.filter(function(item) {
        return normalizarTextoRecorrenciaController_(item.ID_Usuario) === contexto.idLogado &&
               normalizarTextoRecorrenciaController_(item.Modo_Geracao) === "Automática" &&
               normalizarTextoRecorrenciaController_(item.Status_Recorrencia) === "Ativa";
      });

      automaticas.forEach(function(recorrencia) {
        const rateios = listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto);
        const pendencias = listarOcorrenciasPendentesRecorrenciaController_(
          recorrencia,
          contexto,
          hoje,
          rateios
        );

        if (pendencias.length === 0) {
          return;
        }

        const primeira = pendencias[0];
        const primeiraExecucaoAtrasadaPermitida = podeGerarPrimeiraExecucaoAutomaticaRecorrenciaController_(
          recorrencia,
          primeira,
          contexto
        );

        if (primeira.Data_Ocorrencia !== hoje && !primeiraExecucaoAtrasadaPermitida) {
          marcarRecorrenciaComoRevisaoController_(
            recorrencia,
            "Uma ocorrencia automatica anterior nao foi gerada na data esperada. Reavalie esta automacao.",
            contexto.idLogado
          );
          totalRevisao += 1;
          return;
        }

        const diagnostico = validarCompatibilidadeRecorrenciaController_(
          recorrencia,
          contexto,
          rateios
        );

        if (diagnostico.invalida) {
          marcarRecorrenciaComoRevisaoController_(recorrencia, diagnostico.mensagemGeral, contexto.idLogado);
          totalRevisao += 1;
          return;
        }

        gerarOcorrenciaRecorrenciaController_(recorrencia, primeira.Data_Ocorrencia, contexto, primeira.Rateios);
        totalGerado += 1;
      });
    });

    return "Rotina de recorrencias concluida. Geradas: " + totalGerado + ". Em revisao: " + totalRevisao + ".";

  } finally {
    lock.releaseLock();
  }
}


/**
 * Retorna dados resumidos de recorrencias para uso futuro no Dashboard.
 *
 * @param {string} tokenSessao Token de sessao.
 * @returns {Object} Resumo simples.
 */
function obterResumoRecorrenciasParaDashboard(tokenSessao) {
  const pacote = obterPacoteTelaRecorrencias(tokenSessao, {
    Exibir_Inativas: false,
    Data_Limite_Manual: gerarDataHojeRecorrenciaController_()
  });

  return {
    revisaoNecessaria: pacote.resumo.Revisao_Necessaria,
    pendenciasManuais: (pacote.ocorrenciasPeriodo || pacote.ocorrenciasManuais || []).filter(function(item) {
      return item.Status_Ocorrencia !== "Gerada" && item.Modo_Geracao === "Manual";
    }).length
  };
}


function montarContextoRecorrenciasController_(sessao, medidorPerformance) {
  return montarContextoRecorrenciasPorUsuarioController_({
    ID_Usuario: sessao.id,
    Nome: sessao.nome,
    Email: sessao.email,
    Papel: sessao.papel,
    Ativo: true
  }, medidorPerformance);
}


function montarContextoRecorrenciasPorUsuarioController_(usuarioBase, medidorPerformance) {
  const idLogado = normalizarTextoRecorrenciaController_(usuarioBase.ID_Usuario || usuarioBase.id);
  const nomeLogado = normalizarTextoRecorrenciaController_(usuarioBase.Nome || usuarioBase.nome);
  const emailLogado = normalizarTextoRecorrenciaController_(usuarioBase.Email || usuarioBase.email);
  const papelLogado = normalizarTextoRecorrenciaController_(usuarioBase.Papel || usuarioBase.papel) || "Usuário";
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    if (typeof obterContextoRecorrenciasSupabaseRpc_ === "function") {
      const contextoRecorrencias = obterContextoRecorrenciasSupabaseRpc_(idLogado);

      if (contextoRecorrencias) {
        return contextoRecorrencias;
      }
    }

    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, gerarDataHojeRecorrenciaController_().slice(0, 7), true)
      : null;
  });
  const usuariosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
    return contextoRpc ? contextoRpc.usuariosTodos : listarUsuariosModel();
  });
  const contasTodas = medirEtapaPerformance_(medidorPerformance, "consulta_contas", function() {
    return contextoRpc ? contextoRpc.contasTodas : typeof listarContasModel === "function" ? listarContasModel() : [];
  });
  const cartoesTodos = medirEtapaPerformance_(medidorPerformance, "consulta_cartoes", function() {
    return contextoRpc ? contextoRpc.cartoesTodos : typeof listarCartoesModel === "function" ? listarCartoesModel() : [];
  });
  const categoriasTodas = medirEtapaPerformance_(medidorPerformance, "consulta_categorias", function() {
    return typeof listarCategoriasModel === "function"
      ? listarCategoriasModel()
      : contextoRpc
        ? contextoRpc.categoriasTodas
        : [];
  });
  const projetosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_projetos", function() {
    return contextoRpc ? contextoRpc.projetosTodos : typeof listarProjetosModel === "function" ? listarProjetosModel() : [];
  });
  const lancamentosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_lancamentos", function() {
    return contextoRpc ? contextoRpc.lancamentosTodos : typeof listarLancamentosModel === "function" ? listarLancamentosModel() : [];
  });
  const rateiosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_rateios", function() {
    return contextoRpc ? contextoRpc.rateiosTodos : typeof listarRateiosModel === "function" ? listarRateiosModel() : [];
  });
  const recorrenciasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias", function() {
    return contextoRpc ? contextoRpc.recorrenciasTodos : listarRecorrenciasModel();
  });
  const recorrenciasRateiosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_rateios", function() {
    return contextoRpc ? contextoRpc.recorrenciasRateiosTodos : listarRecorrenciasRateiosModel();
  });
  const recorrenciasOcorrenciasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_ocorrencias", function() {
    return contextoRpc && contextoRpc.recorrenciasOcorrenciasTodos
      ? contextoRpc.recorrenciasOcorrenciasTodos
      : typeof listarRecorrenciasOcorrenciasModel === "function" ? listarRecorrenciasOcorrenciasModel() : [];
  });

  return {
    idLogado: idLogado,
    nomeLogado: nomeLogado,
    emailLogado: emailLogado,
    papelLogado: papelLogado,
    usuariosTodos: usuariosTodos,
    contasTodas: contasTodas,
    cartoesTodos: cartoesTodos,
    categoriasTodas: categoriasTodas,
    projetosTodos: projetosTodos,
    lancamentosTodos: lancamentosTodos,
    rateiosTodos: rateiosTodos,
    recorrenciasTodos: recorrenciasTodos,
    recorrenciasRateiosTodos: recorrenciasRateiosTodos,
    recorrenciasOcorrenciasTodos: recorrenciasOcorrenciasTodos,
    usuariosAtivosSanitizados: filtrarUsuariosAtivosParaLancamentos_(usuariosTodos),
    contasAcessiveis: filtrarContasAcessiveisLancamento_(contasTodas, idLogado),
    cartoesAcessiveis: filtrarCartoesAcessiveisLancamento_(cartoesTodos, idLogado),
    categoriasAcessiveis: filtrarCategoriasAcessiveisRecorrenciaController_(categoriasTodas, idLogado),
    projetosAcessiveis: filtrarProjetosAcessiveisLancamento_(projetosTodos, idLogado, papelLogado)
  };
}


function filtrarCategoriasAcessiveisRecorrenciaController_(categorias, idLogado) {
  return (categorias || []).filter(function(categoria) {
    const dono = normalizarTextoRecorrenciaController_(categoria.Criado_Por);
    const global = normalizarBooleanoRecorrenciaController_(categoria.Global);
    const ativa = normalizarBooleanoRecorrenciaController_(categoria.Ativa);

    return ativa && (global || dono === idLogado);
  });
}


function normalizarFiltrosRecorrenciasController_(filtros) {
  filtros = filtros || {};

  return {
    Texto: normalizarTextoRecorrenciaController_(filtros.Texto).toLowerCase(),
    Status_Recorrencia: normalizarTextoRecorrenciaController_(filtros.Status_Recorrencia),
    Modo_Geracao: normalizarTextoRecorrenciaController_(filtros.Modo_Geracao),
    Tipo: normalizarTextoRecorrenciaController_(filtros.Tipo),
    Exibir_Inativas: normalizarBooleanoRecorrenciaController_(filtros.Exibir_Inativas),
    Mes_Inicial: normalizarTextoRecorrenciaController_(filtros.Mes_Inicial || filtros.Mes_Referencia),
    Mes_Final: normalizarTextoRecorrenciaController_(filtros.Mes_Final),
    Data_Inicio_Periodo: obterDataInicioPeriodoRecorrenciasController_(filtros),
    Data_Fim_Periodo: obterDataFimPeriodoRecorrenciasController_(filtros),
    Data_Limite_Manual: normalizarTextoRecorrenciaController_(filtros.Data_Limite_Manual) ||
      obterDataFimPeriodoRecorrenciasController_(filtros) ||
      gerarDataHojeRecorrenciaController_()
  };
}


function aplicarFiltroRecorrenciaController_(recorrencia, filtros) {
  const status = normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia);

  if (!filtros.Exibir_Inativas && status === "Inativa") {
    return false;
  }

  if (filtros.Status_Recorrencia && status !== filtros.Status_Recorrencia) {
    return false;
  }

  if (filtros.Modo_Geracao && normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao) !== filtros.Modo_Geracao) {
    return false;
  }

  if (filtros.Tipo && normalizarTextoRecorrenciaController_(recorrencia.Tipo) !== filtros.Tipo) {
    return false;
  }

  if (filtros.Texto) {
    const textoBase = (
      normalizarTextoRecorrenciaController_(recorrencia.Descricao) + " " +
      normalizarTextoRecorrenciaController_(recorrencia.Nome_Origem_Visualizacao) + " " +
      normalizarTextoRecorrenciaController_(recorrencia.Nome_Projeto_Visualizacao)
    ).toLowerCase();

    if (textoBase.indexOf(filtros.Texto) === -1) {
      return false;
    }
  }

  return true;
}


function recorrenciaEstaNoPeriodoRecorrenciaController_(recorrencia, filtros) {
  const inicioPeriodo = normalizarTextoRecorrenciaController_(filtros && filtros.Data_Inicio_Periodo);
  const fimPeriodo = normalizarTextoRecorrenciaController_(filtros && filtros.Data_Fim_Periodo);
  const limite = fimPeriodo || inicioPeriodo;

  if (!limite) {
    return true;
  }

  const dataInicio = normalizarTextoRecorrenciaController_(recorrencia.Data_Inicio);

  if (!dataInicio || compararDataInicioRecorrenciaController_(dataInicio, limite) > 0) {
    return false;
  }

  const datas = listarDatasAteLimiteRecorrenciaController_(recorrencia, limite);
  const inicioJanela = inicioPeriodo || dataInicio;

  return datas.some(function(dataOcorrencia) {
    return compararDataInicioRecorrenciaController_(dataOcorrencia, inicioJanela) >= 0 &&
      compararDataInicioRecorrenciaController_(dataOcorrencia, limite) <= 0;
  });
}


function obterDataInicioPeriodoRecorrenciasController_(filtros) {
  const mesInicial = normalizarTextoRecorrenciaController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia));

  if (!mesInicial) {
    return "";
  }

  return typeof obterInicioMesConsolidadoController_ === "function"
    ? obterInicioMesConsolidadoController_(mesInicial)
    : mesInicial + "-01";
}


function obterDataFimPeriodoRecorrenciasController_(filtros) {
  const mesInicial = normalizarTextoRecorrenciaController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia));
  const mesFinal = normalizarTextoRecorrenciaController_(filtros && filtros.Mes_Final);
  const mesLimite = mesFinal || mesInicial;

  if (!mesLimite) {
    return "";
  }

  return typeof obterFimMesConsolidadoController_ === "function"
    ? obterFimMesConsolidadoController_(mesLimite)
    : gerarDataHojeRecorrenciaController_();
}


function enriquecerRecorrenciaParaTelaController_(recorrencia, contexto) {
  const rateios = listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto);
  const resumoRateio = montarResumoRateioRecorrenciaController_(rateios);

  return {
    ID_Recorrencia: recorrencia.ID_Recorrencia,
    Descricao: recorrencia.Descricao,
    Tipo: recorrencia.Tipo,
    Valor_Base: recorrencia.Valor_Base,
    Data_Inicio: recorrencia.Data_Inicio,
    Periodicidade_Tipo: recorrencia.Periodicidade_Tipo,
    Intervalo_Dias: recorrencia.Intervalo_Dias,
    Periodicidade_Visual: montarPeriodicidadeVisualRecorrenciaController_(recorrencia),
    Modo_Geracao: recorrencia.Modo_Geracao,
    Status_Recorrencia: recorrencia.Status_Recorrencia,
    Tipo_Origem: recorrencia.Tipo_Origem,
    ID_Origem: recorrencia.ID_Origem,
    ID_Destino: recorrencia.ID_Destino,
    ID_Categoria: recorrencia.ID_Categoria,
    ID_Projeto: recorrencia.ID_Projeto,
    Status_Lancamento: recorrencia.Status_Lancamento,
    Info_Bloqueio: recorrencia.Info_Bloqueio,
    Data_Criacao: recorrencia.Data_Criacao,
    Nome_Categoria_Visualizacao: obterNomeCategoriaRecorrenciaController_(recorrencia, contexto),
    Nome_Origem_Visualizacao: obterNomeOrigemRecorrenciaController_(recorrencia, contexto),
    Nome_Projeto_Visualizacao: obterNomeProjetoRecorrenciaController_(recorrencia, contexto),
    Resumo_Rateio: resumoRateio
  };
}


function montarResumoRecorrenciasController_(recorrencias, ocorrencias) {
  const resumo = {
    Total: 0,
    Ativas: 0,
    Inativas: 0,
    Revisao_Necessaria: 0,
    Manuais: 0,
    Automaticas: 0,
    Pendentes: 0,
    Geradas: 0
  };

  (recorrencias || []).forEach(function(item) {
    resumo.Total += 1;

    if (item.Status_Recorrencia === "Ativa") resumo.Ativas += 1;
    if (item.Status_Recorrencia === "Inativa") resumo.Inativas += 1;
    if (item.Status_Recorrencia === "Revisão necessária") resumo.Revisao_Necessaria += 1;
    if (item.Modo_Geracao === "Manual") resumo.Manuais += 1;
    if (item.Modo_Geracao === "Automática") resumo.Automaticas += 1;
  });

  (ocorrencias || []).forEach(function(item) {
    if (item.Status_Ocorrencia === "Gerada") {
      resumo.Geradas += 1;
    } else {
      resumo.Pendentes += 1;
    }
  });

  return resumo;
}


function montarRecorrenciaParaSalvarController_(dados, contexto, existente) {
  if (!dados) {
    throw new Error("Dados da recorrencia nao recebidos.");
  }

  const agora = new Date().toLocaleString("pt-BR");
  const tipo = normalizarTextoRecorrenciaController_(dados.Tipo);
  const recorrencia = {
    ID_Recorrencia: existente ? existente.ID_Recorrencia : Utilities.getUuid(),
    ID_Usuario: existente ? existente.ID_Usuario : contexto.idLogado,
    Descricao: normalizarTextoRecorrenciaController_(dados.Descricao),
    Tipo: tipo,
    Valor_Base: converterValorLancamento_(dados.Valor_Base),
    Data_Inicio: normalizarTextoRecorrenciaController_(dados.Data_Inicio),
    Periodicidade_Tipo: normalizarPeriodicidadeRecorrenciaController_(dados.Periodicidade_Tipo),
    Intervalo_Dias: normalizarIntervaloRecorrenciaController_(dados.Intervalo_Dias),
    Modo_Geracao: normalizarModoGeracaoRecorrenciaController_(dados.Modo_Geracao),
    Status_Recorrencia: "Ativa",
    Tipo_Origem: tipo === "Transferência" ? "Conta" : normalizarTextoRecorrenciaController_(dados.Tipo_Origem),
    ID_Origem: normalizarTextoRecorrenciaController_(dados.ID_Origem),
    ID_Destino: tipo === "Transferência" ? normalizarTextoRecorrenciaController_(dados.ID_Destino) : "",
    ID_Categoria: tipo === "Transferência" ? "" : normalizarTextoRecorrenciaController_(dados.ID_Categoria),
    ID_Projeto: normalizarTextoRecorrenciaController_(dados.ID_Projeto),
    Status_Lancamento: normalizarStatusLancamentoRecorrenciaController_(dados.Status_Lancamento),
    Observacao: "",
    Info_Bloqueio: "",
    Data_Criacao: existente ? existente.Data_Criacao : agora,
    Data_Alteracao: existente ? agora : "",
    Criado_Por_ID: existente ? existente.Criado_Por_ID : contexto.idLogado,
    Alterado_Por_ID: existente ? contexto.idLogado : "",
    _linhaPlanilha: existente ? existente._linhaPlanilha : null
  };

  validarCamposRecorrenciaController_(recorrencia, {
    permitirDataInicioPassada: !!existente
  });
  validarChavesRecorrenciaController_(recorrencia, contexto, existente);

  return recorrencia;
}


function validarCamposRecorrenciaController_(recorrencia, opcoes) {
  const tiposPermitidos = ["Despesa", "Receita", "Transferência"];
  const tiposOrigemPermitidos = ["Conta", "Cartão"];

  if (tiposPermitidos.indexOf(recorrencia.Tipo) === -1) {
    throw new Error("Tipo de recorrencia invalido.");
  }

  if (!recorrencia.Descricao) {
    throw new Error("A descricao base da recorrencia e obrigatoria.");
  }

  if (recorrencia.Valor_Base <= 0) {
    throw new Error("O valor da recorrencia deve ser maior que zero.");
  }

  validarDataInicioRecorrenciaController_(recorrencia.Data_Inicio, opcoes);

  if (recorrencia.Periodicidade_Tipo === "Personalizada" && (!recorrencia.Intervalo_Dias || recorrencia.Intervalo_Dias <= 0)) {
    throw new Error("Informe o intervalo em dias para a recorrencia personalizada.");
  }

  if (tiposOrigemPermitidos.indexOf(recorrencia.Tipo_Origem) === -1) {
    throw new Error("Tipo de origem invalido para a recorrencia.");
  }

  if (!recorrencia.ID_Origem) {
    throw new Error("Selecione a origem financeira da recorrencia.");
  }

  if (recorrencia.Tipo !== "Transferência" && !recorrencia.ID_Categoria) {
    throw new Error("Selecione a categoria da recorrencia.");
  }

  if (recorrencia.Tipo === "Transferência") {
    if (recorrencia.Tipo_Origem !== "Conta") {
      throw new Error("Transferencias recorrentes usam apenas contas.");
    }

    if (!recorrencia.ID_Destino) {
      throw new Error("Selecione a conta de destino da transferencia recorrente.");
    }

    if (recorrencia.ID_Origem === recorrencia.ID_Destino) {
      throw new Error("A conta de origem deve ser diferente da conta de destino.");
    }
  }
}


function validarChavesRecorrenciaController_(recorrencia, contexto, existente) {
  if (recorrencia.Tipo !== "Transferência") {
    const categoria = (contexto.categoriasAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Categoria) === recorrencia.ID_Categoria;
    });

    if (!categoria) {
      throw new Error("Categoria invalida, inativa ou inacessivel para a recorrencia.");
    }

    if (normalizarTextoLancamento_(categoria.Tipo) !== recorrencia.Tipo) {
      throw new Error("A categoria selecionada nao corresponde ao tipo da recorrencia.");
    }
  }

  if (recorrencia.Tipo_Origem === "Conta") {
    const conta = (contexto.contasAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === recorrencia.ID_Origem;
    });

    if (!conta) {
      throw new Error("Conta de origem invalida, inativa ou inacessivel.");
    }
  }

  if (recorrencia.Tipo_Origem === "Cartão") {
    const cartao = (contexto.cartoesAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Cartao) === recorrencia.ID_Origem;
    });

    if (!cartao) {
      throw new Error("Cartao invalido, inativo ou inacessivel.");
    }
  }

  if (recorrencia.Tipo === "Transferência") {
    const contaDestino = (contexto.contasAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === recorrencia.ID_Destino;
    });

    if (!contaDestino) {
      throw new Error("Conta de destino invalida, inativa ou inacessivel.");
    }
  }

  if (recorrencia.ID_Projeto) {
    const projeto = (contexto.projetosAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Projeto) === recorrencia.ID_Projeto;
    });

    if (!projeto) {
      throw new Error("Projeto invalido, concluido ou inacessivel.");
    }
  }

  if (existente && normalizarTextoRecorrenciaController_(existente.Tipo) !== recorrencia.Tipo) {
    throw new Error("Nao e permitido mudar o tipo da recorrencia. Inative a atual e cadastre uma nova automacao.");
  }
}


function salvarRateioRecorrenciaController_(recorrencia, dados, contexto) {
  const flagRateio = normalizarBooleanoRecorrenciaController_(dados && dados.Rateio_Ativo);
  const participantes = Array.isArray(dados && dados.Participantes_Rateio) ? dados.Participantes_Rateio : [];
  const modo = normalizarTextoRecorrenciaController_(dados && dados.Modo_Rateio);
  const observacao = normalizarTextoRecorrenciaController_(dados && dados.Observacao_Rateio);
  const agora = new Date().toLocaleString("pt-BR");

  if (!flagRateio || recorrencia.Tipo === "Transferência") {
    substituirRecorrenciasRateiosModel(recorrencia.ID_Recorrencia, []);
    return;
  }

  const lancamentoVirtual = montarLancamentoVirtualRecorrenciaController_(recorrencia, contexto);
  const diagnostico = validarCompatibilidadeRecorrenciaController_(recorrencia, contexto, participantes);

  if (diagnostico.invalida) {
    throw new Error(diagnostico.mensagemGeral);
  }

  const itens = calcularNovosRateiosLancamento_(
    lancamentoVirtual,
    {
      Participantes_Rateio: participantes,
      Modo_Rateio: modo,
      Observacao_Rateio: observacao
    },
    contexto
  ).map(function(item) {
    return {
      ID_Recorrencia_Rateio: Utilities.getUuid(),
      ID_Recorrencia: recorrencia.ID_Recorrencia,
      ID_Usuario_Responsavel: item.ID_Usuario_Responsavel,
      Valor_Rateado: item.Valor_Rateado,
      Percentual: item.Percentual,
      Observacao: observacao,
      Modo_Rateio: item.Modo_Rateio || modo,
      Data_Criacao: agora,
      Data_Alteracao: "",
      Criado_Por_ID: contexto.idLogado
    };
  });

  substituirRecorrenciasRateiosModel(recorrencia.ID_Recorrencia, itens);
}


function validarCompatibilidadeRecorrenciaController_(recorrencia, contexto, participantesOverride) {
  const diagnostico = diagnosticarRecorrenciaController_(
    recorrencia,
    contexto,
    participantesOverride || listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto)
  );

  return {
    invalida: diagnostico.mensagensGerais.length > 0 || Object.keys(diagnostico.campos || {}).length > 0 || (diagnostico.participantesInvalidos || []).length > 0,
    mensagemGeral: construirMensagemDiagnosticoRecorrenciaController_(diagnostico)
  };
}


function diagnosticarRecorrenciaController_(recorrencia, contexto, rateios) {
  const mensagensGerais = [];
  const campos = {};
  const participantesInvalidos = [];
  const lancamentoVirtual = montarLancamentoVirtualRecorrenciaController_(recorrencia, contexto);
  const participantesNormalizados = normalizarParticipantesDiagnosticoRecorrenciaController_(rateios);

  try {
    validarCamposRecorrenciaController_(recorrencia, {
      permitirDataInicioPassada: true
    });
  } catch (erroCampos) {
    mensagensGerais.push(erroCampos.message);
  }

  if (recorrencia.Tipo !== "Transferência") {
    const categoria = (contexto.categoriasAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Categoria) === recorrencia.ID_Categoria;
    });

    if (!categoria) {
      campos.ID_Categoria = "A categoria nao esta mais acessivel ou esta inativa.";
    }
  }

  if (recorrencia.Tipo_Origem === "Conta") {
    const contaOrigem = (contexto.contasAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === recorrencia.ID_Origem;
    });

    if (!contaOrigem) {
      campos.ID_Origem = "A conta de origem nao esta mais acessivel ou esta inativa.";
    }
  }

  if (recorrencia.Tipo_Origem === "Cartão") {
    const cartao = (contexto.cartoesAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Cartao) === recorrencia.ID_Origem;
    });

    if (!cartao) {
      campos.ID_Origem = "O cartao de origem nao esta mais acessivel ou esta inativo.";
    }
  }

  if (recorrencia.Tipo === "Transferência") {
    const contaDestino = (contexto.contasAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === recorrencia.ID_Destino;
    });

    if (!contaDestino) {
      campos.ID_Destino = "A conta de destino nao esta mais acessivel ou esta inativa.";
    }
  }

  if (recorrencia.ID_Projeto) {
    const projeto = (contexto.projetosAcessiveis || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Projeto) === recorrencia.ID_Projeto;
    });

    if (!projeto) {
      campos.ID_Projeto = "O projeto vinculado nao esta mais acessivel ou foi concluido.";
    }
  }

  if (participantesNormalizados.length > 0 && recorrencia.Tipo !== "Transferência") {
    try {
      validarParticipantesRateioLancamento_(
        participantesNormalizados,
        contexto,
        lancamentoVirtual
      );
    } catch (erroRateio) {
      mensagensGerais.push("O rateio desta recorrencia precisa ser revisado.");
      participantesInvalidos.push.apply(
        participantesInvalidos,
        encontrarParticipantesInvalidosRecorrenciaController_(participantesNormalizados, contexto, lancamentoVirtual)
      );
    }
  }

  return {
    mensagensGerais: removerDuplicidadesRecorrenciaController_(mensagensGerais),
    campos: campos,
    participantesInvalidos: removerDuplicidadesRecorrenciaController_(participantesInvalidos)
  };
}


function sincronizarStatusRecorrenciasDoUsuarioController_(contexto) {
  const itens = contexto.recorrenciasTodos.filter(function(item) {
    return normalizarTextoRecorrenciaController_(item.ID_Usuario) === contexto.idLogado &&
           normalizarTextoRecorrenciaController_(item.Status_Recorrencia) !== "Inativa";
  });

  itens.forEach(function(recorrencia) {
    const diagnostico = diagnosticarRecorrenciaController_(
      recorrencia,
      contexto,
      listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto)
    );

    if (diagnostico.mensagensGerais.length > 0 || Object.keys(diagnostico.campos).length > 0 || diagnostico.participantesInvalidos.length > 0) {
      const detalhes = diagnostico.mensagensGerais[0] || construirMensagemDiagnosticoRecorrenciaController_(diagnostico);
      marcarRecorrenciaComoRevisaoController_(recorrencia, detalhes, contexto.idLogado);
    }
  });
}


function marcarRecorrenciaComoRevisaoController_(recorrencia, motivo, idUsuarioAlteracao) {
  const statusAtual = normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia);
  const modoAtual = normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao);
  const motivoFinal = normalizarTextoRecorrenciaController_(motivo) || "Esta recorrencia precisa de revisao.";

  if (statusAtual === "Revisão necessária" && modoAtual === "Manual" && normalizarTextoRecorrenciaController_(recorrencia.Info_Bloqueio) === motivoFinal) {
    return;
  }

  recorrencia.Status_Recorrencia = "Revisão necessária";
  recorrencia.Modo_Geracao = "Manual";
  recorrencia.Info_Bloqueio = motivoFinal;
  recorrencia.Alterado_Por_ID = normalizarTextoRecorrenciaController_(idUsuarioAlteracao);
  recorrencia.Data_Alteracao = new Date().toLocaleString("pt-BR");

  salvarRecorrenciaModel(recorrencia);
}


function listarPendenciasManuaisTelaRecorrenciasController_(contexto, dataLimite) {
  const limite = normalizarTextoRecorrenciaController_(dataLimite) || gerarDataHojeRecorrenciaController_();
  const recorrencias = contexto.recorrenciasTodos
    .filter(function(item) {
      return normalizarTextoRecorrenciaController_(item.ID_Usuario) === contexto.idLogado &&
             normalizarTextoRecorrenciaController_(item.Status_Recorrencia) === "Ativa";
    })
    .sort(function(a, b) {
      return compararDataInicioRecorrenciaController_(a.Data_Inicio, b.Data_Inicio);
    });

  const lista = [];

  recorrencias.forEach(function(recorrencia) {
    const rateios = listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto);
    const diagnostico = diagnosticarRecorrenciaController_(recorrencia, contexto, rateios);

    if (diagnostico.mensagensGerais.length > 0 || Object.keys(diagnostico.campos).length > 0 || diagnostico.participantesInvalidos.length > 0) {
      return;
    }

    listarOcorrenciasTelaRecorrenciaController_(recorrencia, contexto, limite, rateios).forEach(function(ocorrencia) {
      lista.push(ocorrencia);
    });
  });

  return lista.sort(function(a, b) {
    const comparacaoGrupo = obterPrioridadeGrupoOcorrenciaRecorrenciaController_(a) -
      obterPrioridadeGrupoOcorrenciaRecorrenciaController_(b);

    if (comparacaoGrupo !== 0) {
      return comparacaoGrupo;
    }

    const comparacaoData = compararDataInicioRecorrenciaController_(a.Data_Ocorrencia, b.Data_Ocorrencia);

    if (comparacaoData !== 0) {
      return comparacaoData;
    }

    return normalizarTextoRecorrenciaController_(a.Descricao).localeCompare(normalizarTextoRecorrenciaController_(b.Descricao));
  });
}


function obterPrioridadeGrupoOcorrenciaRecorrenciaController_(ocorrencia) {
  const status = normalizarTextoRecorrenciaController_(ocorrencia.Status_Ocorrencia);
  const modo = normalizarTextoRecorrenciaController_(ocorrencia.Modo_Geracao);

  if (status !== "Gerada" && modo === "Manual") return 1;
  if (status !== "Gerada" && modo === "Automática") return 2;
  if (status === "Gerada" && modo === "Manual") return 3;
  if (status === "Gerada" && modo === "Automática") return 4;

  return 9;
}


function listarOcorrenciasTelaRecorrenciaController_(recorrencia, contexto, dataLimite, rateios) {
  const limite = normalizarTextoRecorrenciaController_(dataLimite);
  const datasEsperadas = listarDatasAteLimiteRecorrenciaController_(recorrencia, limite);
  const ocorrenciasGeradas = mapearOcorrenciasGeradasRecorrenciaController_(recorrencia, contexto);
  const itens = [];

  datasEsperadas.forEach(function(dataOcorrencia) {
    const ocorrenciaGerada = ocorrenciasGeradas[dataOcorrencia] || null;

    if (ocorrenciaGerada) {
      itens.push(montarOcorrenciaTelaRecorrenciaController_(
        recorrencia,
        contexto,
        rateios,
        dataOcorrencia,
        "Gerada",
        ocorrenciaGerada
      ));
      return;
    }

    itens.push(montarOcorrenciaTelaRecorrenciaController_(
      recorrencia,
      contexto,
      rateios,
      dataOcorrencia,
      "Pendente",
      null
    ));
  });

  return itens;
}


function montarOcorrenciaTelaRecorrenciaController_(recorrencia, contexto, rateios, dataOcorrencia, statusOcorrencia, ocorrenciaGerada) {
  return {
    Chave_Ocorrencia: recorrencia.ID_Recorrencia + "|" + dataOcorrencia,
    ID_Recorrencia: recorrencia.ID_Recorrencia,
    ID_Lancamento_Gerado: ocorrenciaGerada ? normalizarTextoRecorrenciaController_(ocorrenciaGerada.ID_Lancamento_Gerado) : "",
    Descricao: recorrencia.Descricao,
    Tipo: recorrencia.Tipo,
    Valor_Base: recorrencia.Valor_Base,
    Data_Ocorrencia: dataOcorrencia,
    Data_Lancamento_Gerado: ocorrenciaGerada ? normalizarTextoRecorrenciaController_(ocorrenciaGerada.Data_Lancamento_Gerado) : "",
    Periodicidade_Visual: montarPeriodicidadeVisualRecorrenciaController_(recorrencia),
    Nome_Origem_Visualizacao: obterNomeOrigemRecorrenciaController_(recorrencia, contexto),
    Modo_Geracao: recorrencia.Modo_Geracao,
    Status_Lancamento: recorrencia.Status_Lancamento,
    Status_Ocorrencia: statusOcorrencia,
    Status_Recorrencia: recorrencia.Status_Recorrencia,
    Info_Bloqueio: recorrencia.Info_Bloqueio,
    Nome_Projeto_Visualizacao: obterNomeProjetoRecorrenciaController_(recorrencia, contexto),
    Pode_Gerar_Manual: statusOcorrencia !== "Gerada" &&
      normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao) === "Manual",
    Grupo_Visualizacao: montarGrupoOcorrenciaRecorrenciaController_(recorrencia, statusOcorrencia),
    Resumo_Rateio: montarResumoRateioRecorrenciaController_(rateios)
  };
}


function montarGrupoOcorrenciaRecorrenciaController_(recorrencia, statusOcorrencia) {
  const modo = normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao);
  const status = normalizarTextoRecorrenciaController_(statusOcorrencia);

  if (status === "Gerada") {
    return modo === "Automática" ? "Automáticas geradas" : "Manuais geradas";
  }

  return modo === "Automática" ? "Automáticas pendentes" : "Manuais pendentes";
}


function listarOcorrenciasPendentesRecorrenciaController_(recorrencia, contexto, dataLimite, rateios) {
  const limite = normalizarTextoRecorrenciaController_(dataLimite);
  const datasEsperadas = listarDatasAteLimiteRecorrenciaController_(recorrencia, limite);
  const datasGeradas = mapearDatasGeradasRecorrenciaController_(recorrencia, contexto);

  return datasEsperadas
    .filter(function(dataOcorrencia) {
      return datasGeradas[dataOcorrencia] !== true;
    })
    .map(function(dataOcorrencia) {
      return {
        Data_Ocorrencia: dataOcorrencia,
        Rateios: rateios || []
      };
    });
}


function obterPrimeiraDataPendenteRecorrenciaController_(recorrencia, contexto) {
  const datasGeradas = mapearDatasGeradasRecorrenciaController_(recorrencia, contexto);
  let dataAtual = normalizarTextoRecorrenciaController_(recorrencia.Data_Inicio);
  let indice = 0;

  while (dataAtual && indice < 5000) {
    if (datasGeradas[dataAtual] !== true) {
      return dataAtual;
    }

    dataAtual = calcularProximaDataRecorrenciaController_(recorrencia, dataAtual);
    indice += 1;
  }

  throw new Error("Nao foi possivel determinar a proxima ocorrencia pendente desta recorrencia.");
}


function listarDatasAteLimiteRecorrenciaController_(recorrencia, dataLimite) {
  const datas = [];
  const inicio = normalizarTextoRecorrenciaController_(recorrencia.Data_Inicio);
  const limite = normalizarTextoRecorrenciaController_(dataLimite);

  if (!inicio || !limite || compararDataInicioRecorrenciaController_(inicio, limite) > 0) {
    return datas;
  }

  let indice = 0;
  let dataAtual = inicio;

  while (dataAtual && compararDataInicioRecorrenciaController_(dataAtual, limite) <= 0 && indice < 400) {
    datas.push(dataAtual);
    indice += 1;
    dataAtual = calcularProximaDataRecorrenciaController_(recorrencia, dataAtual);
  }

  return datas;
}


function normalizarSelecoesGeracaoManualRecorrenciaController_(selecoes) {
  const lista = Array.isArray(selecoes) ? selecoes : [];

  return lista.map(function(item) {
    return {
      ID_Recorrencia: normalizarTextoRecorrenciaController_(item && item.ID_Recorrencia),
      Data_Ocorrencia: normalizarTextoRecorrenciaController_(item && item.Data_Ocorrencia)
    };
  }).filter(function(item) {
    return !!item.ID_Recorrencia && !!item.Data_Ocorrencia;
  });
}


function validarSelecoesManuaisEmLoteRecorrenciaController_(selecoes, contexto) {
  const mapaPorRecorrencia = {};

  selecoes.forEach(function(item) {
    if (!mapaPorRecorrencia[item.ID_Recorrencia]) {
      mapaPorRecorrencia[item.ID_Recorrencia] = [];
    }

    mapaPorRecorrencia[item.ID_Recorrencia].push(item.Data_Ocorrencia);
  });

  Object.keys(mapaPorRecorrencia).forEach(function(idRecorrencia) {
    const recorrencia = buscarRecorrenciaNoContextoController_(idRecorrencia, contexto);
    const rateios = listarRecorrenciasRateiosDoItemController_(idRecorrencia, contexto);

    validarAcessoRecorrenciaController_(recorrencia, contexto);

    if (normalizarTextoRecorrenciaController_(recorrencia.Modo_Geracao) !== "Manual") {
      throw new Error("A geracao em lote aceita apenas recorrencias manuais.");
    }

    if (normalizarTextoRecorrenciaController_(recorrencia.Status_Recorrencia) !== "Ativa") {
      throw new Error("A recorrencia " + recorrencia.Descricao + " nao esta ativa para geracao manual.");
    }

    const diagnostico = validarCompatibilidadeRecorrenciaController_(recorrencia, contexto, rateios);

    if (diagnostico.invalida) {
      marcarRecorrenciaComoRevisaoController_(recorrencia, diagnostico.mensagemGeral, contexto.idLogado);
      throw new Error(diagnostico.mensagemGeral);
    }

    const datasSelecionadas = mapaPorRecorrencia[idRecorrencia].slice().sort(compararDataInicioRecorrenciaController_);
    const ultimaData = datasSelecionadas[datasSelecionadas.length - 1];
    const pendencias = listarOcorrenciasPendentesRecorrenciaController_(recorrencia, contexto, ultimaData, rateios)
      .map(function(item) {
        return item.Data_Ocorrencia;
      });

    if (pendencias.length === 0) {
      throw new Error("Nao ha ocorrencias pendentes para a recorrencia " + recorrencia.Descricao + ".");
    }

    for (let i = 0; i < datasSelecionadas.length; i++) {
      if (pendencias[i] !== datasSelecionadas[i]) {
        throw new Error("As ocorrencias da recorrencia " + recorrencia.Descricao + " devem ser geradas em ordem cronologica, sem pular datas anteriores.");
      }
    }

    mapaPorRecorrencia[idRecorrencia] = datasSelecionadas.map(function(dataOcorrencia) {
      return {
        recorrencia: recorrencia,
        dataOcorrencia: dataOcorrencia,
        rateios: rateios
      };
    });
  });

  const itensValidados = [];

  Object.keys(mapaPorRecorrencia).forEach(function(idRecorrencia) {
    itensValidados.push.apply(itensValidados, mapaPorRecorrencia[idRecorrencia]);
  });

  selecoes.length = 0;
  itensValidados.forEach(function(item) {
    selecoes.push(item);
  });
}


function gerarOcorrenciaRecorrenciaController_(recorrencia, dataOcorrencia, contexto, rateiosRecorrencia, dataLancamento, modoGeracaoEfetiva) {
  const agora = new Date().toLocaleString("pt-BR");
  const dataPrevista = validarDataLancamentoPontualRecorrenciaController_(dataOcorrencia);
  const dataEfetiva = validarDataLancamentoPontualRecorrenciaController_(dataLancamento || dataPrevista);
  const modoEfetivo = normalizarTextoRecorrenciaController_(modoGeracaoEfetiva) || recorrencia.Modo_Geracao;

  if (mapearDatasGeradasRecorrenciaController_(recorrencia, contexto)[dataPrevista] === true) {
    throw new Error("Esta ocorrencia ja gerou um lancamento e nao pode ser processada novamente.");
  }

  const lancamento = {
    ID_Lancamento: Utilities.getUuid(),
    Tipo: recorrencia.Tipo,
    Descricao: recorrencia.Descricao,
    Valor_Total: recorrencia.Valor_Base,
    Data_Ocorrencia: dataEfetiva,
    Mes_Referencia: obterMesReferenciaLancamentoPorContexto_(
      dataEfetiva,
      recorrencia.Tipo_Origem,
      recorrencia.ID_Origem,
      contexto
    ),
    ID_Categoria: recorrencia.Tipo === "Transferência" ? "" : recorrencia.ID_Categoria,
    Tipo_Origem: recorrencia.Tipo_Origem,
    ID_Origem: recorrencia.ID_Origem,
    ID_Destino: recorrencia.Tipo === "Transferência" ? recorrencia.ID_Destino : "",
    ID_Projeto: recorrencia.ID_Projeto,
    Email_Autor: contexto.emailLogado,
    Status: recorrencia.Status_Lancamento,
    Criado_Por_ID: recorrencia.Criado_Por_ID || contexto.idLogado,
    Data_Criacao: agora,
    Alterado_Por_ID: "",
    Data_Alteracao: "",
    ID_Grupo_Parcela: "",
    Numero_Parcela: "",
    Total_Parcelas: "",
    ID_Recorrencia_Origem: recorrencia.ID_Recorrencia,
    Modo_Recorrencia_Origem: modoEfetivo,
    Data_Ocorrencia_Recorrencia: dataPrevista,
    _linhaPlanilha: null
  };

  validarChavesEstrangeirasLancamento_(lancamento, contexto);
  let novosRateios = [];

  if (rateiosRecorrencia && rateiosRecorrencia.length > 0 && recorrencia.Tipo !== "Transferência") {
    novosRateios = calcularNovosRateiosLancamento_(
      lancamento,
      {
        Participantes_Rateio: rateiosRecorrencia.map(function(item) {
          return {
            ID_Usuario: item.ID_Usuario_Responsavel,
            Valor_Rateado: item.Valor_Rateado,
            Percentual: item.Percentual
          };
        }),
        Modo_Rateio: normalizarTextoRecorrenciaController_(rateiosRecorrencia[0].Modo_Rateio),
        Observacao_Rateio: normalizarTextoRecorrenciaController_(rateiosRecorrencia[0].Observacao)
      },
      contexto
    );
  }

  const ocorrencia = {
    ID_Recorrencia: recorrencia.ID_Recorrencia,
    Data_Ocorrencia: dataPrevista,
    ID_Lancamento_Gerado: lancamento.ID_Lancamento,
    Status: "Gerada",
    Observacao: modoEfetivo === "Manual"
      ? "Gerada manualmente com base na recorrencia."
      : "Gerada por automacao de recorrencia.",
    Criado_Por_ID: contexto.idLogado,
    Data_Criacao: agora
  };

  gerarOcorrenciaRecorrenciaModel(lancamento, ocorrencia, novosRateios, contexto.idLogado);
  return lancamento;
}


function buscarRecorrenciaNoContextoController_(idRecorrencia, contexto) {
  const id = normalizarTextoRecorrenciaController_(idRecorrencia);
  const item = (contexto.recorrenciasTodos || []).find(function(recorrencia) {
    return normalizarTextoRecorrenciaController_(recorrencia.ID_Recorrencia) === id;
  });

  if (!item) {
    throw new Error("Recorrencia nao encontrada.");
  }

  return item;
}


function validarAcessoRecorrenciaController_(recorrencia, contexto) {
  if (normalizarTextoRecorrenciaController_(recorrencia.ID_Usuario) !== contexto.idLogado) {
    throw new Error("Acesso negado: voce so pode alterar as suas proprias recorrencias.");
  }
}


function listarRecorrenciasRateiosDoItemController_(idRecorrencia, contexto) {
  const id = normalizarTextoRecorrenciaController_(idRecorrencia);

  return (contexto.recorrenciasRateiosTodos || []).filter(function(item) {
    return normalizarTextoRecorrenciaController_(item.ID_Recorrencia) === id;
  });
}


function montarLancamentoVirtualRecorrenciaController_(recorrencia, contexto) {
  return {
    ID_Lancamento: "recorrencia-" + recorrencia.ID_Recorrencia,
    Tipo: recorrencia.Tipo,
    Descricao: recorrencia.Descricao,
    Valor_Total: recorrencia.Valor_Base,
    Data_Ocorrencia: recorrencia.Data_Inicio,
    Mes_Referencia: obterMesReferenciaLancamentoPorContexto_(
      recorrencia.Data_Inicio,
      recorrencia.Tipo_Origem,
      recorrencia.ID_Origem,
      contexto
    ),
    ID_Categoria: recorrencia.ID_Categoria,
    Tipo_Origem: recorrencia.Tipo_Origem,
    ID_Origem: recorrencia.ID_Origem,
    ID_Destino: recorrencia.ID_Destino,
    ID_Projeto: recorrencia.ID_Projeto,
    Status: recorrencia.Status_Lancamento,
    Criado_Por_ID: recorrencia.Criado_Por_ID || contexto.idLogado,
    Data_Criacao: recorrencia.Data_Criacao || new Date().toLocaleString("pt-BR"),
    Alterado_Por_ID: "",
    Data_Alteracao: "",
    ID_Grupo_Parcela: "",
    Numero_Parcela: "",
    Total_Parcelas: ""
  };
}


function mapearDatasGeradasRecorrenciaController_(recorrencia, contexto) {
  const mapaLancamentos = mapearOcorrenciasGeradasRecorrenciaController_(recorrencia, contexto);
  const mapa = {};

  Object.keys(mapaLancamentos).forEach(function(dataOcorrencia) {
    mapa[dataOcorrencia] = true;
  });

  return mapa;
}


function mapearOcorrenciasGeradasRecorrenciaController_(recorrencia, contexto) {
  const mapa = {};
  const id = normalizarTextoRecorrenciaController_(
    recorrencia && recorrencia.ID_Recorrencia ? recorrencia.ID_Recorrencia : recorrencia
  );

  (contexto.recorrenciasOcorrenciasTodos || []).forEach(function(ocorrencia) {
    if (normalizarTextoRecorrenciaController_(ocorrencia.Status) !== "Gerada") {
      return;
    }

    if (normalizarTextoRecorrenciaController_(ocorrencia.ID_Recorrencia) !== id) {
      return;
    }

    const dataChave = normalizarTextoRecorrenciaController_(ocorrencia.Data_Ocorrencia);

    if (!dataChave) {
      return;
    }

    mapa[dataChave] = {
      ID_Lancamento_Gerado: normalizarTextoRecorrenciaController_(ocorrencia.ID_Lancamento_Gerado),
      Data_Lancamento_Gerado: obterDataLancamentoGeradoRecorrenciaController_(ocorrencia, contexto)
    };
  });

  const legado = mapearLancamentosGeradosRecorrenciaController_(recorrencia, contexto.lancamentosTodos);

  Object.keys(legado).forEach(function(dataOcorrencia) {
    if (!mapa[dataOcorrencia]) {
      mapa[dataOcorrencia] = {
        ID_Lancamento_Gerado: normalizarTextoRecorrenciaController_(legado[dataOcorrencia].ID_Lancamento),
        Data_Lancamento_Gerado: normalizarTextoRecorrenciaController_(legado[dataOcorrencia].Data_Ocorrencia)
      };
    }
  });

  return mapa;
}


function obterDataLancamentoGeradoRecorrenciaController_(ocorrencia, contexto) {
  const idLancamento = normalizarTextoRecorrenciaController_(ocorrencia.ID_Lancamento_Gerado);

  if (!idLancamento) {
    return "";
  }

  const lancamento = (contexto.lancamentosTodos || []).find(function(item) {
    return normalizarTextoRecorrenciaController_(item.ID_Lancamento) === idLancamento;
  });

  return lancamento ? normalizarTextoRecorrenciaController_(lancamento.Data_Ocorrencia) : "";
}


function mapearLancamentosGeradosRecorrenciaController_(recorrencia, lancamentos) {
  const mapa = {};
  const id = normalizarTextoRecorrenciaController_(
    recorrencia && recorrencia.ID_Recorrencia ? recorrencia.ID_Recorrencia : recorrencia
  );

  (lancamentos || []).forEach(function(lancamento) {
    if (normalizarTextoRecorrenciaController_(lancamento.Status) === "Cancelado") {
      return;
    }

    const idRecorrenciaLancamento = normalizarTextoRecorrenciaController_(lancamento.ID_Recorrencia_Origem);

    if (id && idRecorrenciaLancamento === id) {
      const dataChave = normalizarTextoRecorrenciaController_(lancamento.Data_Ocorrencia_Recorrencia) ||
        normalizarTextoRecorrenciaController_(lancamento.Data_Ocorrencia);

      if (dataChave) {
        mapa[dataChave] = lancamento;
      }

      return;
    }

    if (idRecorrenciaLancamento) {
      return;
    }

    if (recorrencia && recorrencia.ID_Recorrencia) {
      const dataLancamento = normalizarTextoRecorrenciaController_(lancamento.Data_Ocorrencia);

      if (dataLancamento && lancamentoCorrespondeARecorrenciaController_(lancamento, recorrencia, dataLancamento)) {
        mapa[dataLancamento] = lancamento;
      }
    }
  });

  return mapa;
}


function lancamentoCorrespondeARecorrenciaController_(lancamento, recorrencia, dataReferencia) {
  if (normalizarTextoRecorrenciaController_(lancamento.Data_Ocorrencia) !== normalizarTextoRecorrenciaController_(dataReferencia)) {
    return false;
  }

  if (normalizarTextoComparavelRecorrenciaController_(lancamento.Tipo) !== normalizarTextoComparavelRecorrenciaController_(recorrencia.Tipo)) {
    return false;
  }

  if (normalizarTextoComparavelRecorrenciaController_(lancamento.Tipo_Origem) !== normalizarTextoComparavelRecorrenciaController_(recorrencia.Tipo_Origem)) {
    return false;
  }

  if (normalizarTextoRecorrenciaController_(lancamento.ID_Origem) !== normalizarTextoRecorrenciaController_(recorrencia.ID_Origem)) {
    return false;
  }

  if (normalizarTextoRecorrenciaController_(lancamento.ID_Destino || "") !== normalizarTextoRecorrenciaController_(recorrencia.ID_Destino || "")) {
    return false;
  }

  if (normalizarTextoRecorrenciaController_(lancamento.ID_Categoria || "") !== normalizarTextoRecorrenciaController_(recorrencia.ID_Categoria || "")) {
    return false;
  }

  return arredondarRecorrenciaController_(lancamento.Valor_Total) === arredondarRecorrenciaController_(recorrencia.Valor_Base);
}


function normalizarTextoComparavelRecorrenciaController_(valor) {
  return normalizarTextoRecorrenciaController_(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function arredondarRecorrenciaController_(valor) {
  const numero = parseFloat(valor);
  return Math.round((isNaN(numero) ? 0 : numero) * 100) / 100;
}


function listarDatasPendentesAteHojeRecorrenciaController_(recorrencia, contexto) {
  return listarOcorrenciasPendentesRecorrenciaController_(
    recorrencia,
    contexto,
    gerarDataHojeRecorrenciaController_(),
    listarRecorrenciasRateiosDoItemController_(recorrencia.ID_Recorrencia, contexto)
  );
}


function montarPeriodicidadeVisualRecorrenciaController_(recorrencia) {
  if (normalizarTextoRecorrenciaController_(recorrencia.Periodicidade_Tipo) === "Mensal") {
    return "Mensal";
  }

  return "A cada " + (recorrencia.Intervalo_Dias || 0) + " dias";
}


function obterNomeCategoriaRecorrenciaController_(recorrencia, contexto) {
  if (normalizarTextoRecorrenciaController_(recorrencia.Tipo) === "Transferência") {
    return "Nao se aplica";
  }

  return obterNomeCategoriaVisualizacaoLancamento_(recorrencia, {
    categoriasTodas: contexto.categoriasTodas
  });
}


function obterNomeProjetoRecorrenciaController_(recorrencia, contexto) {
  if (!recorrencia.ID_Projeto) {
    return "";
  }

  const projeto = (contexto.projetosTodos || []).find(function(item) {
    return normalizarTextoRecorrenciaController_(item.ID_Projeto) === normalizarTextoRecorrenciaController_(recorrencia.ID_Projeto);
  });

  return projeto ? normalizarTextoRecorrenciaController_(projeto.Nome) : "";
}


function obterNomeOrigemRecorrenciaController_(recorrencia, contexto) {
  if (normalizarTextoRecorrenciaController_(recorrencia.Tipo) === "Transferência") {
    const origem = obterNomeContaPorIdLancamento_(contexto.contasTodas, recorrencia.ID_Origem) || "Conta de origem";
    const destino = obterNomeContaPorIdLancamento_(contexto.contasTodas, recorrencia.ID_Destino) || "Conta de destino";
    return origem + " -> " + destino;
  }

  return obterNomeOrigemVisualizacaoLancamento_(recorrencia, contexto);
}


function montarResumoRateioRecorrenciaController_(rateios) {
  if (!rateios || rateios.length === 0) {
    return "Sem rateio";
  }

  const modo = normalizarTextoRecorrenciaController_(rateios[0].Modo_Rateio);

  if (modo === "Igual") return "Rateio igual";
  if (modo === "Percentual") return "Rateio percentual";
  return "Rateio por valores";
}


function encontrarParticipantesInvalidosRecorrenciaController_(rateios, contexto, lancamentoVirtual) {
  const mapaElegiveis = obterMapaUsuariosElegiveisRateioLancamento_(lancamentoVirtual, contexto);
  const usuariosAtivos = {};

  (contexto.usuariosTodos || []).forEach(function(usuario) {
    if (normalizarBooleanoRecorrenciaController_(usuario.Ativo)) {
      usuariosAtivos[normalizarTextoRecorrenciaController_(usuario.ID_Usuario)] = normalizarTextoRecorrenciaController_(usuario.Nome);
    }
  });

  return (rateios || []).reduce(function(lista, item) {
    const idUsuario = normalizarTextoRecorrenciaController_(item.ID_Usuario || item.ID_Usuario_Responsavel);

    if (!usuariosAtivos[idUsuario] || mapaElegiveis[idUsuario] !== true) {
      lista.push(usuariosAtivos[idUsuario] || ("Participante " + idUsuario));
    }

    return lista;
  }, []);
}


function normalizarParticipantesDiagnosticoRecorrenciaController_(rateios) {
  return (rateios || []).map(function(item) {
    return {
      ID_Usuario: normalizarTextoRecorrenciaController_(item && (item.ID_Usuario || item.ID_Usuario_Responsavel)),
      Valor_Rateado: item && item.Valor_Rateado,
      Percentual: item && item.Percentual
    };
  }).filter(function(item) {
    return !!item.ID_Usuario;
  });
}


function construirMensagemDiagnosticoRecorrenciaController_(diagnostico) {
  if (diagnostico.mensagensGerais.length > 0) {
    return diagnostico.mensagensGerais[0];
  }

  const campos = Object.keys(diagnostico.campos || {});

  if (campos.length > 0) {
    return diagnostico.campos[campos[0]];
  }

  if ((diagnostico.participantesInvalidos || []).length > 0) {
    return "Revise o rateio. Participantes com problema: " + diagnostico.participantesInvalidos.join(", ") + ".";
  }

  return "Esta recorrencia precisa de revisao.";
}


function clonarRecorrenciaController_(recorrencia) {
  const clone = {};

  Object.keys(recorrencia || {}).forEach(function(chave) {
    clone[chave] = recorrencia[chave];
  });

  return clone;
}


function deduplicarRecorrenciaPorIdController_(item, indice, lista) {
  const idAtual = normalizarTextoRecorrenciaController_(item && item.ID_Recorrencia);

  if (!idAtual) {
    return true;
  }

  for (let i = 0; i < indice; i++) {
    if (normalizarTextoRecorrenciaController_(lista[i] && lista[i].ID_Recorrencia) === idAtual) {
      return false;
    }
  }

  return true;
}


function podeGerarPrimeiraExecucaoAutomaticaRecorrenciaController_(recorrencia, primeiraPendencia, contexto) {
  if (!primeiraPendencia || compararDataInicioRecorrenciaController_(primeiraPendencia.Data_Ocorrencia, gerarDataHojeRecorrenciaController_()) >= 0) {
    return false;
  }

  const datasGeradas = mapearDatasGeradasRecorrenciaController_(recorrencia.ID_Recorrencia, contexto);
  const dataCriacao = extrairDataCriacaoRecorrenciaController_(recorrencia.Data_Criacao);

  return Object.keys(datasGeradas).length === 0 &&
    normalizarTextoRecorrenciaController_(recorrencia.Data_Inicio) === normalizarTextoRecorrenciaController_(primeiraPendencia.Data_Ocorrencia) &&
    dataCriacao === normalizarTextoRecorrenciaController_(recorrencia.Data_Inicio);
}


function compararDataCriacaoRecorrenciaController_(dataA, dataB) {
  return converterDataHoraTextoRecorrenciaController_(dataA) - converterDataHoraTextoRecorrenciaController_(dataB);
}


function compararDataInicioRecorrenciaController_(dataA, dataB) {
  const a = normalizarTextoRecorrenciaController_(dataA);
  const b = normalizarTextoRecorrenciaController_(dataB);

  if (a === b) return 0;
  return a < b ? -1 : 1;
}


function converterDataHoraTextoRecorrenciaController_(valor) {
  const texto = normalizarTextoRecorrenciaController_(valor);

  if (!texto) {
    return new Date(0);
  }

  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(texto)) {
    const partes = texto.split(" ");
    const data = partes[0].split("/");
    return new Date(data[2], parseInt(data[1], 10) - 1, data[0], partes[1].split(":")[0], partes[1].split(":")[1], partes[1].split(":")[2]);
  }

  const dataDireta = new Date(texto);
  return isNaN(dataDireta.getTime()) ? new Date(0) : dataDireta;
}


function extrairDataCriacaoRecorrenciaController_(valor) {
  const texto = normalizarTextoRecorrenciaController_(valor);

  if (!texto) {
    return "";
  }

  const dataHoraBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (dataHoraBr) {
    return dataHoraBr[3] + "-" + dataHoraBr[2] + "-" + dataHoraBr[1];
  }

  const dataIso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return dataIso ? dataIso[0] : "";
}


function calcularProximaDataRecorrenciaController_(recorrencia, dataAtual) {
  if (normalizarTextoRecorrenciaController_(recorrencia.Periodicidade_Tipo) === "Mensal") {
    return adicionarMesesDataLancamento_(dataAtual, 1);
  }

  const intervalo = normalizarIntervaloRecorrenciaController_(recorrencia.Intervalo_Dias);
  return adicionarDiasRecorrenciaController_(dataAtual, intervalo);
}


function adicionarDiasRecorrenciaController_(dataTexto, dias) {
  const partes = normalizarTextoRecorrenciaController_(dataTexto).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new Error("Data invalida para calculo da recorrencia.");
  }

  const data = new Date(parseInt(partes[1], 10), parseInt(partes[2], 10) - 1, parseInt(partes[3], 10));
  data.setDate(data.getDate() + dias);
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function validarDataInicioRecorrenciaController_(dataInicio, opcoes) {
  const data = normalizarTextoRecorrenciaController_(dataInicio);
  const permitirPassada = !!(opcoes && opcoes.permitirDataInicioPassada);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error("A data de inicio da recorrencia deve estar no formato AAAA-MM-DD.");
  }

  if (!permitirPassada && compararDataInicioRecorrenciaController_(data, gerarDataHojeRecorrenciaController_()) < 0) {
    throw new Error("Nao e permitido cadastrar recorrencias com data anterior a hoje. Escolha uma data atual ou futura.");
  }
}


function normalizarPeriodicidadeRecorrenciaController_(valor) {
  const texto = normalizarTextoRecorrenciaController_(valor);

  if (texto === "Mensal" || texto === "Personalizada") {
    return texto;
  }

  throw new Error("Periodicidade da recorrencia invalida.");
}


function normalizarIntervaloRecorrenciaController_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";

  const numero = parseInt(valor, 10);
  return isNaN(numero) || numero <= 0 ? "" : numero;
}


function normalizarModoGeracaoRecorrenciaController_(valor) {
  const texto = normalizarTextoRecorrenciaController_(valor);

  if (texto === "Manual" || texto === "Automática") {
    return texto;
  }

  throw new Error("Modo de geracao da recorrencia invalido.");
}


function normalizarStatusLancamentoRecorrenciaController_(valor) {
  const texto = normalizarTextoRecorrenciaController_(valor);

  if (texto === "Efetivado" || texto === "Pendente") {
    return texto;
  }

  throw new Error("Status padrao do lancamento invalido.");
}


function gerarDataHojeRecorrenciaController_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function removerDuplicidadesRecorrenciaController_(lista) {
  const usados = {};

  return (lista || []).filter(function(item) {
    const chave = normalizarTextoRecorrenciaController_(item);

    if (!chave || usados[chave]) {
      return false;
    }

    usados[chave] = true;
    return true;
  });
}


function normalizarTextoRecorrenciaController_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function normalizarBooleanoRecorrenciaController_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}


function garantirTriggerRecorrenciasAutomaticas_() {
  const triggers = ScriptApp.getProjectTriggers();
  const jaExiste = triggers.some(function(trigger) {
    return trigger.getHandlerFunction() === "executarRotinaRecorrenciasAutomaticas";
  });

  if (jaExiste) {
    return;
  }

  ScriptApp.newTrigger("executarRotinaRecorrenciasAutomaticas")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
}
