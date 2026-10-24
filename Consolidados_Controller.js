/**
 * Modulo: Consolidados_Controller.gs
 * Responsabilidade:
 * - Centralizar calculos financeiros usados pelo Dashboard e futuros relatorios.
 * - Evitar que saldos, totais, rateios e pendencias sejam recalculados de formas diferentes.
 */


function obterConsolidadoFinanceiroUsuario(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("Dashboard.obterPacote");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const filtrosNormalizados = medirEtapaPerformance_(medidor, "normalizar_filtros", function() {
    return normalizarFiltrosConsolidadosController_(filtros);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoConsolidadosController_(
      sessao,
      medidor,
      Object.assign({}, filtrosNormalizados, { Carregar_Historico_Completo: true })
    );
  });
  const lancamentosVisiveis = medirEtapaPerformance_(medidor, "filtrar_lancamentos_visiveis", function() {
    return obterLancamentosVisiveisConsolidadosController_(contexto);
  });
  const lancamentosMes = medirEtapaPerformance_(medidor, "filtrar_lancamentos_mes", function() {
    return lancamentosVisiveis.filter(function(lancamento) {
      return mesReferenciaEstaNoIntervaloConsolidadoController_(
        normalizarTextoConsolidadoController_(lancamento.Mes_Referencia),
        filtrosNormalizados.Mes_Inicial,
        filtrosNormalizados.Mes_Final
      );
    });
  });
  const lancamentosProgramadosMes = medirEtapaPerformance_(medidor, "projetar_recorrencias_mes", function() {
    return gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtrosNormalizados);
  });
  const lancamentosProgramadosPatrimonio = medirEtapaPerformance_(medidor, "projetar_recorrencias_patrimonio", function() {
    const mesAtual = gerarMesAtualConsolidadoController_();
    const mesInicialFiltro = filtrosNormalizados.Mes_Inicial || filtrosNormalizados.Mes_Referencia;
    const mesFinalFiltro = obterMesFinalEfetivoConsolidadoController_(filtrosNormalizados);
    const mesInicialProjecao = compararMesesConsolidadoController_(mesInicialFiltro, mesAtual) > 0
      ? mesAtual
      : mesInicialFiltro;

    return gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, {
      Mes_Referencia: mesInicialProjecao,
      Mes_Inicial: mesInicialProjecao,
      Mes_Final: mesFinalFiltro
    });
  });
  const rateiosPorLancamento = medirEtapaPerformance_(medidor, "agrupar_rateios", function() {
    return agruparRateiosConsolidadosController_(contexto.rateiosTodos);
  });
  const rateiosPorLancamentoComProgramados = medirEtapaPerformance_(medidor, "agrupar_rateios_programados", function() {
    return combinarRateiosLancadosEProgramadosConsolidadoController_(
      rateiosPorLancamento,
      lancamentosProgramadosMes.rateiosPorLancamento
    );
  });
  const rateiosPorLancamentoPatrimonio = medirEtapaPerformance_(medidor, "agrupar_rateios_patrimonio", function() {
    return combinarRateiosLancadosEProgramadosConsolidadoController_(
      rateiosPorLancamento,
      lancamentosProgramadosPatrimonio.rateiosPorLancamento
    );
  });
  const lancamentosMesComProgramados = lancamentosMes.concat(lancamentosProgramadosMes.lancamentos);
  const resumoMes = medirEtapaPerformance_(medidor, "calcular_resumo_mes", function() {
    return calcularResumoMesConsolidadoController_(
      contexto,
      lancamentosMesComProgramados,
      rateiosPorLancamentoComProgramados,
      lancamentosProgramadosMes.lancamentos.length
    );
  });

  const pacote = {
    usuarioLogado: {
      id: contexto.idLogado,
      nome: contexto.nomeLogado
    },
    filtros: filtrosNormalizados,
    patrimonio: medirEtapaPerformance_(medidor, "calcular_patrimonio", function() {
      return calcularPatrimonioConsolidadoController_(contexto, lancamentosVisiveis, filtrosNormalizados);
    }),
    contas: medirEtapaPerformance_(medidor, "calcular_contas", function() {
      return calcularContasConsolidadasController_(contexto, lancamentosVisiveis, filtrosNormalizados);
    }),
    resumoMes: resumoMes,
    saldoFinanceiro: medirEtapaPerformance_(medidor, "calcular_saldo_financeiro", function() {
      return calcularSaldoFinanceiroGlobalConsolidadoController_(
        contexto,
        lancamentosVisiveis,
        lancamentosMes,
        lancamentosMesComProgramados,
        lancamentosProgramadosMes.lancamentos,
        rateiosPorLancamento,
        rateiosPorLancamentoComProgramados,
        lancamentosProgramadosMes.rateiosPorLancamento,
        filtrosNormalizados,
        resumoMes
      );
    }),
    saudeFinanceira: medirEtapaPerformance_(medidor, "calcular_saude_financeira", function() {
      return calcularSaudeFinanceiraConsolidadoController_(
        contexto,
        lancamentosVisiveis,
        filtrosNormalizados,
        lancamentosMesComProgramados,
        lancamentosProgramadosPatrimonio.lancamentos,
        rateiosPorLancamentoComProgramados,
        rateiosPorLancamentoPatrimonio
      );
    }),
    cartoes: medirEtapaPerformance_(medidor, "calcular_cartoes", function() {
      return calcularCartoesConsolidadosController_(contexto, lancamentosVisiveis, filtrosNormalizados);
    }),
    orcamento: medirEtapaPerformance_(medidor, "calcular_orcamento", function() {
      return calcularOrcamentoConsolidadoController_(contexto, filtrosNormalizados, lancamentosProgramadosMes);
    }),
    rateios: medirEtapaPerformance_(medidor, "calcular_rateios", function() {
      return calcularAcertosRateioConsolidadoController_(
        contexto,
        lancamentosMesComProgramados,
        rateiosPorLancamentoComProgramados,
        filtrosNormalizados
      );
    }),
    projetos: medirEtapaPerformance_(medidor, "calcular_projetos", function() {
      return calcularProjetosDashboardConsolidadoController_(
        contexto,
        lancamentosVisiveis
      );
    }),
    pendencias: medirEtapaPerformance_(medidor, "calcular_pendencias", function() {
      return calcularPendenciasConsolidadasController_(contexto, lancamentosVisiveis, filtrosNormalizados);
    })
  };

  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
  registrarContagemPerformance_(medidor, "lancamentosVisiveis", lancamentosVisiveis.length);
  registrarContagemPerformance_(medidor, "lancamentosMes", lancamentosMes.length);
  registrarContagemPerformance_(medidor, "lancamentosProgramadosMes", lancamentosProgramadosMes.lancamentos.length);
  registrarContagemPerformance_(medidor, "lancamentosProgramadosPatrimonio", lancamentosProgramadosPatrimonio.lancamentos.length);
  registrarContagemPerformance_(medidor, "rateiosTodos", contexto.rateiosTodos.length);
  registrarContagemPerformance_(medidor, "contasAcessiveis", contexto.contasAcessiveis.length);
  registrarContagemPerformance_(medidor, "cartoesAcessiveis", contexto.cartoesAcessiveis.length);

  pacote._performance = finalizarPerformance_(medidor);
  return pacote;
}


function montarContextoConsolidadosController_(sessao, medidorPerformance, filtrosNormalizados) {
  const idLogado = normalizarTextoConsolidadoController_(sessao.id);
  const papelLogado = normalizarTextoConsolidadoController_(sessao.papel);
  const mesReferencia = filtrosNormalizados && filtrosNormalizados.Carregar_Historico_Completo === true
    ? ""
    : obterMesFinalEfetivoConsolidadoController_(filtrosNormalizados);
  const incluirHistorico = !filtrosNormalizados || filtrosNormalizados.Incluir_Historico !== false;
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, mesReferencia, incluirHistorico)
      : null;
  });

  if (contextoRpc) {
    return montarContextoConsolidadosAPartirBase_(sessao, contextoRpc, medidorPerformance, "RPC");
  }

  return montarContextoConsolidadosAPartirBase_(sessao, null, medidorPerformance, "MODELS");
}


function montarContextoConsolidadosAPartirBase_(sessao, contextoBase, medidorPerformance, origemContexto) {
  const idLogado = normalizarTextoConsolidadoController_(sessao.id);
  const papelLogado = normalizarTextoConsolidadoController_(sessao.papel);
  const usuariosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
    return contextoBase ? contextoBase.usuariosTodos : listarUsuariosModel_();
  });
  const contasTodas = medirEtapaPerformance_(medidorPerformance, "consulta_contas", function() {
    return contextoBase ? contextoBase.contasTodas : typeof listarContasModel_ === "function" ? listarContasModel_() : [];
  });
  const cartoesTodos = medirEtapaPerformance_(medidorPerformance, "consulta_cartoes", function() {
    return contextoBase ? contextoBase.cartoesTodos : typeof listarCartoesModel_ === "function" ? listarCartoesModel_() : [];
  });
  const categoriasTodas = medirEtapaPerformance_(medidorPerformance, "consulta_categorias", function() {
    return contextoBase ? contextoBase.categoriasTodas : typeof listarCategoriasModel_ === "function" ? listarCategoriasModel_() : [];
  });
  const projetosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_projetos", function() {
    return contextoBase ? contextoBase.projetosTodos : typeof listarProjetosModel_ === "function" ? listarProjetosModel_() : [];
  });
  const lancamentosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_lancamentos", function() {
    return contextoBase ? contextoBase.lancamentosTodos : typeof listarLancamentosModel_ === "function" ? listarLancamentosModel_() : [];
  });
  const rateiosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_rateios", function() {
    return contextoBase ? contextoBase.rateiosTodos : typeof listarRateiosModel_ === "function" ? listarRateiosModel_() : [];
  });
  const pagamentosFaturasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_pagamentos_faturas", function() {
    return contextoBase
      ? (contextoBase.pagamentosFaturasTodos || [])
      : typeof listarPagamentosFaturasModel_ === "function" ? listarPagamentosFaturasModel_() : [];
  });
  const orcamentosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_orcamentos", function() {
    return contextoBase ? contextoBase.orcamentosTodos : typeof listarOrcamentosModel_ === "function" ? listarOrcamentosModel_() : [];
  });
  const recorrenciasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias", function() {
    return contextoBase
      ? mesclarRegistrosPorIdConsolidadoController_(
        contextoBase.recorrenciasTodos || [],
        typeof listarRecorrenciasModel_ === "function" ? listarRecorrenciasModel_() : [],
        "ID_Recorrencia"
      )
      : typeof listarRecorrenciasModel_ === "function" ? listarRecorrenciasModel_() : [];
  });
  const recorrenciasRateiosTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_rateios", function() {
    return contextoBase
      ? mesclarRegistrosPorIdConsolidadoController_(
        contextoBase.recorrenciasRateiosTodos || [],
        typeof listarRecorrenciasRateiosModel_ === "function" ? listarRecorrenciasRateiosModel_() : [],
        "ID_Recorrencia_Rateio"
      )
      : typeof listarRecorrenciasRateiosModel_ === "function" ? listarRecorrenciasRateiosModel_() : [];
  });
  const recorrenciasOcorrenciasTodos = medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_ocorrencias", function() {
    return contextoBase
      ? mesclarOcorrenciasRecorrenciasConsolidadoController_(
        contextoBase.recorrenciasOcorrenciasTodos || [],
        typeof listarRecorrenciasOcorrenciasModel_ === "function" ? listarRecorrenciasOcorrenciasModel_() : []
      )
      : typeof listarRecorrenciasOcorrenciasModel_ === "function" ? listarRecorrenciasOcorrenciasModel_() : [];
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
    nomeLogado: normalizarTextoConsolidadoController_(sessao.nome),
    papelLogado: papelLogado,
    usuariosTodos: usuariosTodos,
    contasTodas: contasTodas,
    cartoesTodos: cartoesTodos,
    categoriasTodas: categoriasTodas,
    projetosTodos: projetosTodos,
    lancamentosTodos: lancamentosTodos,
    rateiosTodos: rateiosTodos,
    pagamentosFaturasTodos: pagamentosFaturasTodos,
    orcamentosTodos: orcamentosTodos,
    recorrenciasTodos: recorrenciasTodos,
    recorrenciasRateiosTodos: recorrenciasRateiosTodos,
    recorrenciasOcorrenciasTodos: recorrenciasOcorrenciasTodos,
    contasAcessiveis: contasAcessiveis,
    cartoesAcessiveis: cartoesAcessiveis,
    categoriasAcessiveis: categoriasAcessiveis,
    projetosAcessiveis: projetosAcessiveis,
    origemContexto: origemContexto || "MODELS"
  };
}


function mesclarRegistrosPorIdConsolidadoController_(base, complemento, campoId) {
  const mapa = {};
  const resultado = [];

  (base || []).concat(complemento || []).forEach(function(item) {
    const id = normalizarTextoConsolidadoController_(item && item[campoId]);

    if (!id || mapa[id]) {
      return;
    }

    mapa[id] = true;
    resultado.push(item);
  });

  return resultado;
}


function mesclarOcorrenciasRecorrenciasConsolidadoController_(base, complemento) {
  const mapa = {};
  const resultado = [];

  (base || []).concat(complemento || []).forEach(function(item) {
    const chave = [
      normalizarTextoConsolidadoController_(item && item.ID_Recorrencia),
      normalizarTextoConsolidadoController_(item && item.Data_Ocorrencia)
    ].join("|");

    if (chave === "|" || mapa[chave]) {
      return;
    }

    mapa[chave] = true;
    resultado.push(item);
  });

  return resultado;
}


function normalizarFiltrosConsolidadosController_(filtros) {
  filtros = filtros || {};
  const intervalo = normalizarIntervaloMesesConsolidadoController_(
    filtros.Mes_Inicial || filtros.Mes_Referencia,
    filtros.Mes_Final
  );

  return {
    Mes_Referencia: intervalo.Mes_Inicial,
    Mes_Inicial: intervalo.Mes_Inicial,
    Mes_Final: intervalo.Mes_Final,
    Considerar_Historico_Anterior: filtros.Considerar_Historico_Anterior !== false,
    Incluir_Historico: filtros.Incluir_Historico !== false
  };
}


function obterMesFinalEfetivoConsolidadoController_(filtros) {
  const mesFinal = normalizarTextoConsolidadoController_(filtros && filtros.Mes_Final);
  const mesInicial = normalizarTextoConsolidadoController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia));

  return mesFinal || mesInicial || "";
}


function normalizarIntervaloMesesConsolidadoController_(mesInicial, mesFinal, permitirPeriodoVazio) {
  const textoInicial = normalizarTextoConsolidadoController_(mesInicial);
  const inicio = /^\d{4}-\d{2}$/.test(textoInicial)
    ? textoInicial
    : permitirPeriodoVazio === true
      ? ""
      : gerarMesAtualConsolidadoController_();
  let fim = /^\d{4}-\d{2}$/.test(normalizarTextoConsolidadoController_(mesFinal))
    ? normalizarTextoConsolidadoController_(mesFinal)
    : "";

  if (inicio && fim && compararMesesConsolidadoController_(fim, inicio) < 0) {
    fim = inicio;
  }

  return {
    Mes_Inicial: inicio,
    Mes_Final: inicio && !fim ? inicio : fim
  };
}


function compararMesesConsolidadoController_(mesA, mesB) {
  const a = normalizarTextoConsolidadoController_(mesA);
  const b = normalizarTextoConsolidadoController_(mesB);

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  return a.localeCompare(b);
}


function mesReferenciaEstaNoIntervaloConsolidadoController_(mesReferencia, mesInicial, mesFinal) {
  const mes = normalizarTextoConsolidadoController_(mesReferencia);
  const inicio = normalizarTextoConsolidadoController_(mesInicial);
  const fim = normalizarTextoConsolidadoController_(mesFinal);

  if (!mes) {
    return false;
  }

  if (!inicio && !fim) {
    return true;
  }

  if (inicio && compararMesesConsolidadoController_(mes, inicio) < 0) {
    return false;
  }

  if (fim && compararMesesConsolidadoController_(mes, fim) > 0) {
    return false;
  }

  return true;
}


function obterLancamentosVisiveisConsolidadosController_(contexto) {
  const idsRateioUsuario = {};

  contexto.rateiosTodos.forEach(function(rateio) {
    const responsavel = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel);
    const credor = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Credor);

    if (
      (responsavel === contexto.idLogado || credor === contexto.idLogado) &&
      normalizarTextoConsolidadoController_(rateio.Status) !== "Cancelado"
    ) {
      idsRateioUsuario[normalizarTextoConsolidadoController_(rateio.ID_Lancamento)] = true;
    }
  });

  return contexto.lancamentosTodos.filter(function(lancamento) {
    const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
    const ehAutor = normalizarTextoConsolidadoController_(lancamento.Criado_Por_ID) === contexto.idLogado;
    const participaRateio = idsRateioUsuario[idLancamento] === true;
    const podeVisualizarOrigem = typeof usuarioPodeVisualizarOrigemLancamento_ === "function"
      ? usuarioPodeVisualizarOrigemLancamento_(lancamento, contexto)
      : false;
    const gerenciaOrigem = usuarioPodeGerenciarLancamento_(lancamento, contexto);

    return ehAutor || participaRateio || podeVisualizarOrigem || gerenciaOrigem;
  });
}


function calcularContasConsolidadasController_(contexto, lancamentosVisiveis, filtros) {
  const inicioMes = obterInicioMesConsolidadoController_(filtros.Mes_Referencia);
  const fimMes = obterFimMesConsolidadoController_(obterMesFinalEfetivoConsolidadoController_(filtros));
  const considerarHistoricoAnterior = filtros.Considerar_Historico_Anterior !== false;
  const contas = contexto.contasAcessiveis.map(function(conta) {
    const contaComContexto = {};
    Object.keys(conta || {}).forEach(function(chave) {
      contaComContexto[chave] = conta[chave];
    });
    contaComContexto._contextoPagamentosFaturas = contexto.pagamentosFaturasTodos || [];

    const saldoLancado = considerarHistoricoAnterior
      ? calcularSaldoContaAteDataConsolidadoController_(contaComContexto, lancamentosVisiveis, fimMes)
      : calcularMovimentoContaNoPeriodoConsolidadoController_(contaComContexto, lancamentosVisiveis, inicioMes, fimMes);
    const saldoProjetado = saldoLancado + calcularProjecaoRecorrenciasContaController_(conta, contexto, filtros.Mes_Referencia);

    return {
      ID_Conta: conta.ID_Conta,
      Nome_Conta: conta.Nome_Conta,
      Saldo_Inicial: conta.Saldo_Inicial,
      Saldo_Lancado: arredondarConsolidadoController_(saldoLancado),
      Saldo_Projetado: arredondarConsolidadoController_(saldoProjetado),
      Compartilhada: conta.Compartilhada === true,
      Considera_Historico_Anterior: considerarHistoricoAnterior
    };
  });

  contas.sort(function(a, b) {
    return normalizarTextoConsolidadoController_(a.Nome_Conta).localeCompare(normalizarTextoConsolidadoController_(b.Nome_Conta));
  });

  return contas;
}


function calcularPatrimonioConsolidadoController_(contexto, lancamentosVisiveis, filtros) {
  const inicioMes = obterInicioMesConsolidadoController_(filtros.Mes_Referencia);
  const fimMes = obterFimMesConsolidadoController_(obterMesFinalEfetivoConsolidadoController_(filtros));
  const considerarHistoricoAnterior = filtros.Considerar_Historico_Anterior !== false;
  const contas = calcularContasConsolidadasController_(contexto, lancamentosVisiveis, filtros);
  const saldoLancadoContas = contas.reduce(function(total, conta) {
    return total + converterNumeroConsolidadoController_(conta.Saldo_Lancado);
  }, 0);
  const saldoProjetadoContas = contas.reduce(function(total, conta) {
    return total + converterNumeroConsolidadoController_(conta.Saldo_Projetado);
  }, 0);
  const compromissosCartaoLancados = calcularCompromissosCartaoAteDataConsolidadoController_(
    contexto,
    lancamentosVisiveis,
    fimMes,
    considerarHistoricoAnterior ? "" : inicioMes
  );
  const compromissosCartaoProjetados = calcularProjecaoRecorrenciasCartaoController_(
    contexto,
    filtros.Mes_Referencia
  );
  const acertosRateioLancados = calcularImpactoRateiosAteDataConsolidadoController_(
    contexto,
    lancamentosVisiveis,
    fimMes
  );
  const acertosRateioProjetados = calcularProjecaoRateiosRecorrenciasController_(
    contexto,
    filtros.Mes_Referencia
  );
  const saldoReal = arredondarConsolidadoController_(
    saldoLancadoContas - compromissosCartaoLancados + acertosRateioLancados
  );
  const saldoEstimado = arredondarConsolidadoController_(
    saldoProjetadoContas -
      compromissosCartaoLancados -
      compromissosCartaoProjetados +
      acertosRateioLancados +
      acertosRateioProjetados
  );
  const saldoFuturo = arredondarConsolidadoController_(saldoEstimado - saldoReal);

  return {
    Saldo_Real: saldoReal,
    Saldo_Futuro: saldoFuturo,
    Saldo_Estimado: saldoEstimado,
    Saldo_Lancado: saldoReal,
    Saldo_Projetado: saldoEstimado
  };
}


function calcularSaldoFinanceiroGlobalConsolidadoController_(
  contexto,
  lancamentosVisiveis,
  lancamentosPeriodoReal,
  lancamentosPeriodoComProgramados,
  lancamentosPeriodoProgramados,
  rateiosPorLancamentoReal,
  rateiosPorLancamentoComProgramados,
  rateiosPorLancamentoProgramados,
  filtros,
  resumoPeriodoComProgramados
) {
  const inicioPeriodo = obterInicioMesConsolidadoController_(filtros.Mes_Inicial || filtros.Mes_Referencia);
  const fimPeriodo = obterFimMesConsolidadoController_(obterMesFinalEfetivoConsolidadoController_(filtros));
  const hoje = obterDataHojeConsolidadoController_();
  const limiteAgora = hoje < inicioPeriodo ? inicioPeriodo : hoje > fimPeriodo ? fimPeriodo : hoje;
  const considerarHistoricoAnterior = !filtros || filtros.Considerar_Historico_Anterior !== false;
  const saldoInicialContas = (contexto.contasAcessiveis || []).reduce(function(total, conta) {
    return total + (!conta.Data_Saldo_Inicial || conta.Data_Saldo_Inicial < inicioPeriodo ? converterNumeroConsolidadoController_(conta.Saldo_Inicial) : 0);
  }, 0);
  const saldoInicialNoPeriodo = somarSaldosIniciaisNoPeriodo_(contexto.contasAcessiveis, inicioPeriodo, fimPeriodo);
  const resultadoAnterior = considerarHistoricoAnterior
    ? calcularResultadoGlobalAntesDeDataConsolidadoController_(
      contexto,
      lancamentosVisiveis || [],
      rateiosPorLancamentoReal || {},
      inicioPeriodo
    )
    : 0;
  const saldoAnterior = considerarHistoricoAnterior
    ? saldoInicialContas + resultadoAnterior
    : 0;
  const resumoReal = calcularResumoMesConsolidadoController_(
    contexto,
    lancamentosPeriodoReal || [],
    rateiosPorLancamentoReal || {},
    0
  );
  const resumoProjetado = resumoPeriodoComProgramados || calcularResumoMesConsolidadoController_(
    contexto,
    lancamentosPeriodoComProgramados || [],
    rateiosPorLancamentoComProgramados || {},
    0
  );
  const resultadoReal = obterResultadoReceitasDespesasConsolidadoController_(resumoReal.Fluxo_Rateios || resumoReal.Pessoal || resumoReal);
  const resultadoProjetado = obterResultadoReceitasDespesasConsolidadoController_(resumoProjetado.Fluxo_Rateios || resumoProjetado.Pessoal || resumoProjetado);
  const saldoReal = arredondarConsolidadoController_(saldoAnterior + saldoInicialNoPeriodo + resultadoReal);
  const saldoEstimado = arredondarConsolidadoController_(saldoAnterior + saldoInicialNoPeriodo + resultadoProjetado);
  const cenarioAgora = calcularCenarioSaldoFinanceiroConsolidadoController_(
    contexto,
    lancamentosPeriodoReal || [],
    lancamentosPeriodoProgramados || [],
    rateiosPorLancamentoReal || {},
    rateiosPorLancamentoProgramados || {},
    inicioPeriodo,
    limiteAgora,
    saldoAnterior
  );
  const cenarioFimMes = calcularCenarioSaldoFinanceiroConsolidadoController_(
    contexto,
    lancamentosPeriodoReal || [],
    lancamentosPeriodoProgramados || [],
    rateiosPorLancamentoReal || {},
    rateiosPorLancamentoProgramados || {},
    inicioPeriodo,
    fimPeriodo,
    saldoAnterior
  );

  return {
    Saldo_Anterior: arredondarConsolidadoController_(saldoAnterior),
    Saldo_Inicial_Contas: arredondarConsolidadoController_(considerarHistoricoAnterior ? saldoInicialContas : 0),
    Resultado_Anterior: arredondarConsolidadoController_(resultadoAnterior),
    Saldo_Real: saldoReal,
    Saldo_Futuro: arredondarConsolidadoController_(saldoEstimado - saldoReal),
    Saldo_Estimado: saldoEstimado,
    Saldo_Lancado: saldoReal,
    Saldo_Projetado: saldoEstimado,
    Resultado_Real: arredondarConsolidadoController_(resultadoReal),
    Resultado_Projetado: arredondarConsolidadoController_(resultadoProjetado),
    Considera_Historico_Anterior: considerarHistoricoAnterior,
    Data_Hoje: hoje,
    Data_Limite_Agora: limiteAgora,
    Data_Limite_Fim_Mes: fimPeriodo,
    Cenarios: {
      Agora: cenarioAgora,
      Ate_Fim_Mes: cenarioFimMes
    }
  };
}


/**
 * Calcula os dois indicadores centrais de saúde financeira do Dashboard.
 *
 * Regras:
 * - o resultado projetado inclui lançamentos efetivos, pendentes e recorrências ainda não geradas;
 * - o patrimônio projeta lançamentos efetivos, pendentes e recorrências ainda não geradas;
 * - rateios não geram receitas/despesas sintéticas;
 * - transferências são ignoradas, pois não alteram o patrimônio;
 * - o resultado considera todo o período selecionado, inclusive meses futuros;
 * - o patrimônio sempre considera todo o histórico até o fim do período,
 *   independentemente do filtro "Saldo anterior".
 */
function calcularSaudeFinanceiraConsolidadoController_(contexto, lancamentosVisiveis, filtros, lancamentosPeriodoProjetados, lancamentosPatrimonioProgramados, rateiosPeriodo, rateiosPatrimonio) {
  const inicioPeriodo = obterInicioMesConsolidadoController_(filtros.Mes_Inicial || filtros.Mes_Referencia);
  const fimPeriodo = obterFimMesConsolidadoController_(obterMesFinalEfetivoConsolidadoController_(filtros));
  const origensUsuario = mapearOrigensFinanceirasUsuarioConsolidadoController_(contexto);
  const movimentosPatrimonioProjetado = (lancamentosVisiveis || []).concat(lancamentosPatrimonioProgramados || [])
    .map(function(lancamento) {
      return montarMovimentoSaudeFinanceiraConsolidadoController_(
        lancamento,
        origensUsuario,
        true,
        contexto,
        rateiosPatrimonio || {}
      );
    })
    .filter(function(movimento) {
      return movimento !== null && movimento.Data <= fimPeriodo;
    })
    .sort(function(a, b) {
      return a.Data.localeCompare(b.Data);
    });
  const movimentosPeriodoProjetado = (lancamentosPeriodoProjetados || [])
    .map(function(lancamento) {
      return montarMovimentoSaudeFinanceiraConsolidadoController_(
        lancamento,
        origensUsuario,
        true,
        contexto,
        rateiosPeriodo || {}
      );
    })
    .filter(function(movimento) {
      return movimento !== null;
    })
    .sort(function(a, b) {
      return a.Data.localeCompare(b.Data);
    });
  const movimentosPatrimonioPeriodo = movimentosPatrimonioProjetado.filter(function(movimento) {
    return movimento.Data >= inicioPeriodo && movimento.Data <= fimPeriodo;
  });
  const resumoPeriodoProjetado = resumirMovimentosSaudeFinanceiraConsolidadoController_(movimentosPeriodoProjetado);
  const resumoPatrimonioPeriodo = resumirMovimentosSaudeFinanceiraConsolidadoController_(movimentosPatrimonioPeriodo);
  const resumoAcumulado = resumirMovimentosSaudeFinanceiraConsolidadoController_(movimentosPatrimonioProjetado);
  const saldoInicialContas = calcularSaldoInicialUsuarioSaudeFinanceiraConsolidadoController_(contexto, fimPeriodo);
  const saldosDatados = (contexto.contasTodas || []).filter(function(c) {
    return c.ID_Usuario === contexto.idLogado && c.Data_Saldo_Inicial && c.Data_Saldo_Inicial <= fimPeriodo;
  }).map(function(c) { return { Data: c.Data_Saldo_Inicial, Tipo: 'Saldo Inicial', Impacto: converterNumeroConsolidadoController_(c.Saldo_Inicial), Valor: 0 }; });
  const baseSemData = (contexto.contasTodas || []).filter(function(c) { return !c.Data_Saldo_Inicial && c.ID_Usuario === contexto.idLogado; })
    .reduce(function(n,c) { return n + converterNumeroConsolidadoController_(c.Saldo_Inicial); }, 0);
  const movimentosComSaldos = movimentosPatrimonioProjetado.concat(saldosDatados);
  const patrimonioAcumulado = saldoInicialContas + resumoAcumulado.Resultado;
  const evolucao = montarEvolucaoPatrimonioSaudeFinanceiraConsolidadoController_(
    movimentosComSaldos,
    inicioPeriodo,
    fimPeriodo,
    baseSemData
  );
  const relatorioMensalPatrimonio = montarRelatorioMensalPatrimonioSaudeFinanceiraConsolidadoController_(
    movimentosComSaldos,
    baseSemData,
    inicioPeriodo,
    fimPeriodo
  );

  return {
    Data_Inicio: inicioPeriodo,
    Data_Limite: fimPeriodo,
    Resultado_Periodo: {
      Data_Limite: fimPeriodo,
      Projetado: true,
      Receitas: arredondarConsolidadoController_(resumoPeriodoProjetado.Receitas),
      Despesas: arredondarConsolidadoController_(resumoPeriodoProjetado.Despesas),
      Resultado: arredondarConsolidadoController_(resumoPeriodoProjetado.Resultado),
      Total_Lancamentos: resumoPeriodoProjetado.Total_Lancamentos,
      Total_Pendentes: resumoPeriodoProjetado.Total_Pendentes,
      Total_Programados: resumoPeriodoProjetado.Total_Programados,
      IDs_Receitas: resumoPeriodoProjetado.IDs_Receitas,
      IDs_Despesas: resumoPeriodoProjetado.IDs_Despesas
    },
    Patrimonio_Acumulado: {
      Data_Limite: fimPeriodo,
      Projetado: true,
      Saldo_Inicial_Contas: arredondarConsolidadoController_(saldoInicialContas),
      Receitas_Acumuladas: arredondarConsolidadoController_(resumoAcumulado.Receitas),
      Despesas_Acumuladas: arredondarConsolidadoController_(resumoAcumulado.Despesas),
      Total: arredondarConsolidadoController_(patrimonioAcumulado),
      Variacao_Periodo: arredondarConsolidadoController_(resumoPatrimonioPeriodo.Resultado + saldosDatados.filter(function(m) { return m.Data >= inicioPeriodo; }).reduce(function(n,m) { return n + m.Impacto; }, 0)),
      Total_Pendentes: resumoAcumulado.Total_Pendentes,
      Total_Programados: resumoAcumulado.Total_Programados,
      Evolucao_Periodo: evolucao,
      Relatorio_Mensal: relatorioMensalPatrimonio
    }
  };
}


function mapearOrigensFinanceirasUsuarioConsolidadoController_(contexto) {
  const contas = {};
  const cartoes = {};
  const idLogado = normalizarTextoConsolidadoController_(contexto.idLogado);

  (contexto.contasTodas || []).forEach(function(conta) {
    if (normalizarTextoConsolidadoController_(conta.ID_Usuario) === idLogado) {
      contas[normalizarTextoConsolidadoController_(conta.ID_Conta)] = true;
    }
  });

  (contexto.cartoesTodos || []).forEach(function(cartao) {
    const titular = normalizarTextoConsolidadoController_(cartao.ID_Titular || cartao.ID_Usuario);
    const usuarioCartao = normalizarTextoConsolidadoController_(cartao.ID_Usuario);
    if (titular === idLogado || usuarioCartao === idLogado) {
      cartoes[normalizarTextoConsolidadoController_(cartao.ID_Cartao)] = true;
    }
  });

  return { contas: contas, cartoes: cartoes };
}


function montarMovimentoSaudeFinanceiraConsolidadoController_(lancamento, origensUsuario, incluirPendentes, contexto, rateiosPorLancamento) {
  const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
  const status = normalizarTextoConsolidadoController_(lancamento.Status);
  const tipoOrigem = normalizarTextoConsolidadoController_(lancamento.Tipo_Origem);
  const idOrigem = normalizarTextoConsolidadoController_(lancamento.ID_Origem);
  const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
  const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);
  const rateiosAtivos = ((rateiosPorLancamento || {})[idLancamento] || []).filter(function(rateio) {
    return normalizarTextoConsolidadoController_(rateio.Status) !== "Cancelado";
  });
  const valor = contexto
    ? obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento || {})
    : converterNumeroConsolidadoController_(lancamento.Valor_Total);
  const origemPertenceAoUsuario = tipoOrigem === "Conta"
    ? origensUsuario.contas[idOrigem] === true
    : ehTipoOrigemCartaoConsolidadoController_(tipoOrigem) && origensUsuario.cartoes[idOrigem] === true;
  const pertenceAoUsuario = rateiosAtivos.length > 0
    ? valor > 0
    : origemPertenceAoUsuario && valor > 0;

  if (tipo !== "Receita" && tipo !== "Despesa") return null;
  if (status === "Cancelado" || (!incluirPendentes && status === "Pendente")) return null;
  if (!pertenceAoUsuario || !data) return null;

  return {
    ID_Lancamento: idLancamento,
    Data: data,
    Tipo: tipo,
    Valor: valor,
    Impacto: tipo === "Receita" ? valor : -valor,
    Status: status,
    Programado: lancamento._Programado_Recorrencia === true
  };
}


function resumirMovimentosSaudeFinanceiraConsolidadoController_(movimentos) {
  const resumo = {
    Receitas: 0,
    Despesas: 0,
    Resultado: 0,
    Total_Lancamentos: 0,
    Total_Pendentes: 0,
    Total_Programados: 0,
    IDs_Receitas: [],
    IDs_Despesas: []
  };

  (movimentos || []).forEach(function(movimento) {
    if (movimento.Tipo === "Saldo Inicial") return;
    if (movimento.Tipo === "Receita") {
      resumo.Receitas += movimento.Valor;
      if (movimento.ID_Lancamento) resumo.IDs_Receitas.push(movimento.ID_Lancamento);
    } else if (movimento.Tipo === "Despesa") {
      resumo.Despesas += movimento.Valor;
      if (movimento.ID_Lancamento) resumo.IDs_Despesas.push(movimento.ID_Lancamento);
    }
    resumo.Total_Lancamentos += 1;
    if (movimento.Programado === true) {
      resumo.Total_Programados += 1;
    } else if (movimento.Status === "Pendente") {
      resumo.Total_Pendentes += 1;
    }
  });

  resumo.Resultado = resumo.Receitas - resumo.Despesas;
  return resumo;
}


/**
 * Concilia mensalmente a composição do patrimônio projetado.
 * O saldo inicial das contas entra uma única vez antes do primeiro mês e cada
 * linha parte exatamente do saldo final da linha anterior.
 */
function montarRelatorioMensalPatrimonioSaudeFinanceiraConsolidadoController_(movimentos, saldoInicial, inicioPeriodo, fimPeriodo) {
  const lista = (movimentos || []).slice().sort(function(a, b) {
    return a.Data.localeCompare(b.Data);
  });
  const mesFinal = normalizarTextoConsolidadoController_(fimPeriodo).substring(0, 7);
  const mesInicialSelecionado = normalizarTextoConsolidadoController_(inicioPeriodo).substring(0, 7);
  const movimentosPorMes = {};

  lista.forEach(function(movimento) {
    const mes = normalizarTextoConsolidadoController_(movimento.Data).substring(0, 7);
    if (!mes || mes > mesFinal) return;
    if (!movimentosPorMes[mes]) movimentosPorMes[mes] = [];
    movimentosPorMes[mes].push(movimento);
  });

  const mesesComMovimento = Object.keys(movimentosPorMes).sort();
  let mesAtual = mesesComMovimento.length > 0 ? mesesComMovimento[0] : mesFinal;
  let saldoCorrente = converterNumeroConsolidadoController_(saldoInicial);
  let indiceSeguranca = 0;
  const relatorio = [];

  while (mesAtual && mesAtual <= mesFinal && indiceSeguranca < 600) {
    const resumo = resumirMovimentosSaudeFinanceiraConsolidadoController_(movimentosPorMes[mesAtual] || []);
    const saldoAnterior = saldoCorrente;
    saldoCorrente += resumo.Resultado + (movimentosPorMes[mesAtual] || []).reduce(function(n,m) { return n + (m.Tipo === "Saldo Inicial" ? m.Impacto : 0); }, 0);

    relatorio.push({
      Mes_Referencia: mesAtual,
      No_Periodo_Selecionado: mesAtual >= mesInicialSelecionado && mesAtual <= mesFinal,
      Saldo_Anterior: arredondarConsolidadoController_(saldoAnterior),
      Receitas: arredondarConsolidadoController_(resumo.Receitas),
      Despesas: arredondarConsolidadoController_(resumo.Despesas),
      Resultado: arredondarConsolidadoController_(resumo.Resultado),
      Saldo_Final: arredondarConsolidadoController_(saldoCorrente),
      Total_Lancamentos: resumo.Total_Lancamentos,
      Total_Pendentes: resumo.Total_Pendentes,
      Total_Programados: resumo.Total_Programados,
      IDs_Lancamentos: resumo.IDs_Receitas.concat(resumo.IDs_Despesas)
    });

    indiceSeguranca += 1;
    mesAtual = adicionarMesRecorrenciaConsolidadoController_(mesAtual + "-01").substring(0, 7);
  }

  return relatorio;
}


function calcularSaldoInicialUsuarioSaudeFinanceiraConsolidadoController_(contexto, dataLimite) {
  const contasSomadas = {};
  const idLogado = normalizarTextoConsolidadoController_(contexto.idLogado);

  return (contexto.contasTodas || []).reduce(function(total, conta) {
    const idConta = normalizarTextoConsolidadoController_(conta.ID_Conta);
    if (!idConta || contasSomadas[idConta] || normalizarTextoConsolidadoController_(conta.ID_Usuario) !== idLogado || (dataLimite && conta.Data_Saldo_Inicial && conta.Data_Saldo_Inicial > dataLimite)) {
      return total;
    }

    contasSomadas[idConta] = true;
    return total + converterNumeroConsolidadoController_(conta.Saldo_Inicial);
  }, 0);
}


function montarEvolucaoPatrimonioSaudeFinanceiraConsolidadoController_(movimentos, inicioPeriodo, limiteAteAqui, saldoInicial) {
  let total = saldoInicial;
  const movimentosPorData = {};

  (movimentos || []).forEach(function(movimento) {
    if (movimento.Data < inicioPeriodo) {
      total += movimento.Impacto;
      return;
    }

    if (movimento.Data <= limiteAteAqui) {
      movimentosPorData[movimento.Data] = (movimentosPorData[movimento.Data] || 0) + movimento.Impacto;
    }
  });

  if (limiteAteAqui < inicioPeriodo) {
    return [{ Data: limiteAteAqui, Valor: arredondarConsolidadoController_(total) }];
  }

  const pontos = [{ Data: inicioPeriodo, Valor: arredondarConsolidadoController_(total) }];
  Object.keys(movimentosPorData).sort().forEach(function(data) {
    total += movimentosPorData[data];
    pontos.push({ Data: data, Valor: arredondarConsolidadoController_(total) });
  });

  if (limiteAteAqui >= inicioPeriodo && pontos[pontos.length - 1].Data !== limiteAteAqui) {
    pontos.push({ Data: limiteAteAqui, Valor: arredondarConsolidadoController_(total) });
  }

  return reduzirPontosEvolucaoSaudeFinanceiraConsolidadoController_(pontos, 48);
}


function reduzirPontosEvolucaoSaudeFinanceiraConsolidadoController_(pontos, limite) {
  if (!pontos || pontos.length <= limite) return pontos || [];

  const resultado = [pontos[0]];
  const passo = (pontos.length - 1) / (limite - 1);

  for (let indice = 1; indice < limite - 1; indice += 1) {
    resultado.push(pontos[Math.round(indice * passo)]);
  }

  resultado.push(pontos[pontos.length - 1]);
  return resultado;
}

function calcularCenarioSaldoFinanceiroConsolidadoController_(
  contexto,
  lancamentosReais,
  lancamentosProgramados,
  rateiosReais,
  rateiosProgramados,
  dataInicio,
  dataLimite,
  saldoAnterior
) {
  const reaisAteLimite = filtrarLancamentosPorDataConsolidadoController_(lancamentosReais, dataInicio, dataLimite);
  const programadosAteLimite = filtrarLancamentosPorDataConsolidadoController_(lancamentosProgramados, dataInicio, dataLimite);
  const resumoReais = calcularResumoMesConsolidadoController_(contexto, reaisAteLimite, rateiosReais || {}, 0);
  const resumoProgramados = calcularResumoMesConsolidadoController_(
    contexto,
    programadosAteLimite,
    rateiosProgramados || {},
    programadosAteLimite.length
  );
  const fluxoReais = resumoReais.Fluxo_Rateios || resumoReais.Pessoal || resumoReais;
  const fluxoProgramados = resumoProgramados.Fluxo_Rateios || resumoProgramados.Pessoal || resumoProgramados;
  const receitasLancadas = converterNumeroConsolidadoController_(fluxoReais.Receitas);
  const receitasProgramadas = converterNumeroConsolidadoController_(fluxoProgramados.Receitas);
  const despesasLancadas = converterNumeroConsolidadoController_(fluxoReais.Despesas);
  const despesasProgramadas = converterNumeroConsolidadoController_(fluxoProgramados.Despesas);
  const totalReceitas = receitasLancadas + receitasProgramadas;
  const totalDespesas = despesasLancadas + despesasProgramadas;
  const resultado = totalReceitas - totalDespesas;

  return {
    Data_Inicio: dataInicio,
    Data_Limite: dataLimite,
    Saldo_Anterior: arredondarConsolidadoController_(saldoAnterior),
    Receitas_Lancadas: arredondarConsolidadoController_(receitasLancadas),
    Receitas_Programadas: arredondarConsolidadoController_(receitasProgramadas),
    Receitas_Total: arredondarConsolidadoController_(totalReceitas),
    Despesas_Lancadas: arredondarConsolidadoController_(despesasLancadas),
    Despesas_Programadas: arredondarConsolidadoController_(despesasProgramadas),
    Despesas_Total: arredondarConsolidadoController_(totalDespesas),
    Resultado: arredondarConsolidadoController_(resultado),
    Saldo: arredondarConsolidadoController_(saldoAnterior + somarSaldosIniciaisNoPeriodo_(contexto.contasAcessiveis, dataInicio, dataLimite) + resultado),
    Total_Lancamentos: reaisAteLimite.length,
    Total_Programados: programadosAteLimite.length
  };
}

function filtrarLancamentosPorDataConsolidadoController_(lancamentos, dataInicio, dataFim) {
  const inicio = normalizarTextoConsolidadoController_(dataInicio);
  const fim = normalizarTextoConsolidadoController_(dataFim);

  return (lancamentos || []).filter(function(lancamento) {
    const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);
    return data && (!inicio || data >= inicio) && (!fim || data <= fim);
  });
}

function obterDataHojeConsolidadoController_() {
  const timezone = Session.getScriptTimeZone ? Session.getScriptTimeZone() : "America/Sao_Paulo";
  return Utilities.formatDate(new Date(), timezone || "America/Sao_Paulo", "yyyy-MM-dd");
}


function calcularResultadoGlobalAntesDeDataConsolidadoController_(contexto, lancamentosVisiveis, rateiosPorLancamento, dataInicio) {
  const inicio = normalizarTextoConsolidadoController_(dataInicio);

  if (!inicio) {
    return 0;
  }

  const dataAnterior = adicionarDiasDataConsolidadoController_(inicio, -1);
  const lancamentosAnteriores = (lancamentosVisiveis || []).filter(function(lancamento) {
    const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);
    return data && data <= dataAnterior;
  });
  const resumo = calcularResumoMesConsolidadoController_(
    contexto,
    lancamentosAnteriores,
    rateiosPorLancamento || {},
    0
  );

  return obterResultadoReceitasDespesasConsolidadoController_(resumo.Fluxo_Rateios || resumo.Pessoal || resumo);
}


function obterResultadoReceitasDespesasConsolidadoController_(resumo) {
  return arredondarConsolidadoController_(
    converterNumeroConsolidadoController_(resumo && resumo.Receitas) -
    converterNumeroConsolidadoController_(resumo && resumo.Despesas)
  );
}


function calcularResumoMesLegadoConsolidadoController_(contexto, lancamentosMes, rateiosPorLancamento, totalProgramados) {
  const resumo = {
    Receitas: 0,
    Despesas: 0,
    Transferencias_Entrada: 0,
    Transferencias_Saida: 0,
    Resultado: 0,
    Total_Lancamentos: lancamentosMes.length,
    Total_Programados: totalProgramados || 0
  };

  lancamentosMes.forEach(function(lancamento) {
    const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
    const valor = obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento);

    if (tipo === "Receita") {
      resumo.Receitas += valor;
    } else if (tipo === "Despesa") {
      resumo.Despesas += valor;
    } else if (tipo === "Transferência") {
      const impacto = calcularImpactoTransferenciaUsuarioConsolidadoController_(lancamento, contexto);
      resumo.Transferencias_Entrada += impacto.entrada;
      resumo.Transferencias_Saida += impacto.saida;
    }
  });

  resumo.Resultado = resumo.Receitas - resumo.Despesas + resumo.Transferencias_Entrada - resumo.Transferencias_Saida;

  Object.keys(resumo).forEach(function(chave) {
    if (typeof resumo[chave] === "number") {
      resumo[chave] = arredondarConsolidadoController_(resumo[chave]);
    }
  });

  return resumo;
}


function calcularResumoMesConsolidadoController_(contexto, lancamentosMes, rateiosPorLancamento, totalProgramados) {
  const resumoPessoal = criarResumoBaseConsolidadoController_();
  const resumoFluxoRateios = criarResumoBaseConsolidadoController_();

  lancamentosMes.forEach(function(lancamento) {
    const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
    const valorPessoal = obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento);

    if (tipo === "Receita") {
      resumoPessoal.Receitas += valorPessoal;
    } else if (tipo === "Despesa") {
      resumoPessoal.Despesas += valorPessoal;
    } else if (ehTransferenciaConsolidadoController_(tipo)) {
      const impacto = calcularImpactoTransferenciaUsuarioConsolidadoController_(lancamento, contexto);
      resumoPessoal.Transferencias_Entrada += impacto.entrada;
      resumoPessoal.Transferencias_Saida += impacto.saida;
    }

    somarFluxoComRateiosConsolidadoController_(resumoFluxoRateios, lancamento, contexto, rateiosPorLancamento);
  });

  finalizarResumoBaseConsolidadoController_(resumoPessoal);
  finalizarResumoBaseConsolidadoController_(resumoFluxoRateios);

  return {
    Receitas: resumoPessoal.Receitas,
    Despesas: resumoPessoal.Despesas,
    Transferencias_Entrada: resumoPessoal.Transferencias_Entrada,
    Transferencias_Saida: resumoPessoal.Transferencias_Saida,
    Transferencias: resumoPessoal.Transferencias,
    Resultado: resumoPessoal.Resultado,
    Total_Lancamentos: lancamentosMes.length,
    Total_Programados: totalProgramados || 0,
    Pessoal: resumoPessoal,
    Fluxo_Rateios: resumoFluxoRateios
  };
}


function criarResumoBaseConsolidadoController_() {
  return {
    Receitas: 0,
    Despesas: 0,
    Transferencias_Entrada: 0,
    Transferencias_Saida: 0,
    Transferencias: 0,
    Resultado: 0
  };
}


function finalizarResumoBaseConsolidadoController_(resumo) {
  resumo.Transferencias = resumo.Transferencias_Entrada - resumo.Transferencias_Saida;
  resumo.Resultado = resumo.Receitas - resumo.Despesas + resumo.Transferencias;

  Object.keys(resumo).forEach(function(chave) {
    if (typeof resumo[chave] === "number") {
      resumo[chave] = arredondarConsolidadoController_(resumo[chave]);
    }
  });

  return resumo;
}


function somarFluxoComRateiosConsolidadoController_(resumo, lancamento, contexto, rateiosPorLancamento) {
  const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
  const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
  const rateios = (rateiosPorLancamento[idLancamento] || []).filter(function(rateio) {
    return normalizarTextoConsolidadoController_(rateio.Status) !== "Cancelado";
  });

  if (ehTransferenciaConsolidadoController_(tipo)) {
    const impacto = calcularImpactoTransferenciaUsuarioConsolidadoController_(lancamento, contexto);
    resumo.Transferencias_Entrada += impacto.entrada;
    resumo.Transferencias_Saida += impacto.saida;
    return;
  }

  if (rateios.length === 0) {
    const valorSemRateio = obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento);

    if (tipo === "Receita") {
      resumo.Receitas += valorSemRateio;
    } else if (tipo === "Despesa") {
      resumo.Despesas += valorSemRateio;
    }

    return;
  }

  const valoresRateio = calcularValoresRateioUsuarioConsolidadoController_(rateios, contexto.idLogado);
  const valorTotal = converterNumeroConsolidadoController_(lancamento.Valor_Total);

  if (tipo === "Despesa") {
    if (valoresRateio.valorAReceber > 0) {
      resumo.Despesas += Math.max(valorTotal - valoresRateio.valorAReceber, 0);
    } else if (valoresRateio.valorAPagar > 0) {
      resumo.Despesas += valoresRateio.valorAPagar;
    }
  } else if (tipo === "Receita") {
    if (valoresRateio.valorAReceber > 0) {
      resumo.Receitas += Math.max(valorTotal - valoresRateio.valorAReceber, 0);
    } else if (valoresRateio.valorAPagar > 0) {
      resumo.Receitas += valoresRateio.valorAPagar;
    }
  }
}


function calcularValoresRateioUsuarioConsolidadoController_(rateios, idUsuario) {
  const idLogado = normalizarTextoConsolidadoController_(idUsuario);
  const resultado = {
    valorAPagar: 0,
    valorAReceber: 0
  };

  (rateios || []).forEach(function(rateio) {
    const responsavel = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel);
    const credor = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Credor);
    const valor = converterNumeroConsolidadoController_(rateio.Valor_Rateado);

    if (!responsavel || !credor || responsavel === credor || valor <= 0) {
      return;
    }

    if (responsavel === idLogado) {
      resultado.valorAPagar += valor;
    }

    if (credor === idLogado) {
      resultado.valorAReceber += valor;
    }
  });

  return resultado;
}


function ehTransferenciaConsolidadoController_(tipo) {
  return normalizarTextoConsolidadoController_(tipo).indexOf("Transfer") === 0;
}


function gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtros) {
  const mesInicial = normalizarTextoConsolidadoController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia));
  const mesFinal = obterMesFinalEfetivoConsolidadoController_(filtros);
  const inicioMes = obterInicioMesConsolidadoController_(mesInicial);
  const fimMes = obterFimMesConsolidadoController_(mesFinal);
  const rateiosPorRecorrencia = agruparRateiosRecorrenciasConsolidadoController_(contexto.recorrenciasRateiosTodos || []);
  const resultado = {
    lancamentos: [],
    rateiosPorLancamento: {}
  };

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    const idRecorrencia = normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia);
    const rateiosRecorrencia = rateiosPorRecorrencia[idRecorrencia] || [];

    if (
      normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia) !== "Ativa" ||
      !usuarioParticipaRecorrenciaConsolidadoController_(recorrencia, contexto, rateiosRecorrencia)
    ) {
      return;
    }

    const ocorrencias = listarOcorrenciasPendentesNoPeriodoConsolidadoController_(
      recorrencia,
      contexto,
      inicioMes,
      fimMes
    );

    ocorrencias.forEach(function(dataOcorrencia) {
      const lancamentoProgramado = montarLancamentoProgramadoRecorrenciaConsolidadoController_(
        recorrencia,
        contexto,
        dataOcorrencia
      );

      if (!mesReferenciaEstaNoIntervaloConsolidadoController_(
        normalizarTextoConsolidadoController_(lancamentoProgramado.Mes_Referencia),
        mesInicial,
        mesFinal
      )) {
        return;
      }

      resultado.lancamentos.push(lancamentoProgramado);

      const rateiosProgramados = montarRateiosProgramadosRecorrenciaConsolidadoController_(
        recorrencia,
        contexto,
        dataOcorrencia,
        rateiosRecorrencia
      );

      if (rateiosProgramados.length > 0) {
        resultado.rateiosPorLancamento[lancamentoProgramado.ID_Lancamento] = rateiosProgramados;
      }
    });
  });

  return resultado;
}


function montarLancamentoProgramadoRecorrenciaConsolidadoController_(recorrencia, contexto, dataOcorrencia) {
  const data = normalizarTextoConsolidadoController_(dataOcorrencia);
  const tipo = normalizarTextoConsolidadoController_(recorrencia.Tipo);
  const tipoOrigem = normalizarTextoConsolidadoController_(recorrencia.Tipo_Origem);
  const idOrigem = normalizarTextoConsolidadoController_(recorrencia.ID_Origem);
  const mesReferencia = typeof obterMesReferenciaLancamentoPorContexto_ === "function"
    ? obterMesReferenciaLancamentoPorContexto_(data, tipoOrigem, idOrigem, contexto)
    : data.substring(0, 7);

  return {
    ID_Lancamento: "recorrencia:" + normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia) + ":" + data,
    _Programado_Recorrencia: true,
    ID_Recorrencia_Origem: recorrencia.ID_Recorrencia,
    Data_Ocorrencia_Recorrencia: data,
    Tipo: tipo,
    Descricao: recorrencia.Descricao,
    Valor_Total: recorrencia.Valor_Base,
    Data_Ocorrencia: data,
    Mes_Referencia: mesReferencia,
    ID_Categoria: tipo === "Transferência" ? "" : recorrencia.ID_Categoria,
    Tipo_Origem: tipoOrigem,
    ID_Origem: idOrigem,
    ID_Destino: tipo === "Transferência" ? recorrencia.ID_Destino : "",
    ID_Projeto: recorrencia.ID_Projeto,
    Status: recorrencia.Status_Lancamento || "Pendente",
    Criado_Por_ID: recorrencia.Criado_Por_ID || recorrencia.ID_Usuario || contexto.idLogado
  };
}


function usuarioParticipaRecorrenciaConsolidadoController_(recorrencia, contexto, rateiosRecorrencia) {
  if (normalizarTextoConsolidadoController_(recorrencia.ID_Usuario) === contexto.idLogado) {
    return true;
  }

  const credor = determinarCredorRecorrenciaConsolidadoController_(recorrencia, contexto);

  if (credor === contexto.idLogado) {
    return true;
  }

  return (rateiosRecorrencia || []).some(function(rateio) {
    const responsavel = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel);
    const credorRateio = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Credor);

    return responsavel === contexto.idLogado || credorRateio === contexto.idLogado;
  });
}


function montarRateiosProgramadosRecorrenciaConsolidadoController_(recorrencia, contexto, dataOcorrencia, rateiosRecorrencia) {
  if (normalizarTextoConsolidadoController_(recorrencia.Tipo) === "Transferência") {
    return [];
  }

  const credor = determinarCredorRecorrenciaConsolidadoController_(recorrencia, contexto);
  const idLancamentoProgramado = "recorrencia:" +
    normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia) + ":" +
    normalizarTextoConsolidadoController_(dataOcorrencia);

  if (!credor) {
    return [];
  }

  return (rateiosRecorrencia || []).map(function(rateio) {
    return {
      ID_Rateio: "recorrencia-rateio:" + normalizarTextoConsolidadoController_(rateio.ID_Recorrencia_Rateio || rateio.ID_Usuario_Responsavel) + ":" + normalizarTextoConsolidadoController_(dataOcorrencia),
      ID_Lancamento: idLancamentoProgramado,
      ID_Usuario_Responsavel: rateio.ID_Usuario_Responsavel,
      ID_Usuario_Credor: credor,
      Valor_Rateado: rateio.Valor_Rateado,
      Percentual: rateio.Percentual,
      Status: "Pendente",
      _Programado_Recorrencia: true
    };
  });
}


function combinarRateiosLancadosEProgramadosConsolidadoController_(rateiosLancados, rateiosProgramados) {
  const combinado = {};

  Object.keys(rateiosLancados || {}).forEach(function(idLancamento) {
    combinado[idLancamento] = (rateiosLancados[idLancamento] || []).slice();
  });

  Object.keys(rateiosProgramados || {}).forEach(function(idLancamento) {
    combinado[idLancamento] = (rateiosProgramados[idLancamento] || []).slice();
  });

  return combinado;
}


function calcularCartoesConsolidadosController_(contexto, lancamentosMes, filtros) {
  const mapa = {};
  const cartoesAcessiveis = {};
  const mesInicial = normalizarTextoConsolidadoController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia));
  const mesFinal = obterMesFinalEfetivoConsolidadoController_(filtros);
  const considerarHistoricoAnterior = !filtros || filtros.Considerar_Historico_Anterior !== false;

  contexto.cartoesAcessiveis.forEach(function(cartao) {
    cartoesAcessiveis[cartao.ID_Cartao] = cartao;
  });

  lancamentosMes.forEach(function(lancamento) {
    if (!ehTipoOrigemCartaoConsolidadoController_(lancamento.Tipo_Origem)) {
      return;
    }

    const cartao = cartoesAcessiveis[normalizarTextoConsolidadoController_(lancamento.ID_Origem)];

    if (!cartao) {
      return;
    }

    const mesLancamento = typeof obterMesCompetenciaCartaoLancamentoConsolidadoController_ === "function"
      ? obterMesCompetenciaCartaoLancamentoConsolidadoController_(lancamento, contexto)
      : normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);

    if (!lancamentoCartaoDentroPeriodoConsolidadoController_(mesLancamento, mesInicial, mesFinal, considerarHistoricoAnterior)) {
      return;
    }

    const idGrupo = normalizarTextoConsolidadoController_(cartao.ID_Grupo_Cartao);

    if (!mapa[idGrupo]) {
      mapa[idGrupo] = {
        ID_Grupo_Cartao: idGrupo,
        Nome_Grupo: cartao.Nome_Grupo || cartao.Nome_Cartao || "Fatura",
        Valor_Fatura: 0,
        Valor_Pago: 0,
        Valor_Em_Aberto: 0,
        Quantidade_Lancamentos: 0
      };
    }

    mapa[idGrupo].Valor_Fatura += converterNumeroConsolidadoController_(lancamento.Valor_Total);
    mapa[idGrupo].Quantidade_Lancamentos += 1;
  });

  (contexto.pagamentosFaturasTodos || []).forEach(function(pagamento) {
    const idGrupo = normalizarTextoConsolidadoController_(pagamento.ID_Grupo_Cartao);
    const mesPagamento = normalizarTextoConsolidadoController_(pagamento.Mes_Referencia);

    if (
      !mapa[idGrupo] ||
      !lancamentoCartaoDentroPeriodoConsolidadoController_(mesPagamento, mesInicial, mesFinal, considerarHistoricoAnterior)
    ) {
      return;
    }

    mapa[idGrupo].Valor_Pago += converterNumeroConsolidadoController_(pagamento.Valor);
  });

  return Object.keys(mapa).map(function(idGrupo) {
    mapa[idGrupo].Valor_Fatura = arredondarConsolidadoController_(mapa[idGrupo].Valor_Fatura);
    mapa[idGrupo].Valor_Pago = arredondarConsolidadoController_(mapa[idGrupo].Valor_Pago);
    mapa[idGrupo].Valor_Em_Aberto = arredondarConsolidadoController_(
      Math.max(0, mapa[idGrupo].Valor_Fatura - mapa[idGrupo].Valor_Pago)
    );
    return mapa[idGrupo];
  }).sort(function(a, b) {
    return b.Valor_Em_Aberto - a.Valor_Em_Aberto;
  });
}


function lancamentoCartaoDentroPeriodoConsolidadoController_(mesReferencia, mesInicial, mesFinal, considerarHistoricoAnterior) {
  const mes = normalizarTextoConsolidadoController_(mesReferencia);
  const inicio = normalizarTextoConsolidadoController_(mesInicial);
  const fim = obterMesFinalEfetivoConsolidadoController_({
    Mes_Inicial: inicio,
    Mes_Final: normalizarTextoConsolidadoController_(mesFinal)
  });

  if (!mes) {
    return false;
  }

  if (considerarHistoricoAnterior !== false) {
    return !fim || mes <= fim;
  }

  return mesReferenciaEstaNoIntervaloConsolidadoController_(mes, inicio, fim);
}


function calcularOrcamentoConsolidadoController_(contexto, filtros, recorrenciasProgramadas) {
  if (typeof obterPacoteTelaOrcamentos !== "function") {
    return { itens: [], resumo: {} };
  }

  const mesReferencia = normalizarTextoConsolidadoController_(
    filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia)
  );
  const pacote = obterPacoteTelaOrcamentosPorContextoConsolidadoController_(contexto, mesReferencia);
  const mapaRealizado = calcularRealizadoPorCategoriaPeriodoOrcamentoConsolidadoController_(
    contexto,
    filtros,
    contexto.lancamentosTodos || [],
    mapearRateiosPorLancamentoOrcamentoController_(contexto.rateiosTodos || [])
  );
  const mapaPrevisto = calcularRealizadoPorCategoriaPeriodoOrcamentoConsolidadoController_(
    contexto,
    filtros,
    recorrenciasProgramadas && recorrenciasProgramadas.lancamentos ? recorrenciasProgramadas.lancamentos : [],
    recorrenciasProgramadas && recorrenciasProgramadas.rateiosPorLancamento ? recorrenciasProgramadas.rateiosPorLancamento : {}
  );
  const itens = montarGastosCategoriaPaiOrcamentoConsolidadoController_(
      contexto,
      pacote.itens || [],
      mapaRealizado,
      mapaPrevisto
    )
    .sort(function(a, b) {
      return converterNumeroConsolidadoController_(b.Valor_Realizado) - converterNumeroConsolidadoController_(a.Valor_Realizado);
    });

  return {
    itens: itens,
    resumo: pacote.resumo || {}
  };
}

function montarGastosCategoriaPaiOrcamentoConsolidadoController_(contexto, itensOrcamento, mapaRealizado, mapaPrevisto) {
  const mapaCategorias = mapearCategoriasPorIdConsolidadoController_(contexto.categoriasTodas || []);
  const mapa = {};

  somarMapaCategoriaPaiOrcamentoConsolidadoController_(mapa, mapaCategorias, mapaRealizado, "Valor_Real");
  somarMapaCategoriaPaiOrcamentoConsolidadoController_(mapa, mapaCategorias, mapaPrevisto, "Valor_Previsto");

  Object.keys(mapa).forEach(function(idPai) {
    mapa[idPai].Valor_Realizado = mapa[idPai].Valor_Real + mapa[idPai].Valor_Previsto;
  });

  (itensOrcamento || []).forEach(function(item) {
    if (item.Ativo !== true) {
      return;
    }

    const idCategoriaItem = normalizarTextoConsolidadoController_(item.ID_Categoria);
    const categoria = mapaCategorias[idCategoriaItem] || null;
    const categoriaPai = obterCategoriaRaizOrcamentoConsolidadoController_(categoria, mapaCategorias);
    const idPai = normalizarTextoConsolidadoController_(
      categoriaPai && categoriaPai.ID_Categoria ? categoriaPai.ID_Categoria : idCategoriaItem
    );

    if (!idPai) {
      return;
    }

    if (!mapa[idPai]) {
      mapa[idPai] = criarItemCategoriaPaiOrcamentoConsolidadoController_(
        idPai,
        categoriaPai && categoriaPai.Nome ? categoriaPai.Nome : item.Nome_Categoria
      );
    }

    mapa[idPai].Valor_Teto += converterNumeroConsolidadoController_(item.Valor_Teto);
    mapa[idPai].Tem_Orcamento = true;
    mapa[idPai].Quantidade_Orcamentos += 1;
  });

  return Object.keys(mapa).map(function(idPai) {
    const item = mapa[idPai];
    item.Valor_Teto = arredondarConsolidadoController_(item.Valor_Teto);
    item.Valor_Real = arredondarConsolidadoController_(item.Valor_Real);
    item.Valor_Previsto = arredondarConsolidadoController_(item.Valor_Previsto);
    item.Valor_Realizado = arredondarConsolidadoController_(item.Valor_Real + item.Valor_Previsto);
    item.Saldo = item.Tem_Orcamento
      ? arredondarConsolidadoController_(item.Valor_Teto - item.Valor_Realizado)
      : 0;
    item.Percentual_Usado = item.Tem_Orcamento && item.Valor_Teto > 0
      ? Math.round((item.Valor_Realizado / item.Valor_Teto) * 100)
      : 0;
    item.Status_Visual = !item.Tem_Orcamento
      ? "sem_meta"
      : item.Percentual_Usado >= 100
      ? "estourado"
      : item.Percentual_Usado >= 70
        ? "atencao"
        : "ok";
    return item;
  });
}

function somarMapaCategoriaPaiOrcamentoConsolidadoController_(mapa, mapaCategorias, valoresPorCategoria, campoValor) {
  Object.keys(valoresPorCategoria || {}).forEach(function(idCategoria) {
    const idCategoriaNormalizado = normalizarTextoConsolidadoController_(idCategoria);
    const categoria = mapaCategorias[idCategoriaNormalizado] || null;
    const categoriaPai = obterCategoriaRaizOrcamentoConsolidadoController_(categoria, mapaCategorias);
    const idPai = normalizarTextoConsolidadoController_(
      categoriaPai && categoriaPai.ID_Categoria ? categoriaPai.ID_Categoria : idCategoriaNormalizado
    );

    if (!idPai) {
      return;
    }

    if (!mapa[idPai]) {
      mapa[idPai] = criarItemCategoriaPaiOrcamentoConsolidadoController_(
        idPai,
        categoriaPai && categoriaPai.Nome ? categoriaPai.Nome : "Sem categoria"
      );
    }

    mapa[idPai][campoValor] += converterNumeroConsolidadoController_(valoresPorCategoria[idCategoria]);
  });
}

function criarItemCategoriaPaiOrcamentoConsolidadoController_(idCategoria, nomeCategoria) {
  return {
    ID_Categoria: idCategoria,
    ID_Categoria_Pai: idCategoria,
    Nome_Categoria: normalizarTextoConsolidadoController_(nomeCategoria) || "Categoria",
    Valor_Teto: 0,
    Valor_Real: 0,
    Valor_Previsto: 0,
    Valor_Realizado: 0,
    Saldo: 0,
    Percentual_Usado: 0,
    Ativo: true,
    Tem_Orcamento: false,
    Status_Visual: "sem_meta",
    Quantidade_Orcamentos: 0
  };
}

function calcularRealizadoPorCategoriaPeriodoOrcamentoConsolidadoController_(contexto, filtros, lancamentos, rateiosPorLancamento) {
  const mapa = {};
  const mesInicial = normalizarTextoConsolidadoController_(filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia));
  const mesFinal = normalizarTextoConsolidadoController_(filtros && filtros.Mes_Final) || mesInicial;
  const idsLancamentosComRateio = rateiosPorLancamento || {};

  (lancamentos || []).forEach(function(lancamento) {
    const mesLancamento = normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);

    if (normalizarTextoConsolidadoController_(lancamento.Tipo) !== "Despesa") return;
    if (!mesReferenciaEstaNoIntervaloConsolidadoController_(mesLancamento, mesInicial, mesFinal)) return;

    const idCategoria = normalizarTextoConsolidadoController_(lancamento.ID_Categoria);
    const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
    const ehAutor = normalizarTextoConsolidadoController_(lancamento.Criado_Por_ID) === contexto.idLogado;
    const rateios = idsLancamentosComRateio[idLancamento] || [];
    let valor = 0;

    if (!idCategoria) {
      return;
    }

    if (rateios.length > 0) {
      rateios.forEach(function(rateio) {
        if (
          normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel) === contexto.idLogado &&
          normalizarTextoConsolidadoController_(rateio.Status) !== "Cancelado"
        ) {
          valor += converterNumeroConsolidadoController_(rateio.Valor_Rateado);
        }
      });
    } else if (ehAutor) {
      valor = converterNumeroConsolidadoController_(lancamento.Valor_Total);
    }

    if (valor > 0) {
      mapa[idCategoria] = (mapa[idCategoria] || 0) + valor;
    }
  });

  return mapa;
}

function obterCategoriaRaizOrcamentoConsolidadoController_(categoria, mapaCategorias) {
  if (!categoria) {
    return null;
  }

  let atual = categoria;
  const visitados = {};

  while (atual && normalizarTextoConsolidadoController_(atual.ID_Categoria)) {
    const idAtual = normalizarTextoConsolidadoController_(atual.ID_Categoria);
    const idPai = normalizarTextoConsolidadoController_(atual.ID_Categoria_Pai);

    if (!idPai || visitados[idAtual] || !mapaCategorias[idPai]) {
      return atual;
    }

    visitados[idAtual] = true;
    atual = mapaCategorias[idPai];
  }

  return categoria;
}

function mapearCategoriasPorIdConsolidadoController_(categorias) {
  const mapa = {};

  (categorias || []).forEach(function(categoria) {
    const id = normalizarTextoConsolidadoController_(categoria.ID_Categoria);

    if (id) {
      mapa[id] = categoria;
    }
  });

  return mapa;
}


function obterPacoteTelaOrcamentosPorContextoConsolidadoController_(contexto, mesReferencia) {
  const mapaRealizado = calcularRealizadoPorCategoriaOrcamentoController_(contexto, mesReferencia);
  const itensUsuario = contexto.orcamentosTodos
    .filter(function(item) {
      return normalizarTextoConsolidadoController_(item.ID_Usuario) === contexto.idLogado;
    })
    .map(function(item) {
      return montarItemOrcamentoParaTelaController_(item, contexto, mapaRealizado);
    });

  return {
    itens: itensUsuario,
    mapaRealizado: mapaRealizado,
    resumo: calcularResumoOrcamentosController_(itensUsuario.filter(function(item) {
      return item.Ativo === true;
    }))
  };
}


function calcularAcertosRateioConsolidadoController_(contexto, lancamentosMes, rateiosPorLancamento, filtros) {
  const mapaUsuarios = mapearUsuariosPorIdConsolidadoController_(contexto.usuariosTodos);
  const mapa = {};
  const filtrosNormalizados = filtros || {};

  lancamentosMes.forEach(function(lancamento) {
    if (!mesReferenciaEstaNoIntervaloConsolidadoController_(
      normalizarTextoConsolidadoController_(lancamento.Mes_Referencia),
      filtrosNormalizados.Mes_Inicial,
      filtrosNormalizados.Mes_Final || filtrosNormalizados.Mes_Inicial
    )) {
      return;
    }

    const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
    const rateios = rateiosPorLancamento[idLancamento] || [];
    const ehProgramado = lancamento._Programado_Recorrencia === true;
    const tipoLancamento = normalizarTextoConsolidadoController_(lancamento.Tipo);

    rateios.forEach(function(rateio) {
      if (normalizarTextoConsolidadoController_(rateio.Status) === "Cancelado") {
        return;
      }

      const responsavel = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel);
      const credor = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Credor);
      const valor = converterNumeroConsolidadoController_(rateio.Valor_Rateado);

      if (!responsavel || !credor || responsavel === credor || valor <= 0) {
        return;
      }

      if (!mapa[responsavel]) {
        mapa[responsavel] = { lancado: 0, programado: 0, idsLancamentos: {}, programados: 0 };
      }

      if (!mapa[credor]) {
        mapa[credor] = { lancado: 0, programado: 0, idsLancamentos: {}, programados: 0 };
      }

      if (tipoLancamento === "Receita") {
        if (responsavel === contexto.idLogado) {
          if (ehProgramado) {
            mapa[credor].programado += valor;
            mapa[credor].programados += 1;
          } else {
            mapa[credor].lancado += valor;
            mapa[credor].idsLancamentos[idLancamento] = true;
          }
        }

        if (credor === contexto.idLogado) {
          if (ehProgramado) {
            mapa[responsavel].programado -= valor;
            mapa[responsavel].programados += 1;
          } else {
            mapa[responsavel].lancado -= valor;
            mapa[responsavel].idsLancamentos[idLancamento] = true;
          }
        }

        return;
      }

      if (responsavel === contexto.idLogado) {
        if (ehProgramado) {
          mapa[credor].programado -= valor;
          mapa[credor].programados += 1;
        } else {
          mapa[credor].lancado -= valor;
          mapa[credor].idsLancamentos[idLancamento] = true;
        }
      }

      if (credor === contexto.idLogado) {
        if (ehProgramado) {
          mapa[responsavel].programado += valor;
          mapa[responsavel].programados += 1;
        } else {
          mapa[responsavel].lancado += valor;
          mapa[responsavel].idsLancamentos[idLancamento] = true;
        }
      }
    });
  });

  return Object.keys(mapa).map(function(idUsuario) {
    const itemMapa = mapa[idUsuario] || { lancado: 0, programado: 0, idsLancamentos: {}, programados: 0 };
    const valorLancado = arredondarConsolidadoController_(itemMapa.lancado || 0);
    const valorProgramado = arredondarConsolidadoController_(itemMapa.programado || 0);
    const saldoLiquido = arredondarConsolidadoController_(valorLancado + valorProgramado);

    return {
      Tipo: saldoLiquido < 0 ? "Pagar" : "Receber",
      ID_Usuario: idUsuario,
      Nome_Usuario: mapaUsuarios[idUsuario] || "Usuário",
      Valor: arredondarConsolidadoController_(Math.abs(saldoLiquido)),
      Valor_Lancado: arredondarConsolidadoController_(Math.abs(valorLancado)),
      Valor_Programado: arredondarConsolidadoController_(Math.abs(valorProgramado)),
      IDs_Lancamentos: Object.keys(itemMapa.idsLancamentos || {}),
      Quantidade_Programada: itemMapa.programados || 0
    };
  }).filter(function(item) {
    return item.Valor > 0;
  }).sort(function(a, b) {
    return b.Valor - a.Valor;
  });
}


function calcularProjetosDashboardConsolidadoController_(
  contexto,
  lancamentosVisiveis
) {
  const mapaProjetosAcessiveis = {};
  const gruposProjetos = {};

  (contexto.projetosAcessiveis || []).forEach(function(projeto) {
    const idProjeto = normalizarTextoConsolidadoController_(projeto.ID_Projeto);

    if (!idProjeto) {
      return;
    }

    mapaProjetosAcessiveis[idProjeto] = projeto;
  });

  (lancamentosVisiveis || []).forEach(function(lancamento) {
    const idProjeto = normalizarTextoConsolidadoController_(lancamento.ID_Projeto);

    if (!idProjeto || !mapaProjetosAcessiveis[idProjeto]) {
      return;
    }

    if (!gruposProjetos[idProjeto]) {
      gruposProjetos[idProjeto] = [];
    }

    gruposProjetos[idProjeto].push(lancamento);
  });

  return Object.keys(gruposProjetos).map(function(idProjeto) {
    const projeto = mapaProjetosAcessiveis[idProjeto] || {};
    const lancamentosProjeto = gruposProjetos[idProjeto] || [];
    const totais = lancamentosProjeto.reduce(function(acumulado, lancamento) {
      const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
      const valor = converterNumeroConsolidadoController_(lancamento.Valor_Total);

      if (tipo === "Receita") acumulado.receitas += valor;
      if (tipo === "Despesa") acumulado.despesas += valor;
      return acumulado;
    }, { receitas: 0, despesas: 0 });
    const receitas = totais.receitas;
    const despesas = totais.despesas;
    const saldo = receitas - despesas;
    const movimentacao = Math.abs(receitas) + Math.abs(despesas);

    return {
      ID_Projeto: idProjeto,
      Nome: normalizarTextoConsolidadoController_(projeto.Nome || projeto.Nome_Projeto || "Projeto"),
      Compartilhado: normalizarBooleanoConsolidadoController_(projeto.Compartilhado),
      Status: normalizarBooleanoConsolidadoController_(projeto.Status) !== false,
      Saldo_Anterior: 0,
      Receitas: arredondarConsolidadoController_(receitas),
      Despesas: arredondarConsolidadoController_(despesas),
      Saldo: arredondarConsolidadoController_(saldo),
      Resultado_Periodo: arredondarConsolidadoController_(saldo),
      Movimentacao: arredondarConsolidadoController_(movimentacao),
      Considera_Historico_Anterior: true,
      Escopo: "Total_Historico",
      Quantidade_Lancamentos: lancamentosProjeto.length,
      Quantidade_Anteriores: 0,
      Quantidade_Programada: 0
    };
  }).filter(function(item) {
    return item.Movimentacao > 0;
  }).sort(function(a, b) {
    return b.Movimentacao - a.Movimentacao;
  }).slice(0, 5);
}


function calcularPendenciasConsolidadasController_(contexto, lancamentosVisiveis, filtros) {
  const pendencias = [];
  const lancamentosPendentes = lancamentosVisiveis.filter(function(lancamento) {
    return normalizarTextoConsolidadoController_(lancamento.Mes_Referencia) === filtros.Mes_Referencia &&
      normalizarTextoConsolidadoController_(lancamento.Status) === "Pendente";
  });
  const recorrenciasManuaisPendentes = listarOcorrenciasManuaisPendentesPeriodoConsolidadoController_(
    contexto,
    filtros
  );
  const recorrenciasRevisao = contexto.recorrenciasTodos.filter(function(recorrencia) {
    return normalizarTextoConsolidadoController_(recorrencia.ID_Usuario) === contexto.idLogado &&
      normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia) === "Revisão necessária";
  });

  if (lancamentosPendentes.length > 0) {
    pendencias.push({
      Tipo: "Lançamentos pendentes",
      Quantidade: lancamentosPendentes.length,
      Mensagem: "Há lançamentos pendentes para conciliação no mês.",
      Tela: "Lancamentos"
    });
  }

  if (recorrenciasManuaisPendentes.length > 0) {
    pendencias.push({
      Tipo: "Recorrências manuais",
      Quantidade: recorrenciasManuaisPendentes.length,
      Mensagem: "Há ocorrências manuais pendentes para geração no período.",
      Tela: "Recorrencias"
    });
  }

  if (recorrenciasRevisao.length > 0) {
    pendencias.push({
      Tipo: "Recorrências em revisão",
      Quantidade: recorrenciasRevisao.length,
      Mensagem: "Há recorrências que precisam de reavaliação.",
      Tela: "Recorrencias"
    });
  }

  return pendencias;
}


function listarOcorrenciasManuaisPendentesPeriodoConsolidadoController_(contexto, filtros) {
  const inicioMes = obterInicioMesConsolidadoController_(filtros.Mes_Inicial || filtros.Mes_Referencia);
  const fimMes = obterFimMesConsolidadoController_(obterMesFinalEfetivoConsolidadoController_(filtros));
  const ocorrencias = [];

  if (!inicioMes || !fimMes) {
    return ocorrencias;
  }

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    if (
      normalizarTextoConsolidadoController_(recorrencia.ID_Usuario) !== contexto.idLogado ||
      normalizarTextoConsolidadoController_(recorrencia.Modo_Geracao) !== "Manual" ||
      normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia) !== "Ativa"
    ) {
      return;
    }

    listarOcorrenciasPendentesNoPeriodoConsolidadoController_(
      recorrencia,
      contexto,
      inicioMes,
      fimMes
    ).forEach(function(dataOcorrencia) {
      ocorrencias.push({
        ID_Recorrencia: recorrencia.ID_Recorrencia,
        Data_Ocorrencia: dataOcorrencia
      });
    });
  });

  return ocorrencias;
}


function calcularSaldoContaAteDataConsolidadoController_(conta, lancamentos, dataFim) {
  const idConta = normalizarTextoConsolidadoController_(conta.ID_Conta);
  let saldo = conta.Data_Saldo_Inicial && conta.Data_Saldo_Inicial > dataFim
    ? 0 : converterNumeroConsolidadoController_(conta.Saldo_Inicial);

  lancamentos.forEach(function(lancamento) {
    const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);

    if (!data || data > dataFim) {
      return;
    }

    const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
    const tipoOrigem = lancamento.Tipo_Origem;
    const origem = normalizarTextoConsolidadoController_(lancamento.ID_Origem);
    const destino = normalizarTextoConsolidadoController_(lancamento.ID_Destino);
    const valor = converterNumeroConsolidadoController_(lancamento.Valor_Total);

    if (tipo === "Receita" && tipoOrigem === "Conta" && origem === idConta) {
      saldo += valor;
    }

    if (tipo === "Despesa" && tipoOrigem === "Conta" && origem === idConta) {
      saldo -= valor;
    }

    if (tipo === "Transferência") {
      if (origem === idConta) saldo -= valor;
      if (destino === idConta) saldo += valor;
    }
  });

  if (conta && conta._contextoPagamentosFaturas) {
    conta._contextoPagamentosFaturas.forEach(function(pagamento) {
      const data = normalizarTextoConsolidadoController_(pagamento.Data_Pagamento);

      if (!data || data > dataFim) {
        return;
      }

      if (normalizarTextoConsolidadoController_(pagamento.ID_Conta) === idConta) {
        saldo -= converterNumeroConsolidadoController_(pagamento.Valor);
      }
    });
  }

  return saldo;
}


function calcularMovimentoContaNoPeriodoConsolidadoController_(conta, lancamentos, dataInicio, dataFim) {
  const idConta = normalizarTextoConsolidadoController_(conta.ID_Conta);
  const inicio = normalizarTextoConsolidadoController_(dataInicio);
  const fim = normalizarTextoConsolidadoController_(dataFim);
  let saldo = somarSaldosIniciaisNoPeriodo_([conta], inicio, fim);

  (lancamentos || []).forEach(function(lancamento) {
    const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);

    if (!data || data < inicio || data > fim) {
      return;
    }

    const tipo = normalizarTextoConsolidadoController_(lancamento.Tipo);
    const tipoOrigem = normalizarTextoConsolidadoController_(lancamento.Tipo_Origem);
    const origem = normalizarTextoConsolidadoController_(lancamento.ID_Origem);
    const destino = normalizarTextoConsolidadoController_(lancamento.ID_Destino);
    const valor = converterNumeroConsolidadoController_(lancamento.Valor_Total);

    if (tipo === "Receita" && tipoOrigem === "Conta" && origem === idConta) {
      saldo += valor;
    }

    if (tipo === "Despesa" && tipoOrigem === "Conta" && origem === idConta) {
      saldo -= valor;
    }

    if (ehTransferenciaConsolidadoController_(tipo)) {
      if (origem === idConta) saldo -= valor;
      if (destino === idConta) saldo += valor;
    }
  });

  if (conta && conta._contextoPagamentosFaturas) {
    conta._contextoPagamentosFaturas.forEach(function(pagamento) {
      const data = normalizarTextoConsolidadoController_(pagamento.Data_Pagamento);

      if (!data || data < inicio || data > fim) {
        return;
      }

      if (normalizarTextoConsolidadoController_(pagamento.ID_Conta) === idConta) {
        saldo -= converterNumeroConsolidadoController_(pagamento.Valor);
      }
    });
  }

  return saldo;
}


function calcularProjecaoRecorrenciasContaController_(conta, contexto, mesReferencia) {
  const idConta = normalizarTextoConsolidadoController_(conta.ID_Conta);
  const inicioMes = obterInicioMesConsolidadoController_(mesReferencia);
  const fimMes = obterFimMesConsolidadoController_(mesReferencia);
  const hoje = gerarDataHojeConsolidadoController_();
  const inicioJanela = obterInicioJanelaProjecaoRecorrenciasConsolidadoController_(inicioMes, fimMes, hoje);
  let total = 0;

  if (!inicioJanela) {
    return total;
  }

  contexto.recorrenciasTodos.forEach(function(recorrencia) {
    if (
      normalizarTextoConsolidadoController_(recorrencia.ID_Usuario) !== contexto.idLogado ||
      normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia) !== "Ativa"
    ) {
      return;
    }

    const tipo = normalizarTextoConsolidadoController_(recorrencia.Tipo);
    const tipoOrigem = normalizarTextoConsolidadoController_(recorrencia.Tipo_Origem);
    const origem = normalizarTextoConsolidadoController_(recorrencia.ID_Origem);
    const destino = normalizarTextoConsolidadoController_(recorrencia.ID_Destino);
    const valor = converterNumeroConsolidadoController_(recorrencia.Valor_Base);
    const ocorrencias = listarOcorrenciasPendentesNoPeriodoConsolidadoController_(recorrencia, contexto, inicioJanela, fimMes);

    ocorrencias.forEach(function() {
      if (tipo === "Receita" && tipoOrigem === "Conta" && origem === idConta) {
        total += valor;
      }

      if (tipo === "Despesa" && tipoOrigem === "Conta" && origem === idConta) {
        total -= valor;
      }

      if (tipo === "Transferência") {
        if (origem === idConta) total -= valor;
        if (destino === idConta) total += valor;
      }
    });
  });

  return total;
}


function calcularCompromissosCartaoAteDataConsolidadoController_(contexto, lancamentosVisiveis, dataFim, dataInicio) {
  const fim = normalizarTextoConsolidadoController_(dataFim);
  const inicio = normalizarTextoConsolidadoController_(dataInicio);
  const cartoesAcessiveis = {};
  const totaisPorGrupo = {};

  if (!fim) {
    return 0;
  }

  (contexto.cartoesAcessiveis || []).forEach(function(cartao) {
    const idCartao = normalizarTextoConsolidadoController_(cartao.ID_Cartao);
    const idGrupo = normalizarTextoConsolidadoController_(cartao.ID_Grupo_Cartao);

    if (idCartao && idGrupo) {
      cartoesAcessiveis[idCartao] = idGrupo;
      if (totaisPorGrupo[idGrupo] === undefined) {
        totaisPorGrupo[idGrupo] = 0;
      }
    }
  });

  (lancamentosVisiveis || []).forEach(function(lancamento) {
    const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);
    const tipoOrigem = normalizarTextoConsolidadoController_(lancamento.Tipo_Origem);
    const idOrigem = normalizarTextoConsolidadoController_(lancamento.ID_Origem);
    const idGrupo = cartoesAcessiveis[idOrigem];

    if (!data || data > fim || (inicio && data < inicio) || !ehTipoOrigemCartaoConsolidadoController_(tipoOrigem) || !idGrupo) {
      return;
    }

    totaisPorGrupo[idGrupo] += calcularImpactoCompromissoCartaoConsolidadoController_(lancamento.Tipo, lancamento.Valor_Total);
  });

  (contexto.pagamentosFaturasTodos || []).forEach(function(pagamento) {
    const data = normalizarTextoConsolidadoController_(pagamento.Data_Pagamento);
    const idGrupo = normalizarTextoConsolidadoController_(pagamento.ID_Grupo_Cartao);

    if (!data || data > fim || (inicio && data < inicio) || totaisPorGrupo[idGrupo] === undefined) {
      return;
    }

    totaisPorGrupo[idGrupo] -= converterNumeroConsolidadoController_(pagamento.Valor);
  });

  return Object.keys(totaisPorGrupo).reduce(function(total, idGrupo) {
    return total + Math.max(0, totaisPorGrupo[idGrupo]);
  }, 0);
}


function calcularProjecaoRecorrenciasCartaoController_(contexto, mesReferencia) {
  const cartoesAcessiveis = {};
  const inicioMes = obterInicioMesConsolidadoController_(mesReferencia);
  const fimMes = obterFimMesConsolidadoController_(mesReferencia);
  const hoje = gerarDataHojeConsolidadoController_();
  const inicioJanela = obterInicioJanelaProjecaoRecorrenciasConsolidadoController_(inicioMes, fimMes, hoje);
  let total = 0;

  if (!inicioJanela) {
    return total;
  }

  (contexto.cartoesAcessiveis || []).forEach(function(cartao) {
    const idCartao = normalizarTextoConsolidadoController_(cartao.ID_Cartao);

    if (idCartao) {
      cartoesAcessiveis[idCartao] = true;
    }
  });

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    const tipoOrigem = recorrencia.Tipo_Origem;
    const origem = normalizarTextoConsolidadoController_(recorrencia.ID_Origem);

    if (
      normalizarTextoConsolidadoController_(recorrencia.ID_Usuario) !== contexto.idLogado ||
      normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia) !== "Ativa" ||
      !ehTipoOrigemCartaoConsolidadoController_(tipoOrigem) ||
      cartoesAcessiveis[origem] !== true
    ) {
      return;
    }

    const valor = converterNumeroConsolidadoController_(recorrencia.Valor_Base);
    const ocorrencias = listarOcorrenciasPendentesNoPeriodoConsolidadoController_(recorrencia, contexto, inicioJanela, fimMes);

    ocorrencias.forEach(function() {
      total += calcularImpactoCompromissoCartaoConsolidadoController_(recorrencia.Tipo, valor);
    });
  });

  return total;
}


function calcularImpactoCompromissoCartaoConsolidadoController_(tipo, valor) {
  const tipoNormalizado = normalizarTextoConsolidadoController_(tipo);
  const valorNumerico = converterNumeroConsolidadoController_(valor);

  if (tipoNormalizado === "Despesa") {
    return valorNumerico;
  }

  if (tipoNormalizado === "Receita") {
    return -valorNumerico;
  }

  return 0;
}


function ehTipoOrigemCartaoConsolidadoController_(valor) {
  return normalizarTextoConsolidadoController_(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") === "cartao";
}


function calcularImpactoRateiosAteDataConsolidadoController_(contexto, lancamentosVisiveis, dataFim) {
  const fim = normalizarTextoConsolidadoController_(dataFim);
  const lancamentosPorId = {};
  let total = 0;

  if (!fim) {
    return total;
  }

  (lancamentosVisiveis || []).forEach(function(lancamento) {
    const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
    const data = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);

    if (idLancamento && data && data <= fim) {
      lancamentosPorId[idLancamento] = lancamento;
    }
  });

  (contexto.rateiosTodos || []).forEach(function(rateio) {
    const idLancamento = normalizarTextoConsolidadoController_(rateio.ID_Lancamento);

    if (
      !lancamentosPorId[idLancamento] ||
      normalizarTextoConsolidadoController_(rateio.Status) === "Cancelado"
    ) {
      return;
    }

    total += calcularImpactoRateioUsuarioConsolidadoController_(
      rateio,
      contexto.idLogado,
      lancamentosPorId[idLancamento].Tipo
    );
  });

  return total;
}


function calcularProjecaoRateiosRecorrenciasController_(contexto, mesReferencia) {
  const inicioMes = obterInicioMesConsolidadoController_(mesReferencia);
  const fimMes = obterFimMesConsolidadoController_(mesReferencia);
  const hoje = gerarDataHojeConsolidadoController_();
  const inicioJanela = obterInicioJanelaProjecaoRecorrenciasConsolidadoController_(inicioMes, fimMes, hoje);
  const rateiosPorRecorrencia = agruparRateiosRecorrenciasConsolidadoController_(contexto.recorrenciasRateiosTodos || []);
  let total = 0;

  if (!inicioJanela) {
    return total;
  }

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    const idRecorrencia = normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia);
    const rateios = rateiosPorRecorrencia[idRecorrencia] || [];

    if (
      rateios.length === 0 ||
      normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia) !== "Ativa" ||
      !usuarioParticipaRecorrenciaConsolidadoController_(recorrencia, contexto, rateios)
    ) {
      return;
    }

    const credor = determinarCredorRecorrenciaConsolidadoController_(recorrencia, contexto);
    const ocorrencias = listarOcorrenciasPendentesNoPeriodoConsolidadoController_(recorrencia, contexto, inicioJanela, fimMes);

    ocorrencias.forEach(function() {
      rateios.forEach(function(rateio) {
        total += calcularImpactoRateioUsuarioConsolidadoController_({
          ID_Usuario_Responsavel: rateio.ID_Usuario_Responsavel,
          ID_Usuario_Credor: credor,
          Valor_Rateado: rateio.Valor_Rateado,
          Status: "Pendente"
        }, contexto.idLogado, recorrencia.Tipo);
      });
    });
  });

  return total;
}


function calcularImpactoRateioUsuarioConsolidadoController_(rateio, idUsuario, tipoLancamento) {
  const responsavel = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel);
  const credor = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Credor);
  const idLogado = normalizarTextoConsolidadoController_(idUsuario);
  const tipo = normalizarTextoConsolidadoController_(tipoLancamento);
  const valor = converterNumeroConsolidadoController_(rateio.Valor_Rateado);

  if (!responsavel || !credor || responsavel === credor || valor <= 0) {
    return 0;
  }

  if (tipo === "Receita") {
    if (responsavel === idLogado) {
      return valor;
    }

    if (credor === idLogado) {
      return -valor;
    }

    return 0;
  }

  if (credor === idLogado) {
    return valor;
  }

  return responsavel === idLogado ? -valor : 0;
}


function agruparRateiosRecorrenciasConsolidadoController_(rateios) {
  const mapa = {};

  (rateios || []).forEach(function(rateio) {
    const idRecorrencia = normalizarTextoConsolidadoController_(rateio.ID_Recorrencia);

    if (!idRecorrencia) {
      return;
    }

    if (!mapa[idRecorrencia]) {
      mapa[idRecorrencia] = [];
    }

    mapa[idRecorrencia].push(rateio);
  });

  return mapa;
}


function determinarCredorRecorrenciaConsolidadoController_(recorrencia, contexto) {
  const tipoOrigem = recorrencia.Tipo_Origem;
  const idOrigem = normalizarTextoConsolidadoController_(recorrencia.ID_Origem);

  if (ehTipoOrigemCartaoConsolidadoController_(tipoOrigem)) {
    const cartao = (contexto.cartoesTodos || []).find(function(item) {
      return normalizarTextoConsolidadoController_(item.ID_Cartao) === idOrigem;
    });

    return cartao ? normalizarTextoConsolidadoController_(cartao.ID_Titular) : "";
  }

  if (tipoOrigem === "Conta") {
    const conta = (contexto.contasTodas || []).find(function(item) {
      return normalizarTextoConsolidadoController_(item.ID_Conta) === idOrigem;
    });

    return conta ? normalizarTextoConsolidadoController_(conta.ID_Usuario) : "";
  }

  return normalizarTextoConsolidadoController_(recorrencia.Criado_Por_ID || recorrencia.ID_Usuario);
}


function listarOcorrenciasPendentesNoPeriodoConsolidadoController_(recorrencia, contexto, dataInicioJanela, dataFimJanela) {
  const dataInicio = normalizarTextoConsolidadoController_(recorrencia.Data_Inicio);
  const dataInicioBusca = normalizarTextoConsolidadoController_(dataInicioJanela);
  const dataFimBusca = normalizarTextoConsolidadoController_(dataFimJanela);
  const datas = [];

  if (!dataInicio || !dataInicioBusca || !dataFimBusca || dataInicio > dataFimBusca || dataInicioBusca > dataFimBusca) {
    return datas;
  }

  let dataAtual = dataInicio;
  let indice = 0;

  while (dataAtual && dataAtual <= dataFimBusca && indice < 400) {
    if (
      dataAtual >= dataInicioBusca &&
      !recorrenciaJaGerouLancamentoConsolidadoController_(recorrencia, contexto, dataAtual)
    ) {
      datas.push(dataAtual);
    }

    indice += 1;
    dataAtual = calcularProximaDataRecorrenciaConsolidadoController_(recorrencia, dataAtual);
  }

  return datas;
}


function recorrenciaJaGerouLancamentoConsolidadoController_(recorrencia, contexto, dataOcorrencia) {
  const idRecorrencia = normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia);
  const dataReferencia = normalizarTextoConsolidadoController_(dataOcorrencia);

  if (!dataReferencia) {
    return false;
  }

  const ocorrenciaRegistrada = (contexto.recorrenciasOcorrenciasTodos || []).some(function(ocorrencia) {
    return normalizarTextoConsolidadoController_(ocorrencia.Status) === "Gerada" &&
      normalizarTextoConsolidadoController_(ocorrencia.ID_Recorrencia) === idRecorrencia &&
      normalizarTextoConsolidadoController_(ocorrencia.Data_Ocorrencia) === dataReferencia;
  });

  if (ocorrenciaRegistrada) {
    return true;
  }

  return (contexto.lancamentosTodos || []).some(function(lancamento) {
    if (normalizarTextoConsolidadoController_(lancamento.Status) === "Cancelado") {
      return false;
    }

    const idRecorrenciaLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Recorrencia_Origem);

    if (idRecorrencia && idRecorrenciaLancamento === idRecorrencia) {
      return (
        normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia_Recorrencia) === dataReferencia ||
        normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia) === dataReferencia
      );
    }

    if (idRecorrenciaLancamento) {
      return false;
    }

    return lancamentoCorrespondeARecorrenciaConsolidadoController_(lancamento, recorrencia, dataReferencia);
  });
}


function lancamentoCorrespondeARecorrenciaConsolidadoController_(lancamento, recorrencia, dataReferencia) {
  const dataLancamento = normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia);

  if (dataLancamento !== dataReferencia) {
    return false;
  }

  if (
    normalizarTextoComparavelConsolidadoController_(lancamento.Tipo) !==
    normalizarTextoComparavelConsolidadoController_(recorrencia.Tipo)
  ) {
    return false;
  }

  if (
    normalizarTextoComparavelConsolidadoController_(lancamento.Tipo_Origem) !==
    normalizarTextoComparavelConsolidadoController_(recorrencia.Tipo_Origem)
  ) {
    return false;
  }

  if (
    normalizarTextoConsolidadoController_(lancamento.ID_Origem) !==
    normalizarTextoConsolidadoController_(recorrencia.ID_Origem)
  ) {
    return false;
  }

  if (
    normalizarTextoConsolidadoController_(lancamento.ID_Destino) !==
    normalizarTextoConsolidadoController_(recorrencia.ID_Destino || "")
  ) {
    return false;
  }

  if (
    normalizarTextoConsolidadoController_(lancamento.ID_Categoria || "") !==
    normalizarTextoConsolidadoController_(recorrencia.ID_Categoria || "")
  ) {
    return false;
  }

  return arredondarConsolidadoController_(lancamento.Valor_Total) ===
    arredondarConsolidadoController_(recorrencia.Valor_Base);
}


function normalizarTextoComparavelConsolidadoController_(valor) {
  return normalizarTextoConsolidadoController_(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function calcularProximaDataRecorrenciaConsolidadoController_(recorrencia, dataAtual) {
  if (normalizarTextoConsolidadoController_(recorrencia.Periodicidade_Tipo) === "Mensal") {
    return adicionarMesRecorrenciaConsolidadoController_(dataAtual);
  }

  const intervalo = parseInt(recorrencia.Intervalo_Dias, 10);

  if (isNaN(intervalo) || intervalo <= 0) {
    return "";
  }

  return adicionarDiasDataConsolidadoController_(dataAtual, intervalo);
}


function obterInicioJanelaProjecaoRecorrenciasConsolidadoController_(inicioMes, fimMes, hoje) {
  const inicio = normalizarTextoConsolidadoController_(inicioMes);
  const fim = normalizarTextoConsolidadoController_(fimMes);

  if (!inicio || !fim || inicio > fim) {
    return "";
  }

  return inicio;
}


function adicionarMesRecorrenciaConsolidadoController_(dataTexto) {
  const partes = normalizarTextoConsolidadoController_(dataTexto).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    return "";
  }

  const ano = parseInt(partes[1], 10);
  const mes = parseInt(partes[2], 10);
  const dia = parseInt(partes[3], 10);
  const ultimoDiaProximoMes = new Date(ano, mes + 1, 0).getDate();
  const proximaData = new Date(ano, mes, Math.min(dia, ultimoDiaProximoMes));

  return Utilities.formatDate(proximaData, Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function adicionarDiasDataConsolidadoController_(dataTexto, dias) {
  const partes = normalizarTextoConsolidadoController_(dataTexto).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    return "";
  }

  const data = new Date(parseInt(partes[1], 10), parseInt(partes[2], 10) - 1, parseInt(partes[3], 10));
  data.setDate(data.getDate() + dias);
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function obterInicioMesConsolidadoController_(mesReferencia) {
  const partes = normalizarTextoConsolidadoController_(mesReferencia).match(/^(\d{4})-(\d{2})$/);

  if (!partes) {
    return gerarDataHojeConsolidadoController_();
  }

  return partes[1] + "-" + partes[2] + "-01";
}


function calcularMesCompetenciaCartaoPorDataConsolidadoController_(dataOcorrencia, diaFechamento) {
  const data = normalizarTextoConsolidadoController_(dataOcorrencia);
  const fechamento = parseInt(diaFechamento, 10);
  const partes = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    return "";
  }

  if (isNaN(fechamento) || fechamento < 1 || fechamento > 31) {
    return data.substring(0, 7);
  }

  const ano = parseInt(partes[1], 10);
  const mes = parseInt(partes[2], 10);
  const dia = parseInt(partes[3], 10);
  const competencia = dia > fechamento
    ? new Date(ano, mes, 1)
    : new Date(ano, mes - 1, 1);

  return Utilities.formatDate(competencia, Session.getScriptTimeZone(), "yyyy-MM");
}


function obterMesCompetenciaCartaoLancamentoConsolidadoController_(lancamento, contexto) {
  // Compras registradas mantêm a competência persistida ao mudar o fechamento.
  const registrada = normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);
  if (/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/.test(registrada)) return registrada.slice(0,7);
  if (!ehTipoOrigemCartaoConsolidadoController_(lancamento.Tipo_Origem)) {
    return normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);
  }

  const idOrigem = normalizarTextoConsolidadoController_(lancamento.ID_Origem);
  const cartao = (contexto && contexto.cartoesTodos || []).find(function(item) {
    return normalizarTextoConsolidadoController_(item.ID_Cartao) === idOrigem;
  });

  return calcularMesCompetenciaCartaoPorDataConsolidadoController_(
    lancamento.Data_Ocorrencia,
    cartao ? cartao.Dia_Fechamento : ""
  ) || normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);
}


function obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento) {
  const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
  const rateios = (rateiosPorLancamento[idLancamento] || []).filter(function(rateio) {
    return normalizarTextoConsolidadoController_(rateio.Status) !== "Cancelado";
  });

  if (rateios.length === 0) {
    if (ehTipoOrigemCartaoConsolidadoController_(lancamento.Tipo_Origem)) {
      const cartao = (contexto.cartoesTodos || []).find(function(item) {
        return normalizarTextoConsolidadoController_(item.ID_Cartao) === normalizarTextoConsolidadoController_(lancamento.ID_Origem);
      });

      if (cartao && normalizarTextoConsolidadoController_(cartao.ID_Usuario) !== contexto.idLogado) {
        return 0;
      }
    }

    return converterNumeroConsolidadoController_(lancamento.Valor_Total);
  }

  return rateios.reduce(function(total, rateio) {
    if (normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel) !== contexto.idLogado) {
      return total;
    }

    return total + converterNumeroConsolidadoController_(rateio.Valor_Rateado);
  }, 0);
}


function calcularImpactoTransferenciaUsuarioConsolidadoController_(lancamento, contexto) {
  const origem = buscarContaPorIdConsolidadoController_(contexto.contasTodas, lancamento.ID_Origem);
  const destino = buscarContaPorIdConsolidadoController_(contexto.contasTodas, lancamento.ID_Destino);
  const valor = converterNumeroConsolidadoController_(lancamento.Valor_Total);
  const donoOrigem = origem ? normalizarTextoConsolidadoController_(origem.ID_Usuario) : "";
  const donoDestino = destino ? normalizarTextoConsolidadoController_(destino.ID_Usuario) : "";

  if (donoOrigem === contexto.idLogado && donoDestino === contexto.idLogado) {
    return { entrada: 0, saida: 0 };
  }

  return {
    entrada: donoDestino === contexto.idLogado ? valor : 0,
    saida: donoOrigem === contexto.idLogado ? valor : 0
  };
}


function agruparRateiosConsolidadosController_(rateios) {
  const mapa = {};

  (rateios || []).forEach(function(rateio) {
    const idLancamento = normalizarTextoConsolidadoController_(rateio.ID_Lancamento);

    if (!idLancamento) {
      return;
    }

    if (!mapa[idLancamento]) {
      mapa[idLancamento] = [];
    }

    mapa[idLancamento].push(rateio);
  });

  return mapa;
}


function mapearUsuariosPorIdConsolidadoController_(usuarios) {
  const mapa = {};

  (usuarios || []).forEach(function(usuario) {
    mapa[normalizarTextoConsolidadoController_(usuario.ID_Usuario)] = normalizarTextoConsolidadoController_(usuario.Nome);
  });

  return mapa;
}


function buscarContaPorIdConsolidadoController_(contas, idConta) {
  const id = normalizarTextoConsolidadoController_(idConta);

  return (contas || []).find(function(conta) {
    return normalizarTextoConsolidadoController_(conta.ID_Conta) === id;
  }) || null;
}


function obterFimMesConsolidadoController_(mesReferencia) {
  const partes = normalizarTextoConsolidadoController_(mesReferencia).match(/^(\d{4})-(\d{2})$/);

  if (!partes) {
    return gerarDataHojeConsolidadoController_();
  }

  const data = new Date(parseInt(partes[1], 10), parseInt(partes[2], 10), 0);
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function gerarMesAtualConsolidadoController_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
}


function gerarDataHojeConsolidadoController_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function converterNumeroConsolidadoController_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


function arredondarConsolidadoController_(valor) {
  return Math.round(converterNumeroConsolidadoController_(valor) * 100) / 100;
}


function normalizarBooleanoConsolidadoController_(valor) {
  if (valor === true || valor === false) return valor;
  if (valor === null || valor === undefined || valor === "") return false;

  const texto = normalizarTextoConsolidadoController_(valor).toLowerCase();
  return texto === "true" || texto === "sim" || texto === "1" || texto === "ativo";
}


function normalizarTextoConsolidadoController_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}

/** Efeito patrimonial datado, sem classificar como receita/despesa. */
function somarSaldosIniciaisNoPeriodo_(contas, inicio, fim) {
  return (contas || []).reduce(function(n,c) {
    return n + (c.Data_Saldo_Inicial && c.Data_Saldo_Inicial >= inicio && c.Data_Saldo_Inicial <= fim
      ? converterNumeroConsolidadoController_(c.Saldo_Inicial) : 0);
  }, 0);
}
