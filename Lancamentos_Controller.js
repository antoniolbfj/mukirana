/**
 * Módulo: Lancamentos_Controller.gs
 * Responsabilidade:
 * - Controlar regras de negócio de Lançamentos.
 * - Integrar salvamento de LANCAMENTOS + RATEIOS.
 * - Fornecer carregamento otimizado em pacote para a View.
 *
 * Estratégia de performance:
 * - A tela deve preferir obterPacoteTelaLancamentos(tokenSessao).
 * - O salvamento deve preferir processarSalvarLancamentoCompleto(dadosFormulario, tokenSessao).
 * - Funções antigas são mantidas como compatibilidade temporária.
 */


/**
 * Carrega tudo que a tela de Lançamentos precisa em uma única chamada.
 *
 * Estratégia de performance:
 * - A tela pode enviar filtros de período, tipo, status e texto.
 * - O backend filtra os lançamentos antes de enviar o pacote ao navegador.
 * - Os rateios enviados são apenas os vinculados aos lançamentos filtrados.
 *
 * Filtros aceitos:
 * {
 *   Mes_Referencia: "2026-06",
 *   Tipo: "Despesa" | "Receita" | "Transferência" | "",
 *   Status: "Efetivado" | "Pendente" | "",
 *   Texto: "mercado"
 * }
 *
 * @param {string} tokenSessao Token de sessão.
 * @param {Object} filtros Filtros opcionais da tela.
 * @returns {Object} Pacote completo da tela.
 */
function obterPacoteTelaLancamentos(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("Lancamentos.obterPacoteTela");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoLancamentosOtimizado_(sessao, medidor, filtros);
  });
  const filtrosNormalizados = medirEtapaPerformance_(medidor, "normalizar_filtros", function() {
    return normalizarFiltrosPacoteLancamentos_(filtros);
  });
  const idsLancamentosComRateioDoUsuario = medirEtapaPerformance_(medidor, "mapear_rateios_usuario", function() {
    return mapearIdsLancamentosComRateioDoUsuario_(
      contexto.rateiosTodos,
      contexto.idLogado
    );
  });

  let lancamentosDoUsuario = medirEtapaPerformance_(medidor, "filtrar_acesso", function() {
    return contexto.lancamentosTodos.filter(function(lancamento) {
      const idLancamento = normalizarTextoLancamento_(lancamento.ID_Lancamento);
      const ehAutor = normalizarTextoLancamento_(lancamento.Criado_Por_ID) === contexto.idLogado;
      const participaDoRateio = idsLancamentosComRateioDoUsuario[idLancamento] === true;
      const podeVisualizarOrigem = usuarioPodeVisualizarOrigemLancamento_(lancamento, contexto);
      const podeGerenciarOrigem = usuarioPodeGerenciarLancamento_(lancamento, contexto);

      return ehAutor || participaDoRateio || podeVisualizarOrigem || podeGerenciarOrigem;
    });
  });

  lancamentosDoUsuario = medirEtapaPerformance_(medidor, "aplicar_filtros", function() {
    return aplicarFiltrosPacoteLancamentos_(
      lancamentosDoUsuario,
      filtrosNormalizados,
      contexto
    );
  });

  const recorrenciasProgramadas = medirEtapaPerformance_(medidor, "projetar_recorrencias", function() {
    if (typeof gerarLancamentosProgramadosRecorrenciasConsolidadoController_ !== "function") {
      return { lancamentos: [], rateiosPorLancamento: {} };
    }

    return gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtrosNormalizados);
  });
  const lancamentosProgramadosFiltrados = medirEtapaPerformance_(medidor, "filtrar_recorrencias_programadas", function() {
    return aplicarFiltrosPacoteLancamentos_(
      recorrenciasProgramadas.lancamentos || [],
      filtrosNormalizados,
      contexto
    );
  });
  const pagamentosFaturaFiltrados = medirEtapaPerformance_(medidor, "filtrar_pagamentos_fatura", function() {
    return aplicarFiltrosPacoteLancamentos_(
      montarLancamentosPagamentoFaturaParaTela_(contexto),
      filtrosNormalizados,
      contexto
    );
  });

  lancamentosDoUsuario = lancamentosDoUsuario
    .concat(lancamentosProgramadosFiltrados)
    .concat(pagamentosFaturaFiltrados);

  medirEtapaPerformance_(medidor, "ordenar_lancamentos", function() {
    lancamentosDoUsuario.sort(function(a, b) {
      const dataA = a.Data_Ocorrencia ? new Date(a.Data_Ocorrencia) : new Date(0);
      const dataB = b.Data_Ocorrencia ? new Date(b.Data_Ocorrencia) : new Date(0);
      return dataB - dataA;
    });
  });

  const idsLancamentosFiltrados = {};

  lancamentosDoUsuario.forEach(function(lancamento) {
    idsLancamentosFiltrados[lancamento.ID_Lancamento] = true;
  });

  const rateiosDoUsuario = medirEtapaPerformance_(medidor, "filtrar_rateios_visiveis", function() {
    const rateiosLancados = contexto.rateiosTodos.filter(function(rateio) {
      return idsLancamentosFiltrados[rateio.ID_Lancamento] &&
             rateio.Status !== "Cancelado";
    });
    const rateiosProgramados = [];

    Object.keys(recorrenciasProgramadas.rateiosPorLancamento || {}).forEach(function(idLancamento) {
      if (!idsLancamentosFiltrados[idLancamento]) {
        return;
      }

      (recorrenciasProgramadas.rateiosPorLancamento[idLancamento] || []).forEach(function(rateio) {
        if (normalizarTextoLancamento_(rateio.Status) !== "Cancelado") {
          rateiosProgramados.push(rateio);
        }
      });
    });

    return rateiosLancados.concat(rateiosProgramados);
  });

  const lancamentosParaTela = medirEtapaPerformance_(medidor, "enriquecer_lancamentos", function() {
    return lancamentosDoUsuario.map(function(lancamento) {
      return enriquecerLancamentoParaTela_(
        lancamento,
        contexto,
        idsLancamentosComRateioDoUsuario,
        rateiosDoUsuario
      );
    });
  });

  const rateiosPorLancamento = medirEtapaPerformance_(medidor, "agrupar_rateios", function() {
    return agruparRateiosPorLancamento_(rateiosDoUsuario);
  });

  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
  registrarContagemPerformance_(medidor, "lancamentosRetornados", lancamentosParaTela.length);
  registrarContagemPerformance_(medidor, "lancamentosProgramados", lancamentosProgramadosFiltrados.length);
  registrarContagemPerformance_(medidor, "pagamentosFaturaRetornados", pagamentosFaturaFiltrados.length);
  registrarContagemPerformance_(medidor, "rateiosTodos", contexto.rateiosTodos.length);
  registrarContagemPerformance_(medidor, "rateiosRetornados", rateiosDoUsuario.length);

  const pacote = {
    usuarioLogado: {
      id: contexto.idLogado,
      nome: contexto.nomeLogado,
      email: contexto.emailLogado,
      papel: contexto.papelLogado
    },
    filtrosAplicados: filtrosNormalizados,
    lancamentos: lancamentosParaTela,
    rateios: rateiosDoUsuario,
    rateiosPorLancamento: rateiosPorLancamento,
    dependencias: {
      contas: contexto.contasAcessiveis,
      cartoes: contexto.cartoesAcessiveis,
      categorias: contexto.categoriasAcessiveis,
      projetos: contexto.projetosAcessiveis,
      usuarios: contexto.usuariosAtivosSanitizados
    }
  };

  pacote._performance = finalizarPerformance_(medidor);
  return pacote;
}

/**
 * Normaliza os filtros recebidos da View.
 *
 * Regras:
 * - Filtros ausentes viram string vazia.
 * - Mes_Referencia deve estar no formato yyyy-MM ou vazio.
 * - Texto é convertido para minúsculas para busca simples.
 *
 * @param {Object} filtros Filtros recebidos da View.
 * @returns {Object} Filtros normalizados.
 */
function normalizarFiltrosPacoteLancamentos_(filtros) {
  filtros = filtros || {};

  const intervalo = typeof normalizarIntervaloMesesConsolidadoController_ === "function"
      ? normalizarIntervaloMesesConsolidadoController_(
        filtros.Mes_Inicial || filtros.Mes_Referencia,
        filtros.Mes_Final,
        true
      )
    : {
        Mes_Inicial: /^\d{4}-\d{2}$/.test(normalizarTextoLancamento_(filtros.Mes_Referencia))
          ? normalizarTextoLancamento_(filtros.Mes_Referencia)
          : "",
        Mes_Final: /^\d{4}-\d{2}$/.test(normalizarTextoLancamento_(filtros.Mes_Final))
          ? normalizarTextoLancamento_(filtros.Mes_Final)
          : ""
      };
  const tipo = normalizarTextoLancamento_(filtros.Tipo);
  const status = normalizarTextoLancamento_(filtros.Status);
  const texto = normalizarTextoLancamento_(filtros.Texto).toLowerCase();

  return {
    Mes_Referencia: intervalo.Mes_Inicial || "",
    Mes_Inicial: intervalo.Mes_Inicial || "",
    Mes_Final: intervalo.Mes_Final || "",
    Tipo: tipo,
    Status: status,
    Texto: texto,
    ID_Conta: normalizarTextoLancamento_(filtros.ID_Conta),
    ID_Categoria: normalizarTextoLancamento_(filtros.ID_Categoria),
    ID_Projeto: normalizarTextoLancamento_(filtros.ID_Projeto),
    Tipo_Origem: normalizarTextoLancamento_(filtros.Tipo_Origem),
    ID_Grupo_Cartao: normalizarTextoLancamento_(filtros.ID_Grupo_Cartao),
    ID_Cartao: normalizarTextoLancamento_(filtros.ID_Cartao),
    Parcelado: normalizarBooleanoLancamento_(filtros.Parcelado),
    ID_Lancamento: normalizarTextoLancamento_(filtros.ID_Lancamento),
    IDs_Lancamentos: normalizarTextoLancamento_(filtros.IDs_Lancamentos),
    Modo_Contextual: normalizarBooleanoLancamento_(filtros.Modo_Contextual),
    Titulo_Contexto: normalizarTextoLancamento_(filtros.Titulo_Contexto),
    Subtitulo_Contexto: normalizarTextoLancamento_(filtros.Subtitulo_Contexto)
  };
}


/**
 * Aplica filtros de tela aos lançamentos do usuário.
 *
 * Filtros:
 * - Mes_Referencia: compara com LANCAMENTOS.Mes_Referencia.
 * - Tipo: filtra Despesa/Receita/Transferência.
 * - Status: filtra Efetivado/Pendente.
 * - Texto: busca simples em descrição.
 *
 * @param {Array<Object>} lancamentos Lançamentos do usuário.
 * @param {Object} filtros Filtros normalizados.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Array<Object>} Lançamentos filtrados.
 */
function aplicarFiltrosPacoteLancamentos_(lancamentos, filtros, contexto) {
  const categoriasFiltro = montarMapaIdsFiltroCategoriaLancamento_(filtros.ID_Categoria, contexto.categoriasTodas);
  const projetosFiltro = montarMapaIdsFiltroLancamento_(filtros.ID_Projeto);
  const contasFiltro = montarMapaIdsFiltroLancamento_(filtros.ID_Conta);
  const cartoesFiltro = montarMapaIdsFiltroLancamento_(filtros.ID_Cartao);
  const gruposFiltro = montarMapaIdsFiltroLancamento_(filtros.ID_Grupo_Cartao);
  const lancamentosFiltro = montarMapaIdsFiltroLancamento_(filtros.IDs_Lancamentos);
  const gruposPorCartao = montarMapaGruposPorCartaoFiltroLancamento_(contexto.cartoesTodos || []);

  return lancamentos.filter(function(lancamento) {
    if (filtros.Mes_Inicial) {
      const mesLancamento = normalizarTextoLancamento_(lancamento.Mes_Referencia);

      if (
        typeof mesReferenciaEstaNoIntervaloConsolidadoController_ === "function"
          ? !mesReferenciaEstaNoIntervaloConsolidadoController_(mesLancamento, filtros.Mes_Inicial, filtros.Mes_Final)
          : mesLancamento !== filtros.Mes_Inicial
      ) {
        return false;
      }
    }

    if (filtros.ID_Lancamento) {
      const idLancamento = normalizarTextoLancamento_(lancamento.ID_Lancamento);

      if (idLancamento !== filtros.ID_Lancamento) {
        return false;
      }
    }

    if (filtros.IDs_Lancamentos) {
      const idLancamento = normalizarTextoLancamento_(lancamento.ID_Lancamento);

      if (!lancamentosFiltro[idLancamento]) {
        return false;
      }
    }

    if (filtros.Tipo) {
      const tipoLancamento = normalizarTextoLancamento_(lancamento.Tipo);

      if (tipoLancamento !== filtros.Tipo) {
        return false;
      }
    }

    if (filtros.Status) {
      const statusLancamento = normalizarTextoLancamento_(lancamento.Status);

      if (statusLancamento !== filtros.Status) {
        return false;
      }
    }

    if (filtros.Texto) {
      const descricao = normalizarTextoLancamento_(lancamento.Descricao).toLowerCase();

      if (descricao.indexOf(filtros.Texto) === -1) {
        return false;
      }
    }

    if (filtros.ID_Categoria) {
      const idCategoria = normalizarTextoLancamento_(lancamento.ID_Categoria);

      if (!categoriasFiltro[idCategoria]) {
        return false;
      }
    }

    if (filtros.ID_Projeto) {
      const idProjeto = normalizarTextoLancamento_(lancamento.ID_Projeto);

      if (!projetosFiltro[idProjeto]) {
        return false;
      }
    }

    if (filtros.ID_Conta) {
      const origem = normalizarTextoLancamento_(lancamento.ID_Origem);
      const destino = normalizarTextoLancamento_(lancamento.ID_Destino);
      const tipoOrigem = normalizarTextoLancamento_(lancamento.Tipo_Origem);
      const tipoLancamento = normalizarTextoLancamento_(lancamento.Tipo);
      const usaConta = (tipoOrigem === "Conta" && contasFiltro[origem]) ||
        (tipoLancamento === "Transferência" && (contasFiltro[origem] || contasFiltro[destino]));

      if (!usaConta) {
        return false;
      }
    }

    if (filtros.Tipo_Origem) {
      const tipoOrigemLancamento = normalizarTextoLancamento_(lancamento.Tipo_Origem);

      if (tipoOrigemLancamento !== filtros.Tipo_Origem) {
        return false;
      }
    }

    if (filtros.ID_Cartao) {
      const tipoOrigem = normalizarTextoLancamento_(lancamento.Tipo_Origem);
      const origem = normalizarTextoLancamento_(lancamento.ID_Origem);

      if (tipoOrigem !== "Cartão" || !cartoesFiltro[origem]) {
        return false;
      }
    }

    if (filtros.ID_Grupo_Cartao) {
      const idGrupoPagamentoFatura = normalizarTextoLancamento_(lancamento.ID_Grupo_Cartao);
      const idGrupoCartao = idGrupoPagamentoFatura || gruposPorCartao[normalizarTextoLancamento_(lancamento.ID_Origem)];

      if (!idGrupoCartao || !gruposFiltro[idGrupoCartao]) {
        return false;
      }
    }

    if (filtros.Parcelado && !lancamentoEhParcelaLancamento_(lancamento)) {
      return false;
    }

    return true;
  });
}


function montarMapaIdsFiltroLancamento_(valor) {
  const mapa = {};
  normalizarTextoLancamento_(valor).split(",").forEach(function(id) {
    const idNormalizado = normalizarTextoLancamento_(id);

    if (idNormalizado) {
      mapa[idNormalizado] = true;
    }
  });

  return mapa;
}

function montarMapaIdsFiltroCategoriaLancamento_(valor, categorias) {
  const mapa = montarMapaIdsFiltroLancamento_(valor);
  const filhosPorPai = {};

  (categorias || []).forEach(function(categoria) {
    const id = normalizarTextoLancamento_(categoria.ID_Categoria);
    const idPai = normalizarTextoLancamento_(categoria.ID_Categoria_Pai);

    if (!id || !idPai) {
      return;
    }

    if (!filhosPorPai[idPai]) {
      filhosPorPai[idPai] = [];
    }

    filhosPorPai[idPai].push(id);
  });

  Object.keys(mapa).forEach(function(idCategoria) {
    incluirDescendentesFiltroCategoriaLancamento_(idCategoria, filhosPorPai, mapa, {});
  });

  return mapa;
}

function incluirDescendentesFiltroCategoriaLancamento_(idCategoria, filhosPorPai, mapa, visitados) {
  const id = normalizarTextoLancamento_(idCategoria);

  if (!id || visitados[id]) {
    return;
  }

  visitados[id] = true;
  (filhosPorPai[id] || []).forEach(function(idFilho) {
    mapa[idFilho] = true;
    incluirDescendentesFiltroCategoriaLancamento_(idFilho, filhosPorPai, mapa, visitados);
  });
}


function montarMapaGruposPorCartaoFiltroLancamento_(cartoes) {
  const mapa = {};

  (cartoes || []).forEach(function(cartao) {
    const idCartao = normalizarTextoLancamento_(cartao.ID_Cartao);
    const idGrupo = normalizarTextoLancamento_(cartao.ID_Grupo_Cartao);

    if (idCartao) {
      mapa[idCartao] = idGrupo;
    }
  });

  return mapa;
}


/**
 * Compatibilidade temporária com a View antiga.
 *
 * @param {string} tokenSessao Token de sessão.
 * @returns {Object} Dependências do formulário.
 */
function obterDependenciasFormulario(tokenSessao) {
  return obterPacoteTelaLancamentos(tokenSessao).dependencias;
}


/**
 * Compatibilidade temporária com a View antiga.
 *
 * @param {string} tokenSessao Token de sessão.
 * @returns {Array<Object>} Lançamentos do usuário.
 */
function obterListaLancamentos(tokenSessao) {
  return obterPacoteTelaLancamentos(tokenSessao).lancamentos;
}


/**
 * Salva lançamento e, quando informado, salva/cancela rateios na mesma operação lógica.
 *
 * Convenção esperada para rateio integrado:
 * dadosFormulario.Rateio_Ativo = true | false
 * dadosFormulario.Modo_Rateio = "Igual" | "Valor" | "Percentual"
 * dadosFormulario.Participantes_Rateio = [
 *   { ID_Usuario: "...", Valor_Rateado: 10.50, Percentual: 50 }
 * ]
 *
 * Compatibilidade:
 * - Se Rateio_Ativo vier undefined/null, os rateios existentes são preservados.
 *
 * @param {Object} dadosFormulario Dados do formulário.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarLancamentoCompleto(dadosFormulario, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const medidor = criarMedidorPerformance_("Lancamentos.processarSalvarCompleto");

  try {
    const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
      return obterSessaoObrigatoria(tokenSessao);
    });
    const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
      return montarContextoLancamentosOtimizado_(sessao, medidor);
    });

    medirEtapaPerformance_(medidor, "validar_campos", function() {
      validarCamposBasicosLancamento_(dadosFormulario);
    });

    const idInformado = normalizarTextoLancamento_(dadosFormulario.ID_Lancamento);
    const isEdicao = !!idInformado;
    const parcelamentoAtivo = normalizarBooleanoLancamento_(dadosFormulario.Parcelamento_Ativo);
    let mensagem = "";

    if (!isEdicao && parcelamentoAtivo) {
      mensagem = medirEtapaPerformance_(medidor, "criar_parcelas", function() {
        return processarCriacaoParceladaLancamento_(dadosFormulario, contexto, tokenSessao);
      });
    } else if (isEdicao) {
      const lancamentoOriginal = buscarLancamentoNoContexto_(idInformado, contexto);
      const escopoParcelas = normalizarEscopoEdicaoParcelasLancamento_(dadosFormulario.Escopo_Edicao_Parcelas);

      if (!usuarioPodeGerenciarLancamento_(lancamentoOriginal, contexto)) {
        throw new Error("Acesso Negado: você não tem permissão para editar este lançamento.");
      }

      if (lancamentoEhParcelaLancamento_(lancamentoOriginal) && escopoParcelas === "EstaEProximas") {
        mensagem = medirEtapaPerformance_(medidor, "editar_esta_e_proximas", function() {
          return processarEdicaoEstaEProximasParcelasLancamento_(
            dadosFormulario,
            lancamentoOriginal,
            contexto,
            tokenSessao
          );
        });
      } else {
        mensagem = medirEtapaPerformance_(medidor, "salvar_lancamento_unico", function() {
          return processarSalvarLancamentoUnico_(dadosFormulario, contexto, lancamentoOriginal, tokenSessao);
        });
      }
    } else {
      mensagem = medirEtapaPerformance_(medidor, "salvar_lancamento_unico", function() {
        return processarSalvarLancamentoUnico_(dadosFormulario, contexto, null, tokenSessao);
      });
    }

    registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
    registrarContagemPerformance_(medidor, "rateiosTodos", contexto.rateiosTodos.length);
    finalizarPerformance_(medidor);
    return mensagem;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Salva um lançamento único, parcelado ou não.
 *
 * Observação:
 * - Quando o lançamento original já é uma parcela, os metadados do grupo são preservados.
 * - Transferência não pode permanecer vinculada a um grupo de parcelas.
 *
 * @param {Object} dadosFormulario Dados vindos da View.
 * @param {Object} contexto Contexto otimizado do usuário logado.
 * @param {Object|null} lancamentoOriginal Lançamento original em caso de edição.
 * @param {string} tokenSessao Token de sessão usado para alerta pedagógico.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarLancamentoUnico_(dadosFormulario, contexto, lancamentoOriginal, tokenSessao) {
  const isEdicao = !!lancamentoOriginal;
  const agora = new Date().toLocaleString("pt-BR");
  const idLancamento = isEdicao ? lancamentoOriginal.ID_Lancamento : Utilities.getUuid();
  const dataOcorrencia = normalizarTextoLancamento_(dadosFormulario.Data_Ocorrencia);
  const numeroParcela = isEdicao
    ? normalizarInteiroPositivoLancamento_(lancamentoOriginal.Numero_Parcela)
    : "";
  const totalParcelas = isEdicao
    ? normalizarInteiroPositivoLancamento_(lancamentoOriginal.Total_Parcelas)
    : "";
  const idGrupoParcela = isEdicao
    ? normalizarTextoLancamento_(lancamentoOriginal.ID_Grupo_Parcela)
    : "";

  let descricao = normalizarTextoLancamento_(dadosFormulario.Descricao);

  if (idGrupoParcela && numeroParcela && totalParcelas) {
    descricao = montarDescricaoParcelaLancamento_(descricao, numeroParcela, totalParcelas);
  }

  const lancamento = {
    ID_Lancamento: idLancamento,
    Tipo: normalizarTextoLancamento_(dadosFormulario.Tipo),
    Descricao: descricao,
    Valor_Total: converterValorLancamento_(dadosFormulario.Valor_Total),
    Data_Ocorrencia: dataOcorrencia,
    Mes_Referencia: obterMesReferenciaLancamentoPorContexto_(
      dataOcorrencia,
      normalizarTextoLancamento_(dadosFormulario.Tipo_Origem),
      normalizarTextoLancamento_(dadosFormulario.ID_Origem),
      contexto
    ),
    ID_Categoria: normalizarTextoLancamento_(dadosFormulario.ID_Categoria),
    Tipo_Origem: normalizarTextoLancamento_(dadosFormulario.Tipo_Origem),
    ID_Origem: normalizarTextoLancamento_(dadosFormulario.ID_Origem),
    ID_Destino: normalizarTextoLancamento_(dadosFormulario.ID_Destino),
    ID_Projeto: normalizarTextoLancamento_(dadosFormulario.ID_Projeto),
    Email_Autor: contexto.emailLogado,
    Status: normalizarTextoLancamento_(dadosFormulario.Status),
    ID_Recorrencia_Origem: normalizarMetadadoRecorrenciaLancamento_(
      dadosFormulario.ID_Recorrencia_Origem,
      lancamentoOriginal && lancamentoOriginal.ID_Recorrencia_Origem
    ),
    Modo_Recorrencia_Origem: normalizarMetadadoRecorrenciaLancamento_(
      dadosFormulario.Modo_Recorrencia_Origem,
      lancamentoOriginal && lancamentoOriginal.Modo_Recorrencia_Origem
    ),
    Data_Ocorrencia_Recorrencia: normalizarMetadadoRecorrenciaLancamento_(
      dadosFormulario.Data_Ocorrencia_Recorrencia,
      lancamentoOriginal && lancamentoOriginal.Data_Ocorrencia_Recorrencia
    ),
    Criado_Por_ID: isEdicao ? lancamentoOriginal.Criado_Por_ID : contexto.idLogado,
    Data_Criacao: isEdicao ? lancamentoOriginal.Data_Criacao : agora,
    Alterado_Por_ID: isEdicao ? contexto.idLogado : "",
    Data_Alteracao: isEdicao ? agora : "",
    ID_Grupo_Parcela: idGrupoParcela,
    Numero_Parcela: numeroParcela,
    Total_Parcelas: totalParcelas,
    _linhaPlanilha: isEdicao ? lancamentoOriginal._linhaPlanilha : null
  };

  validarLancamentoParceladoNaoTransferencia_(lancamento);
  validarChavesEstrangeirasLancamento_(lancamento, contexto);

  const flagRateio = obterFlagRateioLancamento_(dadosFormulario);
  let novosRateios = [];

  if (flagRateio === true) {
    validarLancamentoRateavel_(lancamento);

    if (isEdicao) {
      validarSemRateioAcertadoParaRedefinir_(lancamento.ID_Lancamento, contexto);
    }

    novosRateios = calcularNovosRateiosLancamento_(lancamento, dadosFormulario, contexto);
  }

  if (flagRateio === false && isEdicao) {
    validarSemRateioAcertadoParaRedefinir_(lancamento.ID_Lancamento, contexto);
  }

  salvarLancamentoModel(lancamento);

  aplicarRateiosAposSalvarLancamento_(lancamento, flagRateio, novosRateios, contexto);

  const mensagemBase = flagRateio === true
    ? "Lançamento e rateios salvos com sucesso."
    : "Lançamento salvo com sucesso.";

  return adicionarAlertaOrcamentoMensagemLancamento_(mensagemBase, lancamento, tokenSessao);
}


function normalizarMetadadoRecorrenciaLancamento_(valorFormulario, valorOriginal) {
  const valorNormalizado = normalizarTextoLancamento_(valorFormulario);

  if (valorNormalizado) {
    return valorNormalizado;
  }

  return normalizarTextoLancamento_(valorOriginal);
}


/**
 * Cria uma nova receita ou despesa parcelada.
 *
 * Regras aprovadas:
 * - Transferências não podem ser parceladas.
 * - A View envia o valor total da operação já calculado a partir do valor da parcela.
 * - As parcelas mantêm o mesmo valor informado; o total da compra é parcela x quantidade.
 * - A primeira parcela herda o status informado; as futuras ficam Pendentes.
 * - Rateio informado no lançamento da compra é replicado proporcionalmente nas parcelas.
 *
 * @param {Object} dadosFormulario Dados vindos da View.
 * @param {Object} contexto Contexto otimizado.
 * @param {string} tokenSessao Token de sessão usado para alerta pedagógico.
 * @returns {string} Mensagem de sucesso.
 */
function processarCriacaoParceladaLancamento_(dadosFormulario, contexto, tokenSessao) {
  const config = obterConfiguracaoParcelamentoLancamento_(dadosFormulario);
  const agora = new Date().toLocaleString("pt-BR");
  const idGrupoParcela = Utilities.getUuid();
  const descricaoBase = removerSufixoParcelaDescricaoLancamento_(dadosFormulario.Descricao);
  const dataPrimeiraParcela = normalizarTextoLancamento_(dadosFormulario.Data_Ocorrencia);
  const valoresCentavos = distribuirValorParceladoLancamento_(dadosFormulario.Valor_Total, config.quantidadeParcelas);
  const flagRateio = obterFlagRateioLancamento_(dadosFormulario);
  const lancamentos = [];

  for (let i = 0; i < config.quantidadeParcelas; i++) {
    const numeroParcela = i + 1;
    const dataParcela = adicionarMesesDataLancamento_(dataPrimeiraParcela, i);

    const lancamento = {
      ID_Lancamento: Utilities.getUuid(),
      Tipo: normalizarTextoLancamento_(dadosFormulario.Tipo),
      Descricao: montarDescricaoParcelaLancamento_(descricaoBase, numeroParcela, config.quantidadeParcelas),
      Valor_Total: converterCentavosParaValorLancamento_(valoresCentavos[i]),
      Data_Ocorrencia: dataParcela,
      Mes_Referencia: obterMesReferenciaLancamentoPorContexto_(
        dataParcela,
        normalizarTextoLancamento_(dadosFormulario.Tipo_Origem),
        normalizarTextoLancamento_(dadosFormulario.ID_Origem),
        contexto
      ),
      ID_Categoria: normalizarTextoLancamento_(dadosFormulario.ID_Categoria),
      Tipo_Origem: normalizarTextoLancamento_(dadosFormulario.Tipo_Origem),
      ID_Origem: normalizarTextoLancamento_(dadosFormulario.ID_Origem),
      ID_Destino: normalizarTextoLancamento_(dadosFormulario.ID_Destino),
      ID_Projeto: normalizarTextoLancamento_(dadosFormulario.ID_Projeto),
      Email_Autor: contexto.emailLogado,
      Status: numeroParcela === 1 ? normalizarTextoLancamento_(dadosFormulario.Status) : "Pendente",
      ID_Recorrencia_Origem: normalizarTextoLancamento_(dadosFormulario.ID_Recorrencia_Origem),
      Modo_Recorrencia_Origem: normalizarTextoLancamento_(dadosFormulario.Modo_Recorrencia_Origem),
      Data_Ocorrencia_Recorrencia: normalizarTextoLancamento_(dadosFormulario.Data_Ocorrencia_Recorrencia),
      Criado_Por_ID: contexto.idLogado,
      Data_Criacao: agora,
      Alterado_Por_ID: "",
      Data_Alteracao: "",
      ID_Grupo_Parcela: idGrupoParcela,
      Numero_Parcela: numeroParcela,
      Total_Parcelas: config.quantidadeParcelas,
      _linhaPlanilha: null
    };

    validarLancamentoParceladoNaoTransferencia_(lancamento);
    validarChavesEstrangeirasLancamento_(lancamento, contexto);

    if (flagRateio === true) {
      validarLancamentoRateavel_(lancamento);
    }

    lancamentos.push(lancamento);
  }

  const rateiosPorLancamento = flagRateio === true
    ? calcularRateiosParceladosParaCriacao_(lancamentos, dadosFormulario, contexto)
    : {};

  salvarLancamentosEmLoteModel(lancamentos);

  if (flagRateio === true) {
    lancamentos.forEach(function(lancamento) {
      substituirRateiosPendentesDoLancamentoModel(
        lancamento.ID_Lancamento,
        rateiosPorLancamento[lancamento.ID_Lancamento] || [],
        contexto.idLogado
      );
    });
  }

  return adicionarAlertaOrcamentoMensagemLancamento_(
    "Lançamento parcelado criado com " + config.quantidadeParcelas + " parcelas.",
    lancamentos[0],
    tokenSessao
  );
}


/**
 * Edita a parcela atual e todas as próximas do mesmo grupo.
 *
 * Regra aprovada:
 * - O valor informado no formulário é o valor de cada parcela afetada.
 * - A parcela aberta herda o status do formulário.
 * - As parcelas posteriores ficam como Pendentes.
 *
 * @param {Object} dadosFormulario Dados vindos da View.
 * @param {Object} lancamentoOriginal Parcela aberta para edição.
 * @param {Object} contexto Contexto otimizado.
 * @param {string} tokenSessao Token de sessão usado para alerta pedagógico.
 * @returns {string} Mensagem de sucesso.
 */
function processarEdicaoEstaEProximasParcelasLancamento_(dadosFormulario, lancamentoOriginal, contexto, tokenSessao) {
  const idGrupo = normalizarTextoLancamento_(lancamentoOriginal.ID_Grupo_Parcela);
  const numeroInicial = normalizarInteiroPositivoLancamento_(lancamentoOriginal.Numero_Parcela);
  const totalParcelas = normalizarInteiroPositivoLancamento_(lancamentoOriginal.Total_Parcelas);
  const dataBase = normalizarTextoLancamento_(dadosFormulario.Data_Ocorrencia);
  const descricaoBase = removerSufixoParcelaDescricaoLancamento_(dadosFormulario.Descricao);
  const flagRateio = obterFlagRateioLancamento_(dadosFormulario);
  const agora = new Date().toLocaleString("pt-BR");

  if (!idGrupo || !numeroInicial || !totalParcelas) {
    throw new Error("Este lançamento não possui metadados suficientes para edição em série.");
  }

  const parcelasAfetadas = contexto.lancamentosTodos
    .filter(function(item) {
      return normalizarTextoLancamento_(item.ID_Grupo_Parcela) === idGrupo &&
             normalizarInteiroPositivoLancamento_(item.Numero_Parcela) >= numeroInicial;
    })
    .sort(function(a, b) {
      return normalizarInteiroPositivoLancamento_(a.Numero_Parcela) -
             normalizarInteiroPositivoLancamento_(b.Numero_Parcela);
    });

  if (parcelasAfetadas.length === 0) {
    throw new Error("Nenhuma parcela futura foi encontrada para atualização.");
  }

  const lancamentosAtualizados = parcelasAfetadas.map(function(parcela, indice) {
    if (!usuarioPodeGerenciarLancamento_(parcela, contexto)) {
      throw new Error("Acesso Negado: voce nao tem permissao para editar uma das parcelas selecionadas.");
    }

    const numeroParcela = normalizarInteiroPositivoLancamento_(parcela.Numero_Parcela);
    const dataParcela = adicionarMesesDataLancamento_(dataBase, indice);

    const atualizado = {
      ID_Lancamento: parcela.ID_Lancamento,
      Tipo: normalizarTextoLancamento_(dadosFormulario.Tipo),
      Descricao: montarDescricaoParcelaLancamento_(descricaoBase, numeroParcela, totalParcelas),
      Valor_Total: converterValorLancamento_(dadosFormulario.Valor_Total),
      Data_Ocorrencia: dataParcela,
      Mes_Referencia: obterMesReferenciaLancamentoPorContexto_(
        dataParcela,
        normalizarTextoLancamento_(dadosFormulario.Tipo_Origem),
        normalizarTextoLancamento_(dadosFormulario.ID_Origem),
        contexto
      ),
      ID_Categoria: normalizarTextoLancamento_(dadosFormulario.ID_Categoria),
      Tipo_Origem: normalizarTextoLancamento_(dadosFormulario.Tipo_Origem),
      ID_Origem: normalizarTextoLancamento_(dadosFormulario.ID_Origem),
      ID_Destino: normalizarTextoLancamento_(dadosFormulario.ID_Destino),
      ID_Projeto: normalizarTextoLancamento_(dadosFormulario.ID_Projeto),
      Email_Autor: contexto.emailLogado,
      Status: indice === 0 ? normalizarTextoLancamento_(dadosFormulario.Status) : "Pendente",
      ID_Recorrencia_Origem: normalizarTextoLancamento_(dadosFormulario.ID_Recorrencia_Origem) || normalizarTextoLancamento_(parcela.ID_Recorrencia_Origem),
      Modo_Recorrencia_Origem: normalizarTextoLancamento_(dadosFormulario.Modo_Recorrencia_Origem) || normalizarTextoLancamento_(parcela.Modo_Recorrencia_Origem),
      Data_Ocorrencia_Recorrencia: normalizarTextoLancamento_(dadosFormulario.Data_Ocorrencia_Recorrencia) || normalizarTextoLancamento_(parcela.Data_Ocorrencia_Recorrencia),
      Criado_Por_ID: parcela.Criado_Por_ID,
      Data_Criacao: parcela.Data_Criacao,
      Alterado_Por_ID: contexto.idLogado,
      Data_Alteracao: agora,
      ID_Grupo_Parcela: idGrupo,
      Numero_Parcela: numeroParcela,
      Total_Parcelas: totalParcelas,
      _linhaPlanilha: parcela._linhaPlanilha
    };

    validarLancamentoParceladoNaoTransferencia_(atualizado);
    validarChavesEstrangeirasLancamento_(atualizado, contexto);

    if (flagRateio === true || flagRateio === false) {
      validarSemRateioAcertadoParaRedefinir_(atualizado.ID_Lancamento, contexto);
    }

    if (flagRateio === true) {
      validarLancamentoRateavel_(atualizado);
    }

    return atualizado;
  });

  const rateiosPorLancamento = {};

  if (flagRateio === true) {
    lancamentosAtualizados.forEach(function(lancamento) {
      rateiosPorLancamento[lancamento.ID_Lancamento] = calcularNovosRateiosLancamento_(
        lancamento,
        dadosFormulario,
        contexto
      );
    });
  }

  salvarLancamentosEmLoteModel(lancamentosAtualizados);

  lancamentosAtualizados.forEach(function(lancamento) {
    aplicarRateiosAposSalvarLancamento_(
      lancamento,
      flagRateio,
      rateiosPorLancamento[lancamento.ID_Lancamento] || [],
      contexto
    );
  });

  return adicionarAlertaOrcamentoMensagemLancamento_(
    "Parcela atual e próximas parcelas atualizadas com sucesso.",
    lancamentosAtualizados[0],
    tokenSessao
  );
}


/**
 * Aplica a regra pós-salvamento de rateios.
 *
 * @param {Object} lancamento Lançamento salvo.
 * @param {boolean|null} flagRateio Flag de rateio.
 * @param {Array<Object>} novosRateios Novos rateios calculados.
 * @param {Object} contexto Contexto otimizado.
 */
function aplicarRateiosAposSalvarLancamento_(lancamento, flagRateio, novosRateios, contexto) {
  if (flagRateio === true) {
    substituirRateiosDoLancamentoComExclusaoFisica_(
      lancamento.ID_Lancamento,
      novosRateios,
      contexto.idLogado
    );
  }

  if (flagRateio === false) {
    excluirRateiosDoLancamentoComValidacao_(lancamento.ID_Lancamento);
  }
}


/**
 * Adiciona alerta pedagógico de orçamento à mensagem de sucesso do lançamento.
 *
 * O alerta não bloqueia o lançamento. Se o módulo de orçamentos ainda não
 * estiver disponível ou se a categoria não tiver teto cadastrado, a mensagem
 * original é preservada.
 *
 * @param {string} mensagemBase Mensagem principal do salvamento.
 * @param {Object} lancamento Lançamento salvo.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem final.
 */
function adicionarAlertaOrcamentoMensagemLancamento_(mensagemBase, lancamento, tokenSessao) {
  if (typeof obterAlertaOrcamentoLancamento !== "function") {
    return mensagemBase;
  }

  let alerta = null;

  try {
    alerta = obterAlertaOrcamentoLancamento(lancamento, tokenSessao);
  } catch (erroAlerta) {
    console.warn("Alerta de orçamento não pôde ser calculado: " + erroAlerta.message);
    return mensagemBase;
  }

  if (!alerta) {
    return mensagemBase;
  }

  return mensagemBase + " " + alerta.Mensagem +
    " Uso projetado: " + alerta.Percentual + "% do teto.";
}


/**
 * Substitui fisicamente os rateios de um lançamento.
 *
 * Regra atual do Mukirana:
 * - Rateios são vínculos derivados do lançamento.
 * - Ao alterar participantes, origem ou projeto, os vínculos antigos não devem
 *   permanecer como Cancelados; eles devem ser removidos fisicamente.
 * - A validação de participantes elegíveis ocorre antes do salvamento.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {Array<Object>} novosRateios Novos rateios calculados.
 * @param {string} idUsuarioAlteracao ID do usuário responsável pela alteração.
 */
function substituirRateiosDoLancamentoComExclusaoFisica_(idLancamento, novosRateios, idUsuarioAlteracao) {
  if (typeof substituirRateiosDoLancamentoModel === "function") {
    substituirRateiosDoLancamentoModel(idLancamento, novosRateios, idUsuarioAlteracao);
    return;
  }

  excluirRateiosDoLancamentoComValidacao_(idLancamento);

  if (novosRateios && novosRateios.length > 0) {
    substituirRateiosPendentesDoLancamentoModel(
      idLancamento,
      novosRateios,
      idUsuarioAlteracao
    );
  }
}


/**
 * Exclui fisicamente todos os rateios de um lançamento, com fallback seguro.
 *
 * @param {string} idLancamento ID do lançamento.
 */
function excluirRateiosDoLancamentoComValidacao_(idLancamento) {
  if (typeof excluirRateiosDoLancamentoModel === "function") {
    excluirRateiosDoLancamentoModel(idLancamento);
    return;
  }

  if (typeof excluirRateiosPorLancamentosModel === "function") {
    excluirRateiosPorLancamentosModel([idLancamento]);
    return;
  }

  if (typeof cancelarRateiosPendentesDoLancamentoModel === "function") {
    throw new Error("O Model de Rateios ainda não possui exclusão física. Atualize Rateios_Model antes de salvar sem rateio.");
  }

  throw new Error("Função de exclusão de rateios não encontrada no Model de Rateios.");
}


/**
 * Calcula os rateios das parcelas na criação de uma compra/receita parcelada.
 *
 * Importante:
 * - No formulário de criação parcelada, o usuário informa visualmente o valor da parcela.
 * - A View envia o valor total calculado para o backend.
 * - Para modo Valor, os valores são convertidos proporcionalmente para cada parcela.
 * - Para modo Igual e Percentual, a regra já é naturalmente reaplicável por parcela.
 *
 * @param {Array<Object>} lancamentos Parcelas criadas.
 * @param {Object} dadosFormulario Dados originais do formulário.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Object} Mapa ID_Lancamento -> Array de rateios.
 */
function calcularRateiosParceladosParaCriacao_(lancamentos, dadosFormulario, contexto) {
  const modoOriginal = normalizarTextoLancamento_(dadosFormulario.Modo_Rateio || dadosFormulario.Modo_Divisao);
  const participantesOriginais = obterParticipantesRateioFormulario_(dadosFormulario);
  const valorTotalCentavos = converterValorParaCentavosLancamento_(dadosFormulario.Valor_Total);
  const valorPrimeiraParcelaCentavos = lancamentos.length > 0
    ? converterValorParaCentavosLancamento_(lancamentos[0].Valor_Total)
    : 0;
  let valorReferenciaRateioCentavos = valorTotalCentavos;
  const mapa = {};

  if (modoOriginal === "Valor") {
    validarParticipantesRateioLancamento_(participantesOriginais, contexto, lancamentos[0]);
    valorReferenciaRateioCentavos = obterValorReferenciaRateioParcelado_(
      participantesOriginais,
      valorTotalCentavos,
      valorPrimeiraParcelaCentavos
    );
  }

  lancamentos.forEach(function(lancamento) {
    const dadosParcela = copiarDadosFormularioParaRateioParcela_(
      dadosFormulario,
      modoOriginal,
      participantesOriginais,
      valorReferenciaRateioCentavos,
      converterValorParaCentavosLancamento_(lancamento.Valor_Total)
    );

    mapa[lancamento.ID_Lancamento] = calcularNovosRateiosLancamento_(
      lancamento,
      dadosParcela,
      contexto
    );
  });

  return mapa;
}


/**
 * Copia os dados de rateio para uma parcela específica.
 *
 * @param {Object} dadosFormulario Dados originais.
 * @param {string} modoOriginal Modo escolhido pelo usuário.
 * @param {Array<Object>} participantesOriginais Participantes originais.
 * @param {number} valorTotalCentavos Valor total da operação em centavos.
 * @param {number} valorParcelaCentavos Valor da parcela em centavos.
 * @returns {Object} Dados de rateio ajustados para a parcela.
 */
function copiarDadosFormularioParaRateioParcela_(dadosFormulario, modoOriginal, participantesOriginais, valorTotalCentavos, valorParcelaCentavos) {
  const copia = {};

  Object.keys(dadosFormulario || {}).forEach(function(chave) {
    copia[chave] = dadosFormulario[chave];
  });

  if (modoOriginal !== "Valor") {
    return copia;
  }

  copia.Modo_Rateio = "Valor";
  copia.Participantes_Rateio = distribuirRateioPorValorParaParcela_(
    participantesOriginais,
    valorTotalCentavos,
    valorParcelaCentavos
  );

  return copia;
}


/**
 * Distribui participantes de rateio por valor para uma parcela.
 *
 * @param {Array<Object>} participantes Participantes informados para o valor total.
 * @param {number} totalOriginalCentavos Valor total original em centavos.
 * @param {number} parcelaCentavos Valor da parcela em centavos.
 * @returns {Array<Object>} Participantes com valores ajustados à parcela.
 */
function distribuirRateioPorValorParaParcela_(participantes, totalOriginalCentavos, parcelaCentavos) {
  let somaParcela = 0;

  return participantes.map(function(participante, indice) {
    const valorOriginalCentavos = converterValorParaCentavosLancamento_(participante.Valor_Rateado);
    let valorParcelaParticipante = Math.round((parcelaCentavos * valorOriginalCentavos) / totalOriginalCentavos);

    if (indice === participantes.length - 1) {
      valorParcelaParticipante = parcelaCentavos - somaParcela;
    }

    somaParcela += valorParcelaParticipante;

    return {
      ID_Usuario: normalizarTextoLancamento_(participante.ID_Usuario),
      Valor_Rateado: converterCentavosParaValorLancamento_(valorParcelaParticipante),
      Percentual: calcularPercentualLancamento_(valorParcelaParticipante, parcelaCentavos)
    };
  });
}




/**
 * Define se valores informados no rateio parcelado representam o total da operação
 * ou o valor visual de uma parcela.
 *
 * Compatibilidade:
 * - Se a soma for igual ao total da operação, preserva comportamento antigo.
 * - Se a soma for igual à primeira parcela, usa a parcela como base visual.
 *
 * @param {Array<Object>} participantes Participantes do rateio.
 * @param {number} totalCentavos Valor total da operação.
 * @param {number} primeiraParcelaCentavos Valor da primeira parcela.
 * @returns {number} Valor de referência para redistribuição proporcional.
 */
function obterValorReferenciaRateioParcelado_(participantes, totalCentavos, primeiraParcelaCentavos) {
  let soma = 0;

  participantes.forEach(function(participante) {
    soma += converterValorParaCentavosLancamento_(participante.Valor_Rateado);
  });

  if (soma === totalCentavos) {
    return totalCentavos;
  }

  if (soma === primeiraParcelaCentavos) {
    return primeiraParcelaCentavos;
  }

  throw new Error("A soma dos valores rateados deve ser igual ao valor da parcela exibida ou ao valor total da operação parcelada.");
}


/**
 * Valida a soma dos valores rateados informados no lançamento parcelado.
 *
 * @param {Array<Object>} participantes Participantes do rateio.
 * @param {number} totalCentavos Valor total em centavos.
 */
function validarSomaValoresRateioOriginalParcelamento_(participantes, totalCentavos) {
  let soma = 0;

  participantes.forEach(function(participante) {
    soma += converterValorParaCentavosLancamento_(participante.Valor_Rateado);
  });

  if (soma !== totalCentavos) {
    throw new Error("A soma dos valores rateados deve ser igual ao valor total da operação parcelada.");
  }
}


/**
 * Obtém e valida a configuração de parcelamento.
 *
 * @param {Object} dadosFormulario Dados do formulário.
 * @returns {Object} Configuração normalizada.
 */
function obterConfiguracaoParcelamentoLancamento_(dadosFormulario) {
  const tipo = normalizarTextoLancamento_(dadosFormulario.Tipo);
  const quantidade = parseInt(dadosFormulario.Quantidade_Parcelas, 10);
  const valorCentavos = converterValorParaCentavosLancamento_(dadosFormulario.Valor_Total);

  if (tipo === "Transferência") {
    throw new Error("Transferências não podem ser parceladas.");
  }

  if (tipo !== "Receita" && tipo !== "Despesa") {
    throw new Error("Apenas receitas e despesas podem ser parceladas.");
  }

  if (isNaN(quantidade) || quantidade < 2) {
    throw new Error("Informe pelo menos 2 parcelas.");
  }

  if (quantidade > 120) {
    throw new Error("O parcelamento não pode ultrapassar 120 parcelas.");
  }

  if (valorCentavos < quantidade) {
    throw new Error("O valor total é insuficiente para a quantidade de parcelas informada.");
  }

  return {
    quantidadeParcelas: quantidade
  };
}


/**
 * Distribui o valor total entre parcelas, deixando centavos residuais na última.
 *
 * @param {*} valorTotal Valor total da operação.
 * @param {number} quantidadeParcelas Quantidade de parcelas.
 * @returns {Array<number>} Valores em centavos por parcela.
 */
function distribuirValorParceladoLancamento_(valorTotal, quantidadeParcelas) {
  const totalCentavos = converterValorParaCentavosLancamento_(valorTotal);
  const base = Math.floor(totalCentavos / quantidadeParcelas);
  const valores = [];
  let soma = 0;

  for (let i = 0; i < quantidadeParcelas; i++) {
    let valorParcela = base;

    if (i === quantidadeParcelas - 1) {
      valorParcela = totalCentavos - soma;
    }

    soma += valorParcela;
    valores.push(valorParcela);
  }

  return valores;
}


/**
 * Adiciona meses a uma data yyyy-MM-dd, preservando o dia quando possível.
 *
 * Se o mês de destino não tiver o mesmo dia, usa o último dia do mês.
 * Ex.: 2026-01-31 + 1 mês = 2026-02-28.
 *
 * @param {string} dataTexto Data yyyy-MM-dd.
 * @param {number} meses Quantidade de meses a adicionar.
 * @returns {string} Data yyyy-MM-dd.
 */
function adicionarMesesDataLancamento_(dataTexto, meses) {
  const texto = normalizarTextoLancamento_(dataTexto);
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new Error("Data inválida para cálculo das parcelas.");
  }

  const ano = parseInt(partes[1], 10);
  const mesBase = parseInt(partes[2], 10) - 1;
  const dia = parseInt(partes[3], 10);
  const primeiroDiaDestino = new Date(ano, mesBase + meses, 1);
  const ultimoDiaDestino = new Date(
    primeiroDiaDestino.getFullYear(),
    primeiroDiaDestino.getMonth() + 1,
    0
  ).getDate();
  const diaFinal = Math.min(dia, ultimoDiaDestino);
  const dataFinal = new Date(
    primeiroDiaDestino.getFullYear(),
    primeiroDiaDestino.getMonth(),
    diaFinal
  );

  return Utilities.formatDate(dataFinal, Session.getScriptTimeZone(), "yyyy-MM-dd");
}


/**
 * Monta a descrição da parcela garantindo sufixo único.
 *
 * @param {*} descricao Descrição base.
 * @param {number} numeroParcela Número da parcela.
 * @param {number} totalParcelas Total de parcelas.
 * @returns {string} Descrição final.
 */
function montarDescricaoParcelaLancamento_(descricao, numeroParcela, totalParcelas) {
  const base = removerSufixoParcelaDescricaoLancamento_(descricao) || "Lançamento parcelado";
  return base + " (" + numeroParcela + "/" + totalParcelas + ")";
}


/**
 * Remove sufixos finais do tipo "(1/12)" da descrição.
 *
 * @param {*} descricao Descrição original.
 * @returns {string} Descrição base.
 */
function removerSufixoParcelaDescricaoLancamento_(descricao) {
  return normalizarTextoLancamento_(descricao).replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
}


/**
 * Informa se um lançamento é uma parcela de série.
 *
 * @param {Object} lancamento Lançamento.
 * @returns {boolean} True se for parcela.
 */
function lancamentoEhParcelaLancamento_(lancamento) {
  return !!normalizarTextoLancamento_(lancamento && lancamento.ID_Grupo_Parcela) &&
         normalizarInteiroPositivoLancamento_(lancamento && lancamento.Numero_Parcela) > 0 &&
         normalizarInteiroPositivoLancamento_(lancamento && lancamento.Total_Parcelas) > 1;
}


/**
 * Valida que transferência não fique vinculada a parcelamento.
 *
 * @param {Object} lancamento Lançamento.
 */
function validarLancamentoParceladoNaoTransferencia_(lancamento) {
  if (lancamento.Tipo === "Transferência" && lancamentoEhParcelaLancamento_(lancamento)) {
    throw new Error("Transferências não podem ser parceladas.");
  }
}


/**
 * Normaliza escopo de edição de parcelas.
 *
 * @param {*} valor Valor recebido da View.
 * @returns {string} Escopo normalizado.
 */
function normalizarEscopoEdicaoParcelasLancamento_(valor) {
  const texto = normalizarTextoLancamento_(valor);
  return texto === "EstaEProximas" ? "EstaEProximas" : "Esta";
}


/**
 * Normaliza inteiro positivo.
 *
 * @param {*} valor Valor original.
 * @returns {number|string} Inteiro positivo ou string vazia.
 */
function normalizarInteiroPositivoLancamento_(valor) {
  if (valor === null || valor === undefined || valor === "") return "";

  const numero = parseInt(valor, 10);
  return isNaN(numero) || numero <= 0 ? "" : numero;
}


/**
 * Compatibilidade temporária com a View antiga.
 *
 * Se a View antiga não envia Rateio_Ativo, os rateios existentes são preservados.
 *
 * @param {Object} dadosFormulario Dados do formulário.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarLancamentoBase(dadosFormulario, tokenSessao) {
  return processarSalvarLancamentoCompleto(dadosFormulario, tokenSessao);
}


/**
 * Exclui definitivamente lançamento(s) e seus rateios vinculados.
 *
 * Regra:
 * - Autor, dono da conta ou titular da fatura/cartão podem excluir conforme contexto.
 * - Em lançamento parcelado, aceita escopo "Esta" ou "EstaEProximas".
 * - Rateios vinculados são removidos fisicamente da aba RATEIOS.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {string} tokenSessao Token de sessão.
 * @param {string} escopoExclusaoParcelas Escopo de exclusão das parcelas.
 * @returns {string} Mensagem de sucesso.
 */
function excluirLancamentoCompleto(idLancamento, tokenSessao, escopoExclusaoParcelas) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const medidor = criarMedidorPerformance_("Lancamentos.excluirCompleto");

  try {
    const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
      return obterSessaoObrigatoria(tokenSessao);
    });
    const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
      return montarContextoLancamentosOtimizado_(sessao, medidor);
    });
    const id = normalizarTextoLancamento_(idLancamento);
    const escopo = normalizarEscopoEdicaoParcelasLancamento_(escopoExclusaoParcelas || "Esta");

    if (!id) {
      throw new Error("ID do lançamento não informado.");
    }

    const lancamento = medirEtapaPerformance_(medidor, "buscar_lancamento", function() {
      return buscarLancamentoNoContexto_(id, contexto);
    });
    const lancamentosParaExcluir = medirEtapaPerformance_(medidor, "definir_escopo", function() {
      return obterLancamentosParaExclusaoPorEscopo_(lancamento, escopo, contexto);
    });

    medirEtapaPerformance_(medidor, "validar_permissoes", function() {
      lancamentosParaExcluir.forEach(function(item) {
        if (!usuarioPodeGerenciarLancamento_(item, contexto)) {
          throw new Error("Acesso Negado: você não tem permissão para excluir um ou mais lançamentos selecionados.");
        }
      });
    });

    const idsParaExcluir = lancamentosParaExcluir.map(function(item) {
      return item.ID_Lancamento;
    });

    const identificadoresParaExcluir = obterIdentificadoresExclusaoLancamentos_(lancamentosParaExcluir);

    medirEtapaPerformance_(medidor, "excluir_rateios", function() {
      if (typeof excluirRateiosPorLancamentosModel === "function") {
        excluirRateiosPorLancamentosModel(idsParaExcluir);
      }
    });

    medirEtapaPerformance_(medidor, "excluir_lancamentos", function() {
      if (typeof excluirLancamentosPorLinhasModel === "function") {
        excluirLancamentosPorLinhasModel(identificadoresParaExcluir);
      } else {
        identificadoresParaExcluir
          .sort(function(a, b) { return b - a; })
          .forEach(function(linhaPlanilha) {
            excluirLancamentoModel(linhaPlanilha);
          });
      }
    });

    registrarContagemPerformance_(medidor, "lancamentosExcluidos", lancamentosParaExcluir.length);
    finalizarPerformance_(medidor);

    return lancamentosParaExcluir.length > 1
      ? "Parcelas excluídas definitivamente com sucesso."
      : "Lançamento excluído definitivamente com sucesso.";

  } finally {
    lock.releaseLock();
  }
}


/**
 * Compatibilidade temporária com a View antiga.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem de sucesso.
 */
function excluirLancamentoSeguro(idLancamento, tokenSessao) {
  return excluirLancamentoCompleto(idLancamento, tokenSessao);
}


/**
 * Executa ações em lote sobre lançamentos selecionados na tela.
 *
 * Regras da primeira versão:
 * - Altera status somente dos lançamentos selecionados.
 * - Exclui definitivamente somente os lançamentos selecionados e seus rateios.
 * - Lançamentos parcelados não acionam escopo automático; cada parcela precisa estar selecionada.
 * - Todas as ações respeitam a mesma permissão de edição/exclusão já usada no CRUD.
 *
 * @param {Object} dados Dados da ação em lote.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem de sucesso.
 */
function processarAcaoLoteLancamentos(dados, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const medidor = criarMedidorPerformance_("Lancamentos.processarAcaoLote");

  try {
    const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
      return obterSessaoObrigatoria(tokenSessao);
    });
    const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
      return montarContextoLancamentosOtimizado_(sessao, medidor);
    });
    const acao = normalizarTextoLancamento_(dados && dados.Tipo_Acao);
    const idsSelecionados = normalizarIdsLoteLancamentos_(dados && dados.IDs_Lancamentos);

    if (idsSelecionados.length === 0) {
      throw new Error("Selecione pelo menos um lançamento para executar a ação em lote.");
    }

    const lancamentosSelecionados = medirEtapaPerformance_(medidor, "buscar_lancamentos", function() {
      return obterLancamentosSelecionadosLote_(idsSelecionados, contexto);
    });
    let mensagem = "";

    if (acao === "AlterarStatus") {
      mensagem = medirEtapaPerformance_(medidor, "alterar_status_lote", function() {
        return alterarStatusLancamentosEmLote_(lancamentosSelecionados, dados && dados.Status, contexto);
      });
    } else if (acao === "Excluir") {
      mensagem = medirEtapaPerformance_(medidor, "excluir_lote", function() {
        return excluirLancamentosSelecionadosEmLote_(lancamentosSelecionados, contexto);
      });
    } else {
      throw new Error("Ação em lote inválida.");
    }

    registrarContagemPerformance_(medidor, "idsSelecionados", idsSelecionados.length);
    registrarContagemPerformance_(medidor, "lancamentosSelecionados", lancamentosSelecionados.length);
    finalizarPerformance_(medidor);
    return mensagem;

  } finally {
    lock.releaseLock();
  }
}


function alterarStatusLancamentosEmLote_(lancamentosSelecionados, statusInformado, contexto) {
  const status = normalizarTextoLancamento_(statusInformado);
  const agora = new Date().toLocaleString("pt-BR");

  if (status !== "Efetivado" && status !== "Pendente") {
    throw new Error("Status inválido para alteração em lote.");
  }

  lancamentosSelecionados.forEach(function(lancamento) {
    if (!usuarioPodeGerenciarLancamento_(lancamento, contexto)) {
      throw new Error("Acesso Negado: você não tem permissão para alterar um ou mais lançamentos selecionados.");
    }
  });

  const atualizados = lancamentosSelecionados.map(function(lancamento) {
    const clone = clonarLancamentoParaLote_(lancamento);
    clone.Status = status;
    clone.Alterado_Por_ID = contexto.idLogado;
    clone.Data_Alteracao = agora;
    return clone;
  });

  salvarLancamentosEmLoteModel(atualizados);

  return atualizados.length === 1
    ? "Status de 1 lançamento atualizado com sucesso."
    : "Status de " + atualizados.length + " lançamentos atualizado com sucesso.";
}


function excluirLancamentosSelecionadosEmLote_(lancamentosSelecionados, contexto) {
  lancamentosSelecionados.forEach(function(lancamento) {
    if (!usuarioPodeGerenciarLancamento_(lancamento, contexto)) {
      throw new Error("Acesso Negado: você não tem permissão para excluir um ou mais lançamentos selecionados.");
    }
  });

  const idsParaExcluir = lancamentosSelecionados.map(function(lancamento) {
    return lancamento.ID_Lancamento;
  });
  const identificadoresParaExcluir = obterIdentificadoresExclusaoLancamentos_(lancamentosSelecionados);

  if (typeof excluirRateiosPorLancamentosModel === "function") {
    excluirRateiosPorLancamentosModel(idsParaExcluir);
  }

  if (typeof excluirLancamentosPorLinhasModel === "function") {
    excluirLancamentosPorLinhasModel(identificadoresParaExcluir);
  } else {
    identificadoresParaExcluir
      .sort(function(a, b) { return b - a; })
      .forEach(function(linhaPlanilha) {
        excluirLancamentoModel(linhaPlanilha);
      });
  }

  return lancamentosSelecionados.length === 1
    ? "1 lançamento excluído definitivamente com sucesso."
    : lancamentosSelecionados.length + " lançamentos excluídos definitivamente com sucesso.";
}


function obterIdentificadoresExclusaoLancamentos_(lancamentos) {
  const usaSupabase = typeof bancoUsaSupabase === "function" && bancoUsaSupabase();

  return (lancamentos || []).map(function(lancamento) {
    return usaSupabase
      ? normalizarTextoLancamento_(lancamento.ID_Lancamento)
      : lancamento._linhaPlanilha;
  });
}


function normalizarIdsLoteLancamentos_(ids) {
  const usados = {};
  const lista = Array.isArray(ids) ? ids : [];

  return lista.map(function(id) {
    return normalizarTextoLancamento_(id);
  }).filter(function(id) {
    if (!id || usados[id]) return false;
    usados[id] = true;
    return true;
  });
}


function obterLancamentosSelecionadosLote_(idsSelecionados, contexto) {
  const mapaIds = {};

  idsSelecionados.forEach(function(id) {
    mapaIds[id] = true;
  });

  const encontrados = contexto.lancamentosTodos.filter(function(lancamento) {
    return mapaIds[normalizarTextoLancamento_(lancamento.ID_Lancamento)] === true;
  });

  if (encontrados.length !== idsSelecionados.length) {
    throw new Error("Um ou mais lançamentos selecionados não foram encontrados. Atualize a tela e tente novamente.");
  }

  return encontrados;
}


function clonarLancamentoParaLote_(lancamento) {
  const clone = {};

  Object.keys(lancamento || {}).forEach(function(chave) {
    clone[chave] = lancamento[chave];
  });

  return clone;
}


/**
 * Monta contexto otimizado para operações de Lançamentos.
 *
 * Cada aba necessária é lida uma única vez dentro da operação.
 *
 * @param {Object} sessao Sessão validada.
 * @returns {Object} Contexto completo.
 */
function montarContextoLancamentosOtimizado_(sessao, medidorPerformance, filtros) {
  const idLogado = normalizarTextoLancamento_(sessao.id);
  const nomeLogado = normalizarTextoLancamento_(sessao.nome);
  const emailLogado = normalizarTextoLancamento_(sessao.email);
  const papelLogado = normalizarTextoLancamento_(sessao.papel) || "Usuário";
  const mesReferencia = obterMesReferenciaConsultaLancamentos_(filtros);
  const incluirHistorico = !(filtros && filtros.Considerar_Historico_Anterior === false);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, mesReferencia, incluirHistorico)
      : null;
  });

  if (contextoRpc) {
    return montarContextoLancamentosAPartirBase_(
      sessao,
      contextoRpc,
      medidorPerformance,
      "RPC"
    );
  }

  return montarContextoLancamentosAPartirBase_(
    sessao,
    null,
    medidorPerformance,
    "MODELS"
  );
}


function obterMesReferenciaConsultaLancamentos_(filtros) {
  filtros = filtros || {};

  const mesInicial = normalizarTextoLancamento_(filtros.Mes_Inicial || filtros.Mes_Referencia);
  const mesFinal = normalizarTextoLancamento_(filtros.Mes_Final);

  if (!mesInicial || (mesFinal && mesFinal !== mesInicial)) {
    return "";
  }

  return mesInicial;
}


function montarContextoLancamentosAPartirBase_(sessao, contextoBase, medidorPerformance, origemContexto) {
  const idLogado = normalizarTextoLancamento_(sessao.id);
  const nomeLogado = normalizarTextoLancamento_(sessao.nome);
  const emailLogado = normalizarTextoLancamento_(sessao.email);
  const papelLogado = normalizarTextoLancamento_(sessao.papel) || "Usuário";

  const usuariosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
    return contextoBase ? contextoBase.usuariosTodos : listarUsuariosModel();
  });
  const contasTodas = medirEtapaPerformance_(medidorPerformance, "consulta_contas", function() {
    return contextoBase ? contextoBase.contasTodas : typeof listarContasModel === "function" ? listarContasModel() : [];
  });
  const cartoesTodos = medirEtapaPerformance_(medidorPerformance, "consulta_cartoes", function() {
    return contextoBase ? contextoBase.cartoesTodos : typeof listarCartoesModel === "function" ? listarCartoesModel() : [];
  });
  const categoriasTodas = medirEtapaPerformance_(medidorPerformance, "consulta_categorias", function() {
    return contextoBase ? contextoBase.categoriasTodas : typeof listarCategoriasModel === "function" ? listarCategoriasModel() : [];
  });
  const projetosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_projetos", function() {
    return contextoBase ? contextoBase.projetosTodos : typeof listarProjetosModel === "function" ? listarProjetosModel() : [];
  });
  const lancamentosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_lancamentos", function() {
    return contextoBase ? contextoBase.lancamentosTodos : listarLancamentosModel();
  });
  const rateiosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_rateios", function() {
    return contextoBase ? contextoBase.rateiosTodos : typeof listarRateiosModel === "function" ? listarRateiosModel() : [];
  });
  const recorrenciasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias", function() {
    return contextoBase && contextoBase.recorrenciasTodos
      ? contextoBase.recorrenciasTodos
      : typeof listarRecorrenciasModel === "function" ? listarRecorrenciasModel() : [];
  });
  const recorrenciasRateiosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_rateios", function() {
    return contextoBase && contextoBase.recorrenciasRateiosTodos
      ? contextoBase.recorrenciasRateiosTodos
      : typeof listarRecorrenciasRateiosModel === "function" ? listarRecorrenciasRateiosModel() : [];
  });
  const recorrenciasOcorrenciasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_ocorrencias", function() {
    return contextoBase && contextoBase.recorrenciasOcorrenciasTodos
      ? contextoBase.recorrenciasOcorrenciasTodos
      : typeof listarRecorrenciasOcorrenciasModel === "function" ? listarRecorrenciasOcorrenciasModel() : [];
  });
  const pagamentosFaturasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_pagamentos_faturas", function() {
    return contextoBase && contextoBase.pagamentosFaturasTodos
      ? contextoBase.pagamentosFaturasTodos
      : typeof listarPagamentosFaturasModel === "function" ? listarPagamentosFaturasModel() : [];
  });
  const usuariosAtivosSanitizados = medirEtapaPerformance_(medidorPerformance, "filtrar_usuarios_ativos", function() {
    return filtrarUsuariosAtivosParaLancamentos_(usuariosTodos);
  });
  const contasAcessiveis = medirEtapaPerformance_(medidorPerformance, "filtrar_contas_acessiveis", function() {
    return filtrarContasAcessiveisLancamento_(contasTodas, idLogado);
  });
  const cartoesAcessiveis = medirEtapaPerformance_(medidorPerformance, "filtrar_cartoes_acessiveis", function() {
    return filtrarCartoesAcessiveisLancamento_(cartoesTodos, idLogado);
  });
  const categoriasAcessiveis = medirEtapaPerformance_(medidorPerformance, "filtrar_categorias_acessiveis", function() {
    return filtrarCategoriasAcessiveisLancamento_(categoriasTodas, idLogado);
  });
  const projetosAcessiveis = medirEtapaPerformance_(medidorPerformance, "filtrar_projetos_acessiveis", function() {
    return filtrarProjetosAcessiveisLancamento_(projetosTodos, idLogado, papelLogado);
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
    pagamentosFaturasTodos: pagamentosFaturasTodos,

    usuariosAtivosSanitizados: usuariosAtivosSanitizados,
    contasAcessiveis: contasAcessiveis,
    cartoesAcessiveis: cartoesAcessiveis,
    categoriasAcessiveis: categoriasAcessiveis,
    projetosAcessiveis: projetosAcessiveis,
    origemContexto: origemContexto || "MODELS"
  };
}


/**
 * Valida campos básicos do lançamento.
 *
 * @param {Object} dados Dados do formulário.
 */
function validarCamposBasicosLancamento_(dados) {
  if (!dados) {
    throw new Error("Dados do lançamento não recebidos.");
  }

  const tipo = normalizarTextoLancamento_(dados.Tipo);
  const descricao = normalizarTextoLancamento_(dados.Descricao);
  const dataOcorrencia = normalizarTextoLancamento_(dados.Data_Ocorrencia);
  const categoria = normalizarTextoLancamento_(dados.ID_Categoria);
  const tipoOrigem = normalizarTextoLancamento_(dados.Tipo_Origem);
  const origem = normalizarTextoLancamento_(dados.ID_Origem);
  const destino = normalizarTextoLancamento_(dados.ID_Destino);
  const status = normalizarTextoLancamento_(dados.Status);
  const valor = converterValorLancamento_(dados.Valor_Total);

  const tiposPermitidos = ["Despesa", "Receita", "Transferência"];
  const origensPermitidas = ["Conta", "Cartão"];
  const statusPermitidos = ["Efetivado", "Pendente"];

  if (tiposPermitidos.indexOf(tipo) === -1) {
    throw new Error("Tipo de lançamento inválido.");
  }

  if (!descricao) {
    throw new Error("A descrição é obrigatória.");
  }

  if (!dataOcorrencia || !/^\d{4}-\d{2}-\d{2}$/.test(dataOcorrencia)) {
    throw new Error("A data da ocorrência deve estar no formato AAAA-MM-DD.");
  }

  if (isNaN(valor) || valor <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }

  if (tipo !== "Transferência" && !categoria) {
    throw new Error("A categoria é obrigatória.");
  }

  if (origensPermitidas.indexOf(tipoOrigem) === -1) {
    throw new Error("Tipo de origem inválido.");
  }

  if (!origem) {
    throw new Error("A origem/destino é obrigatória.");
  }

  if (tipo === "Transferência") {
    if (tipoOrigem !== "Conta") {
      throw new Error("Transferências usam apenas contas como origem.");
    }

    if (!destino) {
      throw new Error("Selecione a conta de destino da transferência.");
    }

    if (origem === destino) {
      throw new Error("A conta de origem deve ser diferente da conta de destino.");
    }
  }

  if (statusPermitidos.indexOf(status) === -1) {
    throw new Error("Status de lançamento inválido.");
  }
}


/**
 * Valida as chaves estrangeiras do lançamento usando dados já carregados no contexto.
 *
 * @param {Object} lancamento Lançamento normalizado.
 * @param {Object} contexto Contexto otimizado.
 */
function validarChavesEstrangeirasLancamento_(lancamento, contexto) {
  if (lancamento.Tipo !== "Transferência") {
    const categoria = contexto.categoriasAcessiveis.find(function(item) {
      return item.ID_Categoria === lancamento.ID_Categoria;
    });

    if (!categoria) {
      throw new Error("Categoria inválida, inativa ou inacessível.");
    }

    if (categoria.Tipo !== lancamento.Tipo) {
      throw new Error("A categoria selecionada não corresponde ao tipo do lançamento.");
    }
  }

  if (lancamento.Tipo === "Transferência") {
    const contaOrigem = contexto.contasAcessiveis.find(function(item) {
      return item.ID_Conta === lancamento.ID_Origem;
    });
    const contaDestino = contexto.contasAcessiveis.find(function(item) {
      return item.ID_Conta === lancamento.ID_Destino;
    });

    if (!contaOrigem) {
      throw new Error("Conta de origem inválida, inativa ou inacessível.");
    }

    if (!contaDestino) {
      throw new Error("Conta de destino inválida, inativa ou inacessível.");
    }
  } else if (lancamento.Tipo_Origem === "Conta") {
    const conta = contexto.contasAcessiveis.find(function(item) {
      return item.ID_Conta === lancamento.ID_Origem;
    });

    if (!conta) {
      throw new Error("Conta inválida, inativa ou inacessível.");
    }
  }

  if (lancamento.Tipo_Origem === "Cartão") {
    const cartao = contexto.cartoesAcessiveis.find(function(item) {
      return item.ID_Cartao === lancamento.ID_Origem;
    });

    if (!cartao) {
      throw new Error("Cartão inválido, inativo ou inacessível.");
    }
  }

  if (lancamento.ID_Projeto) {
    const projeto = contexto.projetosAcessiveis.find(function(item) {
      return item.ID_Projeto === lancamento.ID_Projeto;
    });

    if (!projeto) {
      throw new Error("Projeto inválido, concluído ou inacessível.");
    }
  }
}


/**
 * Calcula novos rateios do lançamento.
 *
 * @param {Object} lancamento Lançamento já validado.
 * @param {Object} dadosFormulario Dados do formulário.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Array<Object>} Rateios prontos para gravação.
 */
function calcularNovosRateiosLancamento_(lancamento, dadosFormulario, contexto) {
  const participantes = obterParticipantesRateioFormulario_(dadosFormulario);
  const modo = normalizarTextoLancamento_(dadosFormulario.Modo_Rateio || dadosFormulario.Modo_Divisao);
  const credor = determinarCredorRateioLancamento_(lancamento, contexto);
  const observacao = normalizarTextoLancamento_(dadosFormulario.Observacao_Rateio || dadosFormulario.Observacao);
  const agora = new Date().toLocaleString("pt-BR");

  validarParticipantesRateioLancamento_(participantes, contexto, lancamento);

  let calculados = [];

  if (modo === "Igual") {
    calculados = calcularRateioIgualLancamento_(lancamento, participantes);
  } else if (modo === "Valor") {
    calculados = calcularRateioPorValorLancamento_(lancamento, participantes);
  } else if (modo === "Percentual") {
    calculados = calcularRateioPorPercentualLancamento_(lancamento, participantes);
  } else {
    throw new Error("Modo de rateio inválido.");
  }

  return calculados.map(function(item) {
    return {
      ID_Rateio: Utilities.getUuid(),
      ID_Lancamento: lancamento.ID_Lancamento,
      ID_Usuario_Responsavel: item.ID_Usuario_Responsavel,
      ID_Usuario_Credor: credor,
      Valor_Rateado: item.Valor_Rateado,
      Percentual: item.Percentual,
      Status: "Pendente",
      Criado_Por_ID: contexto.idLogado,
      Data_Criacao: agora,
      Alterado_Por_ID: "",
      Data_Alteracao: "",
      Observacao: observacao,
      Modo_Rateio: modo
    };
  });
}


/**
 * Determina o credor padrão do rateio.
 *
 * Regra:
 * - Se saiu de cartão, o credor é o titular do grupo/fatura.
 * - Se saiu de conta, o credor é o autor do lançamento.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {string} ID_Usuario do credor.
 */
function determinarCredorRateioLancamento_(lancamento, contexto) {
  if (lancamento.Tipo_Origem === "Cartão") {
    const cartao = contexto.cartoesTodos.find(function(item) {
      return item.ID_Cartao === lancamento.ID_Origem;
    });

    if (!cartao || !cartao.ID_Titular) {
      throw new Error("Não foi possível identificar o titular da fatura do cartão.");
    }

    return cartao.ID_Titular;
  }

  if (lancamento.Tipo_Origem === "Conta") {
    const conta = contexto.contasTodas.find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === normalizarTextoLancamento_(lancamento.ID_Origem);
    });

    if (!conta || !conta.ID_Usuario) {
      throw new Error("Não foi possível identificar o dono da conta usada no lançamento.");
    }

    return normalizarTextoLancamento_(conta.ID_Usuario);
  }

  return contexto.idLogado;
}


/**
 * Valida se o lançamento pode receber rateio.
 *
 * @param {Object} lancamento Lançamento.
 */
function validarLancamentoRateavel_(lancamento) {
  if (lancamento.Tipo === "Transferência") {
    throw new Error("Transferências não recebem rateio nesta versão.");
  }

  const centavos = converterValorParaCentavosLancamento_(lancamento.Valor_Total);

  if (centavos <= 0) {
    throw new Error("Lançamento sem valor positivo não pode ser rateado.");
  }
}


/**
 * Bloqueia redefinição quando já existe rateio acertado.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {Object} contexto Contexto otimizado.
 */
function validarSemRateioAcertadoParaRedefinir_(idLancamento, contexto) {
  const possuiAcertado = contexto.rateiosTodos.some(function(rateio) {
    return rateio.ID_Lancamento === idLancamento &&
           rateio.Status === "Acertado";
  });

  if (possuiAcertado) {
    throw new Error("Este lançamento possui rateio acertado e não pode ser redefinido.");
  }
}


/**
 * Extrai participantes de rateio do formulário.
 *
 * @param {Object} dadosFormulario Dados do formulário.
 * @returns {Array<Object>} Participantes.
 */
function obterParticipantesRateioFormulario_(dadosFormulario) {
  if (Array.isArray(dadosFormulario.Participantes_Rateio)) {
    return dadosFormulario.Participantes_Rateio;
  }

  if (Array.isArray(dadosFormulario.Participantes)) {
    return dadosFormulario.Participantes;
  }

  if (Array.isArray(dadosFormulario.Rateios)) {
    return dadosFormulario.Rateios;
  }

  return [];
}


/**
 * Valida participantes do rateio.
 *
 * @param {Array<Object>} participantes Participantes.
 * @param {Object} contexto Contexto otimizado.
 * @param {Object} lancamento Lançamento do rateio.
 */
function validarParticipantesRateioLancamento_(participantes, contexto, lancamento) {
  if (!participantes || participantes.length === 0) {
    throw new Error("Selecione pelo menos um participante para o rateio.");
  }

  const usuariosAtivos = {};
  const idsUsados = {};
  const idCriador = lancamento
    ? (normalizarTextoLancamento_(lancamento.Criado_Por_ID) || contexto.idLogado)
    : contexto.idLogado;

  contexto.usuariosTodos.forEach(function(usuario) {
    const id = normalizarTextoLancamento_(usuario.ID_Usuario);

    if (id && normalizarBooleanoLancamento_(usuario.Ativo)) {
      usuariosAtivos[id] = true;
    }
  });

  participantes.forEach(function(participante) {
    const id = normalizarTextoLancamento_(participante.ID_Usuario);

    if (!id) {
      throw new Error("Há participante sem usuário informado.");
    }

    if (!usuariosAtivos[id]) {
      throw new Error("Um dos participantes não existe ou está inativo.");
    }

    if (idsUsados[id]) {
      throw new Error("O mesmo participante não pode aparecer mais de uma vez.");
    }

    idsUsados[id] = true;
  });

  if (idCriador && !idsUsados[idCriador]) {
    throw new Error("Inclua o criador do lançamento no rateio, mesmo que a parte dele seja 0, para preservar o contexto da despesa compartilhada.");
  }
}


/**
 * Calcula rateio em partes iguais.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Array<Object>} participantes Participantes.
 * @returns {Array<Object>} Rateios calculados.
 */
function calcularRateioIgualLancamento_(lancamento, participantes) {
  const totalCentavos = converterValorParaCentavosLancamento_(lancamento.Valor_Total);
  const quantidade = participantes.length;
  const base = Math.floor(totalCentavos / quantidade);

  let resto = totalCentavos - (base * quantidade);

  return participantes.map(function(participante) {
    let valorCentavos = base;

    if (resto > 0) {
      valorCentavos += 1;
      resto -= 1;
    }

    return {
      ID_Usuario_Responsavel: normalizarTextoLancamento_(participante.ID_Usuario),
      Valor_Rateado: converterCentavosParaValorLancamento_(valorCentavos),
      Percentual: calcularPercentualLancamento_(valorCentavos, totalCentavos)
    };
  });
}


/**
 * Calcula rateio por valores informados.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Array<Object>} participantes Participantes.
 * @returns {Array<Object>} Rateios calculados.
 */
function calcularRateioPorValorLancamento_(lancamento, participantes) {
  const totalCentavos = converterValorParaCentavosLancamento_(lancamento.Valor_Total);

  let soma = 0;

  const calculados = participantes.map(function(participante) {
    const valorCentavos = converterValorParaCentavosLancamento_(participante.Valor_Rateado);

    if (valorCentavos < 0) {
      throw new Error("Valores rateados não podem ser negativos.");
    }

    soma += valorCentavos;

    return {
      ID_Usuario_Responsavel: normalizarTextoLancamento_(participante.ID_Usuario),
      Valor_Rateado: converterCentavosParaValorLancamento_(valorCentavos),
      Percentual: calcularPercentualLancamento_(valorCentavos, totalCentavos)
    };
  });

  if (soma !== totalCentavos) {
    throw new Error("A soma dos valores rateados deve ser igual ao valor total do lançamento.");
  }

  if (soma <= 0) {
    throw new Error("Informe pelo menos um valor rateado maior que zero.");
  }

  return calculados;
}


/**
 * Calcula rateio por percentuais informados.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Array<Object>} participantes Participantes.
 * @returns {Array<Object>} Rateios calculados.
 */
function calcularRateioPorPercentualLancamento_(lancamento, participantes) {
  const totalCentavos = converterValorParaCentavosLancamento_(lancamento.Valor_Total);

  let somaPercentual = 0;
  let somaCentavos = 0;

  const calculados = participantes.map(function(participante, indice) {
    const percentual = converterValorLancamento_(participante.Percentual);

    if (percentual < 0) {
      throw new Error("Percentuais de rateio não podem ser negativos.");
    }

    somaPercentual += percentual;

    let valorCentavos = Math.round(totalCentavos * (percentual / 100));

    if (indice === participantes.length - 1) {
      valorCentavos = totalCentavos - somaCentavos;
    }

    somaCentavos += valorCentavos;

    return {
      ID_Usuario_Responsavel: normalizarTextoLancamento_(participante.ID_Usuario),
      Valor_Rateado: converterCentavosParaValorLancamento_(valorCentavos),
      Percentual: percentual
    };
  });

  if (Math.abs(somaPercentual - 100) > 0.01) {
    throw new Error("A soma dos percentuais deve ser 100%.");
  }

  if (!calculados.some(function(item) {
    return converterValorParaCentavosLancamento_(item.Valor_Rateado) > 0;
  })) {
    throw new Error("Informe pelo menos um participante com percentual maior que zero.");
  }

  return calculados;
}


/**
 * Filtra usuários ativos e remove dados sensíveis.
 *
 * @param {Array<Object>} usuarios Lista completa de usuários.
 * @returns {Array<Object>} Usuários seguros para a View.
 */
function filtrarUsuariosAtivosParaLancamentos_(usuarios) {
  return usuarios
    .filter(function(usuario) {
      return normalizarBooleanoLancamento_(usuario.Ativo);
    })
    .map(function(usuario) {
      return {
        ID_Usuario: normalizarTextoLancamento_(usuario.ID_Usuario),
        Nome: normalizarTextoLancamento_(usuario.Nome),
        Email: normalizarTextoLancamento_(usuario.Email),
        Papel: normalizarTextoLancamento_(usuario.Papel)
      };
    });
}


/**
 * Filtra contas acessíveis.
 *
 * @param {Array<Object>} contas Contas.
 * @param {string} idLogado ID do usuário logado.
 * @returns {Array<Object>} Contas acessíveis.
 */
function filtrarContasAcessiveisLancamento_(contas, idLogado) {
  return contas.filter(function(conta) {
    if (!normalizarBooleanoLancamento_(conta.Ativa)) {
      return false;
    }

    return usuarioPodeUsarContaLancamento_(conta, idLogado);
  });
}


/**
 * Filtra cartões físicos acessíveis para lançamento.
 *
 * Regra:
 * - Titular do grupo/fatura pode lançar em qualquer cartão físico do grupo.
 * - Adicional só pode lançar no próprio cartão físico.
 *
 * @param {Array<Object>} cartoes Cartões físicos enriquecidos.
 * @param {string} idLogado ID do usuário logado.
 * @returns {Array<Object>} Cartões acessíveis.
 */
function filtrarCartoesAcessiveisLancamento_(cartoes, idLogado) {
  return cartoes.filter(function(cartao) {
    const cartaoAtivo = normalizarBooleanoLancamento_(cartao.Ativo);
    const grupoAtivo = normalizarBooleanoLancamento_(cartao.Grupo_Ativo);
    const usuarioDoCartao = normalizarTextoLancamento_(cartao.ID_Usuario);
    const titularDoGrupo = normalizarTextoLancamento_(cartao.ID_Titular);

    if (!cartaoAtivo || !grupoAtivo) {
      return false;
    }

    if (titularDoGrupo === idLogado) {
      return true;
    }

    return usuarioDoCartao === idLogado;
  });
}


/**
 * Filtra categorias acessíveis.
 *
 * @param {Array<Object>} categorias Categorias.
 * @param {string} idLogado ID do usuário logado.
 * @returns {Array<Object>} Categorias acessíveis.
 */
function filtrarCategoriasAcessiveisLancamento_(categorias, idLogado) {
  return categorias.filter(function(categoria) {
    const dono = normalizarTextoLancamento_(categoria.Criado_Por);
    const global = normalizarBooleanoLancamento_(categoria.Global);
    const ativa = normalizarBooleanoLancamento_(categoria.Ativa);

    return ativa && (global || dono === idLogado);
  });
}


/**
 * Filtra projetos acessíveis.
 *
 * @param {Array<Object>} projetos Projetos.
 * @param {string} idLogado ID do usuário logado.
 * @param {string} papelLogado Papel do usuário logado.
 * @returns {Array<Object>} Projetos acessíveis.
 */
function filtrarProjetosAcessiveisLancamento_(projetos, idLogado, papelLogado) {
  return projetos.filter(function(projeto) {
    const ativo = normalizarBooleanoLancamento_(projeto.Status);

    if (!ativo) return false;

    if (papelLogado === "Administrador") {
      return true;
    }

    const dono = normalizarTextoLancamento_(projeto.Criado_Por);
    const compartilhados = normalizarTextoLancamento_(projeto.Usuarios_Compartilhados);

    return dono === idLogado || listaTextoContemIdLancamento_(compartilhados, idLogado);
  });
}




/**
 * Verifica se o usuário pode usar uma conta como origem em lançamentos.
 *
 * @param {Object} conta Conta.
 * @param {string} idUsuario ID do usuário.
 * @returns {boolean} True quando pode usar.
 */
function usuarioPodeUsarContaLancamento_(conta, idUsuario) {
  const id = normalizarTextoLancamento_(idUsuario);
  const dono = normalizarTextoLancamento_(conta.ID_Usuario);

  if (dono === id) {
    return true;
  }

  if (!normalizarBooleanoLancamento_(conta.Compartilhada)) {
    return false;
  }

  return listaTextoContemIdLancamento_(conta.Usuarios_Compartilhados, id);
}


/**
 * Verifica se o usuário logado pode gerenciar o lançamento.
 *
 * Regras:
 * - Autor do lançamento pode editar/excluir.
 * - Dono da conta pode editar/excluir lançamentos feitos naquela conta compartilhada.
 * - Titular do grupo/fatura pode editar/excluir lançamentos feitos em qualquer cartão físico do grupo.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {boolean} True quando pode gerenciar.
 */
function usuarioPodeGerenciarLancamento_(lancamento, contexto) {
  if (!lancamento || !contexto) return false;

  const idAutor = normalizarTextoLancamento_(lancamento.Criado_Por_ID);

  if (idAutor && idAutor === contexto.idLogado) {
    return true;
  }

  return usuarioPodeGerenciarOrigemLancamento_(lancamento, contexto);
}


/**
 * Verifica se o usuário logado é gestor da origem do lançamento.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {boolean} True quando gerencia a origem.
 */
function usuarioPodeGerenciarOrigemLancamento_(lancamento, contexto) {
  const tipoOrigem = normalizarTextoLancamento_(lancamento.Tipo_Origem);
  const idOrigem = normalizarTextoLancamento_(lancamento.ID_Origem);
  const idDestino = normalizarTextoLancamento_(lancamento.ID_Destino);

  if (normalizarTextoLancamento_(lancamento.Tipo) === "Transferência") {
    return usuarioPodeGerenciarContaLancamento_(idOrigem, contexto) ||
           usuarioPodeGerenciarContaLancamento_(idDestino, contexto);
  }

  if (tipoOrigem === "Conta") {
    return usuarioPodeGerenciarContaLancamento_(idOrigem, contexto);
  }

  if (tipoOrigem === "Cartão") {
    const cartao = (contexto.cartoesTodos || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Cartao) === idOrigem;
    });

    return !!cartao && normalizarTextoLancamento_(cartao.ID_Titular) === contexto.idLogado;
  }

  return false;
}


/**
 * Verifica se o usuário pode visualizar a origem do lançamento sem, necessariamente,
 * ganhar permissão de gestão.
 *
 * Regra:
 * - Em cartão, o titular do grupo/fatura continua vendo todos os cartões físicos do grupo.
 * - O dono do cartão físico adicional também pode ver todos os lançamentos do próprio cartão,
 *   mesmo quando o lançamento foi criado por outro usuário autorizado, como o titular.
 *
 * @param {Object} lancamento Lançamento avaliado.
 * @param {Object} contexto Contexto otimizado.
 * @returns {boolean} True quando a origem é visível ao usuário logado.
 */
function usuarioPodeVisualizarOrigemLancamento_(lancamento, contexto) {
  const tipoOrigem = normalizarTextoLancamento_(lancamento.Tipo_Origem);
  const idOrigem = normalizarTextoLancamento_(lancamento.ID_Origem);

  if (tipoOrigem !== "Cartão") {
    return false;
  }

  const cartao = (contexto.cartoesTodos || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Cartao) === idOrigem;
  });

  if (!cartao) {
    return false;
  }

  const titularDoGrupo = normalizarTextoLancamento_(cartao.ID_Titular);
  const donoCartao = normalizarTextoLancamento_(cartao.ID_Usuario);

  return titularDoGrupo === contexto.idLogado || donoCartao === contexto.idLogado;
}


function usuarioPodeGerenciarContaLancamento_(idConta, contexto) {
  const id = normalizarTextoLancamento_(idConta);
  const conta = (contexto.contasTodas || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Conta) === id;
  });

  return !!conta && normalizarTextoLancamento_(conta.ID_Usuario) === contexto.idLogado;
}


/**
 * Obtém lançamentos que devem ser excluídos conforme escopo escolhido.
 *
 * @param {Object} lancamento Lançamento de referência.
 * @param {string} escopo Escopo: Esta ou EstaEProximas.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Array<Object>} Lançamentos alvo.
 */
function obterLancamentosParaExclusaoPorEscopo_(lancamento, escopo, contexto) {
  if (!lancamentoEhParcelaLancamento_(lancamento) || escopo !== "EstaEProximas") {
    return [lancamento];
  }

  const idGrupo = normalizarTextoLancamento_(lancamento.ID_Grupo_Parcela);
  const numeroAtual = normalizarInteiroPositivoLancamento_(lancamento.Numero_Parcela);

  return contexto.lancamentosTodos
    .filter(function(item) {
      return normalizarTextoLancamento_(item.ID_Grupo_Parcela) === idGrupo &&
             normalizarInteiroPositivoLancamento_(item.Numero_Parcela) >= numeroAtual;
    })
    .sort(function(a, b) {
      return normalizarInteiroPositivoLancamento_(a.Numero_Parcela) -
             normalizarInteiroPositivoLancamento_(b.Numero_Parcela);
    });
}


/**
 * Retorna mapa de usuários elegíveis para rateio no contexto do lançamento.
 *
 * Regra de negocio:
 * - O rateio e um compartilhamento proprio da despesa ou receita.
 * - Conta, cartao e projeto nao restringem os participantes do rateio.
 * - Apenas usuarios ativos podem participar.
 * - O criador continua obrigatorio no rateio.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Object} Mapa ID_Usuario -> true.
 */
function obterMapaUsuariosElegiveisRateioLancamento_(lancamento, contexto) {
  const mapa = {};

  (contexto.usuariosTodos || []).forEach(function(usuario) {
    const id = normalizarTextoLancamento_(usuario.ID_Usuario);

    if (id && normalizarBooleanoLancamento_(usuario.Ativo)) {
      mapa[id] = true;
    }
  });

  return mapa;
}


/**
 * Obtém o conjunto de usuários elegíveis pelo contexto da origem.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Object|null} Mapa ID_Usuario -> true, ou null quando não houver origem válida.
 */
function obterConjuntoElegivelPorOrigemRateioLancamento_(lancamento, contexto) {
  const tipoOrigem = normalizarTextoLancamento_(lancamento.Tipo_Origem);
  const idOrigem = normalizarTextoLancamento_(lancamento.ID_Origem);

  if (tipoOrigem === "Conta") {
    const conta = (contexto.contasTodas || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === idOrigem;
    });

    if (!conta) {
      return null;
    }

    const conjuntoConta = {};

    adicionarUsuarioElegivelRateioLancamento_(conjuntoConta, conta.ID_Usuario);

    if (normalizarBooleanoLancamento_(conta.Compartilhada)) {
      adicionarListaUsuariosElegiveisRateioLancamento_(conjuntoConta, conta.Usuarios_Compartilhados);
    }

    return conjuntoConta;
  }

  if (tipoOrigem === "Cartão") {
    const cartaoOrigem = (contexto.cartoesTodos || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Cartao) === idOrigem;
    });

    if (!cartaoOrigem) {
      return null;
    }

    const conjuntoCartao = {};
    const idGrupo = normalizarTextoLancamento_(cartaoOrigem.ID_Grupo_Cartao);

    adicionarUsuarioElegivelRateioLancamento_(conjuntoCartao, cartaoOrigem.ID_Titular);

    (contexto.cartoesTodos || []).forEach(function(cartao) {
      const mesmoGrupo = normalizarTextoLancamento_(cartao.ID_Grupo_Cartao) === idGrupo;
      const cartaoAtivo = normalizarBooleanoLancamento_(cartao.Ativo);
      const grupoAtivo = normalizarBooleanoLancamento_(cartao.Grupo_Ativo);

      if (mesmoGrupo && cartaoAtivo && grupoAtivo) {
        adicionarUsuarioElegivelRateioLancamento_(conjuntoCartao, cartao.ID_Usuario);
      }
    });

    return conjuntoCartao;
  }

  return null;
}


/**
 * Adiciona um usuário ao mapa de elegíveis do rateio.
 *
 * Função de backend equivalente ao helper da View. Ela existe para manter
 * a validação real no servidor e evitar que a regra de rateio dependa
 * apenas da interface.
 *
 * @param {Object} mapa Mapa ID_Usuario -> true.
 * @param {*} idUsuario ID do usuário a adicionar.
 */
function adicionarUsuarioElegivelRateioLancamento_(mapa, idUsuario) {
  const idNormalizado = normalizarTextoLancamento_(idUsuario);

  if (!mapa || !idNormalizado) {
    return;
  }

  mapa[idNormalizado] = true;
}


/**
 * Adiciona uma lista de usuários ao mapa de elegíveis do rateio.
 *
 * Aceita tanto texto separado por vírgula quanto array, porque os vínculos
 * de compartilhamento podem vir da planilha como string ou de estruturas
 * já normalizadas em memória.
 *
 * @param {Object} mapa Mapa ID_Usuario -> true.
 * @param {*} listaIds Lista ou texto com IDs de usuários.
 */
function adicionarListaUsuariosElegiveisRateioLancamento_(mapa, listaIds) {
  if (!mapa || listaIds === null || listaIds === undefined || listaIds === '') {
    return;
  }

  const itens = Array.isArray(listaIds)
    ? listaIds
    : listaIds.toString().split(',');

  itens.forEach(function(idUsuario) {
    adicionarUsuarioElegivelRateioLancamento_(mapa, idUsuario);
  });
}



/**
 * Intersecciona os conjuntos de usuários elegíveis.
 *
 * @param {Array<Object>} conjuntos Lista de mapas ID_Usuario -> true.
 * @returns {Object} Mapa final ID_Usuario -> true.
 */
function interseccionarConjuntosUsuariosElegiveisRateioLancamento_(conjuntos) {
  if (!conjuntos || conjuntos.length === 0) {
    return {};
  }

  const resultado = {};
  const primeiro = conjuntos[0] || {};

  Object.keys(primeiro).forEach(function(idUsuario) {
    const presenteEmTodos = conjuntos.every(function(conjunto) {
      return conjunto && conjunto[idUsuario] === true;
    });

    if (presenteEmTodos) {
      resultado[idUsuario] = true;
    }
  });

  return resultado;
}


/**
 * Mapeia lançamentos em que o usuário logado participa por rateio ativo.
 *
 * @param {Array<Object>} rateios Lista de rateios.
 * @param {string} idLogado ID do usuário logado.
 * @returns {Object} Mapa de ID_Lancamento para true.
 */
function mapearIdsLancamentosComRateioDoUsuario_(rateios, idLogado) {
  const mapa = {};
  const idUsuario = normalizarTextoLancamento_(idLogado);

  (rateios || []).forEach(function(rateio) {
    const status = normalizarTextoLancamento_(rateio.Status);
    const responsavel = normalizarTextoLancamento_(rateio.ID_Usuario_Responsavel);
    const credor = normalizarTextoLancamento_(rateio.ID_Usuario_Credor);
    const idLancamento = normalizarTextoLancamento_(rateio.ID_Lancamento);

    if (status === "Cancelado" || !idLancamento) {
      return;
    }

    if (responsavel === idUsuario || credor === idUsuario) {
      mapa[idLancamento] = true;
    }
  });

  return mapa;
}


function montarLancamentosPagamentoFaturaParaTela_(contexto) {
  const contasAcessiveis = {};
  const gruposCartao = {};

  (contexto.contasAcessiveis || []).forEach(function(conta) {
    contasAcessiveis[normalizarTextoLancamento_(conta.ID_Conta)] = conta;
  });

  (contexto.cartoesTodos || []).forEach(function(cartao) {
    const idGrupo = normalizarTextoLancamento_(cartao.ID_Grupo_Cartao);

    if (idGrupo && !gruposCartao[idGrupo]) {
      gruposCartao[idGrupo] = normalizarTextoLancamento_(cartao.Nome_Grupo) || "Fatura";
    }
  });

  return (contexto.pagamentosFaturasTodos || []).filter(function(pagamento) {
    const idConta = normalizarTextoLancamento_(pagamento.ID_Conta);
    return contasAcessiveis[idConta] !== undefined;
  }).map(function(pagamento) {
    const idPagamento = normalizarTextoLancamento_(pagamento.ID_Pagamento_Fatura);
    const idGrupo = normalizarTextoLancamento_(pagamento.ID_Grupo_Cartao);
    const nomeGrupo = gruposCartao[idGrupo] || "Fatura";
    const mesReferencia = normalizarMesPagamentoFaturaLancamento_(pagamento.Data_Pagamento || pagamento.Mes_Referencia);

    return {
      ID_Lancamento: "pagamento-fatura:" + idPagamento,
      ID_Pagamento_Fatura: idPagamento,
      Origem_Registro: "Pagamento_Fatura",
      _Pagamento_Fatura: true,
      Tipo: "Transferência",
      Descricao: "Pagamento de fatura - " + nomeGrupo,
      Valor_Total: converterValorLancamento_(pagamento.Valor),
      Data_Ocorrencia: normalizarTextoLancamento_(pagamento.Data_Pagamento),
      Mes_Referencia: mesReferencia,
      ID_Categoria: "",
      ID_Projeto: "",
      Tipo_Origem: "Conta",
      ID_Origem: normalizarTextoLancamento_(pagamento.ID_Conta),
      ID_Destino: "",
      ID_Grupo_Cartao: idGrupo,
      Nome_Grupo_Cartao: nomeGrupo,
      Status: normalizarTextoLancamento_(pagamento.Status) || "Efetivado",
      Observacao: normalizarTextoLancamento_(pagamento.Observacao),
      Criado_Por_ID: normalizarTextoLancamento_(pagamento.Criado_Por_ID),
      Alterado_Por_ID: normalizarTextoLancamento_(pagamento.Alterado_Por_ID),
      Data_Criacao: normalizarTextoLancamento_(pagamento.Data_Criacao),
      Data_Alteracao: normalizarTextoLancamento_(pagamento.Data_Alteracao)
    };
  });
}


function normalizarMesPagamentoFaturaLancamento_(valor) {
  const texto = normalizarTextoLancamento_(valor);

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto.substring(0, 7);
  }

  if (/^\d{4}-\d{2}$/.test(texto)) {
    return texto;
  }

  return "";
}


/**
 * Enriquece lançamento para a View com permissões e nomes de exibição.
 *
 * @param {Object} lancamento Lançamento original.
 * @param {Object} contexto Contexto otimizado.
 * @param {Object} idsLancamentosComRateioDoUsuario Mapa de participação por rateio.
 * @param {Array<Object>} rateiosVisiveis Rateios ativos dos lançamentos visíveis.
 * @returns {Object} Lançamento seguro para a tela.
 */
function enriquecerLancamentoParaTela_(lancamento, contexto, idsLancamentosComRateioDoUsuario, rateiosVisiveis) {
  if (lancamento && lancamento._Pagamento_Fatura === true) {
    return enriquecerPagamentoFaturaLancamentoParaTela_(lancamento, contexto);
  }

  const idLancamento = normalizarTextoLancamento_(lancamento.ID_Lancamento);
  const ehProgramadoRecorrencia = lancamento._Programado_Recorrencia === true;
  const idAutor = normalizarTextoLancamento_(lancamento.Criado_Por_ID);
  const ehAutor = idAutor === contexto.idLogado;
  const podeGerenciar = ehProgramadoRecorrencia ? false : usuarioPodeGerenciarLancamento_(lancamento, contexto);
  const compartilhadoPorRateio = !ehAutor && idsLancamentosComRateioDoUsuario[idLancamento] === true;
  const usuarioAutor = buscarUsuarioPorIdLancamento_(contexto.usuariosTodos, idAutor);
  const rateiosDoLancamento = filtrarRateiosAtivosDoLancamentoTela_(rateiosVisiveis, idLancamento);
  const resumoRateioUsuario = calcularResumoRateioUsuarioLancamentoTela_(
    rateiosDoLancamento,
    contexto.idLogado
  );
  const possuiRateio = rateiosDoLancamento.length > 0;

  const lancamentoTela = {};

  Object.keys(lancamento).forEach(function(chave) {
    lancamentoTela[chave] = lancamento[chave];
  });

  lancamentoTela.Eh_Autor = ehAutor;
  lancamentoTela.Eh_Compartilhado_Por_Rateio = compartilhadoPorRateio;
  lancamentoTela.Pode_Editar = podeGerenciar;
  lancamentoTela.Pode_Excluir = podeGerenciar;
  lancamentoTela.Somente_Leitura = ehProgramadoRecorrencia;
  lancamentoTela.Eh_Gestor_Origem = podeGerenciar && !ehAutor;
  lancamentoTela.Nome_Autor = usuarioAutor ? normalizarTextoLancamento_(usuarioAutor.Nome) : "Usuário";
  lancamentoTela.Nome_Categoria_Visualizacao = obterNomeCategoriaVisualizacaoLancamento_(lancamento, contexto);
  lancamentoTela.Nome_Projeto_Visualizacao = obterNomeProjetoVisualizacaoLancamento_(lancamento, contexto);
  lancamentoTela.Nome_Origem_Visualizacao = obterNomeOrigemVisualizacaoLancamento_(lancamento, contexto);
  lancamentoTela.Possui_Rateio = possuiRateio;
  lancamentoTela.Valor_Total_Original = converterValorLancamento_(lancamento.Valor_Total);
  lancamentoTela.Valor_A_Pagar_Rateio = resumoRateioUsuario.valorAPagar;
  lancamentoTela.Valor_A_Receber_Rateio = resumoRateioUsuario.valorAReceber;
  lancamentoTela.Saldo_Rateio_Usuario = resumoRateioUsuario.saldo;
  lancamentoTela.Valor_Exibicao = possuiRateio
    ? resumoRateioUsuario.valorAPagar
    : converterValorLancamento_(lancamento.Valor_Total);
  lancamentoTela.Rotulo_Valor_Exibicao = possuiRateio
    ? obterRotuloValorExibicaoRateioLancamento_(lancamento)
    : "Valor total";
  lancamentoTela.Resumo_Rateio_Usuario = resumoRateioUsuario.mensagem;

  return lancamentoTela;
}


function enriquecerPagamentoFaturaLancamentoParaTela_(lancamento, contexto) {
  const lancamentoTela = {};
  const idConta = normalizarTextoLancamento_(lancamento.ID_Origem);
  const conta = (contexto.contasTodas || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Conta) === idConta;
  });
  const nomeConta = conta ? normalizarTextoLancamento_(conta.Nome_Conta) : "Conta";
  const nomeGrupo = normalizarTextoLancamento_(lancamento.Nome_Grupo_Cartao) || "Fatura";

  Object.keys(lancamento).forEach(function(chave) {
    lancamentoTela[chave] = lancamento[chave];
  });

  lancamentoTela.Eh_Autor = true;
  lancamentoTela.Eh_Compartilhado_Por_Rateio = false;
  lancamentoTela.Pode_Editar = true;
  lancamentoTela.Pode_Excluir = true;
  lancamentoTela.Somente_Leitura = false;
  lancamentoTela.Eh_Gestor_Origem = false;
  lancamentoTela.Nome_Autor = "Sistema";
  lancamentoTela.Nome_Categoria_Visualizacao = "Pagamento de fatura";
  lancamentoTela.Nome_Projeto_Visualizacao = "";
  lancamentoTela.Nome_Origem_Visualizacao = nomeConta + " -> " + nomeGrupo;
  lancamentoTela.Possui_Rateio = false;
  lancamentoTela.Valor_Total_Original = converterValorLancamento_(lancamento.Valor_Total);
  lancamentoTela.Valor_A_Pagar_Rateio = 0;
  lancamentoTela.Valor_A_Receber_Rateio = 0;
  lancamentoTela.Saldo_Rateio_Usuario = 0;
  lancamentoTela.Valor_Exibicao = converterValorLancamento_(lancamento.Valor_Total);
  lancamentoTela.Rotulo_Valor_Exibicao = "Pagamento de fatura";
  lancamentoTela.Resumo_Rateio_Usuario = "Pagamento de fatura nao entra no orcamento; apenas reduz a conta e abate o saldo do cartao.";

  return lancamentoTela;
}


/**
 * Define o rótulo do valor exibido na tabela para lançamentos rateados.
 *
 * @param {Object} lancamento Lançamento original.
 * @returns {string} Rótulo adequado ao tipo do lançamento.
 */
function obterRotuloValorExibicaoRateioLancamento_(lancamento) {
  const tipo = normalizarTextoLancamento_(lancamento.Tipo);

  if (tipo === "Receita") {
    return "Valor a receber";
  }

  return "Valor devido";
}


/**
 * Filtra rateios ativos de um lançamento para cálculo de exibição.
 *
 * @param {Array<Object>} rateios Rateios visíveis.
 * @param {string} idLancamento ID do lançamento.
 * @returns {Array<Object>} Rateios ativos.
 */
function filtrarRateiosAtivosDoLancamentoTela_(rateios, idLancamento) {
  const id = normalizarTextoLancamento_(idLancamento);

  return (rateios || []).filter(function(rateio) {
    return normalizarTextoLancamento_(rateio.ID_Lancamento) === id &&
           normalizarTextoLancamento_(rateio.Status) !== "Cancelado";
  });
}


/**
 * Calcula o resumo financeiro do usuario logado em um lancamento rateado.
 *
 * @param {Array<Object>} rateios Rateios ativos do lancamento.
 * @param {string} idLogado ID do usuario logado.
 * @returns {Object} Valores de pagar, receber, saldo e textos para a tela.
 */
function calcularResumoRateioUsuarioLancamentoTela_(rateios, idLogado) {
  const idUsuario = normalizarTextoLancamento_(idLogado);
  let valorAPagar = 0;
  let valorAReceber = 0;

  (rateios || []).forEach(function(rateio) {
    const responsavel = normalizarTextoLancamento_(rateio.ID_Usuario_Responsavel);
    const credor = normalizarTextoLancamento_(rateio.ID_Usuario_Credor);
    const valor = converterValorLancamento_(rateio.Valor_Rateado);

    if (responsavel === idUsuario) {
      valorAPagar += valor;
    }

    if (credor === idUsuario && responsavel !== idUsuario) {
      valorAReceber += valor;
    }
  });

  const saldo = valorAReceber - valorAPagar;
  let rotulo = "Rateio quitado";
  let mensagem = "Neste rateio, voce nao tem valor liquido a pagar ou receber.";

  if (saldo < 0) {
    rotulo = "A pagar";
    mensagem = "Voce precisa pagar R$ " + formatarNumeroLancamentoController_(Math.abs(saldo)) + " neste rateio.";
  } else if (saldo > 0) {
    rotulo = "A receber";
    mensagem = "Voce precisa receber R$ " + formatarNumeroLancamentoController_(saldo) + " neste rateio.";
  }

  return {
    valorAPagar: arredondarMoedaLancamento_(valorAPagar),
    valorAReceber: arredondarMoedaLancamento_(valorAReceber),
    saldo: arredondarMoedaLancamento_(saldo),
    rotulo: rotulo,
    mensagem: mensagem
  };
}


/**
 * Formata numero para mensagens curtas do controller.
 *
 * @param {number} valor Valor numerico.
 * @returns {string} Valor com duas casas decimais.
 */
function formatarNumeroLancamentoController_(valor) {
  return arredondarMoedaLancamento_(valor).toFixed(2).replace(".", ",");
}


/**
 * Busca usuário por ID em uma lista já carregada.
 *
 * @param {Array<Object>} usuarios Lista de usuários.
 * @param {string} idUsuario ID procurado.
 * @returns {Object|null} Usuário encontrado ou null.
 */
function buscarUsuarioPorIdLancamento_(usuarios, idUsuario) {
  const id = normalizarTextoLancamento_(idUsuario);

  return (usuarios || []).find(function(usuario) {
    return normalizarTextoLancamento_(usuario.ID_Usuario) === id;
  }) || null;
}


/**
 * Obtém nome de categoria para exibição em lançamentos próprios ou rateados.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {string} Nome de exibição.
 */
function obterNomeCategoriaVisualizacaoLancamento_(lancamento, contexto) {
  if (normalizarTextoLancamento_(lancamento.Tipo) === "Transferência") {
    return "Não se aplica";
  }

  const idCategoria = normalizarTextoLancamento_(lancamento.ID_Categoria);

  if (!idCategoria) {
    return "Sem categoria";
  }

  const categoria = (contexto.categoriasTodas || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Categoria) === idCategoria;
  });

  return categoria ? normalizarTextoLancamento_(categoria.Nome) : "Categoria não encontrada";
}


/**
 * Obtém nome de projeto para exibição.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {string} Nome de exibição.
 */
function obterNomeProjetoVisualizacaoLancamento_(lancamento, contexto) {
  const idProjeto = normalizarTextoLancamento_(lancamento.ID_Projeto);

  if (!idProjeto) {
    return "";
  }

  const projeto = (contexto.projetosTodos || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Projeto) === idProjeto;
  });

  return projeto ? normalizarTextoLancamento_(projeto.Nome) : "";
}


/**
 * Obtém nome da origem para lançamento do próprio autor.
 *
 * @param {Object} lancamento Lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {string} Nome de exibição.
 */
function obterNomeOrigemVisualizacaoLancamento_(lancamento, contexto) {
  const tipoOrigem = normalizarTextoLancamento_(lancamento.Tipo_Origem);
  const idOrigem = normalizarTextoLancamento_(lancamento.ID_Origem);
  const idDestino = normalizarTextoLancamento_(lancamento.ID_Destino);

  if (normalizarTextoLancamento_(lancamento.Tipo) === "Transferência") {
    const nomeOrigem = obterNomeContaPorIdLancamento_(contexto.contasTodas, idOrigem) || "Conta de origem não encontrada";
    const nomeDestino = obterNomeContaPorIdLancamento_(contexto.contasTodas, idDestino) || "Conta de destino não encontrada";
    return nomeOrigem + " -> " + nomeDestino;
  }

  if (tipoOrigem === "Conta") {
    const conta = (contexto.contasTodas || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Conta) === idOrigem;
    });

    return conta ? normalizarTextoLancamento_(conta.Nome_Conta) : "Conta não encontrada";
  }

  if (tipoOrigem === "Cartão") {
    const cartao = (contexto.cartoesTodos || []).find(function(item) {
      return normalizarTextoLancamento_(item.ID_Cartao) === idOrigem;
    });

    return cartao ? montarNomeCartaoVisualizacaoLancamento_(cartao) : "Cartão não encontrado";
  }

  return "Origem desconhecida";
}


function obterNomeContaPorIdLancamento_(contas, idConta) {
  const id = normalizarTextoLancamento_(idConta);
  const conta = (contas || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Conta) === id;
  });

  return conta ? normalizarTextoLancamento_(conta.Nome_Conta) : "";
}


/**
 * Monta nome de cartão para exibição.
 *
 * @param {Object} cartao Cartão físico.
 * @returns {string} Nome de exibição.
 */
function montarNomeCartaoVisualizacaoLancamento_(cartao) {
  const nomeGrupo = normalizarTextoLancamento_(cartao.Nome_Grupo);
  const nomeCartao = normalizarTextoLancamento_(cartao.Nome_Cartao) || "Cartão";
  const tipoCartao = normalizarTextoLancamento_(cartao.Tipo_Cartao);

  if (nomeGrupo && nomeCartao.indexOf(nomeGrupo) === -1) {
    return nomeGrupo + " - " + nomeCartao + (tipoCartao ? " [" + tipoCartao + "]" : "");
  }

  return nomeCartao + (tipoCartao ? " [" + tipoCartao + "]" : "");
}


/**
 * Busca lançamento no contexto já carregado.
 *
 * @param {string} idLancamento ID do lançamento.
 * @param {Object} contexto Contexto otimizado.
 * @returns {Object} Lançamento encontrado.
 */
function buscarLancamentoNoContexto_(idLancamento, contexto) {
  const id = normalizarTextoLancamento_(idLancamento);

  const lancamento = contexto.lancamentosTodos.find(function(item) {
    return item.ID_Lancamento === id;
  });

  if (!lancamento) {
    throw new Error("Lançamento não encontrado.");
  }

  return lancamento;
}


/**
 * Agrupa rateios por ID_Lancamento.
 *
 * @param {Array<Object>} rateios Lista de rateios.
 * @returns {Object} Mapa por ID_Lancamento.
 */
function agruparRateiosPorLancamento_(rateios) {
  const mapa = {};

  rateios.forEach(function(rateio) {
    if (!mapa[rateio.ID_Lancamento]) {
      mapa[rateio.ID_Lancamento] = [];
    }

    mapa[rateio.ID_Lancamento].push(rateio);
  });

  return mapa;
}


/**
 * Obtém flag explícita de rateio.
 *
 * Retorno:
 * - true: salvar/redefinir rateios.
 * - false: cancelar rateios pendentes.
 * - null: preservar rateios existentes.
 *
 * @param {Object} dados Dados do formulário.
 * @returns {boolean|null} Flag normalizada.
 */
function obterFlagRateioLancamento_(dados) {
  if (
    dados.Rateio_Ativo === undefined &&
    dados.Rateado === undefined &&
    dados.Eh_Rateado === undefined
  ) {
    return null;
  }

  const valor = dados.Rateio_Ativo !== undefined
    ? dados.Rateio_Ativo
    : (dados.Rateado !== undefined ? dados.Rateado : dados.Eh_Rateado);

  return normalizarBooleanoLancamento_(valor);
}


/**
 * Converte valor para número.
 *
 * @param {*} valor Valor original.
 * @returns {number} Número.
 */
function converterValorLancamento_(valor) {
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
 * Converte valor para centavos.
 *
 * @param {*} valor Valor original.
 * @returns {number} Valor em centavos.
 */
function converterValorParaCentavosLancamento_(valor) {
  return Math.round(converterValorLancamento_(valor) * 100);
}


/**
 * Converte centavos para valor decimal.
 *
 * @param {number} centavos Centavos.
 * @returns {number} Valor decimal.
 */
function converterCentavosParaValorLancamento_(centavos) {
  return Math.round(centavos) / 100;
}


/**
 * Arredonda valores monetarios para duas casas.
 *
 * @param {number} valor Valor original.
 * @returns {number} Valor arredondado.
 */
function arredondarMoedaLancamento_(valor) {
  const numero = parseFloat(valor);
  return isNaN(numero) ? 0 : Math.round(numero * 100) / 100;
}


/**
 * Calcula percentual com duas casas.
 *
 * @param {number} parteCentavos Parte em centavos.
 * @param {number} totalCentavos Total em centavos.
 * @returns {number} Percentual.
 */
function calcularPercentualLancamento_(parteCentavos, totalCentavos) {
  if (totalCentavos <= 0) return 0;
  return Math.round((parteCentavos / totalCentavos) * 10000) / 100;
}


/**
 * Gera mês de referência.
 *
 * @param {string} dataOcorrencia Data yyyy-MM-dd.
 * @returns {string} Mês yyyy-MM.
 */
function gerarMesReferenciaLancamento_(dataOcorrencia) {
  const data = normalizarTextoLancamento_(dataOcorrencia);

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data.substring(0, 7);
  }

  return "";
}


/**
 * Deriva o mês de referência real do lançamento.
 *
 * Para cartões, o mês passa a refletir o ciclo da fatura conforme o dia de
 * fechamento do cartão. Para as demais origens, segue o mês da própria data
 * de ocorrência.
 *
 * @param {string} dataOcorrencia Data no formato yyyy-MM-dd.
 * @param {string} tipoOrigem Tipo da origem financeira.
 * @param {string} idOrigem Identificador da origem financeira.
 * @param {Object} contexto Contexto carregado do módulo.
 * @returns {string} Mês de referência no formato yyyy-MM.
 */
function obterMesReferenciaLancamentoPorContexto_(dataOcorrencia, tipoOrigem, idOrigem, contexto) {
  const data = normalizarTextoLancamento_(dataOcorrencia);
  const tipo = normalizarTextoLancamento_(tipoOrigem);
  const id = normalizarTextoLancamento_(idOrigem);
  const mesPadrao = gerarMesReferenciaLancamento_(data);

  if (tipo !== "Cartão" || !id || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return mesPadrao;
  }

  const cartao = (contexto && contexto.cartoesTodos || []).find(function(item) {
    return normalizarTextoLancamento_(item.ID_Cartao) === id;
  });
  const fechamento = parseInt(cartao && cartao.Dia_Fechamento, 10);
  const partes = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!cartao || isNaN(fechamento) || fechamento < 1 || fechamento > 31 || !partes) {
    return mesPadrao;
  }

  const ano = parseInt(partes[1], 10);
  const mes = parseInt(partes[2], 10);
  const dia = parseInt(partes[3], 10);
  const competencia = dia > fechamento
    ? new Date(ano, mes, 1)
    : new Date(ano, mes - 1, 1);

  return Utilities.formatDate(competencia, Session.getScriptTimeZone(), "yyyy-MM");
}


/**
 * Normaliza texto.
 *
 * @param {*} valor Valor original.
 * @returns {string} Texto normalizado.
 */
function normalizarTextoLancamento_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


/**
 * Normaliza booleano.
 *
 * @param {*} valor Valor original.
 * @returns {boolean} Booleano normalizado.
 */
function normalizarBooleanoLancamento_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}


/**
 * Verifica se lista textual separada por vírgula contém ID exato.
 *
 * @param {string} listaTexto Lista separada por vírgula.
 * @param {string} idBuscado ID procurado.
 * @returns {boolean} True se contém.
 */
function listaTextoContemIdLancamento_(listaTexto, idBuscado) {
  const id = normalizarTextoLancamento_(idBuscado);

  if (!listaTexto || !id) return false;

  return listaTexto
    .toString()
    .split(",")
    .map(function(item) {
      return item.trim();
    })
    .indexOf(id) !== -1;
}
