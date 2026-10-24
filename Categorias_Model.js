/**
 * Módulo: Categorias_Model.gs
 * Responsabilidade: Interação com a aba CATEGORIAS.
 * Padronização: A coluna Criado_Por agora armazena o ID_Usuario (UUID).
 */

function listarCategoriasModel_() {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return listarCategoriasSupabaseModel_();
  }

  let banco = conectarBanco_();
  let aba = banco.getSheetByName('CATEGORIAS');
  if (!aba) throw new Error("Aba CATEGORIAS não encontrada na planilha.");

  let dados = aba.getDataRange().getValues();
  let registros = [];

  for (let i = 1; i < dados.length; i++) {
    let linha = dados[i];
    if (linha[0] === "") continue;

    registros.push({
      _linhaPlanilha: i + 1,
      ID_Categoria: linha[0],
      Nome: linha[1],
      Tipo: linha[2],
      ID_Categoria_Pai: linha[3],
      Global: (linha[4] === true || linha[4] === "true" || linha[4] === 1),
      Ativa: (linha[5] === true || linha[5] === "true" || linha[5] === 1),
      Criado_Por: linha[6] || "" // Agora retorna o UUID do criador
    });
  }
  return registros;
}

function salvarCategoriaModel_(categoria) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return salvarCategoriaSupabaseModel_(categoria);
  }

  let banco = conectarBanco_();
  let aba = banco.getSheetByName('CATEGORIAS');

  let dadosVetor = [
    categoria.ID_Categoria,
    categoria.Nome,
    categoria.Tipo,
    categoria.ID_Categoria_Pai,
    categoria.Global,
    categoria.Ativa,
    categoria.Criado_Por // Grava o UUID do criador
  ];

  if (categoria._linhaPlanilha) {
    aba.getRange(categoria._linhaPlanilha, 1, 1, 7).setValues([dadosVetor]);
  } else {
    aba.appendRow(dadosVetor);
  }
  return categoria.ID_Categoria;
}

function alterarStatusCategoriaModel_(linhaPlanilha, novoStatus) {
  if (typeof bancoUsaSupabase_ === "function" && bancoUsaSupabase_()) {
    return alterarStatusCategoriaSupabaseModel_(linhaPlanilha, novoStatus);
  }

  let banco = conectarBanco_();
  let aba = banco.getSheetByName('CATEGORIAS');
  aba.getRange(linhaPlanilha, 6).setValue(novoStatus);
}


function listarCategoriasSupabaseModel_() {
  return supabaseSelecionar_(
    "categorias",
    "select=id_categoria,nome,tipo,id_categoria_pai,global,ativa,criado_por&order=nome.asc"
  ).map(function(item, indice) {
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
  });
}


function salvarCategoriaSupabaseModel_(categoria) {
  const idCategoria = categoria.ID_Categoria || Utilities.getUuid();
  const registro = {
    id_categoria: idCategoria,
    nome: categoria.Nome,
    tipo: categoria.Tipo,
    id_categoria_pai: categoria.ID_Categoria_Pai || null,
    global: categoria.Global === true,
    ativa: categoria.Ativa === true,
    criado_por: categoria.Criado_Por || null,
    updated_at: new Date().toISOString()
  };

  supabaseInserir_("categorias", registro, "resolution=merge-duplicates,return=representation");

  return idCategoria;
}


function alterarStatusCategoriaSupabaseModel_(linhaOuIdCategoria, novoStatus) {
  const idCategoria = obterIdCategoriaParaAlteracaoSupabase_(linhaOuIdCategoria);

  if (!idCategoria) {
    throw new Error("Categoria nao encontrada para alteracao de status no Supabase.");
  }

  supabaseAtualizar_(
    "categorias",
    "id_categoria=eq." + encodeURIComponent(idCategoria),
    {
      ativa: novoStatus === true,
      updated_at: new Date().toISOString()
    }
  );
}


function obterIdCategoriaParaAlteracaoSupabase_(linhaOuIdCategoria) {
  const texto = linhaOuIdCategoria === null || linhaOuIdCategoria === undefined ? "" : linhaOuIdCategoria.toString().trim();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) {
    return texto;
  }

  const linha = parseInt(texto, 10);

  if (isNaN(linha) || linha <= 1) {
    return "";
  }

  const categoria = listarCategoriasSupabaseModel_().find(function(item) {
    return item._linhaPlanilha === linha;
  });

  return categoria ? categoria.ID_Categoria : "";
}
