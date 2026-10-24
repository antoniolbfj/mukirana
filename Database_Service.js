/**
 * Modulo: Database_Service.gs
 * Responsabilidade:
 * - Controlar a fonte de dados ativa do Mukirana.
 * - Permitir migracao gradual entre planilha e Supabase.
 * - Evitar que os Models precisem conhecer detalhes de configuracao global.
 *
 * Propriedade esperada:
 * - MUKIRANA_DATA_SOURCE: PLANILHA ou SUPABASE.
 */

const DATABASE_SERVICE_KEYS = {
  DATA_SOURCE: "MUKIRANA_DATA_SOURCE"
};

const DATABASE_SOURCES = {
  PLANILHA: "PLANILHA",
  SUPABASE: "SUPABASE"
};


function obterFonteDadosMukirana() {
  const props = PropertiesService.getScriptProperties();
  const valor = normalizarTextoDatabaseService_(props.getProperty(DATABASE_SERVICE_KEYS.DATA_SOURCE)).toUpperCase();

  if (valor === DATABASE_SOURCES.SUPABASE) {
    return DATABASE_SOURCES.SUPABASE;
  }

  return DATABASE_SOURCES.PLANILHA;
}


function definirFonteDadosMukirana(fonte) {
  const fonteNormalizada = normalizarTextoDatabaseService_(fonte).toUpperCase();

  if (fonteNormalizada !== DATABASE_SOURCES.PLANILHA && fonteNormalizada !== DATABASE_SOURCES.SUPABASE) {
    throw new Error("Fonte de dados invalida. Use PLANILHA ou SUPABASE.");
  }

  PropertiesService.getScriptProperties().setProperty(DATABASE_SERVICE_KEYS.DATA_SOURCE, fonteNormalizada);

  return {
    ok: true,
    fonte: fonteNormalizada,
    mensagem: "Fonte de dados do Mukirana atualizada para " + fonteNormalizada + "."
  };
}


function bancoUsaSupabase() {
  return obterFonteDadosMukirana() === DATABASE_SOURCES.SUPABASE;
}


function bancoUsaPlanilha() {
  return obterFonteDadosMukirana() === DATABASE_SOURCES.PLANILHA;
}


function consultarTabelaDatabaseService(nomeTabela, consultaSupabase) {
  if (bancoUsaSupabase()) {
    const tabelaSupabase = obterNomeTabelaSupabase_(nomeTabela);
    return supabaseSelecionar(tabelaSupabase, consultaSupabase || "select=*");
  }

  return consultarTabela(nomeTabela);
}


function obterNomeTabelaSupabase_(nomeTabelaPlanilha) {
  const mapa = {
    USUARIOS: "usuarios",
    CATEGORIAS: "categorias",
    CONTAS: "contas",
    CARTOES: "cartoes",
    GRUPOS_CARTOES: "grupos_cartoes",
    CARTOES_COMPARTILHADOS: "cartoes_compartilhados",
    PROJETOS: "projetos",
    LANCAMENTOS: "lancamentos",
    RATEIOS: "rateios",
    PAGAMENTOS_FATURAS: "pagamentos_faturas",
    ORCAMENTOS: "orcamentos",
    RECORRENCIAS: "recorrencias",
    RECORRENCIAS_RATEIOS: "recorrencias_rateios"
  };

  const chave = normalizarTextoDatabaseService_(nomeTabelaPlanilha).toUpperCase();
  const tabela = mapa[chave];

  if (!tabela) {
    throw new Error("Tabela sem mapeamento para Supabase: " + nomeTabelaPlanilha);
  }

  return tabela;
}


function obterStatusBancoMukirana() {
  const fonte = obterFonteDadosMukirana();
  const supabaseConfigurado = typeof supabaseEstaConfigurado === "function" && supabaseEstaConfigurado();

  const status = {
    fonte: fonte,
    supabaseConfigurado: supabaseConfigurado,
    mensagem: fonte === DATABASE_SOURCES.SUPABASE
      ? "Mukirana configurado para usar Supabase."
      : "Mukirana configurado para usar planilha."
  };

  Logger.log(JSON.stringify(status, null, 2));

  return status;
}


function ativarSupabaseMukiranaSePronto() {
  if (typeof supabaseEstaConfigurado !== "function" || !supabaseEstaConfigurado()) {
    throw new Error("Supabase nao configurado. Configure URL e service key antes de ativar.");
  }

  const teste = testarConexaoSupabase();

  if (!teste || teste.ok !== true) {
    throw new Error("Nao foi possivel validar a conexao com Supabase antes da ativacao.");
  }

  return definirFonteDadosMukirana(DATABASE_SOURCES.SUPABASE);
}


function voltarMukiranaParaPlanilha() {
  return definirFonteDadosMukirana(DATABASE_SOURCES.PLANILHA);
}


function normalizarTextoDatabaseService_(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return valor.toString().trim();
}
