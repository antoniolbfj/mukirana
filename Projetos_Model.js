/**
 * Módulo: Projetos_Model.gs
 * Responsabilidade: Interação direta com a aba PROJETOS no banco de dados.
 * Padronização: Colunas de usuário (Criado_Por e Usuarios_Compartilhados) baseadas em ID_Usuario (UUID).
 */

function listarProjetosModel() {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return listarProjetosSupabaseModel_();
  }

  let banco = conectarBanco();
  let aba = banco.getSheetByName('PROJETOS');
  if (!aba) throw new Error("Aba PROJETOS não encontrada na planilha.");

  let dados = aba.getDataRange().getValues();
  let registros = [];

  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    if (linha[0] === "") continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Projeto: linha[0],                                                     
      Nome: linha[1],                                                           
      Orcamento_Teto: linha[2],                                                 
      Compartilhado: (linha[3] === true || linha[3] === "true" || linha[3] === 1),  
      Usuarios_Compartilhados: linha[4] ? linha[4].toString() : "", // Agora retorna string de UUIDs         
      Status: (linha[5] === true || linha[5] === "true" || linha[5] === 1),         
      Criado_Por: linha[6] || "" // Retorna UUID do criador                                                  
    });
  }
  return registros;
}

function salvarProjetoModel(projeto) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return salvarProjetoSupabaseModel_(projeto);
  }

  let banco = conectarBanco();
  let aba = banco.getSheetByName('PROJETOS');

  let dadosVetor = [
    projeto.ID_Projeto,
    projeto.Nome,
    projeto.Orcamento_Teto,
    projeto.Compartilhado,
    projeto.Usuarios_Compartilhados, // Grava os UUIDs separados por vírgula
    projeto.Status,
    projeto.Criado_Por // Grava o UUID
  ];

  if (projeto._linhaPlanilha) {
    aba.getRange(projeto._linhaPlanilha, 1, 1, 7).setValues([dadosVetor]);
  } else {
    aba.appendRow(dadosVetor);
  }
  return projeto.ID_Projeto;
}

function alterarStatusProjetoModel(linhaPlanilha, novoStatus) {
  if (typeof bancoUsaSupabase === "function" && bancoUsaSupabase()) {
    return alterarStatusProjetoSupabaseModel_(linhaPlanilha, novoStatus);
  }

  let banco = conectarBanco();
  let aba = banco.getSheetByName('PROJETOS');
  aba.getRange(linhaPlanilha, 6).setValue(novoStatus);
}


function listarProjetosSupabaseModel_() {
  const projetos = supabaseSelecionar(
    "projetos",
    "select=id_projeto,nome,orcamento_teto,compartilhado,ativo,criado_por&order=nome.asc"
  );
  const compartilhamentos = supabaseSelecionar(
    "projetos_compartilhamentos",
    "select=id_projeto,id_usuario,ativo,papel_no_projeto&ativo=eq.true"
  );
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
      Orcamento_Teto: item.orcamento_teto || 0,
      Compartilhado: item.compartilhado === true,
      Usuarios_Compartilhados: (mapaCompartilhamentos[item.id_projeto] || []).join(","),
      Status: item.ativo === true,
      Criado_Por: item.criado_por || ""
    };
  });
}


function salvarProjetoSupabaseModel_(projeto) {
  const idProjeto = projeto.ID_Projeto || Utilities.getUuid();
  const compartilhado = projeto.Compartilhado === true;
  const usuariosCompartilhados = compartilhado ? (projeto.Usuarios_Compartilhados || "") : "";

  supabaseInserir("projetos", {
    id_projeto: idProjeto,
    nome: projeto.Nome,
    orcamento_teto: projeto.Orcamento_Teto || 0,
    compartilhado: compartilhado,
    ativo: projeto.Status === true,
    criado_por: projeto.Criado_Por,
    updated_at: new Date().toISOString()
  }, "resolution=merge-duplicates,return=representation");

  sincronizarCompartilhamentosProjetoSupabase_(idProjeto, projeto.Criado_Por, usuariosCompartilhados);

  return idProjeto;
}


function alterarStatusProjetoSupabaseModel_(linhaOuIdProjeto, novoStatus) {
  const idProjeto = obterIdProjetoParaAlteracaoSupabase_(linhaOuIdProjeto);

  if (!idProjeto) {
    throw new Error("Projeto nao encontrado para alteracao de status no Supabase.");
  }

  supabaseAtualizar(
    "projetos",
    "id_projeto=eq." + encodeURIComponent(idProjeto),
    {
      ativo: novoStatus === true,
      updated_at: new Date().toISOString()
    }
  );
}


function sincronizarCompartilhamentosProjetoSupabase_(idProjeto, idDono, usuariosCompartilhados) {
  const ids = normalizarListaIdsProjetoSupabase_([idDono, usuariosCompartilhados].join(","));

  supabaseAtualizar(
    "projetos_compartilhamentos",
    "id_projeto=eq." + encodeURIComponent(idProjeto),
    {
      ativo: false,
      updated_at: new Date().toISOString()
    }
  );

  const registros = ids.map(function(idUsuario) {
    return {
      id_compartilhamento: gerarUuidDeterministicoSupabase_("projeto", idProjeto, idUsuario),
      id_projeto: idProjeto,
      id_usuario: idUsuario,
      ativo: true,
      papel_no_projeto: idUsuario === idDono ? "Dono" : "Participante",
      updated_at: new Date().toISOString()
    };
  });

  if (registros.length > 0) {
    supabaseInserir("projetos_compartilhamentos", registros, "resolution=merge-duplicates,return=representation");
  }
}


function obterIdProjetoParaAlteracaoSupabase_(linhaOuIdProjeto) {
  const texto = linhaOuIdProjeto === null || linhaOuIdProjeto === undefined ? "" : linhaOuIdProjeto.toString().trim();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const projeto = listarProjetosSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return projeto ? projeto.ID_Projeto : "";
}


function normalizarListaIdsProjetoSupabase_(valor) {
  const usados = {};

  return (valor || "")
    .toString()
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
