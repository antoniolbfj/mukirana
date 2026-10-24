/**
 * Módulo: Orcamentos_Controller.gs
 * Responsabilidade:
 * - Controlar o orçamento pedagógico do usuário.
 * - Permitir tetos flexíveis por categoria de despesa.
 * - Calcular realizado do mês com base nos lançamentos e rateios visíveis.
 */


/**
 * Carrega tudo que a tela de orçamentos precisa.
 *
 * @param {string} tokenSessao Token de sessão.
 * @param {string} mesReferencia Mês no formato yyyy-MM.
 * @returns {Object} Pacote da tela.
 */
function obterPacoteTelaOrcamentos(tokenSessao, mesReferencia) {
  const medidor = criarMedidorPerformance_("Orcamentos.obterPacoteTela");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const mes = medirEtapaPerformance_(medidor, "normalizar_mes", function() {
    return normalizarMesReferenciaOrcamentoController_(mesReferencia);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoOrcamentosController_(sessao, mes, medidor);
  });
  const categoriasDisponiveis = medirEtapaPerformance_(medidor, "listar_categorias_disponiveis", function() {
    return obterCategoriasDisponiveisOrcamentoController_(contexto);
  });
  const itensUsuario = medirEtapaPerformance_(medidor, "filtrar_orcamentos_usuario", function() {
    return contexto.orcamentosTodos
      .filter(function(item) {
        return normalizarTextoOrcamentoController_(item.ID_Usuario) === contexto.idLogado;
      });
  });
  const itensAtivos = medirEtapaPerformance_(medidor, "filtrar_orcamentos_ativos", function() {
    return itensUsuario.filter(function(item) {
      return normalizarBooleanoOrcamentoController_(item.Ativo);
    });
  });
  const mapaRealizado = medirEtapaPerformance_(medidor, "calcular_realizado", function() {
    return calcularRealizadoPedagogicoTelaOrcamentoController_(contexto, mes);
  });
  const itens = medirEtapaPerformance_(medidor, "montar_itens", function() {
    return itensUsuario.map(function(item) {
      return montarItemOrcamentoParaTelaController_(item, contexto, mapaRealizado);
    });
  });
  const resumo = medirEtapaPerformance_(medidor, "calcular_resumo", function() {
    return calcularResumoOrcamentosController_(itens.filter(function(item) {
      return item.Ativo === true;
    }));
  });

  const pacote = {
    usuarioLogado: {
      id: contexto.idLogado,
      nome: contexto.nomeLogado
    },
    mesReferencia: mes,
    resumo: resumo,
    itens: itens,
    categoriasDisponiveis: categoriasDisponiveis,
    possuiOrcamentoAtivo: itensAtivos.length > 0
  };

  registrarContagemPerformance_(medidor, "categoriasTodas", contexto.categoriasTodas.length);
  registrarContagemPerformance_(medidor, "lancamentosTodos", contexto.lancamentosTodos.length);
  registrarContagemPerformance_(medidor, "rateiosTodos", contexto.rateiosTodos.length);
  registrarContagemPerformance_(medidor, "orcamentosTodos", contexto.orcamentosTodos.length);

  pacote._performance = finalizarPerformance_(medidor);
  return pacote;
}


/**
 * Salva ou reativa uma categoria no orçamento do usuário.
 *
 * @param {Object} dados Dados do formulário.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem de sucesso.
 */
function salvarCategoriaOrcamento(dados, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const medidor = criarMedidorPerformance_("Orcamentos.salvarCategoria");

  try {
    const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
      return obterSessaoObrigatoria(tokenSessao);
    });
    const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
      return montarContextoOrcamentosController_(sessao, null, medidor);
    });
    const idOrcamento = normalizarTextoOrcamentoController_(dados && dados.ID_Orcamento);
    const idCategoria = normalizarTextoOrcamentoController_(dados && dados.ID_Categoria);
    const valorTeto = converterValorOrcamentoController_(dados && dados.Valor_Teto);
    const agora = new Date().toISOString();

    if (!idCategoria) {
      throw new Error("Selecione uma categoria para o orçamento.");
    }

    if (valorTeto <= 0) {
      throw new Error("Informe um teto de gasto maior que zero.");
    }

    const categoria = buscarCategoriaOrcamentoController_(idCategoria, contexto);

    if (!categoria) {
      throw new Error("Categoria inválida ou inacessível para o orçamento.");
    }

    if (normalizarTextoOrcamentoController_(categoria.Tipo) !== "Despesa") {
      throw new Error("O orçamento aceita apenas categorias de despesa.");
    }

    if (!normalizarBooleanoOrcamentoController_(categoria.Ativa)) {
      throw new Error("Categoria inativa não pode ser adicionada ao orçamento.");
    }

    let existente = null;

    if (idOrcamento) {
      existente = contexto.orcamentosTodos.find(function(item) {
        return normalizarTextoOrcamentoController_(item.ID_Orcamento) === idOrcamento;
      });

      if (!existente) {
        throw new Error("Item de orçamento não encontrado para edição.");
      }

      if (normalizarTextoOrcamentoController_(existente.ID_Usuario) !== contexto.idLogado) {
        throw new Error("Acesso negado: você só pode editar o próprio orçamento.");
      }
    }

    const duplicado = contexto.orcamentosTodos.find(function(item) {
      return normalizarTextoOrcamentoController_(item.ID_Usuario) === contexto.idLogado &&
             normalizarTextoOrcamentoController_(item.ID_Categoria) === idCategoria &&
             normalizarTextoOrcamentoController_(item.ID_Orcamento) !== idOrcamento &&
             normalizarBooleanoOrcamentoController_(item.Ativo);
    });

    if (duplicado) {
      throw new Error("Esta categoria já está no seu orçamento.");
    }

    const item = {
      ID_Orcamento: existente ? existente.ID_Orcamento : Utilities.getUuid(),
      ID_Usuario: contexto.idLogado,
      ID_Categoria: idCategoria,
      Valor_Teto: valorTeto,
      Ativo: true,
      Data_Criacao: existente ? existente.Data_Criacao : agora,
      Data_Alteracao: agora,
      _linhaPlanilha: existente ? existente._linhaPlanilha : null
    };

    medirEtapaPerformance_(medidor, "salvar_orcamento", function() {
      salvarOrcamentoModel_(item);
    });
    registrarContagemPerformance_(medidor, "orcamentosTodos", contexto.orcamentosTodos.length);
    finalizarPerformance_(medidor);

    return existente
      ? "Categoria do orçamento atualizada com sucesso."
      : "Categoria adicionada ao orçamento com sucesso.";

  } finally {
    lock.releaseLock();
  }
}


/**
 * Remove uma categoria do orçamento do usuário.
 *
 * A remoção afeta apenas os alertas pedagógicos; lançamentos e categorias
 * permanecem intactos.
 *
 * @param {string} idOrcamento ID do item de orçamento.
 * @param {string} tokenSessao Token de sessão.
 * @returns {string} Mensagem de sucesso.
 */
function removerCategoriaOrcamento(idOrcamento, tokenSessao) {
  const medidor = criarMedidorPerformance_("Orcamentos.removerCategoria");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoOrcamentosController_(sessao, null, medidor);
  });
  const id = normalizarTextoOrcamentoController_(idOrcamento);

  if (!id) {
    throw new Error("Item de orçamento não informado.");
  }

  const item = contexto.orcamentosTodos.find(function(registro) {
    return normalizarTextoOrcamentoController_(registro.ID_Orcamento) === id;
  });

  if (!item) {
    throw new Error("Item de orçamento não encontrado.");
  }

  if (normalizarTextoOrcamentoController_(item.ID_Usuario) !== contexto.idLogado) {
    throw new Error("Acesso negado: você só pode alterar o próprio orçamento.");
  }

  medirEtapaPerformance_(medidor, "excluir_orcamento", function() {
    excluirOrcamentoModel_(obterIdentificadorAlteracaoOrcamentoController_(item));
  });
  registrarContagemPerformance_(medidor, "orcamentosTodos", contexto.orcamentosTodos.length);
  finalizarPerformance_(medidor);

  return "Categoria removida do orçamento. Você deixará de receber alertas para ela.";
}


function obterIdentificadorAlteracaoOrcamentoController_(item) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return normalizarTextoOrcamentoController_(item.ID_Orcamento);
  }

  return item._linhaPlanilha;
}


/**
 * Obtém alerta pedagógico para uma despesa que está sendo lançada.
 *
 * @param {Object} dados Dados do lançamento.
 * @param {string} tokenSessao Token de sessão.
 * @returns {Object|null} Alerta ou null quando não houver orçamento aplicável.
 */
function obterAlertaOrcamentoLancamento(dados, tokenSessao) {
  const medidor = criarMedidorPerformance_("Orcamentos.obterAlertaLancamento");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const tipo = normalizarTextoOrcamentoController_(dados && dados.Tipo);
  const idCategoria = normalizarTextoOrcamentoController_(dados && dados.ID_Categoria);
  const idLancamentoAtual = normalizarTextoOrcamentoController_(dados && dados.ID_Lancamento);
  const dataOcorrencia = normalizarTextoOrcamentoController_(dados && dados.Data_Ocorrencia);

  if (tipo !== "Despesa" || !idCategoria) {
    finalizarPerformance_(medidor);
    return null;
  }

  const mes = gerarMesReferenciaOrcamentoController_(dataOcorrencia) ||
    gerarMesReferenciaOrcamentoController_(new Date());
  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoOrcamentosController_(sessao, mes, medidor);
  });
  const item = buscarItemAtivoOrcamentoUsuarioCategoriaController_(
    contexto.orcamentosTodos,
    contexto.idLogado,
    idCategoria
  );

  if (!item) {
    finalizarPerformance_(medidor);
    return null;
  }

  const valorAplicavel = obterValorAplicavelLancamentoOrcamentoController_(dados, contexto);

  if (valorAplicavel <= 0) {
    finalizarPerformance_(medidor);
    return null;
  }

  const realizado = medirEtapaPerformance_(medidor, "calcular_realizado", function() {
    return calcularRealizadoPorCategoriaOrcamentoController_(
      contexto,
      mes,
      idLancamentoAtual
    )[idCategoria] || 0;
  });
  const projetado = realizado + valorAplicavel;
  const teto = converterValorOrcamentoController_(item.Valor_Teto);
  const percentual = teto > 0 ? Math.round((projetado / teto) * 100) : 0;

  if (percentual < 70) {
    finalizarPerformance_(medidor);
    return null;
  }

  const alerta = {
    tipo: percentual >= 100 ? "estourado" : "atencao",
    ID_Categoria: idCategoria,
    Valor_Teto: teto,
    Valor_Realizado: realizado,
    Valor_Projetado: projetado,
    Percentual: percentual,
    Mensagem: percentual >= 100
      ? "Este lançamento ultrapassa o teto pedagógico desta categoria."
      : "Este lançamento aproxima esta categoria do teto pedagógico definido."
  };

  registrarContagemPerformance_(medidor, "orcamentosTodos", contexto.orcamentosTodos.length);
  finalizarPerformance_(medidor);
  return alerta;
}


function montarContextoOrcamentosController_(sessao, mesReferencia, medidorPerformance) {
  const idLogado = normalizarTextoOrcamentoController_(sessao.id);
  const mes = normalizarMesReferenciaOrcamentoController_(mesReferencia);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, mes, false)
      : null;
  });

  return montarContextoOrcamentosAPartirBase_(sessao, contextoRpc, medidorPerformance);
}


function montarContextoOrcamentosAPartirBase_(sessao, contextoBase, medidorPerformance) {
  return {
    idLogado: normalizarTextoOrcamentoController_(sessao.id),
    nomeLogado: normalizarTextoOrcamentoController_(sessao.nome),
    papelLogado: normalizarTextoOrcamentoController_(sessao.papel),
    categoriasTodas: medirEtapaPerformance_(medidorPerformance, "consulta_categorias", function() {
      return contextoBase ? contextoBase.categoriasTodas : listarCategoriasModel_();
    }),
    lancamentosTodos: medirEtapaPerformance_(medidorPerformance, "consulta_lancamentos", function() {
      return contextoBase ? contextoBase.lancamentosTodos : typeof listarLancamentosModel_ === "function" ? listarLancamentosModel_() : [];
    }),
    rateiosTodos: medirEtapaPerformance_(medidorPerformance, "consulta_rateios", function() {
      return contextoBase ? contextoBase.rateiosTodos : typeof listarRateiosModel_ === "function" ? listarRateiosModel_() : [];
    }),
    orcamentosTodos: medirEtapaPerformance_(medidorPerformance, "consulta_orcamentos", function() {
      return listarOrcamentosModel_();
    }),
    recorrenciasTodos: medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias", function() {
      return contextoBase ? contextoBase.recorrenciasTodos : typeof listarRecorrenciasModel_ === "function" ? listarRecorrenciasModel_() : [];
    }),
    recorrenciasRateiosTodos: medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_rateios", function() {
      return contextoBase
        ? (contextoBase.recorrenciasRateiosTodos || [])
        : typeof listarRecorrenciasRateiosModel_ === "function" ? listarRecorrenciasRateiosModel_() : [];
    }),
    recorrenciasOcorrenciasTodos: medirEtapaPerformance_(medidorPerformance, "consulta_recorrencias_ocorrencias", function() {
      return contextoBase
        ? (contextoBase.recorrenciasOcorrenciasTodos || [])
        : typeof listarRecorrenciasOcorrenciasModel_ === "function" ? listarRecorrenciasOcorrenciasModel_() : [];
    })
  };
}


function obterCategoriasDisponiveisOrcamentoController_(contexto) {
  const idsJaAtivos = {};

  contexto.orcamentosTodos.forEach(function(item) {
    if (
      normalizarTextoOrcamentoController_(item.ID_Usuario) === contexto.idLogado &&
      normalizarBooleanoOrcamentoController_(item.Ativo)
    ) {
      idsJaAtivos[normalizarTextoOrcamentoController_(item.ID_Categoria)] = true;
    }
  });

  return contexto.categoriasTodas
    .filter(function(categoria) {
      return categoriaAcessivelOrcamentoController_(categoria, contexto) &&
             normalizarBooleanoOrcamentoController_(categoria.Ativa) &&
             normalizarTextoOrcamentoController_(categoria.Tipo) === "Despesa" &&
             !idsJaAtivos[normalizarTextoOrcamentoController_(categoria.ID_Categoria)];
    })
    .map(function(categoria) {
      return {
        ID_Categoria: normalizarTextoOrcamentoController_(categoria.ID_Categoria),
        Nome: montarNomeCategoriaOrcamentoController_(categoria, contexto.categoriasTodas),
        Tipo: normalizarTextoOrcamentoController_(categoria.Tipo)
      };
    })
    .sort(function(a, b) {
      return a.Nome.localeCompare(b.Nome);
    });
}


function montarItemOrcamentoParaTelaController_(item, contexto, mapaRealizado) {
  const categoria = buscarCategoriaOrcamentoController_(item.ID_Categoria, contexto, true);
  const categoriaRaiz = obterCategoriaRaizOrcamentoController_(categoria, contexto);
  const idCategoriaCalculo = normalizarTextoOrcamentoController_(
    categoriaRaiz && categoriaRaiz.ID_Categoria ? categoriaRaiz.ID_Categoria : item.ID_Categoria
  );
  const realizado = mapaRealizado[idCategoriaCalculo] || mapaRealizado[item.ID_Categoria] || 0;
  const teto = converterValorOrcamentoController_(item.Valor_Teto);
  const saldo = teto - realizado;
  const percentual = teto > 0 ? Math.round((realizado / teto) * 100) : 0;

  return {
    ID_Orcamento: item.ID_Orcamento,
    ID_Categoria: item.ID_Categoria,
    Nome_Categoria: categoria
      ? montarNomeCategoriaOrcamentoController_(categoria, contexto.categoriasTodas)
      : "Categoria removida",
    Categoria_Ativa: categoria ? normalizarBooleanoOrcamentoController_(categoria.Ativa) : false,
    Valor_Teto: teto,
    Valor_Realizado: realizado,
    Saldo: saldo,
    Percentual_Usado: percentual,
    Ativo: normalizarBooleanoOrcamentoController_(item.Ativo),
    Status_Visual: obterStatusVisualOrcamentoController_(percentual)
  };
}


function calcularRealizadoPedagogicoTelaOrcamentoController_(contexto, mesReferencia) {
  const mes = normalizarMesReferenciaOrcamentoController_(mesReferencia);

  if (
    typeof normalizarFiltrosConsolidadosController_ !== "function" ||
    typeof gerarLancamentosProgramadosRecorrenciasConsolidadoController_ !== "function" ||
    typeof calcularRealizadoPorCategoriaPeriodoOrcamentoConsolidadoController_ !== "function"
  ) {
    return calcularRealizadoPorCategoriaOrcamentoController_(contexto, mes);
  }

  const filtros = normalizarFiltrosConsolidadosController_({
    Mes_Inicial: mes,
    Mes_Final: mes,
    Considerar_Historico_Anterior: true,
    Incluir_Historico: true
  });
  const recorrenciasProgramadas = gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtros);
  const mapaReal = calcularRealizadoPorCategoriaPeriodoOrcamentoConsolidadoController_(
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
  const mapa = {};

  somarMapaRealizadoCategoriaRaizOrcamentoController_(mapa, contexto, mapaReal);
  somarMapaRealizadoCategoriaRaizOrcamentoController_(mapa, contexto, mapaPrevisto);

  return mapa;
}


function somarMapaRealizadoCategoriaRaizOrcamentoController_(destino, contexto, valoresPorCategoria) {
  Object.keys(valoresPorCategoria || {}).forEach(function(idCategoria) {
    const categoria = buscarCategoriaOrcamentoController_(idCategoria, contexto, true);
    const categoriaRaiz = obterCategoriaRaizOrcamentoController_(categoria, contexto);
    const idCalculo = normalizarTextoOrcamentoController_(
      categoriaRaiz && categoriaRaiz.ID_Categoria ? categoriaRaiz.ID_Categoria : idCategoria
    );

    if (!idCalculo) return;

    destino[idCalculo] = (destino[idCalculo] || 0) + converterValorOrcamentoController_(valoresPorCategoria[idCategoria]);
  });
}


function obterCategoriaRaizOrcamentoController_(categoria, contexto) {
  if (!categoria) {
    return null;
  }

  const mapaCategorias = {};

  (contexto.categoriasTodas || []).forEach(function(item) {
    const id = normalizarTextoOrcamentoController_(item.ID_Categoria);
    if (id) mapaCategorias[id] = item;
  });

  let atual = categoria;
  const visitados = {};

  while (atual && normalizarTextoOrcamentoController_(atual.ID_Categoria)) {
    const idAtual = normalizarTextoOrcamentoController_(atual.ID_Categoria);
    const idPai = normalizarTextoOrcamentoController_(atual.ID_Categoria_Pai);

    if (!idPai || visitados[idAtual] || !mapaCategorias[idPai]) {
      return atual;
    }

    visitados[idAtual] = true;
    atual = mapaCategorias[idPai];
  }

  return categoria;
}


function calcularResumoOrcamentosController_(itens) {
  let totalTeto = 0;
  let totalRealizado = 0;

  itens.forEach(function(item) {
    totalTeto += converterValorOrcamentoController_(item.Valor_Teto);
    totalRealizado += converterValorOrcamentoController_(item.Valor_Realizado);
  });

  return {
    Total_Teto: totalTeto,
    Total_Realizado: totalRealizado,
    Saldo: totalTeto - totalRealizado,
    Percentual_Usado: totalTeto > 0 ? Math.round((totalRealizado / totalTeto) * 100) : 0
  };
}


function calcularRealizadoPorCategoriaOrcamentoController_(contexto, mesReferencia, idLancamentoIgnorado) {
  const mapa = {};
  const mes = normalizarMesReferenciaOrcamentoController_(mesReferencia);
  const idIgnorado = normalizarTextoOrcamentoController_(idLancamentoIgnorado);
  const idsLancamentosComRateio = mapearRateiosPorLancamentoOrcamentoController_(contexto.rateiosTodos);

  contexto.lancamentosTodos.forEach(function(lancamento) {
    if (idIgnorado && normalizarTextoOrcamentoController_(lancamento.ID_Lancamento) === idIgnorado) return;
    if (normalizarTextoOrcamentoController_(lancamento.Tipo) !== "Despesa") return;
    if (normalizarTextoOrcamentoController_(lancamento.Mes_Referencia) !== mes) return;

    const idCategoria = normalizarTextoOrcamentoController_(lancamento.ID_Categoria);
    const idLancamento = normalizarTextoOrcamentoController_(lancamento.ID_Lancamento);
    const ehAutor = normalizarTextoOrcamentoController_(lancamento.Criado_Por_ID) === contexto.idLogado;
    const rateios = idsLancamentosComRateio[idLancamento] || [];
    let valor = 0;

    if (rateios.length > 0) {
      rateios.forEach(function(rateio) {
        if (
          normalizarTextoOrcamentoController_(rateio.ID_Usuario_Responsavel) === contexto.idLogado &&
          normalizarTextoOrcamentoController_(rateio.Status) !== "Cancelado"
        ) {
          valor += converterValorOrcamentoController_(rateio.Valor_Rateado);
        }
      });
    } else if (ehAutor) {
      valor = converterValorOrcamentoController_(lancamento.Valor_Total);
    }

    if (valor > 0) {
      mapa[idCategoria] = (mapa[idCategoria] || 0) + valor;
    }
  });

  return mapa;
}


function obterValorAplicavelLancamentoOrcamentoController_(lancamento, contexto) {
  const idLancamento = normalizarTextoOrcamentoController_(lancamento && lancamento.ID_Lancamento);
  const rateios = (contexto.rateiosTodos || []).filter(function(rateio) {
    return normalizarTextoOrcamentoController_(rateio.ID_Lancamento) === idLancamento &&
           normalizarTextoOrcamentoController_(rateio.Status) !== "Cancelado";
  });

  if (rateios.length === 0) {
    return converterValorOrcamentoController_(lancamento && lancamento.Valor_Total);
  }

  return rateios.reduce(function(total, rateio) {
    if (normalizarTextoOrcamentoController_(rateio.ID_Usuario_Responsavel) !== contexto.idLogado) {
      return total;
    }

    return total + converterValorOrcamentoController_(rateio.Valor_Rateado);
  }, 0);
}


function mapearRateiosPorLancamentoOrcamentoController_(rateios) {
  const mapa = {};

  (rateios || []).forEach(function(rateio) {
    const idLancamento = normalizarTextoOrcamentoController_(rateio.ID_Lancamento);

    if (!idLancamento) return;
    if (!mapa[idLancamento]) mapa[idLancamento] = [];

    mapa[idLancamento].push(rateio);
  });

  return mapa;
}


function buscarItemAtivoOrcamentoUsuarioCategoriaController_(orcamentos, idUsuario, idCategoria) {
  return (orcamentos || []).find(function(item) {
    return normalizarTextoOrcamentoController_(item.ID_Usuario) === idUsuario &&
           normalizarTextoOrcamentoController_(item.ID_Categoria) === idCategoria &&
           normalizarBooleanoOrcamentoController_(item.Ativo);
  }) || null;
}


function buscarCategoriaOrcamentoController_(idCategoria, contexto, permitirInativa) {
  const id = normalizarTextoOrcamentoController_(idCategoria);
  const categoria = contexto.categoriasTodas.find(function(item) {
    return normalizarTextoOrcamentoController_(item.ID_Categoria) === id;
  });

  if (!categoria) return null;
  if (!permitirInativa && !normalizarBooleanoOrcamentoController_(categoria.Ativa)) return null;
  if (!categoriaAcessivelOrcamentoController_(categoria, contexto)) return null;

  return categoria;
}


function categoriaAcessivelOrcamentoController_(categoria, contexto) {
  const global = normalizarBooleanoOrcamentoController_(categoria.Global);
  const dono = normalizarTextoOrcamentoController_(categoria.Criado_Por);

  return contexto.papelLogado === "Administrador" || global || dono === contexto.idLogado;
}


function montarNomeCategoriaOrcamentoController_(categoria, categorias) {
  const idPai = normalizarTextoOrcamentoController_(categoria.ID_Categoria_Pai);

  if (!idPai) {
    return normalizarTextoOrcamentoController_(categoria.Nome);
  }

  const pai = (categorias || []).find(function(item) {
    return normalizarTextoOrcamentoController_(item.ID_Categoria) === idPai;
  });

  return pai
    ? normalizarTextoOrcamentoController_(pai.Nome) + " > " + normalizarTextoOrcamentoController_(categoria.Nome)
    : normalizarTextoOrcamentoController_(categoria.Nome);
}


function obterStatusVisualOrcamentoController_(percentual) {
  if (percentual >= 100) return "estourado";
  if (percentual >= 70) return "atencao";
  return "ok";
}


function normalizarMesReferenciaOrcamentoController_(valor) {
  const texto = normalizarTextoOrcamentoController_(valor);

  if (/^\d{4}-\d{2}$/.test(texto)) {
    return texto;
  }

  return gerarMesReferenciaOrcamentoController_(new Date());
}


function gerarMesReferenciaOrcamentoController_(valor) {
  const data = valor instanceof Date ? valor : new Date(valor);

  if (isNaN(data.getTime())) return "";

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");

  return ano + "-" + mes;
}


function normalizarTextoOrcamentoController_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function converterValorOrcamentoController_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : Math.round(numero * 100) / 100;
}


function normalizarBooleanoOrcamentoController_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
