/**
 * Modulo: Supabase_Contexto.gs
 * Responsabilidade:
 * - Buscar contexto financeiro em pacote unico via RPC Supabase.
 * - Converter o JSON relacional para o mesmo contrato usado pelos Controllers.
 * - Manter fallback seguro para os Models tradicionais durante a transicao.
 */


function obterContextoFinanceiroSupabaseRpc_(idUsuario, mesReferencia, incluirHistorico) {
  const id = supabaseNormalizarTexto_(idUsuario);
  const mes = supabaseNormalizarTexto_(mesReferencia);

  if (!id || typeof bancoUsaSupabase_ !== "function" || !bancoUsaSupabase_()) {
    return null;
  }

  try {
    const resposta = supabaseRpc_("rpc_contexto_financeiro_mukirana", {
      p_id_usuario: id,
      p_mes_referencia: mes ? converterDataSupabase_(mes) : null,
      p_incluir_historico: incluirHistorico !== false
    });

    return montarContextoFinanceiroAPartirRpc_(resposta || {});
  } catch (erro) {
    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_RPC_FALLBACK",
      funcao: "rpc_contexto_financeiro_mukirana",
      mensagem: erro && erro.message ? erro.message : erro
    }));
    return null;
  }
}


function obterContextoCadastrosSupabaseRpc_(idUsuario, incluirVinculos) {
  const id = supabaseNormalizarTexto_(idUsuario);

  if (!id || typeof bancoUsaSupabase_ !== "function" || !bancoUsaSupabase_()) {
    return null;
  }

  try {
    const resposta = supabaseRpc_("rpc_cadastros_mukirana", {
      p_id_usuario: id,
      p_incluir_vinculos: incluirVinculos === true
    });

    return montarContextoCadastrosAPartirRpc_(resposta || {});
  } catch (erro) {
    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_RPC_FALLBACK",
      funcao: "rpc_cadastros_mukirana",
      mensagem: erro && erro.message ? erro.message : erro
    }));
    return null;
  }
}


function obterContextoFaturaCartaoSupabaseRpc_(idUsuario, mesReferencia, idGrupoCartao) {
  const id = supabaseNormalizarTexto_(idUsuario);
  const mes = supabaseNormalizarTexto_(mesReferencia);
  const idGrupo = supabaseNormalizarTexto_(idGrupoCartao);

  if (!id || !idGrupo || typeof bancoUsaSupabase_ !== "function" || !bancoUsaSupabase_()) {
    return null;
  }

  try {
    const resposta = supabaseRpc_("rpc_fatura_cartao_mukirana", {
      p_id_usuario: id,
      p_mes_referencia: mes ? converterDataSupabase_(mes) : null,
      p_id_grupo_cartao: idGrupo
    });

    return montarContextoFinanceiroAPartirRpc_(resposta || {});
  } catch (erro) {
    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_RPC_FALLBACK",
      funcao: "rpc_fatura_cartao_mukirana",
      mensagem: erro && erro.message ? erro.message : erro
    }));
    return null;
  }
}


function obterContextoRecorrenciasSupabaseRpc_(idUsuario) {
  const id = supabaseNormalizarTexto_(idUsuario);

  if (!id || typeof bancoUsaSupabase_ !== "function" || !bancoUsaSupabase_()) {
    return null;
  }

  try {
    const resposta = supabaseRpc_("rpc_recorrencias_mukirana", {
      p_id_usuario: id
    });

    return montarContextoFinanceiroAPartirRpc_(resposta || {});
  } catch (erro) {
    Logger.log(JSON.stringify({
      tipo: "MUKIRANA_RPC_FALLBACK",
      funcao: "rpc_recorrencias_mukirana",
      mensagem: erro && erro.message ? erro.message : erro
    }));
    return null;
  }
}


function montarContextoFinanceiroAPartirRpc_(dados) {
  const usuarios = arrayRpc_(dados.usuarios).map(montarUsuarioRpc_);
  const categorias = arrayRpc_(dados.categorias).map(montarCategoriaRpc_);
  const contas = montarContasRpc_(arrayRpc_(dados.contas), arrayRpc_(dados.contas_compartilhamentos));
  const gruposCartoes = arrayRpc_(dados.grupos_cartoes).map(montarGrupoCartaoRpc_);
  const cartoes = montarCartoesRpc_(
    arrayRpc_(dados.cartoes),
    gruposCartoes,
    arrayRpc_(dados.cartoes_compartilhados)
  );
  const projetos = montarProjetosRpc_(arrayRpc_(dados.projetos), arrayRpc_(dados.projetos_compartilhamentos));

  return {
    usuariosTodos: usuarios,
    contasTodas: contas,
    gruposCartoesTodos: gruposCartoes,
    cartoesTodos: cartoes,
    categoriasTodas: categorias,
    projetosTodos: projetos,
    lancamentosTodos: arrayRpc_(dados.lancamentos).map(montarLancamentoRpc_),
    rateiosTodos: arrayRpc_(dados.rateios).map(montarRateioRpc_),
    pagamentosFaturasTodos: arrayRpc_(dados.pagamentos_faturas).map(montarPagamentoFaturaRpc_),
    orcamentosTodos: arrayRpc_(dados.orcamentos).map(montarOrcamentoRpc_),
    recorrenciasTodos: arrayRpc_(dados.recorrencias).map(montarRecorrenciaRpc_),
    recorrenciasRateiosTodos: arrayRpc_(dados.recorrencias_rateios).map(montarRecorrenciaRateioRpc_),
    recorrenciasOcorrenciasTodos: arrayRpc_(dados.recorrencias_ocorrencias).map(montarRecorrenciaOcorrenciaRpc_),
    origem: "RPC"
  };
}


function montarContextoCadastrosAPartirRpc_(dados) {
  const usuarios = arrayRpc_(dados.usuarios).map(montarUsuarioRpc_);
  const categorias = arrayRpc_(dados.categorias).map(montarCategoriaRpc_);
  const contas = montarContasRpc_(arrayRpc_(dados.contas), arrayRpc_(dados.contas_compartilhamentos));
  const gruposCartoes = arrayRpc_(dados.grupos_cartoes).map(montarGrupoCartaoRpc_);
  const cartoes = montarCartoesRpc_(
    arrayRpc_(dados.cartoes),
    gruposCartoes,
    arrayRpc_(dados.cartoes_compartilhados)
  );
  const projetos = montarProjetosRpc_(arrayRpc_(dados.projetos), arrayRpc_(dados.projetos_compartilhamentos));

  return {
    usuariosTodos: usuarios,
    categoriasTodas: categorias,
    contasTodas: contas,
    gruposCartoesTodos: gruposCartoes,
    cartoesTodos: cartoes,
    projetosTodos: projetos,
    lancamentosVinculos: arrayRpc_(dados.lancamentos_vinculos).map(montarLancamentoVinculoRpc_),
    origem: "RPC_CADASTROS"
  };
}


function arrayRpc_(valor) {
  return Array.isArray(valor) ? valor : [];
}


function montarUsuarioRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Usuario: item.id_usuario || "",
    Nome: item.nome || "",
    Email: item.email || "",
    Papel: item.papel || "",
    Preferencia_Tema: item.preferencia_tema || "Claro",
    Ativo: item.ativo === true,
    Senha: item.senha_pin || ""
  };
}


function montarCategoriaRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Categoria: item.id_categoria || "",
    Nome: item.nome || "",
    Tipo: item.tipo || "",
    ID_Categoria_Pai: item.id_categoria_pai || "",
    Global: item.global === true,
    Ativa: item.ativa === true,
    Criado_Por: item.criado_por || ""
  };
}


function montarContasRpc_(contas, compartilhamentos) {
  const mapaCompartilhamentos = {};

  compartilhamentos.forEach(function(item) {
    if (!mapaCompartilhamentos[item.id_conta]) {
      mapaCompartilhamentos[item.id_conta] = [];
    }

    if (item.papel_na_conta !== "Dono") {
      mapaCompartilhamentos[item.id_conta].push(item.id_usuario);
    }
  });

  return contas.map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Conta: item.id_conta || "",
      ID_Usuario: item.id_usuario || "",
      Nome_Conta: item.nome_conta || "",
      Saldo_Inicial: numeroRpc_(item.saldo_inicial),
      Data_Saldo_Inicial: item.saldo_inicial_data || '',
      Versao: item.versao,
      Ativa: item.ativa === true,
      Compartilhada: item.compartilhada === true,
      Usuarios_Compartilhados: (mapaCompartilhamentos[item.id_conta] || []).join(",")
    };
  });
}


function montarGrupoCartaoRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Grupo_Cartao: item.id_grupo_cartao || "",
    ID_Titular: item.id_titular || "",
    Versao: item.versao,
    Nome_Grupo: item.nome_grupo || "",
    Limite: numeroRpc_(item.limite),
    Dia_Fechamento: item.dia_fechamento || "",
    Dia_Vencimento: item.dia_vencimento || "",
    Ativo: item.ativo === true
  };
}


function montarCartoesRpc_(cartoes, gruposCartoes, compartilhamentos) {
  const mapaGrupos = {};
  const mapaCompartilhamentos = {};

  gruposCartoes.forEach(function(grupo) {
    mapaGrupos[grupo.ID_Grupo_Cartao] = grupo;
  });

  compartilhamentos.forEach(function(item) {
    if (!mapaCompartilhamentos[item.id_cartao]) {
      mapaCompartilhamentos[item.id_cartao] = [];
    }

    mapaCompartilhamentos[item.id_cartao].push(item.id_usuario);
  });

  const registros = cartoes.map(function(item, indice) {
    const grupo = mapaGrupos[item.id_grupo_cartao] || {};
    const usuariosCompartilhados = mapaCompartilhamentos[item.id_cartao] || [];

    return {
      _linhaPlanilha: indice + 2,
      ID_Cartao: item.id_cartao || "",
      ID_Grupo_Cartao: item.id_grupo_cartao || "",
      ID_Usuario: item.id_usuario || "",
      Nome_Cartao: item.nome_cartao || "",
      Tipo_Cartao: item.tipo_cartao || "Adicional",
      Ativo: item.ativo === true,
      ID_Titular: grupo.ID_Titular || "",
      Nome_Grupo: grupo.Nome_Grupo || "",
      Limite: grupo.Limite || 0,
      Dia_Fechamento: grupo.Dia_Fechamento || "",
      Dia_Vencimento: grupo.Dia_Vencimento || "",
      Grupo_Ativo: grupo.Ativo === true,
      Compartilhado: usuariosCompartilhados.length > 0,
      Usuarios_Compartilhados: usuariosCompartilhados.join(",")
    };
  });

  return typeof enriquecerCompartilhamentoCartoes_ === "function"
    ? enriquecerCompartilhamentoCartoes_(registros)
    : registros;
}


function montarProjetosRpc_(projetos, compartilhamentos) {
  const mapaCompartilhamentos = {};

  compartilhamentos.forEach(function(item) {
    if (!mapaCompartilhamentos[item.id_projeto]) {
      mapaCompartilhamentos[item.id_projeto] = [];
    }

    if (item.papel_no_projeto !== "Dono") {
      mapaCompartilhamentos[item.id_projeto].push(item.id_usuario);
    }
  });

  return projetos.map(function(item, indice) {
    return {
      _linhaPlanilha: indice + 2,
      ID_Projeto: item.id_projeto || "",
      Nome: item.nome || "",
      Orcamento_Teto: numeroRpc_(item.orcamento_teto),
      Compartilhado: item.compartilhado === true,
      Usuarios_Compartilhados: (mapaCompartilhamentos[item.id_projeto] || []).join(","),
      Status: item.ativo === true,
      Criado_Por: item.criado_por || ""
    };
  });
}


function montarLancamentoRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Lancamento: item.id_lancamento || "",
    Tipo: item.tipo || "",
    Descricao: item.descricao || "",
    Valor_Total: numeroRpc_(item.valor_total),
    Data_Ocorrencia: dataInputRpc_(item.data_ocorrencia),
    Mes_Referencia: mesReferenciaRpc_(item.mes_referencia || item.data_ocorrencia),
    ID_Categoria: item.id_categoria || "",
    Tipo_Origem: item.tipo_origem || "",
    ID_Origem: item.id_origem || "",
    ID_Destino: item.id_destino || "",
    ID_Projeto: item.id_projeto || "",
    Email_Autor: item.email_autor || "",
    Status: item.status || "",
    Criado_Por_ID: item.criado_por_id || "",
    Data_Criacao: item.created_at || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Alteracao: item.updated_at || "",
    ID_Grupo_Parcela: item.id_grupo_parcela || "",
    Numero_Parcela: inteiroRpc_(item.numero_parcela),
    Total_Parcelas: inteiroRpc_(item.total_parcelas),
    ID_Recorrencia_Origem: item.id_recorrencia_origem || "",
    Modo_Recorrencia_Origem: item.modo_recorrencia_origem || "",
    Data_Ocorrencia_Recorrencia: item.data_ocorrencia_recorrencia || ""
  };
}


function montarLancamentoVinculoRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Lancamento: item.id_lancamento || "",
    Tipo: item.tipo || "",
    Tipo_Origem: item.tipo_origem || "",
    ID_Origem: item.id_origem || "",
    ID_Destino: item.id_destino || ""
  };
}


function montarRateioRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Rateio: item.id_rateio || "",
    ID_Lancamento: item.id_lancamento || "",
    ID_Usuario_Responsavel: item.id_usuario_responsavel || "",
    ID_Usuario_Credor: item.id_usuario_credor || "",
    Valor_Rateado: numeroRpc_(item.valor_rateado),
    Percentual: numeroRpc_(item.percentual),
    Status: item.status || "",
    Criado_Por_ID: item.criado_por_id || "",
    Data_Criacao: item.created_at || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Alteracao: item.updated_at || "",
    Observacao: item.observacao || "",
    Modo_Rateio: item.modo_rateio || ""
  };
}


function montarPagamentoFaturaRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Pagamento_Fatura: item.id_pagamento_fatura || "",
    ID_Grupo_Cartao: item.id_grupo_cartao || "",
    ID_Conta: item.id_conta || "",
    Valor: numeroRpc_(item.valor),
    Data_Pagamento: dataInputRpc_(item.data_pagamento),
    Mes_Referencia: mesReferenciaRpc_(item.mes_referencia || item.data_pagamento),
    Status: item.status || "",
    Observacao: item.observacao || "",
    Criado_Por_ID: item.criado_por_id || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || ""
  };
}


function montarOrcamentoRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Orcamento: item.id_orcamento || "",
    ID_Usuario: item.id_usuario || "",
    ID_Categoria: item.id_categoria || "",
    Valor_Teto: numeroRpc_(item.valor_teto),
    Ativo: item.ativo === true,
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || ""
  };
}


function montarRecorrenciaRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Recorrencia: item.id_recorrencia || "",
    ID_Usuario: item.id_usuario || "",
    Descricao: item.descricao || "",
    Tipo: item.tipo || "",
    Valor_Base: numeroRpc_(item.valor_base),
    Data_Inicio: dataInputRpc_(item.data_inicio),
    Periodicidade_Tipo: item.periodicidade_tipo || "",
    Intervalo_Dias: inteiroRpc_(item.intervalo_dias),
    Modo_Geracao: item.modo_geracao || "",
    Status_Recorrencia: item.status_recorrencia || "",
    Tipo_Origem: item.tipo_origem || "",
    ID_Origem: item.id_origem || "",
    ID_Destino: item.id_destino || "",
    ID_Categoria: item.id_categoria || "",
    ID_Projeto: item.id_projeto || "",
    Status_Lancamento: item.status_lancamento || "",
    Observacao: item.observacao || "",
    Info_Bloqueio: item.info_bloqueio || "",
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || "",
    Criado_Por_ID: item.criado_por_id || "",
    Alterado_Por_ID: item.alterado_por_id || ""
  };
}


function montarRecorrenciaRateioRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Recorrencia_Rateio: item.id_recorrencia_rateio || "",
    ID_Recorrencia: item.id_recorrencia || "",
    ID_Usuario_Responsavel: item.id_usuario_responsavel || "",
    Valor_Rateado: numeroRpc_(item.valor_rateado),
    Percentual: numeroRpc_(item.percentual),
    Observacao: item.observacao || "",
    Modo_Rateio: item.modo_rateio || "",
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || "",
    Criado_Por_ID: item.criado_por_id || ""
  };
}


function montarRecorrenciaOcorrenciaRpc_(item, indice) {
  return {
    _linhaPlanilha: indice + 2,
    ID_Recorrencia_Ocorrencia: item.id_recorrencia_ocorrencia || "",
    ID_Recorrencia: item.id_recorrencia || "",
    Data_Ocorrencia: dataInputRpc_(item.data_ocorrencia),
    ID_Lancamento_Gerado: item.id_lancamento_gerado || "",
    Status: item.status || "",
    Observacao: item.observacao || "",
    Criado_Por_ID: item.criado_por_id || "",
    Alterado_Por_ID: item.alterado_por_id || "",
    Data_Criacao: item.created_at || "",
    Data_Alteracao: item.updated_at || ""
  };
}


function numeroRpc_(valor) {
  const numero = parseFloat(valor);
  return isNaN(numero) ? 0 : numero;
}


function inteiroRpc_(valor) {
  const numero = parseInt(valor, 10);
  return isNaN(numero) ? "" : numero;
}


function dataInputRpc_(valor) {
  if (!valor) return "";
  return valor.toString().slice(0, 10);
}


function mesReferenciaRpc_(valor) {
  if (!valor) return "";
  return valor.toString().slice(0, 7);
}
