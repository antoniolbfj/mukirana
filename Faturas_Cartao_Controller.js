/**
 * Modulo: Faturas_Cartao_Controller.gs
 * Responsabilidade:
 * - Exibir a fatura por periodo fechado de um grupo de cartao.
 * - Mostrar consolidado realista de limite, uso e disponibilidade.
 * - Entregar lancamentos compactos com permissoes para a View contextual.
 */


function obterPacoteFaturaCartao(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("FaturasCartao.obterPacote");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const intervalo = medirEtapaPerformance_(medidor, "normalizar_periodo", function() {
    return typeof normalizarIntervaloMesesConsolidadoController_ === "function"
      ? normalizarIntervaloMesesConsolidadoController_(
          filtros && (filtros.Mes_Inicial || filtros.Mes_Referencia),
          filtros && filtros.Mes_Final,
          true
        )
      : {
          Mes_Inicial: normalizarMesFaturaCartaoController_(filtros && filtros.Mes_Referencia),
          Mes_Final: ""
        };
  });
  const idGrupo = normalizarTextoConsolidadoController_(filtros && filtros.ID_Grupo_Cartao);

  if (!idGrupo) {
    throw new Error("Grupo de cartao nao informado para abrir a fatura.");
  }

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoFaturaCartaoController_(
      sessao,
      intervalo,
      idGrupo,
      medidor
    );
  });
  const categoriasFiltro = medirEtapaPerformance_(medidor, "normalizar_filtro_categorias", function() {
    return montarMapaIdsFiltroFaturaCartaoController_(filtros && filtros.ID_Categoria);
  });
  const detalheNovo = bancoUsaSupabase_() ? CartoesNovo_.detail(sessao.id, idGrupo, CartoesNovo_.period(intervalo)) : null;
  const cartoesDoGrupoAcessiveis = medirEtapaPerformance_(medidor, "filtrar_cartoes_grupo", function() {
    return (detalheNovo ? contexto.cartoesTodos : contexto.cartoesAcessiveis).filter(function(cartao) {
      return normalizarTextoConsolidadoController_(cartao.ID_Grupo_Cartao) === idGrupo &&
        (!detalheNovo || detalheNovo.cards.some(function(c) { return c.id === cartao.ID_Cartao; }));
    });
  });

  if (cartoesDoGrupoAcessiveis.length === 0) {
    throw new Error("Voce nao tem acesso a esta fatura.");
  }

  const idsCartoesAcessiveis = {};
  cartoesDoGrupoAcessiveis.forEach(function(cartao) {
    idsCartoesAcessiveis[normalizarTextoConsolidadoController_(cartao.ID_Cartao)] = true;
  });

  const lancamentos = medirEtapaPerformance_(medidor, "filtrar_lancamentos_fatura", function() {
    return obterLancamentosVisiveisConsolidadosController_(contexto)
      .filter(function(lancamento) {
        const mesLancamento = typeof obterMesCompetenciaCartaoLancamentoConsolidadoController_ === "function"
          ? obterMesCompetenciaCartaoLancamentoConsolidadoController_(lancamento, contexto)
          : normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);
        const idCategoria = normalizarTextoConsolidadoController_(lancamento.ID_Categoria);

        if (Object.keys(categoriasFiltro).length > 0 && categoriasFiltro[idCategoria] !== true) {
          return false;
        }

        return mesReferenciaEstaNoIntervaloConsolidadoController_(mesLancamento, intervalo.Mes_Inicial, intervalo.Mes_Final) &&
          ehTipoOrigemCartaoController_(lancamento.Tipo_Origem) &&
          idsCartoesAcessiveis[normalizarTextoConsolidadoController_(lancamento.ID_Origem)] === true;
      })
      .sort(function(a, b) {
        const dataA = normalizarTextoConsolidadoController_(a.Data_Ocorrencia);
        const dataB = normalizarTextoConsolidadoController_(b.Data_Ocorrencia);

        if (dataA === dataB) {
          return normalizarTextoConsolidadoController_(a.Descricao).localeCompare(
            normalizarTextoConsolidadoController_(b.Descricao)
          );
        }

        return dataA < dataB ? -1 : 1;
      });
  });
  const recorrenciasPrevistas = medirEtapaPerformance_(medidor, "montar_recorrencias_previstas", function() {
    return listarRecorrenciasPrevistasFaturaCartaoController_(
      contexto,
      cartoesDoGrupoAcessiveis,
      intervalo,
      categoriasFiltro
    );
  });
  const subtotais = medirEtapaPerformance_(medidor, "montar_subtotais", function() {
    return montarSubtotaisCartoesFaturaController_(cartoesDoGrupoAcessiveis, lancamentos, recorrenciasPrevistas);
  });
  const pagamentos = medirEtapaPerformance_(medidor, "filtrar_pagamentos_fatura", function() {
    return filtrarPagamentosFaturaCartaoController_(contexto.pagamentosFaturasTodos || [], idGrupo, intervalo).filter(function(p) {
      return !detalheNovo || detalheNovo.group.canEdit || p.Criado_Por_ID === sessao.id || contexto.contasAcessiveis.some(function(c) { return c.ID_Conta === p.ID_Conta; });
    });
  });
  const total = subtotais.reduce(function(soma, item) {
    return soma + converterNumeroConsolidadoController_(item.Valor_Total);
  }, 0);
  const totalRecorrenciasPrevistas = recorrenciasPrevistas.reduce(function(soma, item) {
    return soma + converterNumeroConsolidadoController_(item.Valor_Total);
  }, 0);
  const totalPago = pagamentos.reduce(function(soma, pagamento) {
    return soma + converterNumeroConsolidadoController_(pagamento.Valor);
  }, 0);
  const saldoEmAberto = Math.max(0, total - totalPago);
  const grupo = cartoesDoGrupoAcessiveis[0] || {};
  const idsLancamentosComRateioDoUsuario = medirEtapaPerformance_(medidor, "mapear_rateios_usuario", function() {
    return typeof mapearIdsLancamentosComRateioDoUsuario_ === "function"
      ? mapearIdsLancamentosComRateioDoUsuario_(contexto.rateiosTodos, contexto.idLogado)
      : {};
  });
  const rateiosVisiveis = medirEtapaPerformance_(medidor, "filtrar_rateios_visiveis", function() {
    const idsLancamentos = {};

    lancamentos.forEach(function(lancamento) {
      idsLancamentos[normalizarTextoConsolidadoController_(lancamento.ID_Lancamento)] = true;
    });

    return (contexto.rateiosTodos || []).filter(function(rateio) {
      return idsLancamentos[normalizarTextoConsolidadoController_(rateio.ID_Lancamento)] &&
        normalizarTextoConsolidadoController_(rateio.Status) !== "Cancelado";
    });
  });
  const limiteTotal = converterNumeroConsolidadoController_(grupo.Limite);
  const limiteDisponivel = arredondarConsolidadoController_(Math.max(0, limiteTotal - saldoEmAberto));
  const limiteExcedido = arredondarConsolidadoController_(Math.max(0, saldoEmAberto - limiteTotal));
  const percentualUtilizado = limiteTotal > 0
    ? arredondarConsolidadoController_((saldoEmAberto / limiteTotal) * 100)
    : 0;
  const lancamentosTela = ordenarLancamentosFaturaCartaoController_(
    lancamentos.map(function(lancamento) {
      return montarLancamentoFaturaParaTelaController_(
        lancamento,
        contexto,
        idsLancamentosComRateioDoUsuario,
        rateiosVisiveis
      );
    }).concat(montarLancamentosRecorrentesPrevistosFaturaController_(recorrenciasPrevistas, contexto))
  );

  const pacote = {
    Mes_Referencia: intervalo.Mes_Inicial,
    Mes_Inicial: intervalo.Mes_Inicial,
    Mes_Final: intervalo.Mes_Final,
    Resumo_Periodo: montarResumoPeriodoFaturaCartaoController_(intervalo),
    ID_Grupo_Cartao: idGrupo,
    Nome_Grupo: grupo.Nome_Grupo || "Fatura",
    Dia_Fechamento: grupo.Dia_Fechamento || "",
    Dia_Vencimento: grupo.Dia_Vencimento || "",
    Valor_Total: arredondarConsolidadoController_(total),
    Valor_Recorrencias_Previstas: arredondarConsolidadoController_(totalRecorrenciasPrevistas),
    Valor_Pago: arredondarConsolidadoController_(totalPago),
    Valor_Em_Aberto: arredondarConsolidadoController_(saldoEmAberto),
    Limite_Total: arredondarConsolidadoController_(limiteTotal),
    Limite_Disponivel: limiteDisponivel,
    Limite_Excedido: limiteExcedido,
    Percentual_Utilizado: percentualUtilizado,
    Subtotais: subtotais,
    Pagamentos: pagamentos.map(function(pagamento) {
      return montarPagamentoFaturaParaTelaController_(pagamento, contexto);
    }),
    Contas_Origem: contexto.contasAcessiveis.filter(function(c){return (!c.Tipo_Conta||c.Tipo_Conta==='Consumo')&&!c.ID_Grupo_Cartao_V3;}).map(function(conta) {
      return {
        ID_Conta: conta.ID_Conta,
        Nome_Conta: conta.Nome_Conta
      };
    }),
    Categorias_Filtro: (contexto.categoriasAcessiveis || [])
      .filter(function(categoria) {
        const tipo = normalizarTextoConsolidadoController_(categoria.Tipo);
        const status = normalizarTextoConsolidadoController_(categoria.Status);
        return status !== "Inativo" && (tipo === "Despesa" || tipo === "Receita");
      })
      .map(function(categoria) {
        return {
          ID_Categoria: categoria.ID_Categoria,
          Nome_Categoria: categoria.Nome_Categoria,
          Tipo: categoria.Tipo
        };
      })
      .sort(function(a, b) {
        return normalizarTextoConsolidadoController_(a.Nome_Categoria).localeCompare(
          normalizarTextoConsolidadoController_(b.Nome_Categoria)
        );
      }),
    Lancamentos: lancamentosTela
  };

  registrarContagemPerformance_(medidor, "cartoesAcessiveis", contexto.cartoesAcessiveis.length);
  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
  registrarContagemPerformance_(medidor, "lancamentosFatura", lancamentos.length);
  registrarContagemPerformance_(medidor, "pagamentosFatura", pagamentos.length);

  if (detalheNovo) aplicarResumoCartoesNovoNaFatura_(pacote, sessao, intervalo, detalheNovo, contexto);
  pacote._performance = finalizarPerformance_(medidor);
  return pacote;
}


function registrarPagamentoFaturaCartao(tokenSessao, dados) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const pagamento = validarDadosPagamentoFaturaCartaoController_(sessao, dados, "");

  inserirPagamentoFaturaModel_(pagamento);
  return "Pagamento de fatura registrado com sucesso.";
}


function atualizarPagamentoFaturaCartao(tokenSessao, dados) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const idPagamento = normalizarTextoConsolidadoController_(dados && dados.ID_Pagamento_Fatura);
  const pagamento = validarDadosPagamentoFaturaCartaoController_(sessao, dados, idPagamento);

  atualizarPagamentoFaturaModel_(pagamento);
  return "Pagamento de fatura atualizado com sucesso.";
}


function excluirPagamentoFaturaCartao(tokenSessao, idPagamentoFatura) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const idPagamento = normalizarTextoConsolidadoController_(idPagamentoFatura);

  if (!idPagamento) {
    throw new Error("Pagamento de fatura nao informado para exclusao.");
  }

  const pagamento = (typeof listarPagamentosFaturasModel_ === "function" ? listarPagamentosFaturasModel_() : []).find(function(item) {
    return normalizarTextoConsolidadoController_(item.ID_Pagamento_Fatura) === idPagamento;
  });

  if (!pagamento) {
    throw new Error("Pagamento de fatura nao encontrado.");
  }

  const contexto = montarContextoFaturaCartaoController_(
    sessao,
    normalizarMesReferenciaPagamentoFaturaCartaoController_(pagamento.Mes_Referencia),
    normalizarTextoConsolidadoController_(pagamento.ID_Grupo_Cartao),
    null
  );
  const conta = contexto.contasAcessiveis.find(function(item) {
    return normalizarTextoConsolidadoController_(item.ID_Conta) === normalizarTextoConsolidadoController_(pagamento.ID_Conta);
  });

  if (!conta) {
    throw new Error("Voce nao tem acesso a conta usada neste pagamento.");
  }

  excluirPagamentoFaturaModel_(idPagamento);

  return "Pagamento de fatura excluido com sucesso.";
}


function normalizarMesReferenciaPagamentoFaturaCartaoController_(valor) {
  const texto = normalizarTextoConsolidadoController_(valor);

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto.substring(0, 7);
  }

  return normalizarMesFaturaCartaoController_(texto);
}


function validarDadosPagamentoFaturaCartaoController_(sessao, dados, idPagamentoAtual) {
  const idGrupo = normalizarTextoConsolidadoController_(dados && dados.ID_Grupo_Cartao);
  const mesReferencia = normalizarTextoConsolidadoController_(dados && dados.Mes_Referencia).replace(/^(\d{4}-\d{2})-\d{2}$/, "$1");
  const idConta = normalizarTextoConsolidadoController_(dados && dados.ID_Conta);
  const valor = converterNumeroConsolidadoController_(dados && dados.Valor);
  const dataPagamento = normalizarTextoConsolidadoController_(dados && dados.Data_Pagamento);
  const status = normalizarTextoConsolidadoController_(dados && dados.Status) === "Pendente" ? "Pendente" : "Efetivado";
  const observacao = normalizarTextoConsolidadoController_(dados && dados.Observacao);

  if (!idGrupo) {
    throw new Error("Fatura nao informada para registrar pagamento.");
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesReferencia)) {
    throw new Error("Informe a competência da fatura antes de registrar o pagamento.");
  }

  if (!idConta) {
    throw new Error("Selecione a conta de origem do pagamento.");
  }

  if (valor <= 0) {
    throw new Error("Informe um valor de pagamento maior que zero.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    throw new Error("Informe a data do pagamento.");
  }

  const contexto = montarContextoFaturaCartaoController_(sessao, mesReferencia, idGrupo, null);
  const cartoesDoGrupoAcessiveis = contexto.cartoesAcessiveis.filter(function(cartao) {
    return normalizarTextoConsolidadoController_(cartao.ID_Grupo_Cartao) === idGrupo;
  });

  if (cartoesDoGrupoAcessiveis.length === 0) {
    throw new Error("Voce nao tem acesso a esta fatura.");
  }

  const conta = contexto.contasAcessiveis.find(function(item) {
    return normalizarTextoConsolidadoController_(item.ID_Conta) === idConta;
  });

  if (!conta) {
    throw new Error("Conta de origem invalida, inativa ou inacessivel.");
  }

  if (idPagamentoAtual) {
    const original = listarPagamentosFaturasModel_().find(function(p) { return p.ID_Pagamento_Fatura === idPagamentoAtual; });
    if (!original || original.ID_Grupo_Cartao !== idGrupo || !contexto.contasAcessiveis.some(function(c) { return c.ID_Conta === original.ID_Conta; })) {
      throw new Error('Você não tem acesso ao pagamento original.');
    }
  }
  // Conserva a validação de acesso/atividade da fatura; o saldo não limita transferências.
  if (bancoUsaSupabase_()) CartoesNovo_.rpc('rpc_cartoes_pagamento_base_v2', {
    p_usuario: sessao.id, p_grupo: idGrupo, p_mes: mesReferencia + '-01', p_excluir: idPagamentoAtual || null
  });
  return {
    ID_Pagamento_Fatura: idPagamentoAtual || "",
    ID_Grupo_Cartao: idGrupo,
    ID_Conta: idConta,
    Valor: valor,
    Data_Pagamento: dataPagamento,
    Mes_Referencia: mesReferencia,
    Status: status,
    Observacao: observacao,
    Criado_Por_ID: sessao.id,
    Alterado_Por_ID: idPagamentoAtual ? sessao.id : "",
    Data_Criacao: idPagamentoAtual ? "" : new Date().toISOString(),
    Data_Alteracao: idPagamentoAtual ? new Date().toISOString() : ""
  };
}


function formatarValorMensagemPagamentoFaturaCartaoController_(valor) {
  return arredondarConsolidadoController_(converterNumeroConsolidadoController_(valor))
    .toFixed(2)
    .replace(".", ",");
}


function montarContextoFaturaCartaoController_(sessao, intervaloOuMesReferencia, idGrupoCartao, medidorPerformance) {
  const idLogado = normalizarTextoConsolidadoController_(sessao.id);
  const intervalo = typeof intervaloOuMesReferencia === "object"
    ? intervaloOuMesReferencia
    : { Mes_Inicial: normalizarTextoConsolidadoController_(intervaloOuMesReferencia), Mes_Final: "" };
  const mesInicial = normalizarTextoConsolidadoController_(intervalo.Mes_Inicial);
  const mesFinal = normalizarTextoConsolidadoController_(intervalo.Mes_Final);
  const mesReferenciaContexto = mesFinal || mesInicial || "";
  const periodoComMaisDeUmMes = !!(mesInicial && mesFinal && mesFinal !== mesInicial);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return mesReferenciaContexto && !periodoComMaisDeUmMes && typeof obterContextoFaturaCartaoSupabaseRpc_ === "function"
      ? obterContextoFaturaCartaoSupabaseRpc_(idLogado, mesReferenciaContexto, idGrupoCartao)
      : null;
  });

  if (contextoRpc) {
    complementarContextoFaturaComRecorrenciasController_(contextoRpc);
    return montarContextoConsolidadosAPartirBase_(sessao, contextoRpc, medidorPerformance, "RPC_FATURA");
  }

  const contextoFinanceiro = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_financeiro_fallback", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, mesReferenciaContexto, true)
      : null;
  });

  if (contextoFinanceiro) {
    return montarContextoConsolidadosAPartirBase_(sessao, contextoFinanceiro, medidorPerformance, "RPC");
  }

  return montarContextoConsolidadosAPartirBase_(sessao, null, medidorPerformance, "MODELS");
}


function complementarContextoFaturaComRecorrenciasController_(contextoBase) {
  const idsCartoesGrupo = {};
  const recorrenciasComplementares = [];
  const recorrenciasExistentes = {};
  const recorrenciasRateiosExistentes = {};

  (contextoBase.cartoesTodos || []).forEach(function(cartao) {
    const idCartao = normalizarTextoConsolidadoController_(cartao.ID_Cartao);

    if (idCartao) {
      idsCartoesGrupo[idCartao] = true;
    }
  });

  if (Object.keys(idsCartoesGrupo).length === 0) {
    return;
  }

  (contextoBase.recorrenciasTodos || []).forEach(function(recorrencia) {
    recorrenciasExistentes[normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia)] = true;
  });

  (contextoBase.recorrenciasRateiosTodos || []).forEach(function(rateio) {
    recorrenciasRateiosExistentes[normalizarTextoConsolidadoController_(rateio.ID_Recorrencia_Rateio)] = true;
  });

  (typeof listarRecorrenciasModel_ === "function" ? listarRecorrenciasModel_() : []).forEach(function(recorrencia) {
    const idRecorrencia = normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia);
    const idOrigem = normalizarTextoConsolidadoController_(recorrencia.ID_Origem);
    const tipoOrigem = recorrencia.Tipo_Origem;

    if (!idRecorrencia || recorrenciasExistentes[idRecorrencia] === true) {
      return;
    }

    if (ehTipoOrigemCartaoController_(tipoOrigem) && idsCartoesGrupo[idOrigem] === true) {
      recorrenciasComplementares.push(recorrencia);
      recorrenciasExistentes[idRecorrencia] = true;
    }
  });

  if (recorrenciasComplementares.length === 0) {
    return;
  }

  contextoBase.recorrenciasTodos = (contextoBase.recorrenciasTodos || []).concat(recorrenciasComplementares);

  const idsRecorrenciasComplementares = {};
  recorrenciasComplementares.forEach(function(recorrencia) {
    idsRecorrenciasComplementares[normalizarTextoConsolidadoController_(recorrencia.ID_Recorrencia)] = true;
  });

  (typeof listarRecorrenciasRateiosModel_ === "function" ? listarRecorrenciasRateiosModel_() : []).forEach(function(rateio) {
    const idRecorrenciaRateio = normalizarTextoConsolidadoController_(rateio.ID_Recorrencia_Rateio);
    const idRecorrencia = normalizarTextoConsolidadoController_(rateio.ID_Recorrencia);

    if (!idRecorrenciaRateio || recorrenciasRateiosExistentes[idRecorrenciaRateio] === true) {
      return;
    }

    if (idsRecorrenciasComplementares[idRecorrencia] === true) {
      contextoBase.recorrenciasRateiosTodos = contextoBase.recorrenciasRateiosTodos || [];
      contextoBase.recorrenciasRateiosTodos.push(rateio);
      recorrenciasRateiosExistentes[idRecorrenciaRateio] = true;
    }
  });
}


function filtrarPagamentosFaturaCartaoController_(pagamentos, idGrupo, intervalo) {
  const inicio = normalizarTextoConsolidadoController_(intervalo && intervalo.Mes_Inicial);
  const fim = normalizarTextoConsolidadoController_(intervalo && intervalo.Mes_Final);

  return (pagamentos || []).filter(function(pagamento) {
    const grupo = normalizarTextoConsolidadoController_(pagamento.ID_Grupo_Cartao);
    const mes = normalizarMesReferenciaPagamentoFaturaCartaoController_(pagamento.Mes_Referencia);

    return grupo === idGrupo &&
      mesReferenciaEstaNoIntervaloConsolidadoController_(mes, inicio, fim);
  });
}


function montarPagamentoFaturaParaTelaController_(pagamento, contexto) {
  const conta = (contexto.contasTodas || []).find(function(item) {
    return normalizarTextoConsolidadoController_(item.ID_Conta) === normalizarTextoConsolidadoController_(pagamento.ID_Conta);
  });

  return {
    ID_Pagamento_Fatura: pagamento.ID_Pagamento_Fatura,
    Pode_Editar: (contexto.contasAcessiveis || []).some(function(c) { return c.ID_Conta === pagamento.ID_Conta; }) && (contexto.cartoesAcessiveis || []).some(function(c) { return c.ID_Grupo_Cartao === pagamento.ID_Grupo_Cartao; }),
    Pode_Excluir: (contexto.contasAcessiveis || []).some(function(c) { return c.ID_Conta === pagamento.ID_Conta; }),
    ID_Conta: pagamento.ID_Conta,
    Nome_Conta: conta ? conta.Nome_Conta : "Conta",
    Valor: converterNumeroConsolidadoController_(pagamento.Valor),
    Data_Pagamento: pagamento.Data_Pagamento,
    Mes_Referencia: pagamento.Mes_Referencia,
    Status: pagamento.Status,
    Observacao: pagamento.Observacao || ""
  };
}


function montarSubtotaisCartoesFaturaController_(cartoes, lancamentos, recorrenciasPrevistas) {
  const mapa = {};

  cartoes.forEach(function(cartao) {
    mapa[normalizarTextoConsolidadoController_(cartao.ID_Cartao)] = {
      ID_Cartao: cartao.ID_Cartao,
      Nome_Cartao: montarNomeCartaoVisualizacaoLancamento_(cartao),
      Valor_Total: 0,
      Quantidade: 0
    };
  });

  lancamentos.forEach(function(lancamento) {
    const idCartao = normalizarTextoConsolidadoController_(lancamento.ID_Origem);
    const valorCompromisso = calcularImpactoCompromissoCartaoConsolidadoController_(
      lancamento.Tipo,
      lancamento.Valor_Total
    );

    if (!mapa[idCartao] || valorCompromisso === 0) {
      return;
    }

    mapa[idCartao].Valor_Total += valorCompromisso;
    mapa[idCartao].Quantidade += 1;
  });

  (recorrenciasPrevistas || []).forEach(function(item) {
    const idCartao = normalizarTextoConsolidadoController_(item.ID_Cartao);

    if (!mapa[idCartao]) {
      return;
    }

    // Previsões ficam separadas do valor e da quantidade já registrados.
    mapa[idCartao].Valor_Recorrencias_Previstas = arredondarConsolidadoController_(
      converterNumeroConsolidadoController_(mapa[idCartao].Valor_Recorrencias_Previstas || 0) +
      converterNumeroConsolidadoController_(item.Valor_Total)
    );
    mapa[idCartao].Quantidade_Recorrencias_Previstas =
      converterNumeroConsolidadoController_(mapa[idCartao].Quantidade_Recorrencias_Previstas || 0) +
      converterNumeroConsolidadoController_(item.Quantidade || 0);
  });

  return Object.keys(mapa).map(function(idCartao) {
    mapa[idCartao].Valor_Total = arredondarConsolidadoController_(mapa[idCartao].Valor_Total);
    mapa[idCartao].Valor_Recorrencias_Previstas = arredondarConsolidadoController_(
      mapa[idCartao].Valor_Recorrencias_Previstas || 0
    );
    mapa[idCartao].Quantidade_Recorrencias_Previstas = converterNumeroConsolidadoController_(
      mapa[idCartao].Quantidade_Recorrencias_Previstas || 0
    );
    return mapa[idCartao];
  }).sort(function(a, b) {
    return b.Valor_Total - a.Valor_Total;
  });
}


function montarLancamentoFaturaParaTelaController_(lancamento, contexto, idsLancamentosComRateioDoUsuario, rateiosVisiveis) {
  const cartao = (contexto.cartoesTodos || []).find(function(item) {
    return normalizarTextoConsolidadoController_(item.ID_Cartao) === normalizarTextoConsolidadoController_(lancamento.ID_Origem);
  });
  const enriquecido = typeof enriquecerLancamentoParaTela_ === "function"
    ? enriquecerLancamentoParaTela_(lancamento, contexto, idsLancamentosComRateioDoUsuario || {}, rateiosVisiveis || [])
    : lancamento;
  const retorno = {};

  Object.keys(enriquecido).forEach(function(chave) {
    retorno[chave] = enriquecido[chave];
  });

  retorno.Valor_Total = converterNumeroConsolidadoController_(lancamento.Valor_Total);
  retorno.Nome_Cartao = cartao ? montarNomeCartaoVisualizacaoLancamento_(cartao) : "Cartão";

  return retorno;
}


function montarLancamentosRecorrentesPrevistosFaturaController_(recorrenciasPrevistas, contexto) {
  const lancamentos = [];

  (recorrenciasPrevistas || []).forEach(function(item) {
    (item.Ocorrencias || []).forEach(function(ocorrencia) {
      const idCartao = normalizarTextoConsolidadoController_(ocorrencia.ID_Cartao);
      const cartao = (contexto.cartoesTodos || []).find(function(cartaoContexto) {
        return normalizarTextoConsolidadoController_(cartaoContexto.ID_Cartao) === idCartao;
      });
      const lancamento = {
        ID_Lancamento: "recorrencia:" +
          normalizarTextoConsolidadoController_(ocorrencia.ID_Recorrencia) + ":" +
          normalizarTextoConsolidadoController_(ocorrencia.Data_Ocorrencia),
        ID_Recorrencia_Origem: ocorrencia.ID_Recorrencia,
        Data_Ocorrencia_Recorrencia: ocorrencia.Data_Ocorrencia,
        Data_Ocorrencia: ocorrencia.Data_Ocorrencia,
        Descricao: ocorrencia.Descricao || "Recorrencia prevista",
        Tipo: ocorrencia.Tipo || "Despesa",
        Tipo_Origem: "Cartao",
        ID_Origem: ocorrencia.ID_Cartao,
        ID_Categoria: ocorrencia.ID_Categoria || "",
        ID_Projeto: ocorrencia.ID_Projeto || "",
        Valor_Total: converterNumeroConsolidadoController_(ocorrencia.Valor_Total),
        Valor_Total_Original: converterNumeroConsolidadoController_(ocorrencia.Valor_Total),
        Valor_Exibicao: converterNumeroConsolidadoController_(ocorrencia.Valor_Total),
        Status: "Programado",
        Pode_Editar: false,
        Pode_Excluir: false,
        Possui_Rateio: false,
        Somente_Leitura: true,
        _Programado_Recorrencia: true,
        Origem_Fantasma: "Recorrencia prevista",
        Nome_Cartao: cartao ? montarNomeCartaoVisualizacaoLancamento_(cartao) : "Cartao"
      };

      lancamento.Nome_Categoria_Visualizacao = typeof obterNomeCategoriaVisualizacaoLancamento_ === "function"
        ? obterNomeCategoriaVisualizacaoLancamento_(lancamento, contexto)
        : "";
      lancamento.Nome_Projeto_Visualizacao = typeof obterNomeProjetoVisualizacaoLancamento_ === "function"
        ? obterNomeProjetoVisualizacaoLancamento_(lancamento, contexto)
        : "";

      lancamentos.push(lancamento);
    });
  });

  return lancamentos;
}


function ordenarLancamentosFaturaCartaoController_(lancamentos) {
  return (lancamentos || []).slice().sort(function(a, b) {
    const dataA = normalizarTextoConsolidadoController_(a.Data_Ocorrencia);
    const dataB = normalizarTextoConsolidadoController_(b.Data_Ocorrencia);

    if (dataA !== dataB) {
      return dataA < dataB ? -1 : 1;
    }

    const descricaoA = normalizarTextoConsolidadoController_(a.Descricao);
    const descricaoB = normalizarTextoConsolidadoController_(b.Descricao);

    if (descricaoA !== descricaoB) {
      return descricaoA.localeCompare(descricaoB);
    }

    const fantasmaA = a._Programado_Recorrencia === true ? 1 : 0;
    const fantasmaB = b._Programado_Recorrencia === true ? 1 : 0;

    return fantasmaA - fantasmaB;
  });
}


function listarRecorrenciasPrevistasFaturaCartaoController_(contexto, cartoesDoGrupoAcessiveis, intervalo, categoriasFiltro) {
  if (bancoUsaSupabase_()) return previsoesCartoesNovoParaFatura_(contexto, cartoesDoGrupoAcessiveis, intervalo, categoriasFiltro);
  const mapaCartoes = {};
  const inicioMes = normalizarTextoConsolidadoController_(intervalo && intervalo.Mes_Inicial);
  const fimMes = normalizarTextoConsolidadoController_(intervalo && intervalo.Mes_Final) || inicioMes;
  const resultadoPorCartao = {};

  if (!inicioMes || !fimMes) {
    return [];
  }

  (cartoesDoGrupoAcessiveis || []).forEach(function(cartao) {
    const idCartao = normalizarTextoConsolidadoController_(cartao.ID_Cartao);

    if (!idCartao) {
      return;
    }

    mapaCartoes[idCartao] = true;
    resultadoPorCartao[idCartao] = {
      ID_Cartao: cartao.ID_Cartao,
      Valor_Total: 0,
      Quantidade: 0,
      Ocorrencias: []
    };
  });

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    const idCartao = normalizarTextoConsolidadoController_(recorrencia.ID_Origem);
    const tipoOrigem = recorrencia.Tipo_Origem;
    const status = normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia);
    const idCategoria = normalizarTextoConsolidadoController_(recorrencia.ID_Categoria);

    if (!mapaCartoes[idCartao] || !ehTipoOrigemCartaoController_(tipoOrigem) || status !== "Ativa") {
      return;
    }

    if (Object.keys(categoriasFiltro || {}).length > 0 && categoriasFiltro[idCategoria] !== true) {
      return;
    }

    const valor = calcularImpactoCompromissoCartaoConsolidadoController_(recorrencia.Tipo, recorrencia.Valor_Base);

    if (valor === 0) {
      return;
    }

    const ocorrencias = listarOcorrenciasPendentesNoPeriodoConsolidadoController_(
      recorrencia,
      contexto,
      obterInicioMesConsolidadoController_(inicioMes),
      obterFimMesConsolidadoController_(fimMes)
    );

    ocorrencias.forEach(function(dataOcorrencia) {
      resultadoPorCartao[idCartao].Valor_Total += valor;
      resultadoPorCartao[idCartao].Quantidade += 1;
      resultadoPorCartao[idCartao].Ocorrencias.push({
        ID_Cartao: recorrencia.ID_Origem,
        ID_Recorrencia: recorrencia.ID_Recorrencia,
        Data_Ocorrencia: dataOcorrencia,
        Descricao: recorrencia.Descricao || "",
        Tipo: recorrencia.Tipo || "Despesa",
        Valor_Total: converterNumeroConsolidadoController_(recorrencia.Valor_Base),
        ID_Categoria: recorrencia.ID_Categoria || "",
        ID_Projeto: recorrencia.ID_Projeto || ""
      });
    });
  });

  return Object.keys(resultadoPorCartao).map(function(idCartao) {
    const item = resultadoPorCartao[idCartao];
    item.Valor_Total = arredondarConsolidadoController_(item.Valor_Total);
    return item;
  }).filter(function(item) {
    return item.Quantidade > 0 && item.Valor_Total !== 0;
  });
}


function montarMapaIdsFiltroFaturaCartaoController_(valor) {
  const mapa = {};

  normalizarTextoConsolidadoController_(valor).split(",").forEach(function(id) {
    const idNormalizado = normalizarTextoConsolidadoController_(id);

    if (idNormalizado) {
      mapa[idNormalizado] = true;
    }
  });

  return mapa;
}


function montarResumoPeriodoFaturaCartaoController_(intervalo) {
  const inicio = normalizarTextoConsolidadoController_(intervalo && intervalo.Mes_Inicial);
  const fim = normalizarTextoConsolidadoController_(intervalo && intervalo.Mes_Final);

  if (!inicio) {
    return "";
  }

  if (!fim || fim === inicio) {
    return "Periodo fechado em " + inicio + ".";
  }

  return "Periodo fechado de " + inicio + " ate " + fim + ".";
}


function normalizarMesFaturaCartaoController_(valor) {
  const texto = normalizarTextoConsolidadoController_(valor);

  if (/^\d{4}-\d{2}$/.test(texto)) {
    return texto;
  }

  return gerarMesAtualConsolidadoController_();
}
