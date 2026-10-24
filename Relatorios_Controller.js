/**
 * Módulo: Relatorios_Controller.gs
 * Responsabilidade:
 * - Montar e enviar o relatório semanal individual por e-mail.
 * - Usar as mesmas regras de acesso e consolidação já aplicadas ao Dashboard.
 * - Criar a trigger semanal de envio na segunda-feira às 05h.
 */


const CONFIG_RELATORIO_SEMANAL = {
  HORA_ENVIO: 5,
  DIA_SEMANA_ENVIO: ScriptApp.WeekDay.MONDAY,
  REMETENTE_NOME: "Mukirana",
  ASSUNTO_PREFIXO: "Mukirana - relatório semanal"
};


/**
 * Envia o relatório semanal da semana fechada anterior para usuários ativos não virtuais.
 *
 * Regra de período:
 * - Sempre considera a semana fechada anterior, de segunda-feira a domingo.
 * - Usuários sem e-mail válido são ignorados.
 *
 * @returns {Object} Resumo da rotina executada.
 */
function enviarRelatoriosSemanais() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const medidor = criarMedidorPerformance_("Relatorios.Semanal.enviar");
    const periodo = calcularPeriodoSemanaFechadaRelatorio_(new Date());
    const classificacaoUsuarios = medirEtapaPerformance_(medidor, "classificar_usuarios", function() {
      return classificarUsuariosRelatorioSemanal_();
    });
    const usuariosDestino = classificacaoUsuarios.destinatarios;
    const resultado = {
      periodo: periodo,
      totalDestinatarios: usuariosDestino.length,
      enviados: 0,
      ignorados: 0,
      erros: []
    };

    usuariosDestino.forEach(function(usuario) {
      try {
        const pacote = montarPacoteRelatorioSemanalUsuario_(usuario, periodo);
        const htmlBody = montarHtmlRelatorioSemanal_(pacote);
        const assunto = "Seu resumo financeiro da semana - Mukirana (" + periodo.rotuloCurto + ")";

        MailApp.sendEmail({
          to: normalizarTextoRelatorio_(usuario.Email),
          subject: assunto,
          htmlBody: htmlBody,
          name: CONFIG_RELATORIO_SEMANAL.REMETENTE_NOME
        });

        resultado.enviados += 1;
      } catch (erroUsuario) {
        resultado.erros.push({
          ID_Usuario: normalizarTextoRelatorio_(usuario.ID_Usuario),
          Nome: normalizarTextoRelatorio_(usuario.Nome),
          Mensagem: erroUsuario && erroUsuario.message ? erroUsuario.message : erroUsuario.toString()
        });
      }
    });

    resultado.ignorados = classificacaoUsuarios.ignorados;
    registrarContagemPerformance_(medidor, "destinatarios", usuariosDestino.length);
    registrarContagemPerformance_(medidor, "ignorados", classificacaoUsuarios.ignorados);
    registrarContagemPerformance_(medidor, "enviados", resultado.enviados);
    registrarContagemPerformance_(medidor, "erros", resultado.erros.length);
    resultado._performance = finalizarPerformance_(medidor);
    return resultado;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Cria a trigger semanal do relatório, caso ela ainda não exista.
 *
 * @returns {string} Mensagem de confirmação.
 */
function configurarTriggerRelatorioSemanal() {
  garantirTriggerRelatorioSemanal_();
  return "Trigger do relatório semanal configurada para segunda-feira às 05h.";
}


/**
 * Monta uma prévia do relatório semanal para o usuário autenticado.
 * Útil para testes manuais no editor do Apps Script.
 *
 * @param {string} tokenSessao Token da sessão atual.
 * @returns {Object} Pacote do relatório.
 */
function obterPreviaRelatorioSemanal(tokenSessao) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const periodo = calcularPeriodoSemanaFechadaRelatorio_(new Date());
  const usuario = {
    ID_Usuario: sessao.id,
    Nome: sessao.nome,
    Email: sessao.email,
    Papel: sessao.papel,
    Ativo: true
  };

  return montarPacoteRelatorioSemanalUsuario_(usuario, periodo);
}


function montarPacoteRelatorioSemanalUsuario_(usuario, periodo) {
  const medidor = criarMedidorPerformance_("Relatorios.Semanal.montarPacote");
  const sessao = {
    id: normalizarTextoRelatorio_(usuario.ID_Usuario),
    nome: normalizarTextoRelatorio_(usuario.Nome),
    email: normalizarTextoRelatorio_(usuario.Email),
    papel: normalizarTextoRelatorio_(usuario.Papel)
  };
  const mesReferenciaFim = periodo.fim.substring(0, 7);
  const mesReferenciaSeguinte = periodo.inicioProximoMes.substring(0, 7);
  const filtrosMesRelatorio = {
    Mes_Referencia: mesReferenciaFim,
    Mes_Inicial: mesReferenciaFim,
    Mes_Final: mesReferenciaFim,
    Considerar_Historico_Anterior: true,
    Incluir_Historico: false
  };
  const filtrosProximoMesRelatorio = {
    Mes_Referencia: mesReferenciaSeguinte,
    Mes_Inicial: mesReferenciaSeguinte,
    Mes_Final: mesReferenciaSeguinte,
    Considerar_Historico_Anterior: true,
    Incluir_Historico: false
  };
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoRelatorioSemanalController_(sessao, periodo, medidor);
  });
  const lancamentosVisiveis = medirEtapaPerformance_(medidor, "filtrar_lancamentos_visiveis", function() {
    return obterLancamentosVisiveisConsolidadosController_(contexto);
  });
  const lancamentosMesAteLimite = medirEtapaPerformance_(medidor, "filtrar_lancamentos_mes_ate_limite", function() {
    return lancamentosVisiveis.filter(function(lancamento) {
      return lancamentoPertenceMesRelatorio_(lancamento, mesReferenciaFim) &&
        normalizarTextoRelatorio_(lancamento.Data_Ocorrencia) <= periodo.fim;
    });
  });
  const lancamentosMesCompleto = medirEtapaPerformance_(medidor, "filtrar_lancamentos_mes_completo", function() {
    return lancamentosVisiveis.filter(function(lancamento) {
      return lancamentoPertenceMesRelatorio_(lancamento, mesReferenciaFim);
    });
  });
  const lancamentosSemana = medirEtapaPerformance_(medidor, "filtrar_lancamentos_semana", function() {
    return lancamentosVisiveis.filter(function(lancamento) {
      return dataDentroDoPeriodoRelatorio_(lancamento.Data_Ocorrencia, periodo.inicio, periodo.fim);
    });
  });
  const lancamentosProgramadosMes = medirEtapaPerformance_(medidor, "projetar_recorrencias_mes", function() {
    return gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtrosMesRelatorio);
  });
  const lancamentosProgramadosFinalMes = medirEtapaPerformance_(medidor, "filtrar_programados_final_mes", function() {
    return filtrarPacoteLancamentosProgramadosRelatorio_(
      lancamentosProgramadosMes,
      periodo.fim,
      periodo.fimMes
    );
  });
  const lancamentosProximoMes = medirEtapaPerformance_(medidor, "filtrar_lancamentos_proximo_mes", function() {
    return lancamentosVisiveis.filter(function(lancamento) {
      return lancamentoPertenceMesRelatorio_(lancamento, mesReferenciaSeguinte);
    });
  });
  const lancamentosProgramadosProximoMes = medirEtapaPerformance_(medidor, "projetar_recorrencias_proximo_mes", function() {
    return gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtrosProximoMesRelatorio);
  });
  const rateiosPorLancamento = medirEtapaPerformance_(medidor, "agrupar_rateios", function() {
    return agruparRateiosConsolidadosController_(contexto.rateiosTodos);
  });
  const rateiosPorLancamentoComProgramados = medirEtapaPerformance_(medidor, "agrupar_rateios_com_programados", function() {
    return combinarRateiosLancadosEProgramadosConsolidadoController_(
      rateiosPorLancamento,
      lancamentosProgramadosFinalMes.rateiosPorLancamento
    );
  });
  const resumoRealizado = medirEtapaPerformance_(medidor, "calcular_resumo_realizado", function() {
    return calcularResumoMesConsolidadoController_(contexto, lancamentosMesAteLimite, rateiosPorLancamento);
  });
  const resumoProgramado = medirEtapaPerformance_(medidor, "calcular_resumo_programado", function() {
    return calcularResumoMesConsolidadoController_(
      contexto,
      lancamentosProgramadosFinalMes.lancamentos,
      lancamentosProgramadosFinalMes.rateiosPorLancamento,
      lancamentosProgramadosFinalMes.lancamentos.length
    );
  });
  const pacoteFinalMes = medirEtapaPerformance_(medidor, "combinar_final_mes", function() {
    return combinarPacotesLancamentosRelatorio_(
      lancamentosMesCompleto,
      rateiosPorLancamento,
      lancamentosProgramadosFinalMes
    );
  });
  const pacoteProximoMes = medirEtapaPerformance_(medidor, "combinar_proximo_mes", function() {
    return combinarPacotesLancamentosRelatorio_(
      lancamentosProximoMes,
      rateiosPorLancamento,
      lancamentosProgramadosProximoMes
    );
  });
  const lancamentosPatrimonioFinalMes = lancamentosVisiveis.concat(lancamentosProgramadosFinalMes.lancamentos);
  const lancamentosPatrimonioProximoMes = lancamentosPatrimonioFinalMes.concat(lancamentosProgramadosProximoMes.lancamentos);

  const pacote = {
    usuario: {
      ID_Usuario: contexto.idLogado,
      Nome: contexto.nomeLogado,
      Email: sessao.email
    },
    periodo: periodo,
    cenarios: medirEtapaPerformance_(medidor, "montar_cenarios_relatorio", function() {
      return {
        agora: montarCenarioRelatorioSemanal_(
          contexto,
          "Agora",
          periodo.inicioMes,
          periodo.fim,
          lancamentosMesAteLimite,
          rateiosPorLancamento,
          lancamentosVisiveis,
          periodo.fim,
          filtrosMesRelatorio
        ),
        fimMes: montarCenarioRelatorioSemanal_(
          contexto,
          "Final do m\u00eas",
          periodo.inicioMes,
          periodo.fimMes,
          pacoteFinalMes.lancamentos,
          pacoteFinalMes.rateiosPorLancamento,
          lancamentosPatrimonioFinalMes,
          periodo.fimMes,
          filtrosMesRelatorio
        ),
        proximoMes: montarCenarioRelatorioSemanal_(
          contexto,
          "M\u00eas seguinte",
          periodo.inicioProximoMes,
          periodo.fimProximoMes,
          pacoteProximoMes.lancamentos,
          pacoteProximoMes.rateiosPorLancamento,
          lancamentosPatrimonioProximoMes,
          periodo.fimProximoMes,
          filtrosProximoMesRelatorio
        )
      };
    }),
    resumo: medirEtapaPerformance_(medidor, "montar_resumo_relatorio", function() {
      return montarResumoRealizadoProgramadoRelatorio_(
        contexto,
        lancamentosVisiveis,
        periodo,
        resumoRealizado,
        resumoProgramado
      );
    }),
    pulso: medirEtapaPerformance_(medidor, "montar_pulso_relatorio", function() {
      return montarPulsoRelatorio_(resumoRealizado, resumoProgramado);
    }),
    dinheiroGuardado: medirEtapaPerformance_(medidor, "calcular_dinheiro_guardado", function() {
      return calcularDinheiroGuardadoRelatorio_(
        contexto,
        lancamentosVisiveis,
        periodo,
        resumoProgramado,
        lancamentosProgramadosFinalMes,
        rateiosPorLancamento
      );
    }),
    categorias: medirEtapaPerformance_(medidor, "calcular_categorias", function() {
      return calcularDespesasPorCategoriaRelatorio_(contexto, lancamentosMesAteLimite, rateiosPorLancamento);
    }),
    cartoes: medirEtapaPerformance_(medidor, "calcular_cartoes", function() {
      return calcularCartoesConsolidadosController_(contexto, lancamentosMesAteLimite, filtrosMesRelatorio);
    }),
    contas: medirEtapaPerformance_(medidor, "calcular_contas", function() {
      return calcularSaldosContasRelatorio_(contexto, lancamentosVisiveis, periodo);
    }),
    rateios: medirEtapaPerformance_(medidor, "calcular_rateios", function() {
      return calcularAcertosRateioConsolidadoController_(
        contexto,
        lancamentosMesAteLimite.concat(lancamentosProgramadosFinalMes.lancamentos),
        rateiosPorLancamentoComProgramados
      );
    }),
    orcamento: medirEtapaPerformance_(medidor, "calcular_orcamento", function() {
      return calcularOrcamentoRelatorio_(
        contexto,
        mesReferenciaFim,
        lancamentosMesAteLimite,
        rateiosPorLancamento,
        lancamentosProgramadosFinalMes
      );
    }),
    pendencias: medirEtapaPerformance_(medidor, "calcular_pendencias", function() {
      return calcularPendenciasConsolidadasController_(contexto, lancamentosVisiveis, {
        Mes_Referencia: mesReferenciaFim
      });
    }),
    totalLancamentosSemana: lancamentosSemana.length
  };

  registrarContagemPerformance_(medidor, "mesesConsultados", obterMesesPeriodoRelatorio_(periodo).length);
  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
  registrarContagemPerformance_(medidor, "lancamentosVisiveis", lancamentosVisiveis.length);
  registrarContagemPerformance_(medidor, "lancamentosMesAteLimite", lancamentosMesAteLimite.length);
  registrarContagemPerformance_(medidor, "lancamentosMesCompleto", lancamentosMesCompleto.length);
  registrarContagemPerformance_(medidor, "lancamentosSemana", lancamentosSemana.length);
  registrarContagemPerformance_(medidor, "lancamentosProgramadosFinalMes", lancamentosProgramadosFinalMes.lancamentos.length);
  registrarContagemPerformance_(medidor, "lancamentosProximoMes", lancamentosProximoMes.length);
  registrarContagemPerformance_(medidor, "lancamentosProgramadosProximoMes", lancamentosProgramadosProximoMes.lancamentos.length);
  registrarContagemPerformance_(medidor, "rateiosTodos", contexto.rateiosTodos.length);

  pacote._performance = finalizarPerformance_(medidor);
  return pacote;
}


/**
 * Monta o contexto do relatório semanal consultando apenas os meses envolvidos.
 *
 * A semana fechada pode cruzar dois meses. Nesse caso, o relatório combina dois
 * pacotes mensais do Supabase e remove duplicidades por ID antes dos cálculos.
 *
 * @param {Object} sessao Sessão sintética do destinatário.
 * @param {Object} periodo Semana fechada usada no relatório.
 * @param {Object} medidorPerformance Medidor do fluxo.
 * @returns {Object} Contexto consolidado para o relatório.
 */
function montarContextoRelatorioSemanalController_(sessao, periodo, medidorPerformance) {
  const idLogado = normalizarTextoRelatorio_(sessao.id);
  const meses = obterMesesPeriodoRelatorio_(periodo);

  if (typeof obterContextoFinanceiroSupabaseRpc_ === "function") {
    const basesRpc = meses.map(function(mes) {
      return medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc_" + mes, function() {
        return obterContextoFinanceiroSupabaseRpc_(idLogado, mes, false);
      });
    }).filter(function(base) {
      return !!base;
    });

    if (basesRpc.length > 0) {
      return montarContextoConsolidadosAPartirBase_(
        sessao,
        combinarContextosRelatorioSemanal_(basesRpc),
        medidorPerformance,
        "RPC_RELATORIO"
      );
    }
  }

  return montarContextoConsolidadosController_(sessao, medidorPerformance, {
    Mes_Referencia: periodo.fim.substring(0, 7),
    Mes_Inicial: periodo.inicioMes.substring(0, 7),
    Mes_Final: periodo.fimProximoMes.substring(0, 7),
    Incluir_Historico: false
  });
}


function combinarContextosRelatorioSemanal_(bases) {
  bases = bases || [];

  if (bases.length === 0) {
    return null;
  }

  return {
    usuariosTodos: unirRegistrosRelatorioSemanal_(bases, "usuariosTodos", "ID_Usuario"),
    contasTodas: unirRegistrosRelatorioSemanal_(bases, "contasTodas", "ID_Conta"),
    gruposCartoesTodos: unirRegistrosRelatorioSemanal_(bases, "gruposCartoesTodos", "ID_Grupo_Cartao"),
    cartoesTodos: unirRegistrosRelatorioSemanal_(bases, "cartoesTodos", "ID_Cartao"),
    categoriasTodas: unirRegistrosRelatorioSemanal_(bases, "categoriasTodas", "ID_Categoria"),
    projetosTodos: unirRegistrosRelatorioSemanal_(bases, "projetosTodos", "ID_Projeto"),
    lancamentosTodos: unirRegistrosRelatorioSemanal_(bases, "lancamentosTodos", "ID_Lancamento"),
    rateiosTodos: unirRegistrosRelatorioSemanal_(bases, "rateiosTodos", "ID_Rateio"),
    orcamentosTodos: unirRegistrosRelatorioSemanal_(bases, "orcamentosTodos", "ID_Orcamento"),
    recorrenciasTodos: unirRegistrosRelatorioSemanal_(bases, "recorrenciasTodos", "ID_Recorrencia"),
    recorrenciasRateiosTodos: unirRegistrosRelatorioSemanal_(bases, "recorrenciasRateiosTodos", "ID_Recorrencia_Rateio"),
    origem: "RPC_RELATORIO"
  };
}


function unirRegistrosRelatorioSemanal_(bases, nomeLista, campoId) {
  const vistos = {};
  const registros = [];

  (bases || []).forEach(function(base) {
    (base && base[nomeLista] ? base[nomeLista] : []).forEach(function(item) {
      const id = normalizarTextoRelatorio_(item && item[campoId]);

      if (!id || vistos[id]) {
        return;
      }

      vistos[id] = true;
      registros.push(item);
    });
  });

  return registros;
}


function calcularDespesasPorCategoriaRelatorio_(contexto, lancamentosSemana, rateiosPorLancamento) {
  const mapa = {};
  const mapaCategorias = typeof mapearCategoriasPorIdConsolidadoController_ === "function"
    ? mapearCategoriasPorIdConsolidadoController_(contexto.categoriasTodas || [])
    : {};

  lancamentosSemana.forEach(function(lancamento) {
    if (normalizarTextoRelatorio_(lancamento.Tipo) !== "Despesa") {
      return;
    }

    const idCategoriaOriginal = normalizarTextoRelatorio_(lancamento.ID_Categoria) || "sem-categoria";
    const categoria = mapaCategorias[idCategoriaOriginal] || null;
    const categoriaPai = typeof obterCategoriaRaizOrcamentoConsolidadoController_ === "function"
      ? obterCategoriaRaizOrcamentoConsolidadoController_(categoria, mapaCategorias)
      : null;
    const idCategoria = normalizarTextoRelatorio_(
      categoriaPai && categoriaPai.ID_Categoria ? categoriaPai.ID_Categoria : idCategoriaOriginal
    );
    const nomeCategoria = categoriaPai && categoriaPai.Nome
      ? categoriaPai.Nome
      : obterNomeCategoriaRelatorio_(idCategoria, contexto.categoriasTodas);
    const valor = calcularValorPessoalLancamentoRelatorio_(lancamento, contexto, rateiosPorLancamento || {});

    if (valor <= 0) {
      return;
    }

    if (!mapa[idCategoria]) {
      mapa[idCategoria] = {
        ID_Categoria: idCategoria,
        Nome_Categoria: nomeCategoria,
        Valor: 0,
        Quantidade: 0
      };
    }

    mapa[idCategoria].Valor += valor;
    mapa[idCategoria].Quantidade += 1;
  });

  return Object.keys(mapa).map(function(idCategoria) {
    mapa[idCategoria].Valor = arredondarConsolidadoController_(mapa[idCategoria].Valor);
    return mapa[idCategoria];
  }).sort(function(a, b) {
    return b.Valor - a.Valor;
  }).slice(0, 8);
}


function calcularMovimentoContasRelatorio_(contexto, lancamentosSemana, periodo) {
  const mapa = {};

  contexto.contasAcessiveis.forEach(function(conta) {
    mapa[normalizarTextoRelatorio_(conta.ID_Conta)] = {
      ID_Conta: conta.ID_Conta,
      Nome_Conta: conta.Nome_Conta,
      Entradas: 0,
      Saidas: 0,
      Transferencias_Entrada: 0,
      Transferencias_Saida: 0,
      Pagamentos_Faturas: 0
    };
  });

  lancamentosSemana.forEach(function(lancamento) {
    const tipo = normalizarTextoRelatorio_(lancamento.Tipo);
    const tipoOrigem = normalizarTextoRelatorio_(lancamento.Tipo_Origem);
    const origem = normalizarTextoRelatorio_(lancamento.ID_Origem);
    const destino = normalizarTextoRelatorio_(lancamento.ID_Destino);
    const valor = converterNumeroConsolidadoController_(lancamento.Valor_Total);

    if (tipo === "Receita" && tipoOrigem === "Conta" && mapa[origem]) {
      mapa[origem].Entradas += valor;
    }

    if (tipo === "Despesa" && tipoOrigem === "Conta" && mapa[origem]) {
      mapa[origem].Saidas += valor;
    }

    if (tipo === "Transferência") {
      if (mapa[origem]) mapa[origem].Transferencias_Saida += valor;
      if (mapa[destino]) mapa[destino].Transferencias_Entrada += valor;
    }
  });

  (contexto.pagamentosFaturasTodos || []).forEach(function(pagamento) {
    const dataPagamento = normalizarTextoRelatorio_(pagamento.Data_Pagamento);
    const idConta = normalizarTextoRelatorio_(pagamento.ID_Conta);
    const valor = converterNumeroConsolidadoController_(pagamento.Valor);

    if (!dataDentroDoPeriodoRelatorio_(dataPagamento, periodo.inicio, periodo.fim) || !mapa[idConta]) {
      return;
    }

    mapa[idConta].Pagamentos_Faturas += valor;
  });

  return Object.keys(mapa).map(function(idConta) {
    const item = mapa[idConta];

    item.Entradas = arredondarConsolidadoController_(item.Entradas);
    item.Saidas = arredondarConsolidadoController_(item.Saidas);
    item.Transferencias_Entrada = arredondarConsolidadoController_(item.Transferencias_Entrada);
    item.Transferencias_Saida = arredondarConsolidadoController_(item.Transferencias_Saida);
    item.Pagamentos_Faturas = arredondarConsolidadoController_(item.Pagamentos_Faturas);

    return item;
  }).filter(function(item) {
    return item.Entradas > 0 ||
      item.Saidas > 0 ||
      item.Transferencias_Entrada > 0 ||
      item.Transferencias_Saida > 0 ||
      item.Pagamentos_Faturas > 0;
  }).sort(function(a, b) {
    return normalizarTextoRelatorio_(a.Nome_Conta).localeCompare(normalizarTextoRelatorio_(b.Nome_Conta));
  });
}


function calcularSaldosContasRelatorio_(contexto, lancamentosVisiveis, periodo) {
  return (contexto.contasAcessiveis || []).map(function(conta) {
    const contaComContexto = {};
    Object.keys(conta || {}).forEach(function(chave) {
      contaComContexto[chave] = conta[chave];
    });
    contaComContexto._contextoPagamentosFaturas = contexto.pagamentosFaturasTodos || [];

    const saldoAtual = calcularSaldoContaAteDataConsolidadoController_(contaComContexto, lancamentosVisiveis, periodo.fim);
    const saldoProjetado = calcularSaldoContaAteDataConsolidadoController_(contaComContexto, lancamentosVisiveis, periodo.fimMes);

    return {
      ID_Conta: conta.ID_Conta,
      Nome_Conta: conta.Nome_Conta,
      Saldo_Atual: arredondarConsolidadoController_(saldoAtual),
      Saldo_Projetado: arredondarConsolidadoController_(saldoProjetado)
    };
  }).sort(function(a, b) {
    return Math.abs(converterNumeroConsolidadoController_(b.Saldo_Atual)) -
      Math.abs(converterNumeroConsolidadoController_(a.Saldo_Atual));
  });
}


function filtrarPacoteLancamentosProgramadosRelatorio_(pacoteProgramado, dataLimiteRealizado, dataFimMes) {
  const inicio = adicionarDiasDataConsolidadoController_(normalizarTextoRelatorio_(dataLimiteRealizado), 1);
  const fim = normalizarTextoRelatorio_(dataFimMes);
  const idsMantidos = {};
  const lancamentos = (pacoteProgramado && pacoteProgramado.lancamentos ? pacoteProgramado.lancamentos : []).filter(function(lancamento) {
    const data = normalizarTextoRelatorio_(lancamento.Data_Ocorrencia);
    const manter = data && inicio && fim && data >= inicio && data <= fim;

    if (manter) {
      idsMantidos[normalizarTextoRelatorio_(lancamento.ID_Lancamento)] = true;
    }

    return manter;
  });
  const rateiosPorLancamento = {};

  Object.keys(pacoteProgramado && pacoteProgramado.rateiosPorLancamento ? pacoteProgramado.rateiosPorLancamento : {}).forEach(function(idLancamento) {
    if (idsMantidos[normalizarTextoRelatorio_(idLancamento)] === true) {
      rateiosPorLancamento[idLancamento] = pacoteProgramado.rateiosPorLancamento[idLancamento];
    }
  });

  return {
    lancamentos: lancamentos,
    rateiosPorLancamento: rateiosPorLancamento
  };
}


function montarResumoRealizadoProgramadoRelatorio_(contexto, lancamentosVisiveis, periodo, resumoRealizado, resumoProgramado) {
  const saldoAnterior = calcularPatrimonioAteDataRelatorio_(
    contexto,
    lancamentosVisiveis,
    adicionarDiasDataConsolidadoController_(periodo.inicioMes, -1)
  );
  const transferenciasRealizadas = converterNumeroConsolidadoController_(resumoRealizado.Transferencias_Entrada) -
    converterNumeroConsolidadoController_(resumoRealizado.Transferencias_Saida);
  const transferenciasProgramadas = converterNumeroConsolidadoController_(resumoProgramado.Transferencias_Entrada) -
    converterNumeroConsolidadoController_(resumoProgramado.Transferencias_Saida);
  const resultadoRealizado = converterNumeroConsolidadoController_(resumoRealizado.Resultado);
  const resultadoProgramado = converterNumeroConsolidadoController_(resumoProgramado.Resultado);
  const saldoAteLimite = arredondarConsolidadoController_(saldoAnterior + resultadoRealizado);

  return {
    Saldo_Anterior: saldoAnterior,
    Receitas: resumoRealizado.Receitas,
    Despesas: resumoRealizado.Despesas,
    Transferencias_Entrada: resumoRealizado.Transferencias_Entrada,
    Transferencias_Saida: resumoRealizado.Transferencias_Saida,
    Transferencias: transferenciasRealizadas,
    Resultado: resultadoRealizado,
    Receitas_Programadas: resumoProgramado.Receitas,
    Despesas_Programadas: resumoProgramado.Despesas,
    Transferencias_Programadas: transferenciasProgramadas,
    Resultado_Programado: resultadoProgramado,
    Saldo_Ate_Limite: saldoAteLimite,
    Saldo_Projetado_Final_Mes: arredondarConsolidadoController_(saldoAteLimite + resultadoProgramado),
    Total_Lancamentos: resumoRealizado.Total_Lancamentos,
    Total_Programados: resumoProgramado.Total_Programados || 0,
    Pessoal: resumoRealizado.Pessoal,
    Fluxo_Rateios: resumoRealizado.Fluxo_Rateios
  };
}


function montarPulsoRelatorio_(resumoRealizado, resumoProgramado) {
  const receitas = converterNumeroConsolidadoController_(resumoRealizado.Receitas);
  const despesas = converterNumeroConsolidadoController_(resumoRealizado.Despesas);
  const transferencias = converterNumeroConsolidadoController_(resumoRealizado.Transferencias_Entrada) -
    converterNumeroConsolidadoController_(resumoRealizado.Transferencias_Saida);
  const receitasProgramadas = converterNumeroConsolidadoController_(resumoProgramado.Receitas);
  const despesasProgramadas = converterNumeroConsolidadoController_(resumoProgramado.Despesas);
  const transferenciasProgramadas = converterNumeroConsolidadoController_(resumoProgramado.Transferencias_Entrada) -
    converterNumeroConsolidadoController_(resumoProgramado.Transferencias_Saida);
  const maior = Math.max(
    Math.abs(receitas),
    Math.abs(despesas),
    Math.abs(transferencias),
    Math.abs(receitas + receitasProgramadas),
    Math.abs(despesas + despesasProgramadas),
    Math.abs(transferencias + transferenciasProgramadas),
    1
  );

  return {
    Receitas: receitas,
    Despesas: despesas,
    Transferencias: transferencias,
    Receitas_Programadas: receitasProgramadas,
    Despesas_Programadas: despesasProgramadas,
    Transferencias_Programadas: transferenciasProgramadas,
    Percentual_Receitas: calcularPercentualRelatorio_(receitas + receitasProgramadas, maior),
    Percentual_Despesas: calcularPercentualRelatorio_(despesas + despesasProgramadas, maior),
    Percentual_Transferencias: calcularPercentualRelatorio_(Math.abs(transferencias + transferenciasProgramadas), maior)
  };
}


function calcularDinheiroGuardadoRelatorio_(contexto, lancamentosVisiveis, periodo, resumoProgramado, pacoteProgramado, rateiosPorLancamento) {
  const saldoAtual = calcularPatrimonioAteDataRelatorio_(contexto, lancamentosVisiveis, periodo.fim);
  const programado = arredondarConsolidadoController_(resumoProgramado.Resultado);

  return {
    Saldo_Atual: saldoAtual,
    Programado: programado,
    Estimado: arredondarConsolidadoController_(saldoAtual + programado)
  };
}


function calcularPatrimonioAteDataRelatorio_(contexto, lancamentosVisiveis, dataFim) {
  const fim = normalizarTextoRelatorio_(dataFim);

  if (!fim) {
    return 0;
  }

  const saldoContas = (contexto.contasAcessiveis || []).reduce(function(total, conta) {
    const contaComContexto = {};
    Object.keys(conta || {}).forEach(function(chave) {
      contaComContexto[chave] = conta[chave];
    });
    contaComContexto._contextoPagamentosFaturas = contexto.pagamentosFaturasTodos || [];

    return total + calcularSaldoContaAteDataConsolidadoController_(contaComContexto, lancamentosVisiveis, fim);
  }, 0);
  const compromissosCartao = calcularCompromissosCartaoAteDataConsolidadoController_(contexto, lancamentosVisiveis, fim);

  return arredondarConsolidadoController_(saldoContas - compromissosCartao);
}


function calcularOrcamentoRelatorio_(contexto, mesReferencia, lancamentosRealizados, rateiosRealizados, pacoteProgramado) {
  const mapaCategorias = mapearCategoriasPorIdConsolidadoController_(contexto.categoriasTodas || []);
  const mapa = {};

  somarGastosOrcamentoRelatorio_(mapa, mapaCategorias, contexto, lancamentosRealizados, rateiosRealizados, "Valor_Realizado");
  somarGastosOrcamentoRelatorio_(
    mapa,
    mapaCategorias,
    contexto,
    pacoteProgramado.lancamentos,
    pacoteProgramado.rateiosPorLancamento,
    "Valor_Programado"
  );

  const pacoteOrcamentos = obterPacoteTelaOrcamentosPorContextoConsolidadoController_(contexto, mesReferencia);
  (pacoteOrcamentos.itens || []).forEach(function(item) {
    if (item.Ativo !== true) {
      return;
    }

    const idCategoria = normalizarTextoRelatorio_(item.ID_Categoria);
    const categoria = mapaCategorias[idCategoria] || null;
    const categoriaPai = obterCategoriaRaizOrcamentoConsolidadoController_(categoria, mapaCategorias);
    const idPai = normalizarTextoRelatorio_(categoriaPai && categoriaPai.ID_Categoria ? categoriaPai.ID_Categoria : idCategoria);

    if (!idPai) {
      return;
    }

    if (!mapa[idPai]) {
      mapa[idPai] = criarItemOrcamentoRelatorio_(idPai, categoriaPai && categoriaPai.Nome ? categoriaPai.Nome : item.Nome_Categoria);
    }

    mapa[idPai].Valor_Teto += converterNumeroConsolidadoController_(item.Valor_Teto);
    mapa[idPai].Tem_Orcamento = true;
  });

  const itens = Object.keys(mapa).map(function(idPai) {
    const item = mapa[idPai];
    item.Valor_Realizado = arredondarConsolidadoController_(item.Valor_Realizado);
    item.Valor_Programado = arredondarConsolidadoController_(item.Valor_Programado);
    item.Valor_Projetado = arredondarConsolidadoController_(item.Valor_Realizado + item.Valor_Programado);
    item.Valor_Teto = arredondarConsolidadoController_(item.Valor_Teto);
    item.Percentual_Usado = item.Tem_Orcamento && item.Valor_Teto > 0
      ? Math.round((item.Valor_Realizado / item.Valor_Teto) * 100)
      : 0;
    item.Percentual_Projetado = item.Tem_Orcamento && item.Valor_Teto > 0
      ? Math.round((item.Valor_Projetado / item.Valor_Teto) * 100)
      : 0;
    return item;
  }).sort(function(a, b) {
    return converterNumeroConsolidadoController_(b.Valor_Realizado) - converterNumeroConsolidadoController_(a.Valor_Realizado);
  });

  return {
    itens: itens,
    resumo: pacoteOrcamentos.resumo || {}
  };
}


function somarGastosOrcamentoRelatorio_(mapa, mapaCategorias, contexto, lancamentos, rateiosPorLancamento, campoValor) {
  (lancamentos || []).forEach(function(lancamento) {
    if (normalizarTextoRelatorio_(lancamento.Tipo) !== "Despesa") {
      return;
    }

    const idCategoria = normalizarTextoRelatorio_(lancamento.ID_Categoria);
    const categoria = mapaCategorias[idCategoria] || null;
    const categoriaPai = obterCategoriaRaizOrcamentoConsolidadoController_(categoria, mapaCategorias);
    const idPai = normalizarTextoRelatorio_(categoriaPai && categoriaPai.ID_Categoria ? categoriaPai.ID_Categoria : idCategoria);
    const valor = obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento || {});

    if (!idPai || valor <= 0) {
      return;
    }

    if (!mapa[idPai]) {
      mapa[idPai] = criarItemOrcamentoRelatorio_(idPai, categoriaPai && categoriaPai.Nome ? categoriaPai.Nome : "Sem categoria");
    }

    mapa[idPai][campoValor] += valor;
  });
}


function criarItemOrcamentoRelatorio_(idCategoria, nomeCategoria) {
  return {
    ID_Categoria: idCategoria,
    Nome_Categoria: normalizarTextoRelatorio_(nomeCategoria) || "Categoria",
    Valor_Realizado: 0,
    Valor_Programado: 0,
    Valor_Projetado: 0,
    Valor_Teto: 0,
    Percentual_Usado: 0,
    Percentual_Projetado: 0,
    Tem_Orcamento: false
  };
}


function combinarPacotesLancamentosRelatorio_(lancamentosBase, rateiosBase, pacoteProgramado) {
  const rateiosPorLancamento = {};

  Object.keys(rateiosBase || {}).forEach(function(idLancamento) {
    rateiosPorLancamento[idLancamento] = (rateiosBase[idLancamento] || []).slice();
  });

  Object.keys(pacoteProgramado && pacoteProgramado.rateiosPorLancamento ? pacoteProgramado.rateiosPorLancamento : {}).forEach(function(idLancamento) {
    rateiosPorLancamento[idLancamento] = (pacoteProgramado.rateiosPorLancamento[idLancamento] || []).slice();
  });

  return {
    lancamentos: (lancamentosBase || []).concat(pacoteProgramado && pacoteProgramado.lancamentos ? pacoteProgramado.lancamentos : []),
    rateiosPorLancamento: rateiosPorLancamento
  };
}


function montarCenarioRelatorioSemanal_(contexto, rotulo, inicio, fim, lancamentosPeriodo, rateiosPorLancamento, lancamentosPatrimonio, dataPatrimonio, filtrosCartoes) {
  const resumo = calcularResumoMesConsolidadoController_(
    contexto,
    lancamentosPeriodo || [],
    rateiosPorLancamento || {},
    (lancamentosPeriodo || []).filter(function(lancamento) {
      return lancamento._Programado_Recorrencia === true;
    }).length
  );
  const cartoes = calcularCartoesConsolidadosController_(contexto, lancamentosPeriodo || [], filtrosCartoes || {});
  const contas = calcularSaldosContasNaDataRelatorio_(contexto, lancamentosPatrimonio || [], dataPatrimonio);
  const categorias = calcularDespesasPorCategoriaRelatorio_(contexto, lancamentosPeriodo || [], rateiosPorLancamento || {});
  const fluxoPessoal = calcularFluxoPessoalRateadoRelatorio_(contexto, lancamentosPeriodo || [], rateiosPorLancamento || {});
  const saldoFluxo = arredondarConsolidadoController_(
    fluxoPessoal.receitas - fluxoPessoal.despesas
  );

  return {
    rotulo: rotulo,
    inicio: inicio,
    fim: fim,
    resumo: resumo,
    receitas: fluxoPessoal.receitas,
    despesas: fluxoPessoal.despesas,
    balanco: saldoFluxo,
    saldo: saldoFluxo,
    rateios: 0,
    patrimonio: calcularPatrimonioAteDataRelatorio_(contexto, lancamentosPatrimonio || [], dataPatrimonio),
    cartoes: cartoes,
    totalCartoes: somarCartoesRelatorio_(cartoes),
    contas: contas,
    totalContas: contas.reduce(function(total, conta) {
      return total + converterNumeroConsolidadoController_(conta.Saldo);
    }, 0),
    categorias: categorias
  };
}


function calcularFluxoPessoalRateadoRelatorio_(contexto, lancamentosPeriodo, rateiosPorLancamento) {
  const total = (lancamentosPeriodo || []).reduce(function(total, lancamento) {
    const tipo = normalizarTextoRelatorio_(lancamento.Tipo);

    if (tipo !== "Receita" && tipo !== "Despesa") {
      return total;
    }

    const valor = calcularValorPessoalLancamentoRelatorio_(lancamento, contexto, rateiosPorLancamento || {});

    if (tipo === "Receita") {
      total.receitas += valor;
    } else {
      total.despesas += valor;
    }

    return total;
  }, { receitas: 0, despesas: 0 });

  return {
    receitas: arredondarConsolidadoController_(total.receitas),
    despesas: arredondarConsolidadoController_(total.despesas)
  };
}


function montarDiagnosticoDespesasRelatorio_(contexto, lancamentosPeriodo, rateiosPorLancamento) {
  const itens = (lancamentosPeriodo || []).filter(function(lancamento) {
    return normalizarTextoRelatorio_(lancamento.Tipo) === "Despesa";
  }).map(function(lancamento) {
    const idLancamento = normalizarTextoRelatorio_(lancamento.ID_Lancamento);
    const rateios = (rateiosPorLancamento[idLancamento] || []).filter(function(rateio) {
      return normalizarTextoRelatorio_(rateio.Status) !== "Cancelado";
    });
    const valoresRateio = calcularValoresRateioUsuarioConsolidadoController_(rateios, contexto.idLogado);
    const valorTotal = converterNumeroConsolidadoController_(lancamento.Valor_Total);
    const valorPessoal = calcularValorPessoalLancamentoRelatorio_(lancamento, contexto, rateiosPorLancamento || {});
    const credor = normalizarTextoRelatorio_(lancamento.ID_Usuario_Credor || lancamento.ID_Usuario || lancamento.ID_Usuario_Responsavel);
    const pagador = normalizarTextoRelatorio_(lancamento.ID_Usuario_Pagador || lancamento.ID_Usuario_Conta || lancamento.ID_Usuario_Cartao);
    const proprietario = credor || pagador || "-";

    return {
      id: idLancamento || "-",
      data: lancamento.Data_Ocorrencia || lancamento.Data_Pagamento || "",
      mesReferencia: lancamento.Mes_Referencia || "",
      descricao: lancamento.Descricao || lancamento.Nome_Lancamento || lancamento.Observacao || "(sem descri\u00e7\u00e3o)",
      categoria: lancamento.Nome_Categoria || lancamento.Categoria || "-",
      origem: lancamento.Nome_Conta || lancamento.Nome_Grupo_Cartao || lancamento.ID_Conta || lancamento.ID_Grupo_Cartao || "-",
      status: lancamento.Status || "-",
      proprietario: proprietario,
      valorTotal: valorTotal,
      valorAReceber: converterNumeroConsolidadoController_(valoresRateio.valorAReceber),
      valorAPagar: converterNumeroConsolidadoController_(valoresRateio.valorAPagar),
      valorPessoal: valorPessoal,
      quantidadeRateios: rateios.length,
      programado: lancamento._Programado_Recorrencia === true
    };
  }).sort(function(a, b) {
    return Math.abs(converterNumeroConsolidadoController_(b.valorPessoal)) -
      Math.abs(converterNumeroConsolidadoController_(a.valorPessoal));
  });

  return {
    total: arredondarConsolidadoController_(itens.reduce(function(total, item) {
      return total + converterNumeroConsolidadoController_(item.valorPessoal);
    }, 0)),
    quantidade: itens.length,
    itens: itens
  };
}


function calcularValorPessoalLancamentoRelatorio_(lancamento, contexto, rateiosPorLancamento) {
  const idLancamento = normalizarTextoRelatorio_(lancamento.ID_Lancamento);
  const rateios = (rateiosPorLancamento[idLancamento] || []).filter(function(rateio) {
    return normalizarTextoRelatorio_(rateio.Status) !== "Cancelado";
  });

  if (rateios.length === 0) {
    return obterValorIndividualLancamentoConsolidadoController_(lancamento, contexto, rateiosPorLancamento);
  }

  const valoresRateio = calcularValoresRateioUsuarioConsolidadoController_(rateios, contexto.idLogado);
  const valorTotal = converterNumeroConsolidadoController_(lancamento.Valor_Total);

  if (valoresRateio.valorAReceber > 0) {
    return arredondarConsolidadoController_(Math.max(valorTotal - valoresRateio.valorAReceber, 0));
  }

  return arredondarConsolidadoController_(rateios.reduce(function(total, rateio) {
    if (normalizarTextoRelatorio_(rateio.ID_Usuario_Responsavel) !== contexto.idLogado) {
      return total;
    }

    return total + converterNumeroConsolidadoController_(rateio.Valor_Rateado);
  }, 0));
}


function calcularSaldosContasNaDataRelatorio_(contexto, lancamentosVisiveis, dataFim) {
  return (contexto.contasAcessiveis || []).map(function(conta) {
    const contaComContexto = {};
    Object.keys(conta || {}).forEach(function(chave) {
      contaComContexto[chave] = conta[chave];
    });
    contaComContexto._contextoPagamentosFaturas = contexto.pagamentosFaturasTodos || [];

    return {
      ID_Conta: conta.ID_Conta,
      Nome_Conta: conta.Nome_Conta,
      Saldo: arredondarConsolidadoController_(
        calcularSaldoContaAteDataConsolidadoController_(contaComContexto, lancamentosVisiveis || [], dataFim)
      )
    };
  }).sort(function(a, b) {
    return Math.abs(converterNumeroConsolidadoController_(b.Saldo)) -
      Math.abs(converterNumeroConsolidadoController_(a.Saldo));
  });
}


function calcularSaldoRateiosPeriodoRelatorio_(contexto, lancamentosPeriodo, rateiosPorLancamento) {
  return calcularAcertosRateioConsolidadoController_(contexto, lancamentosPeriodo || [], rateiosPorLancamento || {}).reduce(function(total, item) {
    const valor = converterNumeroConsolidadoController_(item.Valor);
    return total + (normalizarTextoRelatorio_(item.Tipo) === "Receber" ? valor : -valor);
  }, 0);
}


function somarCartoesRelatorio_(cartoes) {
  return (cartoes || []).reduce(function(total, item) {
    const valor = item.Valor_Em_Aberto !== undefined ? item.Valor_Em_Aberto : item.Valor_Fatura;
    return total + converterNumeroConsolidadoController_(valor);
  }, 0);
}


function montarHtmlRelatorioSemanal_(pacote) {
  const template = HtmlService.createTemplateFromFile("Relatorios_Email");
  template.conteudoHtml = montarConteudoHtmlRelatorioSemanal_(pacote);
  return template.evaluate().getContent();
}


function montarConteudoHtmlRelatorioSemanal_(pacote) {
  return [
    montarBalancoProximoMesRelatorio_(pacote),
    montarComparativoCenariosRelatorio_(pacote.cenarios),
    montarCategoriasCenariosRelatorio_(pacote.cenarios),
    montarRodapeRelatorio_(pacote)
  ].join("");
}


function montarDiagnosticoDespesasHtmlRelatorio_(pacote) {
  const cenarios = pacote && pacote.cenarios ? pacote.cenarios : {};
  return abrirSecaoRelatorio_("Diagn\u00f3stico de despesas", "Relat\u00f3rio tempor\u00e1rio para conferir cada despesa considerada no c\u00e1lculo.") +
    "<p class=\"texto-base diagnostico-aviso\">" +
      "O restante do relat\u00f3rio foi ocultado temporariamente. A coluna \"Usado no c\u00e1lculo\" mostra o valor que entra na soma das despesas para o usu\u00e1rio logado." +
    "</p>" +
    montarBlocoDiagnosticoDespesasRelatorio_("Hoje", cenarios.agora) +
    montarBlocoDiagnosticoDespesasRelatorio_("At\u00e9 o fim do m\u00eas", cenarios.fimMes) +
    montarBlocoDiagnosticoDespesasRelatorio_("M\u00eas seguinte", cenarios.proximoMes) +
    fecharSecaoRelatorio_();
}


function montarBlocoDiagnosticoDespesasRelatorio_(rotulo, cenario) {
  const diagnostico = cenario && cenario.diagnosticoDespesas ? cenario.diagnosticoDespesas : { total: 0, quantidade: 0, itens: [] };
  return "" +
    "<div class=\"subsecao-relatorio diagnostico-despesas\">" +
      "<div class=\"diagnostico-topo\">" +
        "<h3>" + escaparHtmlRelatorio_(rotulo) + "</h3>" +
        "<strong>" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(diagnostico.total)) + "</strong>" +
      "</div>" +
      "<p class=\"texto-base\">" + escaparHtmlRelatorio_(diagnostico.quantidade) + " despesas encontradas.</p>" +
      montarTabelaDiagnosticoDespesasRelatorio_(diagnostico.itens) +
    "</div>";
}


function montarTabelaDiagnosticoDespesasRelatorio_(itens) {
  if (!itens || itens.length === 0) {
    return "<p class=\"vazio-relatorio\">Nenhuma despesa neste cen\u00e1rio.</p>";
  }

  return "" +
    "<div class=\"tabela-diagnostico\">" +
      "<div class=\"tabela-diagnostico-cabecalho\">" +
        "<span>Despesa</span><span>Total</span><span>A receber</span><span>A pagar</span><span>Usado no c\u00e1lculo</span>" +
      "</div>" +
      itens.map(function(item) {
        const detalhes = [
          item.data ? "Data: " + formatarDataCurtaDiagnosticoRelatorio_(item.data) : "",
          item.mesReferencia ? "M\u00eas ref.: " + item.mesReferencia : "",
          item.categoria ? "Categoria: " + item.categoria : "",
          item.origem ? "Origem: " + item.origem : "",
          item.status ? "Status: " + item.status : "",
          "Rateios: " + item.quantidadeRateios,
          item.programado ? "Recorr\u00eancia prevista" : "",
          item.id ? "ID: " + item.id : ""
        ].filter(Boolean).join(" | ");

        return "" +
          "<div class=\"tabela-diagnostico-linha\">" +
            "<div>" +
              "<strong>" + escaparHtmlRelatorio_(item.descricao) + "</strong>" +
              "<span>" + escaparHtmlRelatorio_(detalhes) + "</span>" +
            "</div>" +
            "<b data-label=\"Total\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(item.valorTotal)) + "</b>" +
            "<b data-label=\"A receber\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(item.valorAReceber)) + "</b>" +
            "<b data-label=\"A pagar\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(item.valorAPagar)) + "</b>" +
            "<b data-label=\"Usado no c\u00e1lculo\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(item.valorPessoal)) + "</b>" +
          "</div>";
      }).join("") +
    "</div>";
}


function formatarDataCurtaDiagnosticoRelatorio_(valor) {
  const texto = normalizarTextoRelatorio_(valor);
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.substring(8, 10) + "/" + texto.substring(5, 7) + "/" + texto.substring(0, 4);
  }
  return texto;
}


function montarBalancoProximoMesRelatorio_(pacote) {
  const proximo = pacote && pacote.cenarios ? pacote.cenarios.proximoMes : {};
  const receitas = converterNumeroConsolidadoController_(proximo.receitas);
  const despesas = converterNumeroConsolidadoController_(proximo.despesas);
  const saldo = arredondarConsolidadoController_(receitas - despesas);
  const margem = receitas > 0 ? (saldo / receitas) * 100 : 0;
  const estado = saldo < 0 ? "vermelho" : (margem < 10 ? "amarelo" : "verde");
  const rotuloEstado = estado === "verde" ? "VERDE" : (estado === "amarelo" ? "AMARELO" : "VERMELHO");
  const mensagem = saldo < 0
    ? "As despesas conhecidas do m\u00eas seguinte superam as receitas conhecidas."
    : (margem < 10 ? "O m\u00eas seguinte fecha, mas com pouca margem." : "O m\u00eas seguinte tem folga entre receitas e despesas conhecidas.");

  return "" +
    "<div class=\"balanco-card semaforo-" + escaparHtmlRelatorio_(estado) + "\">" +
      "<span class=\"hero-kicker\">Relat\u00f3rio semanal</span>" +
      "<div class=\"balanco-topo\">" +
        "<div>" +
          "<h1>Balan\u00e7o do m\u00eas seguinte</h1>" +
          "<p class=\"texto-base\">" + escaparHtmlRelatorio_(mensagem) + "</p>" +
        "</div>" +
        "<strong>" + escaparHtmlRelatorio_(rotuloEstado) + "</strong>" +
      "</div>" +
      "<div class=\"balanco-valor\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(saldo)) + "</div>" +
      "<div class=\"meta-periodo\">" +
        "M\u00eas seguinte: " + escaparHtmlRelatorio_(pacote.periodo.inicioProximoMesVisual) +
        " a " + escaparHtmlRelatorio_(pacote.periodo.fimProximoMesVisual) +
      "</div>" +
      "<div class=\"hero-grade grade-compacta\">" +
        montarHeroCardRelatorio_("Receitas", formatarMoedaRelatorio_(receitas), "Realizadas, futuras e recorrentes.") +
        montarHeroCardRelatorio_("Despesas", formatarMoedaRelatorio_(despesas), "Realizadas, futuras e recorrentes.") +
        montarHeroCardRelatorio_("Margem", formatarPercentualRelatorio_(margem), "Sobra sobre as entradas.") +
      "</div>" +
    "</div>";
}


function montarComparativoCenariosRelatorio_(cenarios) {
  cenarios = cenarios || {};
  return abrirSecaoRelatorio_("Resumo em tr\u00eas cen\u00e1rios", "As colunas usam a data limite de cada recorte para facilitar a leitura.") +
    montarTabelaCenariosRelatorio_([
      { rotulo: "Receitas", classe: "receita", valores: [cenarios.agora && cenarios.agora.receitas, cenarios.fimMes && cenarios.fimMes.receitas, cenarios.proximoMes && cenarios.proximoMes.receitas] },
      { rotulo: "Despesas", classe: "despesa", valores: [cenarios.agora && cenarios.agora.despesas, cenarios.fimMes && cenarios.fimMes.despesas, cenarios.proximoMes && cenarios.proximoMes.despesas] },
      { rotulo: "Saldo", classe: "resultado", valores: [cenarios.agora && cenarios.agora.saldo, cenarios.fimMes && cenarios.fimMes.saldo, cenarios.proximoMes && cenarios.proximoMes.saldo] },
      { rotulo: "Patrim\u00f4nio", classe: "resultado", valores: [cenarios.agora && cenarios.agora.patrimonio, cenarios.fimMes && cenarios.fimMes.patrimonio, cenarios.proximoMes && cenarios.proximoMes.patrimonio] },
      { rotulo: "Despesas nos cart\u00f5es", classe: "despesa", valores: [cenarios.agora && cenarios.agora.totalCartoes, cenarios.fimMes && cenarios.fimMes.totalCartoes, cenarios.proximoMes && cenarios.proximoMes.totalCartoes] }
    ], obterCabecalhosDatasCenariosRelatorio_(cenarios)) +
    fecharSecaoRelatorio_();
}


function montarTabelaCenariosRelatorio_(linhas, cabecalhos) {
  cabecalhos = cabecalhos || ["Hoje", "Final do m\u00eas", "M\u00eas seguinte"];

  return "" +
    "<table class=\"tabela-cenarios\" role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\">" +
      "<colgroup><col class=\"col-rotulo\"><col class=\"col-valor\"><col class=\"col-valor\"><col class=\"col-valor\"></colgroup>" +
      "<thead><tr><th></th><th>" + escaparHtmlRelatorio_(cabecalhos[0]) + "</th><th>" + escaparHtmlRelatorio_(cabecalhos[1]) + "</th><th>" + escaparHtmlRelatorio_(cabecalhos[2]) + "</th></tr></thead>" +
      "<tbody>" +
      (linhas || []).map(function(linha) {
        return "" +
          "<tr class=\"tabela-linha " + escaparHtmlRelatorio_(linha.classe || "") + "\">" +
            "<td class=\"celula-rotulo\">" + escaparHtmlRelatorio_(linha.rotulo) + "</td>" +
            "<td class=\"celula-valor\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(linha.valores[0])) + "</td>" +
            "<td class=\"celula-valor\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(linha.valores[1])) + "</td>" +
            "<td class=\"celula-valor\">" + escaparHtmlRelatorio_(formatarMoedaRelatorio_(linha.valores[2])) + "</td>" +
          "</tr>";
      }).join("") +
      "</tbody>" +
    "</table>";
}


function montarCartoesCenariosRelatorio_(cenarios) {
  return montarItensDiscriminadosCenariosRelatorio_(
    "Cart\u00f5es",
    "Saldo das faturas por grupo de cart\u00e3o.",
    cenarios,
    "cartoes",
    "ID_Grupo_Cartao",
    "Nome_Grupo",
    function(item) {
      return item.Valor_Em_Aberto !== undefined ? item.Valor_Em_Aberto : item.Valor_Fatura;
    }
  );
}


function montarContasCenariosRelatorio_(cenarios) {
  return montarItensDiscriminadosCenariosRelatorio_(
    "Contas",
    "Saldo por conta acess\u00edvel.",
    cenarios,
    "contas",
    "ID_Conta",
    "Nome_Conta",
    function(item) {
      return item.Saldo;
    }
  );
}


function montarCategoriasCenariosRelatorio_(cenarios) {
  return montarItensDiscriminadosCenariosRelatorio_(
    "Categorias",
    "Ranking das maiores despesas.",
    cenarios,
    "categorias",
    "ID_Categoria",
    "Nome_Categoria",
    function(item) {
      return item.Valor;
    }
  );
}


function montarItensDiscriminadosCenariosRelatorio_(titulo, subtitulo, cenarios, chaveLista, campoId, campoNome, obterValor) {
  const itens = combinarItensCenariosRelatorio_(cenarios, chaveLista, campoId, campoNome, obterValor).slice(0, 6);

  if (itens.length === 0) {
    return montarListaVaziaRelatorio_(titulo, "Nenhuma informa\u00e7\u00e3o encontrada para este bloco.");
  }

  return abrirSecaoRelatorio_(titulo, subtitulo) +
    montarTabelaCenariosRelatorio_(itens.map(function(item) {
      return {
        rotulo: item.nome,
        valores: [item.agora, item.fimMes, item.proximoMes]
      };
    }), obterCabecalhosDatasCenariosRelatorio_(cenarios)) +
    fecharSecaoRelatorio_();
}


function obterCabecalhosDatasCenariosRelatorio_(cenarios) {
  cenarios = cenarios || {};
  return [
    formatarDataCabecalhoCenarioRelatorio_(cenarios.agora && cenarios.agora.fim) || "Hoje",
    formatarDataCabecalhoCenarioRelatorio_(cenarios.fimMes && cenarios.fimMes.fim) || "Final do m\u00eas",
    formatarIntervaloCabecalhoCenarioRelatorio_(cenarios.proximoMes && cenarios.proximoMes.inicio, cenarios.proximoMes && cenarios.proximoMes.fim) || "M\u00eas seguinte"
  ];
}


function formatarDataCabecalhoCenarioRelatorio_(valor) {
  const texto = normalizarTextoRelatorio_(valor);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return "";
  }

  return texto.substring(8, 10) + "/" + texto.substring(5, 7);
}


function formatarIntervaloCabecalhoCenarioRelatorio_(inicio, fim) {
  const inicioFormatado = formatarDataCabecalhoCenarioRelatorio_(inicio);
  const fimFormatado = formatarDataCabecalhoCenarioRelatorio_(fim);

  if (!inicioFormatado || !fimFormatado) {
    return "";
  }

  return inicioFormatado + " a " + fimFormatado;
}


function combinarItensCenariosRelatorio_(cenarios, chaveLista, campoId, campoNome, obterValor) {
  const mapa = {};

  [
    { chave: "agora", campo: "agora" },
    { chave: "fimMes", campo: "fimMes" },
    { chave: "proximoMes", campo: "proximoMes" }
  ].forEach(function(config) {
    const lista = cenarios && cenarios[config.chave] && cenarios[config.chave][chaveLista]
      ? cenarios[config.chave][chaveLista]
      : [];

    lista.forEach(function(item) {
      const id = normalizarTextoRelatorio_(item[campoId]) || normalizarTextoRelatorio_(item[campoNome]);

      if (!id) {
        return;
      }

      if (!mapa[id]) {
        mapa[id] = { nome: item[campoNome] || "Item", agora: 0, fimMes: 0, proximoMes: 0 };
      }

      mapa[id].nome = mapa[id].nome || item[campoNome] || "Item";
      mapa[id][config.campo] = arredondarConsolidadoController_(obterValor(item));
    });
  });

  return Object.keys(mapa).map(function(id) {
    return mapa[id];
  }).sort(function(a, b) {
    const pesoB = Math.abs(converterNumeroConsolidadoController_(b.proximoMes)) +
      Math.abs(converterNumeroConsolidadoController_(b.fimMes)) +
      Math.abs(converterNumeroConsolidadoController_(b.agora));
    const pesoA = Math.abs(converterNumeroConsolidadoController_(a.proximoMes)) +
      Math.abs(converterNumeroConsolidadoController_(a.fimMes)) +
      Math.abs(converterNumeroConsolidadoController_(a.agora));
    return pesoB - pesoA;
  });
}


function formatarPercentualRelatorio_(valor) {
  return Math.round(converterNumeroConsolidadoController_(valor)) + "%";
}


function montarCabecalhoSemanalSimplificadoRelatorio_(pacote) {
  const resumo = pacote && pacote.resumo ? pacote.resumo : {};
  const despesas = converterNumeroConsolidadoController_(resumo.Despesas);
  const receitas = converterNumeroConsolidadoController_(resumo.Receitas);
  const saldoProjetado = converterNumeroConsolidadoController_(resumo.Saldo_Projetado_Final_Mes);
  const status = saldoProjetado >= 0 ? "Sa\u00fade financeira da semana" : "Aten\u00e7\u00e3o ao caixa projetado";

  return "" +
    "<div class=\"hero\">" +
      "<span class=\"hero-kicker\">Relat\u00f3rio semanal</span>" +
      "<h1>" + escaparHtmlRelatorio_(status) + "</h1>" +
      "<p class=\"texto-base\">Ol\u00e1, " + escaparHtmlRelatorio_(pacote.usuario.Nome || "usu\u00e1rio") + ". Uma leitura objetiva para celular: fluxo, patrim\u00f4nio, cart\u00f5es, contas e categorias.</p>" +
      "<div class=\"meta-periodo\">" +
        "M\u00eas at\u00e9 " + escaparHtmlRelatorio_(pacote.periodo.fimVisual) +
        " \u00b7 Semana: " + escaparHtmlRelatorio_(pacote.periodo.rotuloCurto) +
      "</div>" +
      "<div class=\"hero-grade\">" +
        montarHeroCardRelatorio_("Receitas", formatarMoedaRelatorio_(receitas), "Entradas realizadas no m\u00eas.") +
        montarHeroCardRelatorio_("Despesas", formatarMoedaRelatorio_(despesas), "Sa\u00eddas realizadas no m\u00eas.") +
        montarHeroCardRelatorio_("Saldo projetado", formatarMoedaRelatorio_(saldoProjetado), "Proje\u00e7\u00e3o at\u00e9 o fim do m\u00eas.") +
      "</div>" +
    "</div>";
}


function montarFluxoEssencialRelatorio_(resumo) {
  resumo = resumo || {};
  const transferencias = converterNumeroConsolidadoController_(resumo.Transferencias);
  const resultado = converterNumeroConsolidadoController_(resumo.Resultado);

  return abrirSecaoRelatorio_("Fluxo do m\u00eas", "Receitas, despesas e transfer\u00eancias realizadas at\u00e9 domingo.") +
    montarGradeMetricasRelatorio_([
      {
        rotulo: "Receitas",
        valor: formatarMoedaRelatorio_(resumo.Receitas),
        classe: "receita",
        detalhe: "Previsto at\u00e9 o fim do m\u00eas: " + formatarMoedaRelatorio_(resumo.Receitas_Programadas)
      },
      {
        rotulo: "Despesas",
        valor: formatarMoedaRelatorio_(resumo.Despesas),
        classe: "despesa",
        detalhe: "Previsto at\u00e9 o fim do m\u00eas: " + formatarMoedaRelatorio_(resumo.Despesas_Programadas)
      },
      {
        rotulo: "Transfer\u00eancias",
        valor: formatarMoedaRelatorio_(transferencias),
        classe: "transferencia",
        detalhe: "Movimento l\u00edquido entre contas."
      },
      {
        rotulo: "Resultado",
        valor: formatarMoedaRelatorio_(resultado),
        classe: "resultado",
        detalhe: "Receitas menos despesas no m\u00eas."
      }
    ]) +
    fecharSecaoRelatorio_();
}


function montarPatrimonioHtmlRelatorio_(dinheiro) {
  dinheiro = dinheiro || {};
  return abrirSecaoRelatorio_("Patrim\u00f4nio", "Dinheiro guardado depois dos compromissos conhecidos.") +
    "<div class=\"hero-grade grade-compacta\">" +
      montarHeroCardRelatorio_("Hoje", formatarMoedaRelatorio_(dinheiro.Saldo_Atual), "Saldo acumulado at\u00e9 domingo.") +
      montarHeroCardRelatorio_("Programado", formatarMoedaRelatorio_(dinheiro.Programado), "Impacto previsto at\u00e9 o fim do m\u00eas.") +
      montarHeroCardRelatorio_("Estimado", formatarMoedaRelatorio_(dinheiro.Estimado), "Patrim\u00f4nio estimado no fechamento.") +
    "</div>" +
    fecharSecaoRelatorio_();
}


function montarCabecalhoDashboardRelatorio_(pacote) {
  const resumo = pacote && pacote.resumo ? pacote.resumo : {};
  const saldoHoje = converterNumeroConsolidadoController_(resumo.Saldo_Ate_Limite);
  const saldoProjetado = converterNumeroConsolidadoController_(resumo.Saldo_Projetado_Final_Mes);
  const statusMes = saldoProjetado > saldoHoje
    ? "Dashboard do m\u00eas: proje\u00e7\u00e3o melhorando"
    : (saldoProjetado < saldoHoje ? "Dashboard do m\u00eas: aten\u00e7\u00e3o ao programado" : "Dashboard do m\u00eas");

  return "" +
    "<div class=\"hero\">" +
      "<span class=\"hero-kicker\">Espelho do Dashboard</span>" +
      "<h1>" + escaparHtmlRelatorio_(statusMes) + "</h1>" +
      "<p class=\"texto-base\">Ol\u00e1, " + escaparHtmlRelatorio_(pacote.usuario.Nome || "usu\u00e1rio") + ". Este e-mail segue a mesma ordem do Dashboard para mostrar, de forma direta, como est\u00e3o as finan\u00e7as no m\u00eas.</p>" +
      "<div class=\"meta-periodo\">" +
        "Realizado at\u00e9 " + escaparHtmlRelatorio_(pacote.periodo.fimVisual) +
        " \u00b7 Proje\u00e7\u00e3o at\u00e9 " + escaparHtmlRelatorio_(pacote.periodo.fimMesVisual) +
        " \u00b7 Semana: " + escaparHtmlRelatorio_(pacote.periodo.rotuloCurto) +
      "</div>" +
      "<div class=\"hero-grade\">" +
        montarHeroCardRelatorio_("Agora", formatarMoedaRelatorio_(saldoHoje), "Dinheiro guardado at\u00e9 domingo.") +
        montarHeroCardRelatorio_("Final do m\u00eas", formatarMoedaRelatorio_(saldoProjetado), "Saldo projetado se o programado acontecer.") +
        montarHeroCardRelatorio_("Lan\u00e7amentos", String(pacote.totalLancamentosSemana || 0), "Movimentos da semana fechada analisada.") +
      "</div>" +
    "</div>";
}


function montarResumoDashboardRelatorio_(resumo) {
  resumo = resumo || {};
  const fluxo = resumo.Fluxo_Rateios || resumo.Pessoal || resumo;
  const pessoalTransferencias = (resumo.Transferencias_Entrada || 0) - (resumo.Transferencias_Saida || 0);
  const fluxoTransferencias = (fluxo.Transferencias_Entrada || 0) - (fluxo.Transferencias_Saida || 0);

  return abrirSecaoRelatorio_("Resumo", "Mesmo bloco do Dashboard: leitura pessoal e fluxo considerando rateios.") +
    montarGradeMetricasRelatorio_([
      {
        rotulo: "Receitas",
        valor: formatarMoedaRelatorio_(resumo.Receitas),
        classe: "receita",
        detalhe: "Fluxo: " + formatarMoedaRelatorio_(fluxo.Receitas)
      },
      {
        rotulo: "Despesas",
        valor: formatarMoedaRelatorio_(resumo.Despesas),
        classe: "despesa",
        detalhe: "Fluxo: " + formatarMoedaRelatorio_(fluxo.Despesas)
      },
      {
        rotulo: "Transf.",
        valor: formatarMoedaRelatorio_(pessoalTransferencias),
        classe: "transferencia",
        detalhe: "Fluxo: " + formatarMoedaRelatorio_(fluxoTransferencias)
      },
      {
        rotulo: "Resultado",
        valor: formatarMoedaRelatorio_(resumo.Resultado),
        classe: "resultado",
        detalhe: "Fluxo: " + formatarMoedaRelatorio_(fluxo.Resultado)
      }
    ]) +
    fecharSecaoRelatorio_();
}


function montarPulsoDashboardRelatorio_(resumo) {
  resumo = resumo || {};
  const pessoal = resumo.Pessoal || resumo;
  const fluxo = resumo.Fluxo_Rateios || pessoal;

  return abrirSecaoRelatorio_("Pulso do m\u00eas", "Mesmo bloco do Dashboard: pessoal e fluxo com rateios.") +
    montarGrupoPulsoDashboardRelatorio_("Pessoal", pessoal) +
    montarGrupoPulsoDashboardRelatorio_("Fluxo com rateios", fluxo) +
    fecharSecaoRelatorio_();
}


function montarGrupoPulsoDashboardRelatorio_(titulo, resumo) {
  resumo = resumo || {};
  const receitas = converterNumeroConsolidadoController_(resumo.Receitas);
  const despesas = converterNumeroConsolidadoController_(resumo.Despesas);
  const transferencias = Math.abs(obterTransferenciasDashboardRelatorio_(resumo));
  const maior = Math.max(receitas, despesas, transferencias, 1);

  return "<div class=\"subsecao-relatorio\">" +
      "<h3>" + escaparHtmlRelatorio_(titulo) + "</h3>" +
      montarLinhaComBarraRelatorio_("Receitas", formatarMoedaRelatorio_(receitas), "Realizado no m\u00eas at\u00e9 domingo.", calcularPercentualRelatorio_(receitas, maior), "receita") +
      montarLinhaComBarraRelatorio_("Despesas", formatarMoedaRelatorio_(despesas), "Realizado no m\u00eas at\u00e9 domingo.", calcularPercentualRelatorio_(despesas, maior), "despesa") +
      montarLinhaComBarraRelatorio_("Transf.", formatarMoedaRelatorio_(transferencias), "Movimento entre contas no per\u00edodo.", calcularPercentualRelatorio_(transferencias, maior), "transferencia") +
    "</div>";
}


function obterTransferenciasDashboardRelatorio_(resumo) {
  if (typeof resumo.Transferencias === "number") {
    return converterNumeroConsolidadoController_(resumo.Transferencias);
  }

  return converterNumeroConsolidadoController_(resumo.Transferencias_Entrada) -
    converterNumeroConsolidadoController_(resumo.Transferencias_Saida);
}


function montarDinheiroGuardadoDashboardRelatorio_(dinheiro) {
  dinheiro = dinheiro || {};
  return abrirSecaoRelatorio_("Dinheiro Guardado", "Fotografia do dinheiro guardado, como no Dashboard.") +
    "<div class=\"hero-grade\">" +
      montarHeroCardRelatorio_("Agora", formatarMoedaRelatorio_(dinheiro.Saldo_Atual), "Saldo acumulado at\u00e9 domingo.") +
      montarHeroCardRelatorio_("Programado nas contas", formatarMoedaRelatorio_(dinheiro.Programado), "Impacto previsto at\u00e9 o fim do m\u00eas.") +
      montarHeroCardRelatorio_("Ap\u00f3s recorr\u00eancias", formatarMoedaRelatorio_(dinheiro.Estimado), "Saldo estimado ap\u00f3s o programado.") +
    "</div>" +
    fecharSecaoRelatorio_();
}


function montarCabecalhoRelatorio_(pacote) {
  const resumo = pacote && pacote.resumo ? pacote.resumo : {};
  const saldoProjetado = converterNumeroConsolidadoController_(resumo.Saldo_Projetado_Final_Mes);
  const resultadoMes = converterNumeroConsolidadoController_(resumo.Resultado) +
    converterNumeroConsolidadoController_(resumo.Resultado_Programado);
  const statusMes = saldoProjetado > 0
    ? "Mês projetado no positivo"
    : (saldoProjetado < 0 ? "Mês projetado no negativo" : "Mês projetado equilibrado");

  return "" +
    "<div class=\"hero\">" +
      "<span class=\"hero-kicker\">Resumo financeiro do m\u00eas</span>" +
      "<h1>" + escaparHtmlRelatorio_(statusMes) + "</h1>" +
      "<p class=\"texto-base\">Ol\u00e1, " + escaparHtmlRelatorio_(pacote.usuario.Nome || "usu\u00e1rio") + ". Este \u00e9 o panorama individual do m\u00eas, combinando o que j\u00e1 aconteceu at\u00e9 domingo com o que est\u00e1 programado at\u00e9 o fechamento.</p>" +
      "<div class=\"meta-periodo\">" +
        "Realizado at\u00e9 " + escaparHtmlRelatorio_(pacote.periodo.fimVisual) +
        " \u00b7 Proje\u00e7\u00e3o at\u00e9 " + escaparHtmlRelatorio_(pacote.periodo.fimMesVisual) +
        " \u00b7 Semana: " + escaparHtmlRelatorio_(pacote.periodo.rotuloCurto) +
      "</div>" +
      "<div class=\"hero-grade\">" +
        montarHeroCardRelatorio_("Saldo hoje", formatarMoedaRelatorio_(resumo.Saldo_Ate_Limite), "Patrim\u00f4nio estimado at\u00e9 domingo.") +
        montarHeroCardRelatorio_("Final do m\u00eas", formatarMoedaRelatorio_(saldoProjetado), "Saldo projetado se o programado acontecer.") +
        montarHeroCardRelatorio_("Resultado mensal", formatarMoedaRelatorio_(resultadoMes), "Realizado mais programado do m\u00eas.") +
      "</div>" +
    "</div>";
}


function montarPlacarMesRelatorio_(pacote) {
  const resumo = pacote && pacote.resumo ? pacote.resumo : {};
  const saldoTransferencias = (resumo.Transferencias_Entrada || 0) - (resumo.Transferencias_Saida || 0);
  const despesas = converterNumeroConsolidadoController_(resumo.Despesas);
  const receitas = converterNumeroConsolidadoController_(resumo.Receitas);
  const despesasProgramadas = converterNumeroConsolidadoController_(resumo.Despesas_Programadas);
  const receitasProgramadas = converterNumeroConsolidadoController_(resumo.Receitas_Programadas);
  const resultadoRealizado = converterNumeroConsolidadoController_(resumo.Resultado);
  const resultadoProgramado = converterNumeroConsolidadoController_(resumo.Resultado_Programado);
  const comprometimento = receitas > 0 ? (despesas / receitas) * 100 : 0;

  return abrirSecaoRelatorio_(
      "Placar do m\u00eas",
      "O essencial para entender rapidamente onde voc\u00ea est\u00e1 e para onde o m\u00eas aponta."
    ) +
    montarInsightResumoRelatorio_(pacote) +
    montarGradeMetricasRelatorio_([
      {
        rotulo: "Entradas at\u00e9 agora",
        valor: formatarMoedaRelatorio_(resumo.Receitas),
        classe: "receita",
        detalhe: receitasProgramadas > 0
          ? "Ainda previsto: " + formatarMoedaRelatorio_(receitasProgramadas)
          : "Sem novas entradas programadas at\u00e9 o fim do m\u00eas."
      },
      {
        rotulo: "Sa\u00eddas at\u00e9 agora",
        valor: formatarMoedaRelatorio_(resumo.Despesas),
        classe: "despesa",
        detalhe: despesasProgramadas > 0
          ? "Ainda previsto: " + formatarMoedaRelatorio_(despesasProgramadas)
          : "Sem novas despesas programadas at\u00e9 o fim do m\u00eas."
      },
      {
        rotulo: "Transfer\u00eancias",
        valor: formatarMoedaRelatorio_(saldoTransferencias),
        classe: "transferencia",
        detalhe: "Movimento l\u00edquido entre contas at\u00e9 domingo."
      },
      {
        rotulo: "F\u00f4lego do m\u00eas",
        valor: formatarMoedaRelatorio_(resultadoRealizado + resultadoProgramado),
        classe: "resultado",
        detalhe: "Realizado: " + formatarMoedaRelatorio_(resultadoRealizado) +
          " \u00b7 Programado: " + formatarMoedaRelatorio_(resultadoProgramado) +
          (receitas > 0 ? " \u00b7 Sa\u00eddas/entradas: " + Math.round(comprometimento) + "%" : "")
      }
    ]) +
    fecharSecaoRelatorio_();
}


function montarInsightResumoRelatorio_(pacote) {
  const resumo = pacote && pacote.resumo ? pacote.resumo : {};
  const saldoAteLimite = converterNumeroConsolidadoController_(resumo.Saldo_Ate_Limite);
  const saldoProjetado = converterNumeroConsolidadoController_(resumo.Saldo_Projetado_Final_Mes);
  const resultadoProjetado = converterNumeroConsolidadoController_(resumo.Resultado) +
    converterNumeroConsolidadoController_(resumo.Resultado_Programado);
  const receitas = converterNumeroConsolidadoController_(resumo && resumo.Receitas);
  const despesas = converterNumeroConsolidadoController_(resumo && resumo.Despesas);
  let mensagem = "M\u00eas sob controle: acompanhe or\u00e7amento e categorias para manter a rota at\u00e9 o fechamento.";

  if (saldoProjetado < 0) {
    mensagem = "A proje\u00e7\u00e3o indica saldo negativo no fim do m\u00eas. Priorize revisar despesas programadas, faturas e categorias perto do teto.";
  } else if (saldoAteLimite < 0 && saldoProjetado >= 0) {
    mensagem = "O saldo atual est\u00e1 pressionado, mas o programado ainda pode recuperar o m\u00eas. Vale conferir se essas entradas s\u00e3o realistas.";
  } else if (resultadoProjetado > 0) {
    mensagem = "O m\u00eas aponta para sobra. Confira onde ela aparece e se faz sentido proteger esse valor antes de novos gastos.";
  } else if (resultadoProjetado < 0) {
    mensagem = "O m\u00eas aponta para consumo de saldo. O mapa de or\u00e7amento e categorias mostra onde agir primeiro.";
  }

  if (receitas === 0 && despesas === 0) {
    mensagem = "N\u00e3o houve receitas ou despesas vis\u00edveis at\u00e9 domingo. Se isso parecer estranho, confira lan\u00e7amentos pendentes ou filtros de acesso.";
  }

  return "<p class=\"insight\">" + escaparHtmlRelatorio_(mensagem) + "</p>";
}


function montarAlertasRelatorio_(pacote) {
  const alertas = [];
  const resumo = pacote && pacote.resumo ? pacote.resumo : {};
  const orcamento = pacote && pacote.orcamento ? pacote.orcamento : {};
  const pendencias = pacote && pacote.pendencias ? pacote.pendencias : [];
  const saldoProjetado = converterNumeroConsolidadoController_(resumo.Saldo_Projetado_Final_Mes);
  const despesasProgramadas = converterNumeroConsolidadoController_(resumo.Despesas_Programadas);
  const itensOrcamento = orcamento.itens || [];
  const categoriasCriticas = itensOrcamento.filter(function(item) {
    return converterNumeroConsolidadoController_(item.Percentual_Projetado) >= 100;
  }).length;
  const categoriasAtencao = itensOrcamento.filter(function(item) {
    const percentual = converterNumeroConsolidadoController_(item.Percentual_Projetado);
    return percentual >= 80 && percentual < 100;
  }).length;

  if (saldoProjetado < 0) {
    alertas.push({
      titulo: "Saldo projetado negativo",
      detalhe: "Se nada mudar, o fim do m\u00eas chega em " + formatarMoedaRelatorio_(saldoProjetado) + ".",
      valor: "Ajustar"
    });
  }

  if (despesasProgramadas > 0) {
    alertas.push({
      titulo: "Despesas ainda programadas",
      detalhe: "Compromissos previstos de hoje at\u00e9 o fim do m\u00eas.",
      valor: formatarMoedaRelatorio_(despesasProgramadas)
    });
  }

  if (categoriasCriticas > 0 || categoriasAtencao > 0) {
    alertas.push({
      titulo: "Or\u00e7amento em aten\u00e7\u00e3o",
      detalhe: categoriasCriticas + " categoria(s) acima do teto e " + categoriasAtencao + " perto do limite.",
      valor: categoriasCriticas > 0 ? "Cr\u00edtico" : "Aten\u00e7\u00e3o"
    });
  }

  if (pendencias && pendencias.length > 0) {
    alertas.push({
      titulo: "Pend\u00eancias para revisar",
      detalhe: "Existem pontos que podem distorcer a leitura financeira.",
      valor: pendencias.length + " item(ns)"
    });
  }

  if (alertas.length === 0) {
    alertas.push({
      titulo: "Sem alertas relevantes",
      detalhe: "A leitura do m\u00eas n\u00e3o encontrou press\u00f5es imediatas.",
      valor: "OK"
    });
  }

  return abrirSecaoRelatorio_("Pr\u00f3ximas decis\u00f5es", "O que merece sua aten\u00e7\u00e3o antes do pr\u00f3ximo fechamento.") +
    alertas.slice(0, 4).map(function(alerta) {
      return montarLinhaRelatorio_(alerta.titulo, alerta.valor, alerta.detalhe, alerta.valor === "OK" ? "" : "alerta");
    }).join("") +
    fecharSecaoRelatorio_();
}


function montarCategoriasHtmlRelatorio_(categorias) {
  if (!categorias || categorias.length === 0) {
    return montarListaVaziaRelatorio_("Despesas por categoria", "Nenhuma despesa por categoria no m\u00eas at\u00e9 domingo.");
  }

  const maior = categorias.reduce(function(maximo, item) {
    return Math.max(maximo, converterNumeroConsolidadoController_(item.Valor));
  }, 0);
  const linhas = categorias.map(function(item) {
    return montarLinhaComBarraRelatorio_(
      item.Nome_Categoria,
      formatarMoedaRelatorio_(item.Valor),
      item.Quantidade + " lan\u00e7amento(s)",
      calcularPercentualRelatorio_(item.Valor, maior),
      "despesa"
    );
  }).join("");

  return abrirSecaoRelatorio_("Despesas por categoria", "Onde seu dinheiro mais saiu no m\u00eas at\u00e9 domingo.") + linhas + fecharSecaoRelatorio_();
}


function montarCartoesHtmlRelatorio_(cartoes) {
  if (!cartoes || cartoes.length === 0) {
    return montarListaVaziaRelatorio_("Cart\u00f5es", "Nenhum lan\u00e7amento em cart\u00e3o no m\u00eas at\u00e9 domingo.");
  }

  const maior = cartoes.reduce(function(maximo, item) {
    return Math.max(maximo, converterNumeroConsolidadoController_(item.Valor_Fatura));
  }, 0);
  const linhas = cartoes.map(function(item) {
    const limite = converterNumeroConsolidadoController_(item.Limite || item.Limite_Total || item.Valor_Limite);
    const comprometimento = limite > 0
      ? " \u00b7 " + Math.round((converterNumeroConsolidadoController_(item.Valor_Fatura) / limite) * 100) + "% do limite usado"
      : "";

    return montarLinhaComBarraRelatorio_(
      item.Nome_Grupo,
      formatarMoedaRelatorio_(item.Valor_Fatura),
      item.Quantidade_Lancamentos + " lan\u00e7amento(s)" + comprometimento,
      calcularPercentualRelatorio_(item.Valor_Fatura, maior),
      "despesa"
    );
  }).join("");

  return abrirSecaoRelatorio_("Cart\u00f5es", "Uso das faturas acess\u00edveis no m\u00eas.") + linhas + fecharSecaoRelatorio_();
}


function montarContasHtmlRelatorio_(contas) {
  if (!contas || contas.length === 0) {
    return montarListaVaziaRelatorio_("Contas", "Nenhuma movimenta\u00e7\u00e3o em conta no per\u00edodo.");
  }

  const linhas = contas.map(function(item) {
    const totalEntradas = converterNumeroConsolidadoController_(item.Entradas) +
      converterNumeroConsolidadoController_(item.Transferencias_Entrada);
    const totalSaidas = converterNumeroConsolidadoController_(item.Saidas) +
      converterNumeroConsolidadoController_(item.Transferencias_Saida) +
      converterNumeroConsolidadoController_(item.Pagamentos_Faturas);
    const detalhe = "Entradas: " + formatarMoedaRelatorio_(totalEntradas) +
      " \u00b7 Sa\u00eddas: " + formatarMoedaRelatorio_(totalSaidas) +
      " \u00b7 Faturas: " + formatarMoedaRelatorio_(item.Pagamentos_Faturas);

    return montarLinhaRelatorio_(
      item.Nome_Conta,
      formatarMoedaRelatorio_(totalEntradas - totalSaidas),
      detalhe
    );
  }).join("");

  return abrirSecaoRelatorio_("Contas", "Movimento l\u00edquido por conta acess\u00edvel.") + linhas + fecharSecaoRelatorio_();
}


function montarRateiosHtmlRelatorio_(rateios) {
  if (!rateios || rateios.length === 0) {
    return montarListaVaziaRelatorio_("Rateios", "Nenhum acerto de rateio relevante para o m\u00eas.");
  }

  const linhas = rateios.map(function(item) {
    return montarLinhaRateioRelatorio_(
      item.Tipo,
      item.Nome_Usuario,
      formatarMoedaRelatorio_(item.Valor),
      "Consolidado pelo realizado e pelo programado do m\u00eas."
    );
  }).join("");

  return abrirSecaoRelatorio_("Rateios", "Valores a pagar ou receber entre participantes.") + linhas + fecharSecaoRelatorio_();
}


function montarOrcamentoHtmlRelatorio_(orcamento) {
  const itens = orcamento && orcamento.itens ? orcamento.itens : [];

  if (itens.length === 0) {
    return montarListaVaziaRelatorio_("Or\u00e7amento", "Nenhum or\u00e7amento ativo para acompanhar neste m\u00eas.");
  }

  const linhas = itens.map(function(item) {
    const percentual = converterNumeroConsolidadoController_(item.Percentual_Usado);
    const detalhe = "Realizado: " + formatarMoedaRelatorio_(item.Valor_Realizado) +
      " de " + formatarMoedaRelatorio_(item.Valor_Teto);
    const destaque = percentual >= 100
      ? "Teto ultrapassado"
      : (percentual >= 80 ? "Pr\u00f3ximo do teto" : "Dentro do teto");

    return montarLinhaComBarraRelatorio_(
      item.Nome_Categoria,
      Math.round(percentual) + "%",
      detalhe + " \u00b7 " + destaque,
      Math.min(100, Math.max(0, Math.round(percentual))),
      percentual >= 100 ? "despesa" : (percentual >= 80 ? "alerta" : "")
    );
  }).join("");

  return abrirSecaoRelatorio_("Or\u00e7amento", "Acompanhamento pedag\u00f3gico dos tetos definidos para o m\u00eas.") + linhas + fecharSecaoRelatorio_();
}


function montarPendenciasHtmlRelatorio_(pendencias) {
  if (!pendencias || pendencias.length === 0) {
    return montarListaVaziaRelatorio_("Pend\u00eancias", "Nenhuma pend\u00eancia relevante encontrada para o per\u00edodo.");
  }

  const linhas = pendencias.map(function(item) {
    return montarLinhaRelatorio_(
      item.Tipo,
      item.Quantidade,
      item.Mensagem,
      "alerta"
    );
  }).join("");

  return abrirSecaoRelatorio_("Pend\u00eancias", "Pontos que merecem revis\u00e3o para manter o sistema confi\u00e1vel.") + linhas + fecharSecaoRelatorio_();
}


function montarRodapeRelatorio_(pacote) {
  return "" +
    "<div class=\"rodape\">" +
      "<p>Relat\u00f3rio gerado automaticamente pelo Mukirana para apoiar suas decis\u00f5es da semana.</p>" +
      "<p>Abra o Dashboard para ver o panorama geral e use a tela de Lan\u00e7amentos para corrigir pend\u00eancias, revisar rateios ou ajustar seu or\u00e7amento.</p>" +
    "</div>";
}


function abrirSecaoRelatorio_(titulo, subtitulo) {
  return "" +
    "<section class=\"secao\">" +
      "<div class=\"secao-cabecalho\">" +
        "<h2>" + escaparHtmlRelatorio_(titulo) + "</h2>" +
        (subtitulo ? "<span>" + escaparHtmlRelatorio_(subtitulo) + "</span>" : "") +
      "</div>";
}


function fecharSecaoRelatorio_() {
  return "</section>";
}


function montarGradeMetricasRelatorio_(metricas) {
  return "<div class=\"grade-metricas\">" + metricas.map(function(item) {
    return "" +
      "<div class=\"metrica " + escaparHtmlRelatorio_(item.classe || "") + "\">" +
        "<span>" + escaparHtmlRelatorio_(item.rotulo) + "</span>" +
        "<strong>" + escaparHtmlRelatorio_(item.valor) + "</strong>" +
        (item.detalhe ? "<small>" + escaparHtmlRelatorio_(item.detalhe) + "</small>" : "") +
      "</div>";
  }).join("") + "</div>";
}


function montarHeroCardRelatorio_(rotulo, valor, detalhe) {
  return "" +
    "<div class=\"hero-card\">" +
      "<span>" + escaparHtmlRelatorio_(rotulo) + "</span>" +
      "<strong>" + escaparHtmlRelatorio_(valor) + "</strong>" +
      (detalhe ? "<small>" + escaparHtmlRelatorio_(detalhe) + "</small>" : "") +
    "</div>";
}


function montarLinhaRelatorio_(titulo, valor, detalhe, classe) {
  return "" +
    "<div class=\"linha " + escaparHtmlRelatorio_(classe || "") + "\">" +
      "<div class=\"linha-topo\">" +
        "<div>" +
          "<strong>" + escaparHtmlRelatorio_(titulo) + "</strong>" +
          "<span>" + escaparHtmlRelatorio_(detalhe || "") + "</span>" +
        "</div>" +
        "<b>" + escaparHtmlRelatorio_(valor) + "</b>" +
      "</div>" +
    "</div>";
}


function montarLinhaRateioRelatorio_(tipo, nomeUsuario, valor, detalhe) {
  const tipoNormalizado = normalizarTextoRelatorio_(tipo).toLowerCase();
  const rotulo = tipoNormalizado === "receber" ? "Voc\u00ea recebe de" : "Voc\u00ea paga para";
  const badge = tipoNormalizado === "receber" ? "Receber" : "Pagar";

  return "" +
    "<div class=\"linha\">" +
      "<div class=\"chamada-rateio\">" +
        "<div>" +
          "<em>" + escaparHtmlRelatorio_(badge) + "</em>" +
          "<strong>" + escaparHtmlRelatorio_(rotulo) + "</strong>" +
          "<span>" + escaparHtmlRelatorio_(nomeUsuario || "Outro participante") + "</span>" +
          "<span>" + escaparHtmlRelatorio_(detalhe || "") + "</span>" +
        "</div>" +
        "<b>" + escaparHtmlRelatorio_(valor) + "</b>" +
      "</div>" +
    "</div>";
}


function montarLinhaComBarraRelatorio_(titulo, valor, detalhe, percentual, classeBarra) {
  const largura = Math.max(3, Math.min(100, Math.round(converterNumeroConsolidadoController_(percentual))));

  return "" +
    "<div class=\"linha\">" +
      "<div class=\"linha-topo\">" +
        "<div>" +
          "<strong>" + escaparHtmlRelatorio_(titulo) + "</strong>" +
          "<span>" + escaparHtmlRelatorio_(detalhe || "") + "</span>" +
        "</div>" +
        "<b>" + escaparHtmlRelatorio_(valor) + "</b>" +
      "</div>" +
      "<div class=\"barra\"><div class=\"barra-preenchimento " + escaparHtmlRelatorio_(classeBarra || "") + "\" style=\"width:" + largura + "%;\"></div></div>" +
    "</div>";
}


function montarListaVaziaRelatorio_(titulo, mensagem) {
  return abrirSecaoRelatorio_(titulo) +
    "<p class=\"vazio\">" + escaparHtmlRelatorio_(mensagem) + "</p>" +
    fecharSecaoRelatorio_();
}


function calcularPercentualRelatorio_(valor, total) {
  const base = converterNumeroConsolidadoController_(total);

  if (base <= 0) {
    return 0;
  }

  return (converterNumeroConsolidadoController_(valor) / base) * 100;
}


function listarDestinatariosRelatorioSemanal_() {
  return classificarUsuariosRelatorioSemanal_().destinatarios;
}


function contarUsuariosIgnoradosRelatorioSemanal_() {
  return classificarUsuariosRelatorioSemanal_().ignorados;
}


function classificarUsuariosRelatorioSemanal_() {
  const usuarios = typeof listarUsuariosModel_ === "function" ? (listarUsuariosModel_() || []) : [];
  const classificacao = {
    destinatarios: [],
    ignorados: 0
  };

  usuarios.forEach(function(usuario) {
    if (!normalizarBooleanoRelatorio_(usuario.Ativo)) {
      return;
    }

    if (ehUsuarioVirtualRelatorio_(usuario.Papel) || !emailValidoRelatorio_(usuario.Email)) {
      classificacao.ignorados += 1;
      return;
    }

    classificacao.destinatarios.push(usuario);
  });

  return classificacao;
}


function garantirTriggerRelatorioSemanal_() {
  const triggers = ScriptApp.getProjectTriggers();
  const jaExiste = triggers.some(function(trigger) {
    return trigger.getHandlerFunction() === "enviarRelatoriosSemanais";
  });

  if (jaExiste) {
    return;
  }

  ScriptApp.newTrigger("enviarRelatoriosSemanais")
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(CONFIG_RELATORIO_SEMANAL.DIA_SEMANA_ENVIO)
    .atHour(CONFIG_RELATORIO_SEMANAL.HORA_ENVIO)
    .create();
}


function calcularPeriodoSemanaFechadaRelatorio_(dataBase) {
  const base = dataBase instanceof Date && !isNaN(dataBase.getTime()) ? new Date(dataBase.getTime()) : new Date();
  base.setHours(0, 0, 0, 0);

  const diasDesdeSegundaAtual = (base.getDay() + 6) % 7;
  const segundaAtual = new Date(base.getTime());
  segundaAtual.setDate(base.getDate() - diasDesdeSegundaAtual);

  const inicio = new Date(segundaAtual.getTime());
  inicio.setDate(segundaAtual.getDate() - 7);

  const fim = new Date(segundaAtual.getTime());
  fim.setDate(segundaAtual.getDate() - 1);
  const inicioMes = new Date(fim.getFullYear(), fim.getMonth(), 1);
  const fimMes = new Date(fim.getFullYear(), fim.getMonth() + 1, 0);
  const inicioProximoMes = new Date(fim.getFullYear(), fim.getMonth() + 1, 1);
  const fimProximoMes = new Date(fim.getFullYear(), fim.getMonth() + 2, 0);

  return {
    inicio: formatarDataIsoRelatorio_(inicio),
    fim: formatarDataIsoRelatorio_(fim),
    inicioMes: formatarDataIsoRelatorio_(inicioMes),
    fimMes: formatarDataIsoRelatorio_(fimMes),
    inicioProximoMes: formatarDataIsoRelatorio_(inicioProximoMes),
    fimProximoMes: formatarDataIsoRelatorio_(fimProximoMes),
    inicioMesVisual: formatarDataVisualRelatorio_(inicioMes),
    fimMesVisual: formatarDataVisualRelatorio_(fimMes),
    inicioProximoMesVisual: formatarDataVisualRelatorio_(inicioProximoMes),
    fimProximoMesVisual: formatarDataVisualRelatorio_(fimProximoMes),
    inicioVisual: formatarDataVisualRelatorio_(inicio),
    fimVisual: formatarDataVisualRelatorio_(fim),
    rotuloCurto: formatarDataVisualRelatorio_(inicio) + " a " + formatarDataVisualRelatorio_(fim)
  };
}


function obterMesesPeriodoRelatorio_(periodo) {
  const meses = [];
  const inicio = normalizarTextoRelatorio_(periodo && (periodo.inicioMes || periodo.inicio));
  const fim = normalizarTextoRelatorio_(periodo && (periodo.fimProximoMes || periodo.fimMes || periodo.fim));
  const mesInicio = inicio.substring(0, 7);
  const mesFim = fim.substring(0, 7);

  if (/^\d{4}-\d{2}$/.test(mesInicio)) {
    meses.push(mesInicio);
  }

  if (/^\d{4}-\d{2}$/.test(mesFim)) {
    let cursor = mesInicio;

    while (/^\d{4}-\d{2}$/.test(cursor) && cursor < mesFim) {
      cursor = obterMesSeguinteRelatorio_(cursor);
      if (cursor && meses.indexOf(cursor) === -1) {
        meses.push(cursor);
      }
    }
  }

  if (meses.length === 0) {
    meses.push(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM"));
  }

  return meses;
}


function obterMesSeguinteRelatorio_(mesReferencia) {
  const partes = normalizarTextoRelatorio_(mesReferencia).split("-");
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);

  if (!ano || !mes) {
    return "";
  }

  const data = new Date(ano, mes, 1);
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy-MM");
}


function dataDentroDoPeriodoRelatorio_(valor, inicio, fim) {
  const data = normalizarTextoRelatorio_(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && data >= inicio && data <= fim;
}


function lancamentoPertenceMesRelatorio_(lancamento, mesReferencia) {
  const mes = normalizarTextoRelatorio_(mesReferencia);
  const mesLancamento = normalizarTextoRelatorio_(lancamento && lancamento.Mes_Referencia);
  const data = normalizarTextoRelatorio_(lancamento && lancamento.Data_Ocorrencia);

  if (mesLancamento) {
    return mesLancamento === mes;
  }

  return data.substring(0, 7) === mes;
}


function obterNomeCategoriaRelatorio_(idCategoria, categorias) {
  const id = normalizarTextoRelatorio_(idCategoria);
  const categoria = (categorias || []).find(function(item) {
    return normalizarTextoRelatorio_(item.ID_Categoria) === id;
  });

  if (!categoria) {
    return "Sem categoria";
  }

  const idPai = normalizarTextoRelatorio_(categoria.ID_Categoria_Pai);
  const pai = idPai ? (categorias || []).find(function(item) {
    return normalizarTextoRelatorio_(item.ID_Categoria) === idPai;
  }) : null;

  return pai
    ? normalizarTextoRelatorio_(pai.Nome) + " > " + normalizarTextoRelatorio_(categoria.Nome)
    : normalizarTextoRelatorio_(categoria.Nome);
}


function emailValidoRelatorio_(email) {
  const texto = normalizarTextoRelatorio_(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);
}


function ehUsuarioVirtualRelatorio_(papel) {
  return normalizarTextoComparacaoRelatorio_(papel) === "usuario virtual";
}


function formatarMoedaRelatorio_(valor) {
  return "R$ " + converterNumeroConsolidadoController_(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}


function formatarDataIsoRelatorio_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy-MM-dd");
}


function formatarDataVisualRelatorio_(data) {
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM/yyyy");
}


function escaparHtmlRelatorio_(valor) {
  return normalizarTextoRelatorio_(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function normalizarTextoRelatorio_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function normalizarTextoComparacaoRelatorio_(valor) {
  return normalizarTextoRelatorio_(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}


function normalizarBooleanoRelatorio_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
