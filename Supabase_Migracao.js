/**
 * Modulo: Supabase_Migracao.gs
 * Responsabilidade:
 * - Oferecer rotinas server-side para diagnosticar a integracao com Supabase.
 * - Comparar contagens entre planilha e Supabase durante a transicao.
 * - Evitar troca definitiva de banco antes de validacao funcional.
 */

const SUPABASE_TABELAS_DIAGNOSTICO = [
  { planilha: "USUARIOS", supabase: "usuarios" },
  { planilha: "CATEGORIAS", supabase: "categorias" },
  { planilha: "CONTAS", supabase: "contas" },
  { planilha: "GRUPOS_CARTOES", supabase: "grupos_cartoes" },
  { planilha: "CARTOES", supabase: "cartoes" },
  { planilha: "PROJETOS", supabase: "projetos" },
  { planilha: "LANCAMENTOS", supabase: "lancamentos" },
  { planilha: "RATEIOS", supabase: "rateios" },
  { planilha: "ORCAMENTOS", supabase: "orcamentos" },
  { planilha: "RECORRENCIAS", supabase: "recorrencias" }
];


function sincronizarPlanilhaAtualParaSupabase_() {
  if (typeof supabaseEstaConfigurado_ !== "function" || !supabaseEstaConfigurado_()) {
    throw new Error("Supabase nao configurado. Configure URL e service key antes de sincronizar.");
  }

  const resultado = {
    usuarios: sincronizarUsuariosPlanilhaParaSupabase_(),
    categorias: sincronizarCategoriasPlanilhaParaSupabase_(),
    contas: sincronizarContasPlanilhaParaSupabase_(),
    gruposCartoes: sincronizarGruposCartoesPlanilhaParaSupabase_(),
    cartoes: sincronizarCartoesPlanilhaParaSupabase_(),
    projetos: sincronizarProjetosPlanilhaParaSupabase_(),
    recorrencias: sincronizarRecorrenciasPlanilhaParaSupabase_(),
    recorrenciasRateios: sincronizarRecorrenciasRateiosPlanilhaParaSupabase_(),
    lancamentos: sincronizarLancamentosPlanilhaParaSupabase_(),
    rateios: sincronizarRateiosPlanilhaParaSupabase_(),
    orcamentos: sincronizarOrcamentosPlanilhaParaSupabase_()
  };

  Logger.log(JSON.stringify(resultado, null, 2));

  return resultado;
}


function sincronizarUsuariosPlanilhaParaSupabase_() {
  const linhas = lerTabelaPlanilhaMigracao_("USUARIOS");
  const registros = linhas.map(function(item) {
    return {
      id_usuario: textoMigracao_(item.ID_Usuario),
      nome: textoMigracao_(item.Nome),
      email: textoMigracao_(item.Email),
      papel: textoMigracao_(item.Papel) || "Usuário",
      preferencia_tema: textoMigracao_(item.Preferencia_Tema) || "Claro",
      ativo: booleanoMigracao_(item.Ativo),
      senha_pin: textoMigracao_(item.Senha)
    };
  }).filter(function(item) {
    return item.id_usuario;
  });

  inserirSupabaseEmBlocos_("usuarios", registros);
  return registros.length;
}


function sincronizarCategoriasPlanilhaParaSupabase_() {
  const linhas = lerTabelaPlanilhaMigracao_("CATEGORIAS")
    .sort(function(a, b) {
      return textoMigracao_(a.ID_Categoria_Pai) ? 1 : textoMigracao_(b.ID_Categoria_Pai) ? -1 : 0;
    });
  const registros = linhas.map(function(item) {
    return {
      id_categoria: textoMigracao_(item.ID_Categoria),
      nome: textoMigracao_(item.Nome),
      tipo: textoMigracao_(item.Tipo),
      id_categoria_pai: textoMigracao_(item.ID_Categoria_Pai) || null,
      global: booleanoMigracao_(item.Global),
      ativa: booleanoMigracao_(item.Ativa),
      criado_por: textoMigracao_(item.Criado_Por) || null,
      updated_at: new Date().toISOString()
    };
  }).filter(function(item) {
    return item.id_categoria;
  });

  inserirSupabaseEmBlocos_("categorias", registros);
  return registros.length;
}


function sincronizarContasPlanilhaParaSupabase_() {
  const linhas = lerTabelaPlanilhaMigracao_("CONTAS");
  const contas = [];
  const compartilhamentos = [];

  linhas.forEach(function(item) {
    const idConta = textoMigracao_(item.ID_Conta);
    const idDono = textoMigracao_(item.ID_Usuario);
    const usuariosCompartilhados = listaIdsMigracao_(item.Usuarios_Compartilhados);

    if (!idConta) return;

    contas.push({
      id_conta: idConta,
      id_usuario: idDono,
      nome_conta: textoMigracao_(item.Nome_Conta),
      saldo_inicial: numeroMigracao_(item.Saldo_Inicial),
      ativa: booleanoMigracao_(item.Ativa),
      compartilhada: booleanoMigracao_(item.Compartilhada),
      updated_at: new Date().toISOString()
    });

    [idDono].concat(usuariosCompartilhados).filter(Boolean).forEach(function(idUsuario) {
      compartilhamentos.push({
        id_compartilhamento: gerarUuidDeterministicoSupabase_("conta", idConta, idUsuario),
        id_conta: idConta,
        id_usuario: idUsuario,
        ativo: true,
        papel_na_conta: idUsuario === idDono ? "Dono" : "Participante",
        updated_at: new Date().toISOString()
      });
    });
  });

  inserirSupabaseEmBlocos_("contas", contas);
  inserirSupabaseEmBlocosComConflito_(
    "contas_compartilhamentos",
    compartilhamentos,
    "id_conta,id_usuario"
  );

  return {
    contas: contas.length,
    compartilhamentos: compartilhamentos.length
  };
}


function sincronizarGruposCartoesPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("GRUPOS_CARTOES").map(function(item) {
    return {
      id_grupo_cartao: textoMigracao_(item.ID_Grupo_Cartao),
      id_titular: textoMigracao_(item.ID_Titular),
      nome_grupo: textoMigracao_(item.Nome_Grupo),
      limite: numeroMigracao_(item.Limite),
      dia_fechamento: inteiroMigracao_(item.Dia_Fechamento),
      dia_vencimento: inteiroMigracao_(item.Dia_Vencimento),
      ativo: booleanoMigracao_(item.Ativo),
      updated_at: new Date().toISOString()
    };
  }).filter(function(item) {
    return item.id_grupo_cartao;
  });

  inserirSupabaseEmBlocos_("grupos_cartoes", registros);
  return registros.length;
}


function sincronizarCartoesPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("CARTOES").map(function(item) {
    const registro = {
      id_cartao: textoMigracao_(item.ID_Cartao),
      id_grupo_cartao: textoMigracao_(item.ID_Grupo_Cartao),
      id_usuario: textoMigracao_(item.ID_Usuario),
      nome_cartao: textoMigracao_(item.Nome_Cartao),
      tipo_cartao: textoMigracao_(item.Tipo_Cartao) || "Adicional",
      ativo: booleanoMigracao_(item.Ativo),
      updated_at: new Date().toISOString()
    };

    validarRegistroCartaoMigracao_(registro, item);
    return registro;
  }).filter(function(item) {
    return item.id_cartao;
  });

  inserirSupabaseEmBlocos_("cartoes", registros);
  return registros.length;
}


function sincronizarProjetosPlanilhaParaSupabase_() {
  const linhas = lerTabelaPlanilhaMigracao_("PROJETOS");
  const projetos = [];
  const compartilhamentos = [];

  linhas.forEach(function(item) {
    const idProjeto = textoMigracao_(item.ID_Projeto);
    const idDono = textoMigracao_(item.Criado_Por);
    const usuariosCompartilhados = listaIdsMigracao_(item.Usuarios_Compartilhados);

    if (!idProjeto) return;

    projetos.push({
      id_projeto: idProjeto,
      nome: textoMigracao_(item.Nome),
      orcamento_teto: numeroMigracao_(item.Orcamento_Teto),
      compartilhado: booleanoMigracao_(item.Compartilhado),
      ativo: booleanoMigracao_(item.Status),
      criado_por: idDono,
      updated_at: new Date().toISOString()
    });

    [idDono].concat(usuariosCompartilhados).filter(Boolean).forEach(function(idUsuario) {
      compartilhamentos.push({
        id_compartilhamento: gerarUuidDeterministicoSupabase_("projeto", idProjeto, idUsuario),
        id_projeto: idProjeto,
        id_usuario: idUsuario,
        ativo: true,
        papel_no_projeto: idUsuario === idDono ? "Dono" : "Participante",
        updated_at: new Date().toISOString()
      });
    });
  });

  inserirSupabaseEmBlocos_("projetos", projetos);
  inserirSupabaseEmBlocosComConflito_(
    "projetos_compartilhamentos",
    compartilhamentos,
    "id_projeto,id_usuario"
  );

  return {
    projetos: projetos.length,
    compartilhamentos: compartilhamentos.length
  };
}


function sincronizarLancamentosPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("LANCAMENTOS").map(function(item) {
    return {
      id_lancamento: textoMigracao_(item.ID_Lancamento),
      tipo: textoMigracao_(item.Tipo),
      descricao: textoMigracao_(item.Descricao),
      valor_total: numeroMigracao_(item.Valor_Total),
      data_ocorrencia: converterDataSupabase_(item.Data_Ocorrencia),
      mes_referencia: converterDataSupabase_(item.Mes_Referencia || item.Data_Ocorrencia),
      id_categoria: textoMigracao_(item.ID_Categoria) || null,
      tipo_origem: textoMigracao_(item.Tipo_Origem),
      id_origem: textoMigracao_(item.ID_Origem),
      id_destino: textoMigracao_(item.ID_Destino) || null,
      id_projeto: textoMigracao_(item.ID_Projeto) || null,
      email_autor: textoMigracao_(item.Email_Autor) || null,
      status: textoMigracao_(item.Status),
      criado_por_id: textoMigracao_(item.Criado_Por_ID),
      alterado_por_id: textoMigracao_(item.Alterado_Por_ID) || null,
      id_grupo_parcela: textoMigracao_(item.ID_Grupo_Parcela) || null,
      numero_parcela: inteiroMigracao_(item.Numero_Parcela) || null,
      total_parcelas: inteiroMigracao_(item.Total_Parcelas) || null,
      id_recorrencia_origem: textoMigracao_(item.ID_Recorrencia_Origem) || null,
      modo_recorrencia_origem: textoMigracao_(item.Modo_Recorrencia_Origem) || null,
      data_ocorrencia_recorrencia: converterDataSupabase_(item.Data_Ocorrencia_Recorrencia),
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao)
    };
  }).filter(function(item) {
    return item.id_lancamento;
  });

  inserirSupabaseEmBlocos_("lancamentos", registros);
  return registros.length;
}


function sincronizarRateiosPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("RATEIOS").map(function(item) {
    return {
      id_rateio: textoMigracao_(item.ID_Rateio),
      id_lancamento: textoMigracao_(item.ID_Lancamento),
      id_usuario_responsavel: textoMigracao_(item.ID_Usuario_Responsavel),
      id_usuario_credor: textoMigracao_(item.ID_Usuario_Credor),
      valor_rateado: numeroMigracao_(item.Valor_Rateado),
      percentual: numeroMigracao_(item.Percentual),
      status: textoMigracao_(item.Status),
      criado_por_id: textoMigracao_(item.Criado_Por_ID),
      alterado_por_id: textoMigracao_(item.Alterado_Por_ID) || null,
      observacao: textoMigracao_(item.Observacao) || null,
      modo_rateio: textoMigracao_(item.Modo_Rateio) || null,
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao)
    };
  }).filter(function(item) {
    return item.id_rateio;
  });

  inserirSupabaseEmBlocos_("rateios", registros);
  return registros.length;
}


function sincronizarOrcamentosPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("ORCAMENTOS").map(function(item) {
    return {
      id_orcamento: textoMigracao_(item.ID_Orcamento),
      id_usuario: textoMigracao_(item.ID_Usuario),
      id_categoria: textoMigracao_(item.ID_Categoria),
      valor_teto: numeroMigracao_(item.Valor_Teto),
      ativo: booleanoMigracao_(item.Ativo),
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao)
    };
  }).filter(function(item) {
    return item.id_orcamento;
  });

  inserirSupabaseEmBlocosComConflito_(
    "orcamentos",
    registros,
    "id_usuario,id_categoria"
  );
  return registros.length;
}


function sincronizarRecorrenciasPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("RECORRENCIAS").map(function(item) {
    return {
      id_recorrencia: textoMigracao_(item.ID_Recorrencia),
      id_usuario: textoMigracao_(item.ID_Usuario),
      descricao: textoMigracao_(item.Descricao),
      tipo: textoMigracao_(item.Tipo),
      valor_base: numeroMigracao_(item.Valor_Base),
      data_inicio: converterDataSupabase_(item.Data_Inicio),
      periodicidade_tipo: textoMigracao_(item.Periodicidade_Tipo),
      intervalo_dias: inteiroMigracao_(item.Intervalo_Dias) || null,
      modo_geracao: textoMigracao_(item.Modo_Geracao),
      status_recorrencia: textoMigracao_(item.Status_Recorrencia),
      tipo_origem: textoMigracao_(item.Tipo_Origem),
      id_origem: textoMigracao_(item.ID_Origem),
      id_destino: textoMigracao_(item.ID_Destino) || null,
      id_categoria: textoMigracao_(item.ID_Categoria) || null,
      id_projeto: textoMigracao_(item.ID_Projeto) || null,
      status_lancamento: textoMigracao_(item.Status_Lancamento) || "Pendente",
      observacao: textoMigracao_(item.Observacao) || null,
      info_bloqueio: textoMigracao_(item.Info_Bloqueio) || null,
      criado_por_id: textoMigracao_(item.Criado_Por_ID),
      alterado_por_id: textoMigracao_(item.Alterado_Por_ID) || null,
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao)
    };
  }).filter(function(item) {
    return item.id_recorrencia;
  });

  inserirSupabaseEmBlocos_("recorrencias", registros);
  return registros.length;
}


function sincronizarRecorrenciasRateiosPlanilhaParaSupabase_() {
  const registros = lerTabelaPlanilhaMigracao_("RECORRENCIAS_RATEIOS").map(function(item) {
    return {
      id_recorrencia_rateio: textoMigracao_(item.ID_Recorrencia_Rateio),
      id_recorrencia: textoMigracao_(item.ID_Recorrencia),
      id_usuario_responsavel: textoMigracao_(item.ID_Usuario_Responsavel),
      valor_rateado: numeroMigracao_(item.Valor_Rateado),
      percentual: numeroMigracao_(item.Percentual),
      observacao: textoMigracao_(item.Observacao) || null,
      modo_rateio: textoMigracao_(item.Modo_Rateio) || null,
      created_at: converterDataHoraSupabase_(item.Data_Criacao) || new Date().toISOString(),
      updated_at: converterDataHoraSupabase_(item.Data_Alteracao),
      criado_por_id: textoMigracao_(item.Criado_Por_ID)
    };
  }).filter(function(item) {
    return item.id_recorrencia_rateio;
  });

  inserirSupabaseEmBlocos_("recorrencias_rateios", registros);
  return registros.length;
}


function inserirSupabaseEmBlocos_(nomeTabela, registros) {
  const lista = registros || [];
  const tamanhoBloco = 200;

  if (lista.length === 0) {
    return;
  }

  for (let i = 0; i < lista.length; i += tamanhoBloco) {
    supabaseInserir_(
      nomeTabela,
      lista.slice(i, i + tamanhoBloco),
      "resolution=merge-duplicates,return=minimal"
    );
  }
}


function inserirSupabaseEmBlocosComConflito_(nomeTabela, registros, colunasConflito) {
  const lista = registros || [];
  const tamanhoBloco = 200;

  if (lista.length === 0) {
    return;
  }

  for (let i = 0; i < lista.length; i += tamanhoBloco) {
    supabaseInserirComConflito_(
      nomeTabela,
      lista.slice(i, i + tamanhoBloco),
      colunasConflito,
      "resolution=merge-duplicates,return=minimal"
    );
  }
}


function lerTabelaPlanilhaMigracao_(nomeTabela) {
  const banco = conectarBanco_();
  const aba = banco.getSheetByName(nomeTabela);

  if (!aba || aba.getLastRow() <= 1) {
    return [];
  }

  const dados = aba.getRange(1, 1, aba.getLastRow(), aba.getLastColumn()).getValues();
  const cabecalhos = dados[0].map(function(cabecalho) {
    return textoMigracao_(cabecalho);
  });

  return dados.slice(1).map(function(linha, indiceLinha) {
    const registro = {};

    cabecalhos.forEach(function(cabecalho, indice) {
      if (cabecalho) {
        registro[cabecalho] = linha[indice];
      }
    });

    registro.__linhaPlanilha = indiceLinha + 2;
    registro.__abaPlanilha = nomeTabela;
    registro.__cabecalhosPlanilha = cabecalhos.filter(Boolean).join(", ");

    return registro;
  }).filter(function(registro) {
    return Object.keys(registro).some(function(chave) {
      if (chave.indexOf("__") === 0) return false;
      return registro[chave] !== "" && registro[chave] !== null && registro[chave] !== undefined;
    });
  });
}


function validarRegistroCartaoMigracao_(registro, linhaOriginal) {
  if (!registro.id_cartao) {
    return;
  }

  validarUuidMigracao_("CARTOES", linhaOriginal, "ID_Cartao", registro.id_cartao);
  validarUuidMigracao_("CARTOES", linhaOriginal, "ID_Grupo_Cartao", registro.id_grupo_cartao);
  validarUuidMigracao_("CARTOES", linhaOriginal, "ID_Usuario", registro.id_usuario);

  if (!registro.nome_cartao) {
    throw new Error(montarErroMigracao_(
      "CARTOES",
      linhaOriginal,
      "Nome_Cartao",
      registro.nome_cartao,
      "O nome do cartao e obrigatorio para sincronizar com o Supabase."
    ));
  }
}


function validarUuidMigracao_(nomeTabela, linhaOriginal, nomeCampo, valor) {
  const texto = textoMigracao_(valor);

  if (uuidValidoMigracao_(texto)) {
    return;
  }

  throw new Error(montarErroMigracao_(
    nomeTabela,
    linhaOriginal,
    nomeCampo,
    texto,
    "O Supabase espera um UUID nesse campo. Verifique se a estrutura da aba esta alinhada com o cabecalho."
  ));
}


function uuidValidoMigracao_(valor) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(textoMigracao_(valor));
}


function montarErroMigracao_(nomeTabela, linhaOriginal, nomeCampo, valor, orientacao) {
  const linha = linhaOriginal && linhaOriginal.__linhaPlanilha ? linhaOriginal.__linhaPlanilha : "desconhecida";
  const cabecalhos = linhaOriginal && linhaOriginal.__cabecalhosPlanilha
    ? linhaOriginal.__cabecalhosPlanilha
    : "nao foi possivel ler os cabecalhos";

  return [
    "Falha na migracao da aba " + nomeTabela + ", linha " + linha + ".",
    "Campo: " + nomeCampo + ".",
    "Valor recebido: " + (valor || "[vazio]") + ".",
    orientacao,
    "Cabecalhos lidos: " + cabecalhos + "."
  ].join(" ");
}


function textoMigracao_(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return valor.toString().trim();
}


function numeroMigracao_(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return 0;
  }

  if (typeof valor === "number") {
    return valor;
  }

  let texto = valor.toString().trim();

  if (texto.indexOf(",") !== -1) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = parseFloat(texto);
  return isNaN(numero) ? 0 : numero;
}


function inteiroMigracao_(valor) {
  const numero = parseInt(valor, 10);
  return isNaN(numero) ? 0 : numero;
}


function booleanoMigracao_(valor) {
  return valor === true || valor === 1 || valor === "1" || valor === "true" || valor === "True";
}


function listaIdsMigracao_(valor) {
  const usados = {};

  return textoMigracao_(valor)
    .split(",")
    .map(function(item) {
      return item.trim();
    })
    .filter(function(id) {
      if (!id || usados[id]) return false;
      usados[id] = true;
      return true;
    });
}
