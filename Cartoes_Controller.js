/**
 * Modulo: Cartoes_Controller.gs
 * Responsabilidade:
 * - Aplicar regras de negocio para grupos de cartoes/faturas.
 * - Garantir privacidade por usuario com validacao sempre no servidor.
 * - Manter compatibilidade com a View, que usa os nomes publicos historicos.
 *
 * Modelo atual:
 * - GRUPOS_CARTOES representa a fatura consolidada.
 * - CARTOES representa os cartoes fisicos vinculados ao grupo.
 */


/**
 * Busca usuarios ativos para selecao de cartoes adicionais.
 *
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {Array<Object>} Usuarios ativos, exceto o usuario logado.
 */
function obterUsuariosAtivos(tokenSessao) {
  const medidor = criarMedidorPerformance_("Cartoes.obterUsuariosAtivos");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoCartaoController_(sessao.id);
  const usuariosAtivos = medirEtapaPerformance_(medidor, "listar_usuarios_ativos", function() {
    return listarUsuariosAtivosCartaoController_(sessao, medidor);
  });

  const lista = usuariosAtivos
    .filter(function(usuario) {
      return usuario.id !== idLogado;
    })
    .map(function(usuario) {
      return {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
      };
    });

  registrarContagemPerformance_(medidor, "usuariosAtivos", usuariosAtivos.length);
  registrarContagemPerformance_(medidor, "usuariosRetornados", lista.length);
  finalizarPerformance_(medidor);

  return lista;
}


/**
 * Salva ou atualiza um grupo de cartoes/fatura e sincroniza seus cartoes fisicos.
 *
 * Regras:
 * - Apenas o titular pode editar.
 * - A linha da planilha nunca vem do navegador; e redescoberta pelo ID.
 * - O cartao fisico titular sempre existe e fica ativo enquanto o grupo existir.
 * - Adicionais selecionados recebem cartao fisico ativo.
 * - Adicionais removidos sao inativados para preservar historico.
 *
 * @param {Object} dadosFormulario Dados enviados pela View.
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function processarSalvarCartao(dadosFormulario, tokenSessao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = obterSessaoObrigatoria(tokenSessao);
    const idLogado = normalizarTextoCartaoController_(sessao.id);

    validarDadosGrupoCartaoController_(dadosFormulario);

    const contexto = montarContextoCadastroCartaoController_(sessao, null);
    const grupos = contexto.grupos;
    const cartoes = contexto.cartoes;
    const usuariosAtivos = contexto.usuariosAtivos;
    const mapaUsuariosAtivos = montarMapaUsuariosAtivosCartaoController_(usuariosAtivos);

    const idGrupoInformado = normalizarTextoCartaoController_(dadosFormulario.ID_Grupo_Cartao);
    const isEdicao = !!idGrupoInformado;
    const idGrupo = idGrupoInformado || Utilities.getUuid();

    let grupoOriginal = null;
    let linhaGrupoConfiavel = null;
    let titularConfiavel = idLogado;
    let statusConfiavel = true;

    if (isEdicao) {
      grupoOriginal = buscarGrupoCartaoPorIdController_(idGrupo, grupos);
      titularConfiavel = normalizarTextoCartaoController_(grupoOriginal.ID_Titular);

      if (titularConfiavel !== idLogado) {
        throw new Error("Acesso negado: apenas o titular pode editar este grupo de cartoes.");
      }

      linhaGrupoConfiavel = grupoOriginal._linhaPlanilha;
      statusConfiavel = normalizarBooleanoCartaoController_(grupoOriginal.Ativo);
    }

    const idsAdicionais = obterIdsAdicionaisFormularioCartaoController_(dadosFormulario);
    validarIdsAdicionaisCartaoController_(idsAdicionais, titularConfiavel, mapaUsuariosAtivos);

    const nomeGrupo = normalizarTextoCartaoController_(dadosFormulario.Nome_Grupo);

    validarNomeGrupoCartaoUnicoController_(
      grupos,
      idGrupo,
      titularConfiavel,
      nomeGrupo
    );

    const grupo = {
      ID_Grupo_Cartao: idGrupo,
      ID_Titular: titularConfiavel,
      Nome_Grupo: nomeGrupo,
      Limite: normalizarNumeroCartaoController_(dadosFormulario.Limite),
      Dia_Fechamento: parseInt(dadosFormulario.Dia_Fechamento, 10),
      Dia_Vencimento: parseInt(dadosFormulario.Dia_Vencimento, 10),
      Ativo: statusConfiavel,
      _linhaPlanilha: linhaGrupoConfiavel
    };

    salvarGrupoCartaoModel(grupo);
    sincronizarCartoesFisicosDoGrupoCartaoController_(
      grupo,
      idsAdicionais,
      cartoes,
      mapaUsuariosAtivos
    );

    return isEdicao
      ? "Grupo de cartoes atualizado com sucesso!"
      : "Grupo de cartoes criado com sucesso!";

  } finally {
    lock.releaseLock();
  }
}


function montarContextoCadastroCartaoController_(sessao, medidorPerformance) {
  const idLogado = normalizarTextoCartaoController_(sessao.id);
  const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
    return typeof obterContextoCadastrosSupabaseRpc_ === "function"
      ? obterContextoCadastrosSupabaseRpc_(idLogado, false)
      : null;
  });

  return {
    grupos: medirEtapaPerformance_(medidorPerformance, "consulta_grupos_cartoes", function() {
      return contextoRpc && contextoRpc.gruposCartoesTodos
        ? contextoRpc.gruposCartoesTodos
        : listarGruposCartoesModel();
    }),
    cartoes: medirEtapaPerformance_(medidorPerformance, "consulta_cartoes", function() {
      return contextoRpc && contextoRpc.cartoesTodos
        ? contextoRpc.cartoesTodos
        : listarCartoesModel();
    }),
    usuariosAtivos: medirEtapaPerformance_(medidorPerformance, "consulta_usuarios", function() {
      return contextoRpc && contextoRpc.usuariosTodos
        ? listarUsuariosAtivosCartaoAPartirBaseController_(contextoRpc.usuariosTodos)
        : listarUsuariosAtivosCartaoController_();
    })
  };
}


/**
 * Lista grupos/faturas acessiveis ao usuario logado.
 *
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {Array<Object>} Grupos de cartoes acessiveis.
 */
function obterListaCartoes(tokenSessao, filtros) {
  const medidor = criarMedidorPerformance_("Cartoes.obterLista");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoCartaoController_(sessao.id);
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
    return montarContextoListaCartoesController_(sessao, medidor);
  });
  const grupos = contexto.grupos;
  const cartoes = contexto.cartoes;
  const cartoesPorGrupo = medirEtapaPerformance_(medidor, "agrupar_cartoes", function() {
    return agruparCartoesFisicosPorGrupoController_(cartoes);
  });
  const gruposComVinculoFinanceiro = medirEtapaPerformance_(medidor, "mapear_vinculos_financeiros", function() {
    return montarMapaGruposComVinculoFinanceiroCartaoController_(idLogado, cartoes);
  });
  const listaEstrutural = medirEtapaPerformance_(medidor, "montar_lista_estrutural", function() {
    return grupos
      .map(function(grupo) {
        return montarGrupoCartaoTelaController_(
          grupo,
          cartoesPorGrupo,
          {},
          intervalo,
          idLogado,
          gruposComVinculoFinanceiro
        );
      })
      .filter(function(grupo) {
        return grupo.Tem_Acesso_Estrutural === true;
      });
  });
  const gruposEstruturais = listaEstrutural.map(function(grupo) {
    return {
      ID_Grupo_Cartao: grupo.ID_Grupo_Cartao,
      ID_Titular: grupo.ID_Titular,
      Nome_Grupo: grupo.Nome_Grupo,
      Limite: grupo.Limite,
      Dia_Fechamento: grupo.Dia_Fechamento,
      Dia_Vencimento: grupo.Dia_Vencimento,
      Ativo: grupo.Ativo
    };
  });
  const consolidadoPeriodo = medirEtapaPerformance_(medidor, "montar_consolidado_periodo", function() {
    try {
      return montarConsolidadoPeriodoCartoesController_(sessao, intervalo, gruposEstruturais, medidor);
    } catch (erroConsolidado) {
      Logger.log(JSON.stringify({
        tipo: "MUKIRANA_CARTOES_CONSOLIDADO_FALLBACK",
        mensagem: erroConsolidado && erroConsolidado.message ? erroConsolidado.message : erroConsolidado
      }));
      return {};
    }
  });
  const lista = medirEtapaPerformance_(medidor, "anexar_consolidado_periodo", function() {
    return listaEstrutural.map(function(grupo) {
      grupo.Consolidado_Periodo = consolidadoPeriodo[grupo.ID_Grupo_Cartao] ||
        montarConsolidadoVazioCartoesController_(grupo, intervalo);
      return grupo;
    });
  });

  registrarContagemPerformance_(medidor, "gruposTodos", grupos.length);
  registrarContagemPerformance_(medidor, "cartoesTodos", cartoes.length);
  registrarContagemPerformance_(medidor, "gruposRetornados", lista.length);
  finalizarPerformance_(medidor);

  return lista;
}


function montarGrupoCartaoTelaController_(grupo, cartoesPorGrupo, consolidadoPeriodo, intervalo, idLogado, gruposComVinculoFinanceiro) {
  const idGrupo = normalizarTextoCartaoController_(grupo.ID_Grupo_Cartao);
  const idTitular = normalizarTextoCartaoController_(grupo.ID_Titular);
  const cartoesDoGrupo = cartoesPorGrupo[idGrupo] || [];
  const ehTitular = idTitular === idLogado;
  const possuiCartaoNoGrupo = cartoesDoGrupo.some(function(cartao) {
    return normalizarTextoCartaoController_(cartao.ID_Usuario) === idLogado;
  });
  const ehAdicional = !ehTitular && cartoesDoGrupo.some(function(cartao) {
    return normalizarTextoCartaoController_(cartao.ID_Usuario) === idLogado &&
           normalizarTextoCartaoController_(cartao.Tipo_Cartao) === "Adicional";
  });
  const possuiMovimentoFinanceiroNoGrupo = gruposComVinculoFinanceiro &&
    gruposComVinculoFinanceiro[idGrupo] === true;

  return {
    ID_Grupo_Cartao: idGrupo,
    ID_Titular: idTitular,
    Nome_Grupo: normalizarTextoCartaoController_(grupo.Nome_Grupo),
    Limite: normalizarNumeroCartaoController_(grupo.Limite),
    Dia_Fechamento: grupo.Dia_Fechamento,
    Dia_Vencimento: grupo.Dia_Vencimento,
    Ativo: normalizarBooleanoCartaoController_(grupo.Ativo),
    Cartoes_Fisicos: cartoesDoGrupo,
    Pode_Editar: ehTitular,
    Pode_Excluir: ehTitular,
    Eh_Titular: ehTitular,
    Eh_Adicional: ehAdicional,
    Tem_Acesso_Estrutural: ehTitular || possuiCartaoNoGrupo || possuiMovimentoFinanceiroNoGrupo,
    Consolidado_Periodo: consolidadoPeriodo[idGrupo] || montarConsolidadoVazioCartoesController_(grupo, intervalo)
  };
}


function montarMapaGruposComVinculoFinanceiroCartaoController_(idLogado, cartoes) {
  const gruposPorCartao = {};
  const gruposPermitidos = {};

  (cartoes || []).forEach(function(cartao) {
    const idCartao = normalizarTextoCartaoController_(cartao.ID_Cartao);
    const idGrupo = normalizarTextoCartaoController_(cartao.ID_Grupo_Cartao);

    if (idCartao && idGrupo) {
      gruposPorCartao[idCartao] = idGrupo;
    }
  });

  (typeof listarLancamentosModel === "function" ? listarLancamentosModel() : []).forEach(function(lancamento) {
    const idAutor = normalizarTextoCartaoController_(lancamento.Criado_Por_ID);
    const tipoOrigem = normalizarTextoCartaoController_(lancamento.Tipo_Origem);
    const idOrigem = normalizarTextoCartaoController_(lancamento.ID_Origem);
    const idGrupo = gruposPorCartao[idOrigem];

    if (idAutor === idLogado && ehTipoOrigemCartaoController_(tipoOrigem) && idGrupo) {
      gruposPermitidos[idGrupo] = true;
    }
  });

  (typeof listarRecorrenciasModel === "function" ? listarRecorrenciasModel() : []).forEach(function(recorrencia) {
    const idUsuario = normalizarTextoCartaoController_(recorrencia.ID_Usuario);
    const idCriador = normalizarTextoCartaoController_(recorrencia.Criado_Por_ID);
    const tipoOrigem = normalizarTextoCartaoController_(recorrencia.Tipo_Origem);
    const idOrigem = normalizarTextoCartaoController_(recorrencia.ID_Origem);
    const idGrupo = gruposPorCartao[idOrigem];

    if ((idUsuario === idLogado || idCriador === idLogado) && ehTipoOrigemCartaoController_(tipoOrigem) && idGrupo) {
      gruposPermitidos[idGrupo] = true;
    }
  });

  return gruposPermitidos;
}


function montarConsolidadoPeriodoCartoesController_(sessao, intervalo, gruposBase, medidorPerformance) {
  const inicio = intervalo && intervalo.Mes_Inicial ? intervalo.Mes_Inicial : "";
  const fim = intervalo && intervalo.Mes_Final ? intervalo.Mes_Final : "";
  const idLogado = normalizarTextoCartaoController_(sessao.id);
  const contextoFinanceiro = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_financeiro", function() {
    return typeof obterContextoFinanceiroSupabaseRpc_ === "function"
      ? obterContextoFinanceiroSupabaseRpc_(idLogado, fim || inicio, true)
      : null;
  });
  const contexto = contextoFinanceiro
    ? montarContextoConsolidadosAPartirBase_(sessao, contextoFinanceiro, null, "RPC")
    : montarContextoConsolidadosAPartirBase_(sessao, null, null, "MODELS");
  complementarContextoCartoesComRecorrenciasController_(contexto, gruposBase);
  const recorrenciasPrevistasPorGrupo = listarRecorrenciasPrevistasGruposCartaoController_(
    contexto,
    gruposBase,
    inicio,
    fim
  );
  const lancamentosPeriodo = obterLancamentosVisiveisConsolidadosController_(contexto).filter(function(lancamento) {
    return ehTipoOrigemCartaoController_(lancamento.Tipo_Origem) &&
      mesReferenciaEstaNoIntervaloConsolidadoController_(
        typeof obterMesCompetenciaCartaoLancamentoConsolidadoController_ === "function"
          ? obterMesCompetenciaCartaoLancamentoConsolidadoController_(lancamento, contexto)
          : normalizarTextoConsolidadoController_(lancamento.Mes_Referencia),
        inicio,
        fim
      );
  });
  const mapa = {};

  (gruposBase || []).forEach(function(grupo) {
    mapa[normalizarTextoCartaoController_(grupo.ID_Grupo_Cartao)] = montarConsolidadoVazioCartoesController_(grupo, {
      Mes_Inicial: inicio,
      Mes_Final: fim
    });
  });

  lancamentosPeriodo.forEach(function(lancamento) {
    const cartao = (contexto.cartoesTodos || []).find(function(item) {
      return normalizarTextoCartaoController_(item.ID_Cartao) === normalizarTextoCartaoController_(lancamento.ID_Origem);
    });
    const idGrupo = cartao ? normalizarTextoCartaoController_(cartao.ID_Grupo_Cartao) : "";
    const consolidado = mapa[idGrupo];

    if (!consolidado) {
      return;
    }

    consolidado.Valor_Fatura += calcularImpactoCompromissoCartaoConsolidadoController_(
      lancamento.Tipo,
      lancamento.Valor_Total
    );
    consolidado.Quantidade_Lancamentos += 1;
  });

  Object.keys(recorrenciasPrevistasPorGrupo).forEach(function(idGrupo) {
    const consolidado = mapa[idGrupo];
    const previsto = recorrenciasPrevistasPorGrupo[idGrupo];

    if (!consolidado || !previsto) {
      return;
    }

    consolidado.Valor_Fatura += normalizarNumeroCartaoController_(previsto.Valor_Total);
    consolidado.Quantidade_Lancamentos += previsto.Quantidade || 0;
    consolidado.Valor_Recorrencias_Previstas = normalizarNumeroCartaoController_(previsto.Valor_Total);
    consolidado.Quantidade_Recorrencias_Previstas = previsto.Quantidade || 0;
  });

  Object.keys(mapa).forEach(function(idGrupo) {
    const consolidado = mapa[idGrupo];
    consolidado.Valor_Fatura = arredondarConsolidadoController_(consolidado.Valor_Fatura);
    consolidado.Limite_Disponivel = arredondarConsolidadoController_(Math.max(0, consolidado.Limite_Total - consolidado.Valor_Fatura));
    consolidado.Limite_Excedido = arredondarConsolidadoController_(Math.max(0, consolidado.Valor_Fatura - consolidado.Limite_Total));
    consolidado.Percentual_Utilizado = consolidado.Limite_Total > 0
      ? arredondarConsolidadoController_((consolidado.Valor_Fatura / consolidado.Limite_Total) * 100)
      : 0;
  });

  return mapa;
}


/**
 * Complementa o contexto da tela de cartões com recorrências de cartões
 * acessíveis que possam ter sido omitidas pela RPC financeira por não terem
 * sido criadas pelo usuário logado.
 *
 * Motivo:
 * - A tela de cartões e o filtro por período futuro precisam refletir tudo que
 *   está programado para os cartões visíveis, mesmo quando a automação foi
 *   cadastrada por outro usuário autorizado do mesmo grupo.
 *
 * @param {Object} contexto Contexto consolidado já montado.
 * @param {Array<Object>} gruposBase Grupos acessíveis na tela.
 */
function complementarContextoCartoesComRecorrenciasController_(contexto, gruposBase) {
  const gruposPermitidos = {};
  const cartoesPermitidos = {};
  const recorrenciasExistentes = {};

  (gruposBase || []).forEach(function(grupo) {
    const idGrupo = normalizarTextoCartaoController_(grupo.ID_Grupo_Cartao);

    if (idGrupo) {
      gruposPermitidos[idGrupo] = true;
    }
  });

  (contexto.cartoesTodos || []).forEach(function(cartao) {
    const idGrupo = normalizarTextoCartaoController_(cartao.ID_Grupo_Cartao);
    const idCartao = normalizarTextoCartaoController_(cartao.ID_Cartao);

    if (idCartao && gruposPermitidos[idGrupo] === true) {
      cartoesPermitidos[idCartao] = true;
    }
  });

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    const idRecorrencia = normalizarTextoCartaoController_(recorrencia.ID_Recorrencia);

    if (idRecorrencia) {
      recorrenciasExistentes[idRecorrencia] = true;
    }
  });

  (typeof listarRecorrenciasModel === "function" ? listarRecorrenciasModel() : []).forEach(function(recorrencia) {
    const idRecorrencia = normalizarTextoCartaoController_(recorrencia.ID_Recorrencia);
    const idOrigem = normalizarTextoCartaoController_(recorrencia.ID_Origem);
    const tipoOrigem = normalizarTextoCartaoController_(recorrencia.Tipo_Origem);

    if (!idRecorrencia || recorrenciasExistentes[idRecorrencia] === true) {
      return;
    }

    if (ehTipoOrigemCartaoController_(tipoOrigem) && cartoesPermitidos[idOrigem] === true) {
      contexto.recorrenciasTodos = contexto.recorrenciasTodos || [];
      contexto.recorrenciasTodos.push(recorrencia);
      recorrenciasExistentes[idRecorrencia] = true;
    }
  });
}


function ehTipoOrigemCartaoController_(valor) {
  const texto = normalizarTextoCartaoController_(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return texto === "cartao";
}


function montarConsolidadoVazioCartoesController_(grupo, intervalo) {
  return {
    Mes_Inicial: intervalo && intervalo.Mes_Inicial ? intervalo.Mes_Inicial : "",
    Mes_Final: intervalo && intervalo.Mes_Final ? intervalo.Mes_Final : "",
    Limite_Total: normalizarNumeroCartaoController_(grupo && grupo.Limite),
    Valor_Fatura: 0,
    Valor_Recorrencias_Previstas: 0,
    Quantidade_Lancamentos: 0,
    Quantidade_Recorrencias_Previstas: 0,
    Limite_Disponivel: normalizarNumeroCartaoController_(grupo && grupo.Limite),
    Limite_Excedido: 0,
    Percentual_Utilizado: 0
  };
}


function listarRecorrenciasPrevistasGruposCartaoController_(contexto, gruposBase, mesInicial, mesFinal) {
  const inicio = normalizarTextoCartaoController_(mesInicial);
  const fim = normalizarTextoCartaoController_(mesFinal) || inicio;
  const gruposPermitidos = {};
  const gruposPorCartao = {};
  const resultado = {};

  if (!inicio || !fim) {
    return resultado;
  }

  (gruposBase || []).forEach(function(grupo) {
    const idGrupo = normalizarTextoCartaoController_(grupo.ID_Grupo_Cartao);

    if (!idGrupo) {
      return;
    }

    gruposPermitidos[idGrupo] = true;
    resultado[idGrupo] = {
      Valor_Total: 0,
      Quantidade: 0
    };
  });

  (contexto.cartoesTodos || []).forEach(function(cartao) {
    const idCartao = normalizarTextoCartaoController_(cartao.ID_Cartao);
    const idGrupo = normalizarTextoCartaoController_(cartao.ID_Grupo_Cartao);

    if (!idCartao || !gruposPermitidos[idGrupo]) {
      return;
    }

    gruposPorCartao[idCartao] = idGrupo;
  });

  (contexto.recorrenciasTodos || []).forEach(function(recorrencia) {
    const idCartao = normalizarTextoCartaoController_(recorrencia.ID_Origem);
    const idGrupo = gruposPorCartao[idCartao];
    const tipoOrigem = recorrencia.Tipo_Origem;
    const status = normalizarTextoConsolidadoController_(recorrencia.Status_Recorrencia);
    const valorCompromisso = calcularImpactoCompromissoCartaoConsolidadoController_(
      recorrencia.Tipo,
      recorrencia.Valor_Base
    );

    if (!idGrupo || !ehTipoOrigemCartaoController_(tipoOrigem) || status !== "Ativa" || valorCompromisso === 0) {
      return;
    }

    const ocorrencias = listarOcorrenciasPendentesNoPeriodoConsolidadoController_(
      recorrencia,
      contexto,
      obterInicioMesConsolidadoController_(inicio),
      obterFimMesConsolidadoController_(fim)
    );

    ocorrencias.forEach(function() {
      resultado[idGrupo].Valor_Total += valorCompromisso;
      resultado[idGrupo].Quantidade += 1;
    });
  });

  Object.keys(resultado).forEach(function(idGrupo) {
    resultado[idGrupo].Valor_Total = arredondarConsolidadoController_(resultado[idGrupo].Valor_Total);
  });

  return resultado;
}


function montarContextoListaCartoesController_(sessao, medidorPerformance) {
  return {
    grupos: medirEtapaPerformance_(medidorPerformance, "consulta_grupos_cartoes", function() {
      return listarGruposCartoesModel();
    }),
    cartoes: medirEtapaPerformance_(medidorPerformance, "consulta_cartoes", function() {
      return listarCartoesModel();
    })
  };
}


/**
 * Alterna status de um grupo/fatura.
 *
 * @param {string} idGrupoCartao ID do grupo/fatura.
 * @param {string} tokenSessao Token de sessao emitido pelo servidor.
 * @returns {string} Mensagem de sucesso.
 */
function alternarStatusCartao(idGrupoCartao, tokenSessao) {
  const medidor = criarMedidorPerformance_("Cartoes.alternarStatus");
  const sessao = medirEtapaPerformance_(medidor, "sessao", function() {
    return obterSessaoObrigatoria(tokenSessao);
  });
  const idLogado = normalizarTextoCartaoController_(sessao.id);
  const idGrupo = normalizarTextoCartaoController_(idGrupoCartao);

  if (!idGrupo) {
    throw new Error("Grupo de cartoes nao informado.");
  }

  const contexto = medirEtapaPerformance_(medidor, "montar_contexto", function() {
    return montarContextoListaCartoesController_(sessao, medidor);
  });
  const grupo = medirEtapaPerformance_(medidor, "buscar_grupo", function() {
    return buscarGrupoCartaoPorIdController_(idGrupo, contexto.grupos);
  });

  if (normalizarTextoCartaoController_(grupo.ID_Titular) !== idLogado) {
    throw new Error("Acesso negado: apenas o titular pode alterar o status deste grupo.");
  }

  const novoStatus = !normalizarBooleanoCartaoController_(grupo.Ativo);
  medirEtapaPerformance_(medidor, "alterar_status", function() {
    alterarStatusGrupoCartaoModel(
      typeof bancoUsaSupabase === "function" && bancoUsaSupabase() ? idGrupo : grupo._linhaPlanilha,
      novoStatus
    );
  });
  finalizarPerformance_(medidor);

  return novoStatus
    ? "Grupo de cartoes restaurado com sucesso."
    : "Grupo de cartoes inativado com sucesso. Os lancamentos vinculados continuam preservados no historico.";
}


/**
 * Valida campos basicos do grupo/fatura.
 *
 * @param {Object} dados Dados enviados pela View.
 */
function validarDadosGrupoCartaoController_(dados) {
  if (!dados) {
    throw new Error("Dados do grupo de cartoes nao recebidos.");
  }

  const nome = normalizarTextoCartaoController_(dados.Nome_Grupo || dados.Nome_Cartao);
  const diaFechamento = parseInt(dados.Dia_Fechamento, 10);
  const diaVencimento = parseInt(dados.Dia_Vencimento, 10);

  if (!nome) {
    throw new Error("O nome do grupo/fatura e obrigatorio.");
  }

  if (
    isNaN(diaFechamento) ||
    isNaN(diaVencimento) ||
    diaFechamento < 1 ||
    diaFechamento > 31 ||
    diaVencimento < 1 ||
    diaVencimento > 31
  ) {
    throw new Error("Os dias de fechamento e vencimento devem estar entre 1 e 31.");
  }
}


/**
 * Bloqueia nomes duplicados de fatura para grupos acessiveis ao titular.
 *
 * @param {Array<Object>} grupos Todos os grupos.
 * @param {string} idGrupoAtual ID do grupo em edicao.
 * @param {string} idTitular ID do titular.
 * @param {string} nomeGrupo Nome desejado.
 */
function validarNomeGrupoCartaoUnicoController_(grupos, idGrupoAtual, idTitular, nomeGrupo) {
  const nomeNormalizado = normalizarChaveNomeCartaoController_(nomeGrupo);
  const idAtual = normalizarTextoCartaoController_(idGrupoAtual);
  const titular = normalizarTextoCartaoController_(idTitular);

  const duplicado = (grupos || []).some(function(grupo) {
    const mesmoTitular = normalizarTextoCartaoController_(grupo.ID_Titular) === titular;
    const outroGrupo = normalizarTextoCartaoController_(grupo.ID_Grupo_Cartao) !== idAtual;
    const mesmoNome = normalizarChaveNomeCartaoController_(grupo.Nome_Grupo) === nomeNormalizado;

    return mesmoTitular && outroGrupo && mesmoNome;
  });

  if (duplicado) {
    throw new Error("Ja existe um grupo/fatura com este nome.");
  }
}


/**
 * Sincroniza cartoes fisicos de titular e adicionais.
 *
 * @param {Object} grupo Grupo salvo.
 * @param {Array<string>} idsAdicionais IDs selecionados.
 * @param {Array<Object>} cartoesTodos Cartoes existentes.
 * @param {Object} mapaUsuariosAtivos Mapa ID_Usuario -> usuario ativo.
 */
function sincronizarCartoesFisicosDoGrupoCartaoController_(grupo, idsAdicionais, cartoesTodos, mapaUsuariosAtivos) {
  const idGrupo = normalizarTextoCartaoController_(grupo.ID_Grupo_Cartao);
  const idTitular = normalizarTextoCartaoController_(grupo.ID_Titular);
  const idsAdicionaisMapa = {};

  idsAdicionais.forEach(function(idUsuario) {
    idsAdicionaisMapa[idUsuario] = true;
  });

  const cartoesDoGrupo = (cartoesTodos || []).filter(function(cartao) {
    return normalizarTextoCartaoController_(cartao.ID_Grupo_Cartao) === idGrupo;
  });

  const cartaoTitular = cartoesDoGrupo.find(function(cartao) {
    return normalizarTextoCartaoController_(cartao.ID_Usuario) === idTitular &&
           normalizarTextoCartaoController_(cartao.Tipo_Cartao) === "Titular";
  });

  salvarCartaoFisicoModel({
    ID_Cartao: cartaoTitular ? cartaoTitular.ID_Cartao : Utilities.getUuid(),
    ID_Grupo_Cartao: idGrupo,
    ID_Usuario: idTitular,
    Nome_Cartao: grupo.Nome_Grupo + " - Titular",
    Tipo_Cartao: "Titular",
    Ativo: true,
    _linhaPlanilha: cartaoTitular ? cartaoTitular._linhaPlanilha : null
  });

  idsAdicionais.forEach(function(idUsuario) {
    const usuario = mapaUsuariosAtivos[idUsuario] || {};
    const cartaoExistente = cartoesDoGrupo.find(function(cartao) {
      return normalizarTextoCartaoController_(cartao.ID_Usuario) === idUsuario &&
             normalizarTextoCartaoController_(cartao.Tipo_Cartao) === "Adicional";
    });

    salvarCartaoFisicoModel({
      ID_Cartao: cartaoExistente ? cartaoExistente.ID_Cartao : Utilities.getUuid(),
      ID_Grupo_Cartao: idGrupo,
      ID_Usuario: idUsuario,
      Nome_Cartao: grupo.Nome_Grupo + " - " + (usuario.nome || "Adicional"),
      Tipo_Cartao: "Adicional",
      Ativo: true,
      _linhaPlanilha: cartaoExistente ? cartaoExistente._linhaPlanilha : null
    });
  });

  cartoesDoGrupo.forEach(function(cartao) {
    const idUsuario = normalizarTextoCartaoController_(cartao.ID_Usuario);
    const tipo = normalizarTextoCartaoController_(cartao.Tipo_Cartao);
    const deveInativar = tipo === "Adicional" && !idsAdicionaisMapa[idUsuario];

    if (deveInativar && normalizarBooleanoCartaoController_(cartao.Ativo)) {
      alterarStatusCartaoFisicoModel(cartao._linhaPlanilha, false);
    }
  });
}


/**
 * Extrai IDs de adicionais do formulario.
 *
 * @param {Object} dados Dados enviados pela View.
 * @returns {Array<string>} IDs sem duplicidade.
 */
function obterIdsAdicionaisFormularioCartaoController_(dados) {
  const origem = dados.Usuarios_Adicionais ||
    dados.Usuarios_Compartilhados ||
    dados.IDs_Usuarios_Adicionais ||
    dados.IDs_Adicionais ||
    [];

  return normalizarListaIdsCartaoController_(origem);
}


/**
 * Valida adicionais selecionados.
 *
 * @param {Array<string>} idsAdicionais IDs selecionados.
 * @param {string} idTitular ID do titular.
 * @param {Object} mapaUsuariosAtivos Mapa de usuarios ativos.
 */
function validarIdsAdicionaisCartaoController_(idsAdicionais, idTitular, mapaUsuariosAtivos) {
  idsAdicionais.forEach(function(idUsuario) {
    if (idUsuario === idTitular) {
      throw new Error("O titular ja possui cartao fisico proprio e nao deve ser selecionado como adicional.");
    }

    if (!mapaUsuariosAtivos[idUsuario]) {
      throw new Error("Um dos usuarios adicionais nao existe ou esta inativo.");
    }
  });
}


function buscarGrupoCartaoPorIdController_(idGrupoCartao, grupos) {
  const id = normalizarTextoCartaoController_(idGrupoCartao);
  const grupo = (grupos || []).find(function(item) {
    return normalizarTextoCartaoController_(item.ID_Grupo_Cartao) === id;
  });

  if (!grupo) {
    throw new Error("Grupo de cartoes nao encontrado.");
  }

  return grupo;
}


function agruparCartoesFisicosPorGrupoController_(cartoes) {
  const grupos = {};

  (cartoes || []).forEach(function(cartao) {
    const idGrupo = normalizarTextoCartaoController_(cartao.ID_Grupo_Cartao);

    if (!idGrupo) return;
    if (!grupos[idGrupo]) grupos[idGrupo] = [];

    grupos[idGrupo].push({
      ID_Cartao: normalizarTextoCartaoController_(cartao.ID_Cartao),
      ID_Grupo_Cartao: idGrupo,
      ID_Usuario: normalizarTextoCartaoController_(cartao.ID_Usuario),
      Nome_Cartao: normalizarTextoCartaoController_(cartao.Nome_Cartao),
      Tipo_Cartao: normalizarTextoCartaoController_(cartao.Tipo_Cartao),
      Ativo: normalizarBooleanoCartaoController_(cartao.Ativo)
    });
  });

  return grupos;
}


function listarUsuariosAtivosCartaoController_(sessao, medidorPerformance) {
  if (sessao) {
    const idLogado = normalizarTextoCartaoController_(sessao.id);
    const contextoRpc = medirEtapaPerformance_(medidorPerformance, "consulta_contexto_rpc", function() {
      return typeof obterContextoCadastrosSupabaseRpc_ === "function"
        ? obterContextoCadastrosSupabaseRpc_(idLogado, false)
        : null;
    });

    if (contextoRpc && contextoRpc.usuariosTodos) {
      return listarUsuariosAtivosCartaoAPartirBaseController_(contextoRpc.usuariosTodos);
    }
  }

  if (typeof listarUsuariosModel === "function") {
    return listarUsuariosAtivosCartaoAPartirBaseController_(listarUsuariosModel());
  }

  const banco = conectarBanco();
  const aba = banco.getSheetByName("USUARIOS");
  const dados = aba.getDataRange().getValues();
  const usuarios = [];

  for (let i = 1; i < dados.length; i++) {
    if (normalizarBooleanoCartaoController_(dados[i][5])) {
      usuarios.push({
        id: normalizarTextoCartaoController_(dados[i][0]),
        nome: normalizarTextoCartaoController_(dados[i][1]) || "Usuario",
        email: normalizarTextoCartaoController_(dados[i][2]),
        papel: normalizarTextoCartaoController_(dados[i][4])
      });
    }
  }

  return usuarios;
}


function listarUsuariosAtivosCartaoAPartirBaseController_(usuarios) {
  return (usuarios || [])
    .filter(function(usuario) {
      return normalizarBooleanoCartaoController_(usuario.Ativo);
    })
    .map(function(usuario) {
      return {
        id: normalizarTextoCartaoController_(usuario.ID_Usuario),
        nome: normalizarTextoCartaoController_(usuario.Nome) || "Usuario",
        email: normalizarTextoCartaoController_(usuario.Email),
        papel: normalizarTextoCartaoController_(usuario.Papel)
      };
    });
}


function montarMapaUsuariosAtivosCartaoController_(usuarios) {
  const mapa = {};

  (usuarios || []).forEach(function(usuario) {
    if (usuario.id) {
      mapa[usuario.id] = usuario;
    }
  });

  return mapa;
}


function normalizarListaIdsCartaoController_(valor) {
  const origem = Array.isArray(valor) ? valor : normalizarTextoCartaoController_(valor).split(",");
  const usados = {};
  const ids = [];

  origem.forEach(function(item) {
    const id = normalizarTextoCartaoController_(item);

    if (!id || usados[id]) return;

    usados[id] = true;
    ids.push(id);
  });

  return ids;
}


function normalizarTextoCartaoController_(valor) {
  if (valor === null || valor === undefined) return "";
  return valor.toString().trim();
}


function normalizarNumeroCartaoController_(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) || numero < 0 ? 0 : numero;
}


function normalizarBooleanoCartaoController_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}


function normalizarChaveNomeCartaoController_(valor) {
  return normalizarTextoCartaoController_(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
