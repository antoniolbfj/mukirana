/**
 * Modulo: Testes_Diagnosticos.gs
 * Responsabilidade:
 * - Concentrar rotinas manuais de teste, diagnostico e auditoria.
 * - Evitar que funcoes auxiliares de verificacao fiquem espalhadas pelos modulos de producao.
 * - Nao alterar dados, exceto quando a propria funcao deixar isso explicito no nome/retorno.
 */


function diagnosticarRateiosUsuarioMes(emailUsuario, mesReferencia, opcoes) {
  opcoes = opcoes || {};
  const usuario = obterUsuarioDiagnosticoPerformance_(emailUsuario);
  const mesNormalizado = normalizarMesDiagnosticoRateios_(mesReferencia);
  const filtros = normalizarFiltrosConsolidadosController_({
    Mes_Referencia: mesNormalizado,
    Mes_Inicial: mesNormalizado,
    Mes_Final: mesNormalizado,
    Considerar_Historico_Anterior: false,
    Incluir_Historico: true
  });
  const medidor = criarMedidorPerformance_("Diagnostico.RateiosUsuarioMes");
  const sessao = {
    id: usuario.ID_Usuario,
    nome: usuario.Nome,
    email: usuario.Email,
    papel: usuario.Papel
  };
  const contexto = montarContextoConsolidadosController_(sessao, medidor, filtros);
  const lancamentosVisiveis = obterLancamentosVisiveisConsolidadosController_(contexto);
  const lancamentosPeriodo = lancamentosVisiveis.filter(function(lancamento) {
    return mesReferenciaEstaNoIntervaloConsolidadoController_(
      normalizarTextoConsolidadoController_(lancamento.Mes_Referencia),
      filtros.Mes_Inicial,
      filtros.Mes_Final
    );
  });
  const lancamentosProgramados = gerarLancamentosProgramadosRecorrenciasConsolidadoController_(contexto, filtros);
  const rateiosLancados = agruparRateiosConsolidadosController_(contexto.rateiosTodos || []);
  const rateiosComProgramados = combinarRateiosLancadosEProgramadosConsolidadoController_(
    rateiosLancados,
    lancamentosProgramados.rateiosPorLancamento
  );
  const lancamentosCalculados = lancamentosPeriodo.concat(lancamentosProgramados.lancamentos || []);
  const rateiosCard = calcularAcertosRateioConsolidadoController_(
    contexto,
    lancamentosCalculados,
    rateiosComProgramados,
    filtros
  );
  const detalhes = montarDetalhesDiagnosticoRateios_(contexto, lancamentosCalculados, rateiosComProgramados, filtros);
  const anteriores = montarDetalhesDiagnosticoRateios_(
    contexto,
    lancamentosVisiveis.filter(function(lancamento) {
      return normalizarTextoConsolidadoController_(lancamento.Mes_Referencia) < filtros.Mes_Inicial;
    }),
    rateiosLancados,
    filtros
  );
  const inconsistencias = identificarInconsistenciasDiagnosticoRateios_(detalhes, anteriores);
  const resultado = {
    usuario: {
      id: contexto.idLogado,
      nome: contexto.nomeLogado,
      email: usuario.Email
    },
    periodo: {
      mesReferencia: mesNormalizado,
      inicio: obterInicioMesConsolidadoController_(mesNormalizado),
      fim: obterFimMesConsolidadoController_(mesNormalizado),
      consideraSaldoAnterior: false
    },
    resumo: montarResumoDiagnosticoRateios_(rateiosCard),
    rateiosCard: rateiosCard,
    itensConsiderados: detalhes,
    itensAnterioresQueNaoEntram: anteriores,
    inconsistencias: inconsistencias
  };

  resultado._performance = finalizarPerformance_(medidor);
  if (opcoes.registrarLogCompleto !== false) {
    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_DIAGNOSTICO_RATEIOS_USUARIO_MES",
      resultado: resultado
    }, null, 2));
  }

  return resultado;
}


function diagnosticarRateiosAntonioJulho2026() {
  return diagnosticarRateiosUsuarioMes("lbfjantonio@gmail.com", "2026-07");
}


function resumirRateiosAntonioJulho2026() {
  return resumirRateiosUsuarioMes("lbfjantonio@gmail.com", "2026-07");
}


function resumirRateiosUsuarioMes(emailUsuario, mesReferencia) {
  const diagnostico = diagnosticarRateiosUsuarioMes(emailUsuario, mesReferencia, {
    registrarLogCompleto: false
  });
  const itens = diagnostico.itensConsiderados || [];
  const anteriores = diagnostico.itensAnterioresQueNaoEntram || [];
  const agrupadoDescricao = agruparItensResumoRateios_(itens, function(item) {
    return normalizarTextoConsolidadoController_(item.Descricao) || "(sem descricao)";
  });
  const agrupadoDirecao = agruparItensResumoRateios_(itens, function(item) {
    return normalizarTextoConsolidadoController_(item.Direcao) || "(sem direcao)";
  });
  const agrupadoTipo = agruparItensResumoRateios_(itens, function(item) {
    return normalizarTextoConsolidadoController_(item.Tipo) || "(sem tipo)";
  });
  const agrupadoContraparte = agruparItensResumoRateios_(itens, function(item) {
    return normalizarTextoConsolidadoController_(item.Credor) || "(sem credor)";
  });
  const top20 = itens.slice().sort(function(a, b) {
    return Math.abs(converterNumeroConsolidadoController_(b.Impacto_Usuario)) -
      Math.abs(converterNumeroConsolidadoController_(a.Impacto_Usuario));
  }).slice(0, 20).map(function(item) {
    return {
      data: item.Data_Ocorrencia,
      descricao: item.Descricao,
      tipo: item.Tipo,
      direcao: item.Direcao,
      responsavel: item.Responsavel,
      credor: item.Credor,
      valorRateado: item.Valor_Rateado,
      impactoUsuario: item.Impacto_Usuario,
      idLancamento: item.ID_Lancamento
    };
  });
  const resumo = {
    usuario: diagnostico.usuario,
    periodo: diagnostico.periodo,
    resumoCard: diagnostico.resumo,
    quantidadeItensConsiderados: itens.length,
    quantidadeItensAnterioresIgnorados: anteriores.length,
    totalAnteriorIgnorado: arredondarConsolidadoController_(anteriores.reduce(function(total, item) {
      return total + converterNumeroConsolidadoController_(item.Impacto_Usuario);
    }, 0)),
    porDirecao: agrupadoDirecao,
    porTipo: agrupadoTipo,
    porContraparte: agrupadoContraparte,
    topDescricoes: agrupadoDescricao.slice(0, 25),
    top20MaioresItens: top20,
    inconsistencias: diagnostico.inconsistencias
  };

  Logger.log(JSON.stringify({
    tipo: "MUKIRANA_RESUMO_RATEIOS_USUARIO_MES",
    resumo: resumo
  }, null, 2));

  return resumo;
}


function agruparItensResumoRateios_(itens, obterChave) {
  const mapa = {};

  (itens || []).forEach(function(item) {
    const chave = obterChave(item);
    const impacto = converterNumeroConsolidadoController_(item.Impacto_Usuario);

    if (!mapa[chave]) {
      mapa[chave] = {
        chave: chave,
        quantidade: 0,
        totalImpacto: 0,
        totalAbsoluto: 0
      };
    }

    mapa[chave].quantidade += 1;
    mapa[chave].totalImpacto += impacto;
    mapa[chave].totalAbsoluto += Math.abs(impacto);
  });

  return Object.keys(mapa).map(function(chave) {
    return {
      chave: chave,
      quantidade: mapa[chave].quantidade,
      totalImpacto: arredondarConsolidadoController_(mapa[chave].totalImpacto),
      totalAbsoluto: arredondarConsolidadoController_(mapa[chave].totalAbsoluto)
    };
  }).sort(function(a, b) {
    return b.totalAbsoluto - a.totalAbsoluto || a.chave.localeCompare(b.chave);
  });
}


function montarDetalhesDiagnosticoRateios_(contexto, lancamentos, rateiosPorLancamento, filtros) {
  const mapaUsuarios = mapearUsuariosPorIdConsolidadoController_(contexto.usuariosTodos || []);
  const detalhes = [];

  (lancamentos || []).forEach(function(lancamento) {
    const idLancamento = normalizarTextoConsolidadoController_(lancamento.ID_Lancamento);
    const mesReferencia = normalizarTextoConsolidadoController_(lancamento.Mes_Referencia);
    const tipoLancamento = normalizarTextoConsolidadoController_(lancamento.Tipo);
    const programado = lancamento._Programado_Recorrencia === true;
    const rateios = rateiosPorLancamento[idLancamento] || [];

    rateios.forEach(function(rateio) {
      const responsavel = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Responsavel);
      const credor = normalizarTextoConsolidadoController_(rateio.ID_Usuario_Credor);
      const valor = converterNumeroConsolidadoController_(rateio.Valor_Rateado);
      const impacto = calcularImpactoRateioUsuarioConsolidadoController_(
        rateio,
        contexto.idLogado,
        tipoLancamento
      );

      if (
        normalizarTextoConsolidadoController_(rateio.Status) === "Cancelado" ||
        !responsavel ||
        !credor ||
        responsavel === credor ||
        valor <= 0 ||
        impacto === 0
      ) {
        return;
      }

      detalhes.push({
        Origem: programado ? "Recorrencia pendente" : "Lancamento",
        ID_Lancamento: idLancamento,
        ID_Rateio: normalizarTextoConsolidadoController_(rateio.ID_Rateio),
        Descricao: normalizarTextoConsolidadoController_(lancamento.Descricao),
        Tipo: tipoLancamento,
        Data_Ocorrencia: normalizarTextoConsolidadoController_(lancamento.Data_Ocorrencia),
        Mes_Referencia: mesReferencia,
        Dentro_Do_Periodo: mesReferenciaEstaNoIntervaloConsolidadoController_(
          mesReferencia,
          filtros.Mes_Inicial,
          filtros.Mes_Final
        ),
        Responsavel: mapaUsuarios[responsavel] || responsavel,
        Credor: mapaUsuarios[credor] || credor,
        Valor_Rateado: arredondarConsolidadoController_(valor),
        Impacto_Usuario: arredondarConsolidadoController_(impacto),
        Direcao: impacto < 0 ? "Pagar" : "Receber"
      });
    });
  });

  return detalhes.sort(function(a, b) {
    return normalizarTextoConsolidadoController_(a.Data_Ocorrencia).localeCompare(
      normalizarTextoConsolidadoController_(b.Data_Ocorrencia)
    ) || normalizarTextoConsolidadoController_(a.Descricao).localeCompare(
      normalizarTextoConsolidadoController_(b.Descricao)
    );
  });
}


function montarResumoDiagnosticoRateios_(rateiosCard) {
  const resumo = {
    totalExibidoNoCard: 0,
    totalAPagar: 0,
    totalAReceber: 0,
    saldoLiquido: 0,
    quantidadeContrapartes: (rateiosCard || []).length
  };

  (rateiosCard || []).forEach(function(item) {
    const valor = converterNumeroConsolidadoController_(item.Valor);
    resumo.totalExibidoNoCard += valor;

    if (normalizarTextoConsolidadoController_(item.Tipo) === "Pagar") {
      resumo.totalAPagar += valor;
      resumo.saldoLiquido -= valor;
    } else {
      resumo.totalAReceber += valor;
      resumo.saldoLiquido += valor;
    }
  });

  Object.keys(resumo).forEach(function(chave) {
    if (typeof resumo[chave] === "number") {
      resumo[chave] = arredondarConsolidadoController_(resumo[chave]);
    }
  });

  return resumo;
}


function identificarInconsistenciasDiagnosticoRateios_(detalhes, anteriores) {
  const chaves = {};
  const duplicidades = [];

  (detalhes || []).forEach(function(item) {
    const chave = [
      normalizarTextoConsolidadoController_(item.Descricao).toLowerCase(),
      item.Tipo,
      item.Data_Ocorrencia,
      item.Responsavel,
      item.Credor,
      item.Valor_Rateado
    ].join("|");

    chaves[chave] = chaves[chave] || [];
    chaves[chave].push(item);
  });

  Object.keys(chaves).forEach(function(chave) {
    if (chaves[chave].length > 1) {
      duplicidades.push({
        chave: chave,
        quantidade: chaves[chave].length,
        itens: chaves[chave]
      });
    }
  });

  return {
    duplicidadesPossiveis: duplicidades,
    existeItemForaDoPeriodoNoCalculo: (detalhes || []).some(function(item) {
      return item.Dentro_Do_Periodo !== true;
    }),
    totalAnteriorQueNaoDeveEntrar: arredondarConsolidadoController_((anteriores || []).reduce(function(total, item) {
      return total + converterNumeroConsolidadoController_(item.Impacto_Usuario);
    }, 0)),
    quantidadeItensAnterioresQueNaoDevemEntrar: (anteriores || []).length
  };
}


function normalizarMesDiagnosticoRateios_(mesReferencia) {
  const texto = normalizarTextoConsolidadoController_(mesReferencia);

  if (/^\d{4}-\d{2}$/.test(texto)) {
    return texto;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto.substring(0, 7);
  }

  return obterMesAtualPerformance_();
}


function diagnosticarPerformanceMukirana(emailUsuario) {
  const usuario = obterUsuarioDiagnosticoPerformance_(emailUsuario);
  const token = criarSessaoUsuario_(usuario);
  const mesReferencia = obterMesAtualPerformance_();

  try {
    const resultado = {
      usuarioDiagnostico: {
        id: usuario.ID_Usuario,
        nome: usuario.Nome,
        email: usuario.Email
      },
      mesReferencia: mesReferencia,
      dashboard: obterPacoteDashboard(token, { Mes_Referencia: mesReferencia })._performance,
      lancamentos: obterPacoteTelaLancamentos(token, { Mes_Referencia: mesReferencia })._performance,
      orcamentos: obterPacoteTelaOrcamentos(token, mesReferencia)._performance,
      recorrencias: obterPacoteTelaRecorrencias(token, {
        Exibir_Inativas: true,
        Data_Limite_Manual: obterDataHojePerformance_()
      })._performance,
      contas: medirFluxoPerformance_("Contas.obterLista", function() {
        return obterListaContas(token);
      }),
      cartoes: medirFluxoPerformance_("Cartoes.obterLista", function() {
        return obterListaCartoes(token);
      }),
      categorias: medirFluxoPerformance_("Categorias.obterLista", function() {
        return obterListaCategorias(token);
      }),
      projetos: medirFluxoPerformance_("Projetos.obterLista", function() {
        return obterListaProjetos(token);
      }),
      projetosUsuariosCompartilhaveis: medirFluxoPerformance_("Projetos.obterUsuariosCompartilhaveis", function() {
        return obterUsuariosCompartilhaveisProjeto("", token).usuarios;
      }),
      usuarios: medirFluxoPerformance_("Usuarios.obterLista", function() {
        return obterListaUsuarios(token);
      }),
      contasUsuariosCompartilhaveis: medirFluxoPerformance_("Contas.obterUsuariosCompartilhaveis", function() {
        return obterUsuariosCompartilhaveisConta("", token).usuarios;
      }),
      cartoesUsuariosAtivos: medirFluxoPerformance_("Cartoes.obterUsuariosAtivos", function() {
        return obterUsuariosAtivos(token);
      }),
      relatorioSemanal: montarPacoteRelatorioSemanalUsuario_(usuario, calcularPeriodoSemanaFechadaRelatorio_(new Date()))._performance,
      faturaCartao: medirFaturaCartaoPerformance_(token, mesReferencia)
    };

    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_PERFORMANCE_DIAGNOSTICO",
      resultado: resultado
    }, null, 2));

    return resultado;
  } finally {
    encerrarSessao(token);
  }
}


function medirFaturaCartaoPerformance_(token, mesReferencia) {
  const dashboard = obterPacoteDashboard(token, { Mes_Referencia: mesReferencia });
  const cartao = (dashboard.cartoes || []).find(function(item) {
    return item && item.ID_Grupo_Cartao;
  });

  if (!cartao) {
    return {
      nomeFluxo: "FaturasCartao.obterPacote",
      fonteDados: typeof obterFonteDadosMukirana === "function" ? obterFonteDadosMukirana() : "DESCONHECIDA",
      ignorado: true,
      motivo: "Nenhuma fatura acessivel encontrada no mes de referencia."
    };
  }

  return obterPacoteFaturaCartao(token, {
    Mes_Referencia: mesReferencia,
    ID_Grupo_Cartao: cartao.ID_Grupo_Cartao
  })._performance;
}


function medirFluxoPerformance_(nomeFluxo, callback) {
  const inicio = Date.now();
  const retorno = callback();

  return {
    nomeFluxo: nomeFluxo,
    fonteDados: typeof obterFonteDadosMukirana === "function" ? obterFonteDadosMukirana() : "DESCONHECIDA",
    totalMs: Date.now() - inicio,
    quantidadeRetornada: Array.isArray(retorno) ? retorno.length : null
  };
}


function obterUsuarioDiagnosticoPerformance_(emailUsuario) {
  const email = emailUsuario ? emailUsuario.toString().trim().toLowerCase() : "";
  const usuarioPorEmail = email && typeof buscarUsuarioPorEmailModel === "function"
    ? buscarUsuarioPorEmailModel(email)
    : null;
  const usuarios = usuarioPorEmail ? [] : (typeof listarUsuariosModel === "function" ? listarUsuariosModel() : []);
  const usuario = usuarioPorEmail && usuarioPorEmail.Ativo === true
    ? usuarioPorEmail
    : usuarios.find(function(item) {
      return item &&
        item.Ativo === true &&
        item.Papel === "Administrador";
    }) || usuarios.find(function(item) {
      return item &&
        item.Ativo === true &&
        item.Papel !== "Usuario Virtual";
    }) || usuarios.find(function(item) {
      return item && item.Ativo === true;
    });

  if (!usuario) {
    throw new Error("Nenhum usuario ativo encontrado para diagnostico.");
  }

  return usuario;
}


function obterMesAtualPerformance_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );
}


function obterDataHojePerformance_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}


function diagnosticarRelatorioSemanal() {
  const triggers = ScriptApp.getProjectTriggers().map(function(trigger) {
    return {
      handler: trigger.getHandlerFunction(),
      eventType: trigger.getEventType ? String(trigger.getEventType()) : "",
      source: trigger.getTriggerSource ? String(trigger.getTriggerSource()) : "",
      uniqueId: trigger.getUniqueId ? trigger.getUniqueId() : ""
    };
  });
  const triggersRelatorio = triggers.filter(function(trigger) {
    return trigger.handler === "enviarRelatoriosSemanais";
  });
  const classificacao = classificarUsuariosRelatorioSemanal_();
  const periodo = calcularPeriodoSemanaFechadaRelatorio_(new Date());

  return {
    periodoSemanaFechada: periodo,
    triggerRelatorioInstalado: triggersRelatorio.length > 0,
    quantidadeTriggersRelatorio: triggersRelatorio.length,
    triggersRelatorio: triggersRelatorio,
    totalTriggersProjeto: triggers.length,
    totalDestinatarios: classificacao.destinatarios.length,
    totalUsuariosIgnorados: classificacao.ignorados,
    destinatarios: classificacao.destinatarios.map(function(usuario) {
      return {
        ID_Usuario: normalizarTextoRelatorio_(usuario.ID_Usuario),
        Nome: normalizarTextoRelatorio_(usuario.Nome),
        Email: normalizarTextoRelatorio_(usuario.Email)
      };
    })
  };
}


function enviarRelatorioSemanalFicticioTeste() {
  const destinatario = "lbfjantonio@gmail.com";
  const pacote = montarPacoteRelatorioSemanalFicticioTeste_();
  const htmlBody = montarHtmlRelatorioSemanalFicticioTeste_(pacote);
  const assunto = "Seu resumo financeiro da semana - Mukirana (" + pacote.periodo.rotuloCurto + ")";

  MailApp.sendEmail({
    to: destinatario,
    subject: assunto,
    htmlBody: htmlBody,
    name: CONFIG_RELATORIO_SEMANAL.REMETENTE_NOME
  });

  return {
    enviado: true,
    destinatario: destinatario,
    assunto: assunto,
    periodo: pacote.periodo,
    totalLancamentosSemana: pacote.totalLancamentosSemana
  };
}


function montarHtmlRelatorioSemanalFicticioTeste_(pacote) {
  const iconeUrl = "https://drive.google.com/uc?export=view&id=" + CONFIG_SISTEMA.ID_ICONE_DRIVE;
  const css = "" +
    "body{margin:0;padding:0;background:#efebe2;color:#25352e;font-family:Arial,Helvetica,sans-serif;}" +
    ".container{max-width:860px;margin:0 auto;padding:18px 12px;}" +
    ".shell{background:#fbf8f1;border:1px solid #d9d2c4;border-radius:14px;overflow:hidden;}" +
    ".topo{padding:20px 22px;background:#e9efe8;border-bottom:1px solid #d9d2c4;}" +
    ".marca{display:table;width:100%;}.marca-logo{display:table-cell;width:72px;vertical-align:middle;}.marca-logo img{width:58px;height:58px;border-radius:16px;display:block;}.marca-texto{display:table-cell;vertical-align:middle;}.marca-texto strong{display:block;font-size:22px;color:#25352e;}.marca-texto span{display:block;margin-top:4px;font-size:13px;color:#5f7067;}" +
    ".intro{margin-top:14px;padding:12px 14px;border-radius:10px;background:#fbf8f1;border:1px solid #d9d2c4;color:#40544a;font-size:13px;line-height:1.45;}" +
    ".corpo{padding:16px;}" +
    ".grid{width:100%;border-spacing:12px;border-collapse:separate;}.grid td{vertical-align:top;width:50%;}" +
    ".secao{border:1px solid #d9d2c4;border-radius:12px;background:#fffdf8;overflow:hidden;margin-bottom:12px;}" +
    ".secao h2{margin:0;padding:11px 13px;background:#e9efe8;border-bottom:1px solid #d9d2c4;font-size:15px;color:#25352e;}" +
    ".secao p.sub{margin:0;padding:9px 13px 0;color:#5f7067;font-size:12px;line-height:1.35;}" +
    ".tabela{width:100%;border-collapse:collapse;font-size:13px;}.tabela th{padding:9px 11px;background:#f0f4ef;color:#5f7067;text-align:left;font-size:12px;border-bottom:1px solid #d9d2c4;}.tabela td{padding:10px 11px;border-bottom:1px solid #ebe4d8;color:#25352e;}.tabela tr:last-child td{border-bottom:0;}.tabela td.valor{text-align:right;font-weight:700;white-space:nowrap;}.positivo{color:#2f6d4f!important;}.negativo{color:#a64032!important;}.alerta{color:#8a5a00!important;}" +
    ".barra{height:7px;background:#e7e0d4;border-radius:999px;overflow:hidden;margin-top:5px;}.barra span{display:block;height:7px;background:#2f7d68;border-radius:999px;}.barra span.amarelo{background:#d9a822;}.barra span.vermelho{background:#c65b4a;}" +
    ".rodape{padding:12px 16px;background:#e9efe8;color:#5f7067;font-size:11px;line-height:1.4;border-top:1px solid #d9d2c4;}" +
    "@media(max-width:620px){.grid,.grid tbody,.grid tr,.grid td{display:block;width:100%!important;}.grid{border-spacing:0;}.grid td{margin-bottom:12px;}}";

  return "" +
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><style>" + css + "</style></head><body>" +
      "<div class=\"container\"><div class=\"shell\">" +
        "<div class=\"topo\">" +
          "<div class=\"marca\"><div class=\"marca-logo\"><img src=\"" + escaparHtmlRelatorio_(iconeUrl) + "\" alt=\"Mukirana\"></div>" +
          "<div class=\"marca-texto\"><strong>Mukirana</strong><span>Relatorio semanal de saude financeira</span></div></div>" +
          "<div class=\"intro\">Este relatorio mostra a situacao acumulada do mes ate o domingo da semana fechada e tambem o que esta programado ate o fim do mes. O saldo anterior considera tudo antes do inicio do mes, para que a leitura reflita melhor a saude financeira real do periodo e ajude no planejamento das proximas semanas.</div>" +
        "</div>" +
        "<div class=\"corpo\">" +
          "<table class=\"grid\"><tr><td>" +
            montarSecaoResumoTeste_(pacote) +
          "</td><td>" +
            montarSecaoPulsoTeste_(pacote) +
          "</td></tr></table>" +
          "<table class=\"grid\"><tr><td>" +
            montarSecaoRateiosTabelaTeste_(pacote.rateios) +
          "</td><td>" +
            montarSecaoDinheiroGuardadoTeste_(pacote.dinheiroGuardado) +
          "</td></tr></table>" +
          montarSecaoOrcamentoTabelaTeste_(pacote.orcamento) +
        "</div>" +
        "<div class=\"rodape\">" + (pacote.relatorioTeste === true
          ? "Relatorio ficticio de teste. Apos aprovacao do formato, aplicaremos a mesma estrutura ao envio automatico semanal."
          : "Relatorio gerado automaticamente pelo Mukirana para apoiar suas decisoes da semana e o planejamento ate o fim do mes.") + "</div>" +
      "</div></div>" +
    "</body></html>";
}


function montarSecaoResumoTeste_(pacote) {
  const resumo = pacote.resumo || {};
  const saldoAnterior = converterNumeroConsolidadoController_(resumo.Saldo_Anterior);
  const receitas = converterNumeroConsolidadoController_(resumo.Receitas);
  const despesas = converterNumeroConsolidadoController_(resumo.Despesas);
  const transferencias = converterNumeroConsolidadoController_(resumo.Transferencias_Entrada) - converterNumeroConsolidadoController_(resumo.Transferencias_Saida);
  const receitasProgramadas = converterNumeroConsolidadoController_(resumo.Receitas_Programadas);
  const despesasProgramadas = converterNumeroConsolidadoController_(resumo.Despesas_Programadas);
  const transferenciasProgramadas = converterNumeroConsolidadoController_(resumo.Transferencias_Programadas);
  const saldoAteLimite = saldoAnterior + receitas - despesas + transferencias;
  const programadoFinalMes = receitasProgramadas - despesasProgramadas + transferenciasProgramadas;
  const saldoProjetadoFinalMes = saldoAteLimite + programadoFinalMes;

  return abrirSecaoTabelaTeste_("Resumo", "Mes ate " + escaparHtmlRelatorio_(pacote.periodo.fimVisual) + ", com saldo anterior antes de " + escaparHtmlRelatorio_(pacote.periodo.inicioMesVisual) + ".") +
    linhaTabelaTeste_("Saldo anterior", formatarMoedaRelatorio_(saldoAnterior), saldoAnterior >= 0 ? "positivo" : "negativo") +
    linhaTabelaComDetalheTeste_("Receitas", "Programado ate " + pacote.periodo.fimMesVisual + ": " + formatarMoedaRelatorio_(receitasProgramadas), formatarMoedaRelatorio_(receitas), "positivo") +
    linhaTabelaComDetalheTeste_("Despesas", "Programado ate " + pacote.periodo.fimMesVisual + ": " + formatarMoedaRelatorio_(despesasProgramadas), formatarMoedaRelatorio_(despesas), "negativo") +
    linhaTabelaComDetalheTeste_("Transferencias liquidas", "Programado ate " + pacote.periodo.fimMesVisual + ": " + formatarMoedaRelatorio_(transferenciasProgramadas), formatarMoedaRelatorio_(transferencias), transferencias >= 0 ? "positivo" : "negativo") +
    linhaTabelaTeste_("Saldo ate a data limite", formatarMoedaRelatorio_(saldoAteLimite), saldoAteLimite >= 0 ? "positivo" : "negativo") +
    linhaTabelaTeste_("Programado ate o final do mes", formatarMoedaRelatorio_(programadoFinalMes), programadoFinalMes >= 0 ? "positivo" : "negativo") +
    linhaTabelaTeste_("Saldo projetado no final do mes", formatarMoedaRelatorio_(saldoProjetadoFinalMes), saldoProjetadoFinalMes >= 0 ? "positivo" : "negativo") +
    fecharSecaoTabelaTeste_();
}


function montarSecaoPulsoTeste_(pacote) {
  const pulso = pacote.pulso || {};
  return abrirSecaoTabelaTeste_("Pulso do mes", "Realizado ate " + escaparHtmlRelatorio_(pacote.periodo.fimVisual) + " e programado ate " + escaparHtmlRelatorio_(pacote.periodo.fimMesVisual) + ".") +
    linhaTabelaComBarraTeste_("Receitas", formatarMoedaRelatorio_(pulso.Receitas), "Programado: " + formatarMoedaRelatorio_(pulso.Receitas_Programadas), pulso.Percentual_Receitas || 0, "") +
    linhaTabelaComBarraTeste_("Despesas", formatarMoedaRelatorio_(pulso.Despesas), "Programado: " + formatarMoedaRelatorio_(pulso.Despesas_Programadas), pulso.Percentual_Despesas || 0, "vermelho") +
    linhaTabelaComBarraTeste_("Transferencias", formatarMoedaRelatorio_(pulso.Transferencias), "Programado: " + formatarMoedaRelatorio_(pulso.Transferencias_Programadas), pulso.Percentual_Transferencias || 0, "amarelo") +
    fecharSecaoTabelaTeste_();
}


function montarSecaoRateiosTabelaTeste_(rateios) {
  let html = abrirSecaoTabelaTeste_("Acertos de rateio", "Valores realizados no recorte e acertos programados ate o fim do mes.");
  (rateios || []).forEach(function(item) {
    const classe = normalizarTextoRelatorio_(item.Tipo) === "Receber" ? "positivo" : "negativo";
    const valorRealizado = item.Valor_Lancado !== undefined ? item.Valor_Lancado : item.Valor;
    const valorProgramado = item.Programado_Final_Mes !== undefined ? item.Programado_Final_Mes : item.Valor_Programado;
    html += linhaTabelaComDetalheTeste_(item.Tipo + " - " + item.Nome_Usuario, "Programado ate o final do mes: " + formatarMoedaRelatorio_(valorProgramado), formatarMoedaRelatorio_(valorRealizado), classe);
  });
  return html + fecharSecaoTabelaTeste_();
}


function montarSecaoDinheiroGuardadoTeste_(dinheiro) {
  dinheiro = dinheiro || {};
  return abrirSecaoTabelaTeste_("Dinheiro guardado", "Fotografia do patrimonio acumulado e projecao com o programado ate o fim do mes.") +
    linhaTabelaTeste_("Saldo atual acumulado", formatarMoedaRelatorio_(dinheiro.Saldo_Atual), dinheiro.Saldo_Atual >= 0 ? "positivo" : "negativo") +
    linhaTabelaTeste_("Programado ate o final do mes", formatarMoedaRelatorio_(dinheiro.Programado), dinheiro.Programado >= 0 ? "positivo" : "negativo") +
    linhaTabelaTeste_("Saldo projetado no final do mes", formatarMoedaRelatorio_(dinheiro.Estimado), dinheiro.Estimado >= 0 ? "positivo" : "negativo") +
    fecharSecaoTabelaTeste_();
}


function montarSecaoOrcamentoTabelaTeste_(orcamento) {
  let html = abrirSecaoTabelaTeste_("Orcamento", "Categorias pai em ordem de gasto, com realizado e programado ate o fim do mes.");
  (orcamento && orcamento.itens ? orcamento.itens : []).forEach(function(item) {
    const percentualProjetado = converterNumeroConsolidadoController_(item.Percentual_Projetado);
    const classe = percentualProjetado >= 100 ? "vermelho" : (percentualProjetado >= 80 ? "amarelo" : "");
    html += linhaTabelaComBarraTeste_(
      item.Nome_Categoria,
      formatarMoedaRelatorio_(item.Valor_Realizado),
      "Meta: " + formatarMoedaRelatorio_(item.Valor_Teto) + " - Programado: " + formatarMoedaRelatorio_(item.Valor_Programado) + " - Projetado: " + formatarMoedaRelatorio_(item.Valor_Projetado) + " (" + Math.round(percentualProjetado) + "%)",
      percentualProjetado,
      classe
    );
  });
  return html + fecharSecaoTabelaTeste_();
}


function abrirSecaoTabelaTeste_(titulo, subtitulo) {
  return "<section class=\"secao\"><h2>" + escaparHtmlRelatorio_(titulo) + "</h2>" +
    (subtitulo ? "<p class=\"sub\">" + subtitulo + "</p>" : "") +
    "<table class=\"tabela\"><tbody>";
}


function fecharSecaoTabelaTeste_() {
  return "</tbody></table></section>";
}


function linhaTabelaTeste_(rotulo, valor, classeValor) {
  return "<tr><td>" + escaparHtmlRelatorio_(rotulo) + "</td><td class=\"valor " + escaparHtmlRelatorio_(classeValor || "") + "\">" + escaparHtmlRelatorio_(valor) + "</td></tr>";
}


function linhaTabelaComDetalheTeste_(rotulo, detalhe, valor, classeValor) {
  return "<tr><td><strong>" + escaparHtmlRelatorio_(rotulo) + "</strong><br><span style=\"color:#5f7067;font-size:11px;\">" + escaparHtmlRelatorio_(detalhe || "") + "</span></td><td class=\"valor " + escaparHtmlRelatorio_(classeValor || "") + "\">" + escaparHtmlRelatorio_(valor) + "</td></tr>";
}


function linhaTabelaComBarraTeste_(rotulo, valor, detalhe, percentual, classeBarra) {
  const largura = Math.max(2, Math.min(100, Math.round(converterNumeroConsolidadoController_(percentual))));
  return "<tr><td><strong>" + escaparHtmlRelatorio_(rotulo) + "</strong><br><span style=\"color:#5f7067;font-size:11px;\">" + escaparHtmlRelatorio_(detalhe || "") + "</span><div class=\"barra\"><span class=\"" + escaparHtmlRelatorio_(classeBarra || "") + "\" style=\"width:" + largura + "%;\"></span></div></td><td class=\"valor\">" + escaparHtmlRelatorio_(valor) + "</td></tr>";
}


function montarPacoteRelatorioSemanalFicticioTeste_() {
  return {
    usuario: {
      ID_Usuario: "usuario-teste",
      Nome: "Luiz",
      Email: "lbfjantonio@gmail.com"
    },
    relatorioTeste: true,
    periodo: {
      inicio: "2026-06-01",
      fim: "2026-06-07",
      inicioMes: "2026-06-01",
      inicioMesVisual: "01/06/2026",
      inicioVisual: "01/06/2026",
      fimVisual: "07/06/2026",
      fimMesVisual: "30/06/2026",
      rotuloCurto: "01/06/2026 a 07/06/2026"
    },
    resumo: {
      Saldo_Anterior: 8310.72,
      Receitas: 4200,
      Despesas: 2875.45,
      Transferencias_Entrada: 900,
      Transferencias_Saida: 650,
      Receitas_Programadas: 1650,
      Despesas_Programadas: 2310.80,
      Transferencias_Programadas: -300,
      Resultado: 1324.55
    },
    pulso: {
      Receitas: 4200,
      Despesas: 2875.45,
      Transferencias: 250,
      Receitas_Programadas: 1650,
      Despesas_Programadas: 2310.80,
      Transferencias_Programadas: -300,
      Percentual_Receitas: 100,
      Percentual_Despesas: 68,
      Percentual_Transferencias: 12
    },
    dinheiroGuardado: {
      Saldo_Atual: 9885.27,
      Programado: -1430.80,
      Estimado: 8454.47
    },
    categorias: [
      { Nome_Categoria: "Casa > Mercado", Valor: 812.34, Quantidade: 5 },
      { Nome_Categoria: "Transporte > Combustivel", Valor: 390.10, Quantidade: 2 },
      { Nome_Categoria: "Saude", Valor: 275.00, Quantidade: 1 },
      { Nome_Categoria: "Lazer", Valor: 188.90, Quantidade: 3 }
    ],
    cartoes: [
      { Nome_Grupo: "Nubank", Valor_Fatura: 1240.70, Quantidade_Lancamentos: 9, Limite: 6000 },
      { Nome_Grupo: "Itaucard", Valor_Fatura: 430.25, Quantidade_Lancamentos: 4, Limite: 3500 }
    ],
    contas: [
      { Nome_Conta: "Conta Corrente", Entradas: 4200, Saidas: 980.35, Transferencias_Entrada: 900, Transferencias_Saida: 650, Pagamentos_Faturas: 740 },
      { Nome_Conta: "Carteira Digital", Entradas: 0, Saidas: 210.50, Transferencias_Entrada: 0, Transferencias_Saida: 0, Pagamentos_Faturas: 0 }
    ],
    rateios: [
      { Tipo: "Receber", Nome_Usuario: "Ana", Valor: 180.00, Programado_Final_Mes: 60.00 },
      { Tipo: "Pagar", Nome_Usuario: "Bruno", Valor: 95.50, Programado_Final_Mes: 140.00 }
    ],
    orcamento: {
      itens: [
        { Nome_Categoria: "Casa", Valor_Realizado: 812.34, Valor_Teto: 1200, Percentual_Usado: 67.7, Valor_Programado: 260.00, Valor_Projetado: 1072.34, Percentual_Projetado: 89.4 },
        { Nome_Categoria: "Transporte", Valor_Realizado: 390.10, Valor_Teto: 450, Percentual_Usado: 86.7, Valor_Programado: 95.00, Valor_Projetado: 485.10, Percentual_Projetado: 107.8 },
        { Nome_Categoria: "Lazer", Valor_Realizado: 188.90, Valor_Teto: 180, Percentual_Usado: 104.9, Valor_Programado: 0, Valor_Projetado: 188.90, Percentual_Projetado: 104.9 }
      ]
    },
    pendencias: [
      { Tipo: "Lancamentos pendentes", Quantidade: "3", Mensagem: "Revise compromissos cadastrados como pendentes antes do fechamento." },
      { Tipo: "Rateios em aberto", Quantidade: "2", Mensagem: "Existem acertos com participantes que merecem conferencia." }
    ],
    totalLancamentosSemana: 24
  };
}


function diagnosticarSupabaseMukirana() {
  const status = obterStatusBancoMukirana();
  const resultado = {
    fonteAtual: status.fonte,
    supabaseConfigurado: status.supabaseConfigurado,
    conexao: null,
    contagens: []
  };

  if (!status.supabaseConfigurado) {
    resultado.conexao = {
      ok: false,
      mensagem: "Supabase ainda nao configurado nas propriedades do script."
    };
    return resultado;
  }

  resultado.conexao = testarConexaoSupabase();
  resultado.contagens = compararContagensPlanilhaSupabase_();

  Logger.log(JSON.stringify(resultado, null, 2));

  return resultado;
}


function diagnosticarEstruturaPlanilhaMukirana() {
  const banco = conectarBanco();
  const resultado = SUPABASE_TABELAS_DIAGNOSTICO.map(function(item) {
    const aba = banco.getSheetByName(item.planilha);

    if (!aba) {
      return {
        tabela: item.planilha,
        existe: false,
        mensagem: "Aba nao encontrada na planilha."
      };
    }

    const totalLinhas = aba.getLastRow();
    const totalColunas = aba.getLastColumn();
    const cabecalhos = totalLinhas > 0
      ? aba.getRange(1, 1, 1, totalColunas).getValues()[0].map(textoMigracao_)
      : [];
    const amostra = totalLinhas > 1
      ? aba.getRange(2, 1, Math.min(totalLinhas - 1, 3), totalColunas).getValues()
      : [];

    return {
      tabela: item.planilha,
      existe: true,
      totalLinhas: Math.max(totalLinhas - 1, 0),
      totalColunas: totalColunas,
      cabecalhos: cabecalhos,
      amostra: amostra
    };
  });

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


function compararContagensPlanilhaSupabase_() {
  return SUPABASE_TABELAS_DIAGNOSTICO.map(function(item) {
    const totalPlanilha = contarLinhasTabelaPlanilha_(item.planilha);
    const totalSupabase = contarLinhasTabelaSupabase_(item.supabase);

    return {
      tabelaPlanilha: item.planilha,
      tabelaSupabase: item.supabase,
      totalPlanilha: totalPlanilha,
      totalSupabase: totalSupabase,
      diferenca: totalPlanilha - totalSupabase
    };
  });
}


function contarLinhasTabelaPlanilha_(nomeTabela) {
  const aba = conectarBanco().getSheetByName(nomeTabela);

  if (!aba) {
    return 0;
  }

  return Math.max(aba.getLastRow() - 1, 0);
}


function contarLinhasTabelaSupabase_(nomeTabela) {
  const resposta = supabaseSelecionar(nomeTabela, "select=*&limit=1");

  if (Array.isArray(resposta) && resposta.length === 0) {
    return 0;
  }

  const cabecalhoContagem = supabaseRestRequest_("get", nomeTabela, {
    query: "select=*&limit=1",
    headers: { Prefer: "count=exact" }
  });

  return Array.isArray(cabecalhoContagem) ? cabecalhoContagem.length : 0;
}


function testarConexaoSupabase() {
  const usuarios = supabaseSelecionar("usuarios", "select=id_usuario&limit=1");
  return {
    ok: true,
    mensagem: "Conexao com Supabase realizada com sucesso.",
    amostraUsuarios: usuarios.length
  };
}


function diagnosticarCategoriasGlobaisIntermediariasMukirana() {
  return executarCargaCategoriasGlobaisIntermediariasMukirana_(true);
}


function diagnosticarCategoriasRecorrenciasMukirana(tokenSessao) {
  const sessao = obterSessaoObrigatoria(tokenSessao);
  const contexto = montarContextoRecorrenciasController_(sessao);
  const resumo = montarDiagnosticoCategoriasRecorrenciasController_(contexto);

  Logger.log(JSON.stringify({
    tipo: "MUKIRANA_DIAGNOSTICO_CATEGORIAS_RECORRENCIAS",
    resultado: resumo
  }, null, 2));

  return resumo;
}


function montarDiagnosticoCategoriasRecorrenciasController_(contexto) {
  const categoriasTodas = contexto.categoriasTodas || [];
  const categoriasAcessiveis = contexto.categoriasAcessiveis || [];
  const contar = function(lista, predicado) {
    return lista.filter(predicado).length;
  };

  return {
    usuario: {
      id: contexto.idLogado,
      nome: contexto.nomeLogado
    },
    todas: {
      total: categoriasTodas.length,
      pais: contar(categoriasTodas, function(categoria) {
        return !normalizarTextoRecorrenciaController_(categoria.ID_Categoria_Pai);
      }),
      filhas: contar(categoriasTodas, function(categoria) {
        return !!normalizarTextoRecorrenciaController_(categoria.ID_Categoria_Pai);
      }),
      globais: contar(categoriasTodas, function(categoria) {
        return normalizarBooleanoRecorrenciaController_(categoria.Global);
      }),
      globaisFilhas: contar(categoriasTodas, function(categoria) {
        return normalizarBooleanoRecorrenciaController_(categoria.Global) &&
          !!normalizarTextoRecorrenciaController_(categoria.ID_Categoria_Pai);
      })
    },
    acessiveis: {
      total: categoriasAcessiveis.length,
      pais: contar(categoriasAcessiveis, function(categoria) {
        return !normalizarTextoRecorrenciaController_(categoria.ID_Categoria_Pai);
      }),
      filhas: contar(categoriasAcessiveis, function(categoria) {
        return !!normalizarTextoRecorrenciaController_(categoria.ID_Categoria_Pai);
      }),
      despesa: contar(categoriasAcessiveis, function(categoria) {
        return normalizarTextoRecorrenciaController_(categoria.Tipo) === "Despesa";
      }),
      receita: contar(categoriasAcessiveis, function(categoria) {
        return normalizarTextoRecorrenciaController_(categoria.Tipo) === "Receita";
      })
    },
    exemplosFilhasAcessiveis: categoriasAcessiveis
      .filter(function(categoria) {
        return !!normalizarTextoRecorrenciaController_(categoria.ID_Categoria_Pai);
      })
      .slice(0, 12)
      .map(function(categoria) {
        return {
          nome: categoria.Nome,
          tipo: categoria.Tipo,
          global: categoria.Global,
          ativa: categoria.Ativa,
          idCategoriaPai: categoria.ID_Categoria_Pai
        };
      })
  };
}
