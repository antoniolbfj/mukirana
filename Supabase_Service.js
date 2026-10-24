/**
 * Modulo: Supabase_Service.gs
 * Responsabilidade:
 * - Centralizar a comunicacao server-side entre o Apps Script e o Supabase.
 * - Manter URL e chaves fora do HTML e fora do codigo versionado.
 * - Fornecer operacoes REST reutilizaveis para os Models durante a migracao.
 *
 * Propriedades esperadas em PropertiesService.getScriptProperties():
 * - MUKIRANA_SUPABASE_URL: URL do projeto, ex: https://xxxx.supabase.co
 * - MUKIRANA_SUPABASE_SERVICE_KEY: chave server-side do Supabase.
 *
 * Observacao de seguranca:
 * Esta chave nunca deve ser enviada ao front-end. Use apenas em arquivos .gs.
 */

const SUPABASE_CONFIG_KEYS = {
  URL: "MUKIRANA_SUPABASE_URL",
  SERVICE_KEY: "MUKIRANA_SUPABASE_SERVICE_KEY"
};


function supabaseEstaConfigurado() {
  const props = PropertiesService.getScriptProperties();
  return Boolean(
    supabaseNormalizarTexto_(props.getProperty(SUPABASE_CONFIG_KEYS.URL)) &&
    supabaseNormalizarTexto_(props.getProperty(SUPABASE_CONFIG_KEYS.SERVICE_KEY))
  );
}


function configurarSupabaseMukirana(urlProjeto, serviceKey) {
  const url = normalizarUrlProjetoSupabase_(urlProjeto);
  const chave = supabaseNormalizarTexto_(serviceKey);

  if (!url || !/^https:\/\/.+\.supabase\.co$/i.test(url)) {
    throw new Error("URL do Supabase invalida. Informe algo como https://xxxx.supabase.co.");
  }

  if (!chave) {
    throw new Error("Chave server-side do Supabase nao informada.");
  }

  PropertiesService.getScriptProperties().setProperties(
    {
      [SUPABASE_CONFIG_KEYS.URL]: url,
      [SUPABASE_CONFIG_KEYS.SERVICE_KEY]: chave
    },
    false
  );

  return {
    ok: true,
    mensagem: "Credenciais do Supabase configuradas no PropertiesService."
  };
}


function obterConfigSupabase_() {
  const props = PropertiesService.getScriptProperties();
  const url = normalizarUrlProjetoSupabase_(props.getProperty(SUPABASE_CONFIG_KEYS.URL));
  const serviceKey = supabaseNormalizarTexto_(props.getProperty(SUPABASE_CONFIG_KEYS.SERVICE_KEY));

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase nao configurado. Defina MUKIRANA_SUPABASE_URL e MUKIRANA_SUPABASE_SERVICE_KEY nas propriedades do script."
    );
  }

  return {
    url: url,
    serviceKey: serviceKey
  };
}


function supabaseRestRequest_(metodo, caminho, opcoes) {
  const config = obterConfigSupabase_();
  const opts = opcoes || {};
  const query = opts.query ? "?" + opts.query : "";
  const endpoint = config.url + "/rest/v1/" + caminho + query;
  const headers = {
    apikey: config.serviceKey,
    Authorization: "Bearer " + config.serviceKey,
    "Content-Type": "application/json",
    Prefer: opts.prefer || "return=representation"
  };
  const parametros = {
    method: metodo,
    headers: headers,
    muteHttpExceptions: true
  };

  if (opts.payload !== undefined) {
    parametros.payload = JSON.stringify(opts.payload);
  }

  const resposta = UrlFetchApp.fetch(endpoint, parametros);
  const status = resposta.getResponseCode();
  const texto = resposta.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Erro Supabase " + status + " em " + metodo + " " + caminho + ": " + texto
    );
  }

  if (!texto) {
    return null;
  }

  return JSON.parse(texto);
}


function supabaseSelecionar(nomeTabela, parametrosConsulta) {
  const query = parametrosConsulta || "select=*";
  return supabaseRestRequest_("get", nomeTabela, { query: query, prefer: "return=representation" }) || [];
}


function supabaseRpc(nomeFuncao, payload, prefer) {
  const nome = supabaseNormalizarTexto_(nomeFuncao);

  if (!nome) {
    throw new Error("Nome da RPC Supabase nao informado.");
  }

  return supabaseRestRequest_("post", "rpc/" + nome, {
    payload: payload || {},
    prefer: prefer || "return=representation"
  });
}


function supabaseInserir(nomeTabela, registros, prefer) {
  const payload = Array.isArray(registros) ? registros : [registros];
  if (payload.length === 0) {
    return [];
  }

  return supabaseRestRequest_("post", nomeTabela, {
    payload: payload,
    prefer: prefer || "return=representation"
  }) || [];
}


function supabaseInserirComConflito(nomeTabela, registros, colunasConflito, prefer) {
  const payload = Array.isArray(registros) ? registros : [registros];
  const conflito = supabaseNormalizarTexto_(colunasConflito);

  if (payload.length === 0) {
    return [];
  }

  if (!conflito) {
    throw new Error("Colunas de conflito nao informadas para upsert no Supabase.");
  }

  return supabaseRestRequest_("post", nomeTabela, {
    query: "on_conflict=" + encodeURIComponent(conflito),
    payload: payload,
    prefer: prefer || "resolution=merge-duplicates,return=representation"
  }) || [];
}


function supabaseAtualizar(nomeTabela, filtroQuery, dados) {
  if (!filtroQuery) {
    throw new Error("Filtro obrigatorio para atualizar registros no Supabase.");
  }

  return supabaseRestRequest_("patch", nomeTabela, {
    query: filtroQuery,
    payload: dados,
    prefer: "return=representation"
  }) || [];
}


function supabaseExcluir(nomeTabela, filtroQuery) {
  if (!filtroQuery) {
    throw new Error("Filtro obrigatorio para excluir registros no Supabase.");
  }

  return supabaseRestRequest_("delete", nomeTabela, {
    query: filtroQuery,
    prefer: "return=representation"
  }) || [];
}


function supabaseNormalizarTexto_(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return valor.toString().trim();
}


function normalizarUrlProjetoSupabase_(valor) {
  return supabaseNormalizarTexto_(valor)
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/+$/, "");
}


function gerarUuidDeterministicoSupabase_(prefixo) {
  const partes = Array.prototype.slice.call(arguments)
    .map(function(item) {
      return supabaseNormalizarTexto_(item);
    })
    .join(":");
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, partes);
  const hex = bytes
    .slice(0, 16)
    .map(function(byte) {
      const valor = byte < 0 ? byte + 256 : byte;
      return ("0" + valor.toString(16)).slice(-2);
    })
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.slice(18, 20),
    hex.slice(20, 32)
  ].join("-");
}


function converterDataHoraSupabase_(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return valor.toISOString();
  }

  const texto = valor.toString().trim();

  if (!texto) {
    return null;
  }

  const data = new Date(texto);

  if (!isNaN(data.getTime())) {
    return data.toISOString();
  }

  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);

  if (partes) {
    const ano = partes[3];
    const mes = partes[2];
    const dia = partes[1];
    const hora = partes[4] || "00";
    const minuto = partes[5] || "00";
    const segundo = partes[6] || "00";
    return ano + "-" + mes + "-" + dia + "T" + hora + ":" + minuto + ":" + segundo + "-03:00";
  }

  return texto;
}


function converterDataSupabase_(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }

  const texto = valor.toString().trim();

  if (!texto) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(texto)) {
    return texto + "-01";
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10);
  }

  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (partes) {
    return partes[3] + "-" + partes[2] + "-" + partes[1];
  }

  throw new Error("Data invalida para Supabase: " + texto + ". Use yyyy-MM-dd ou yyyy-MM.");
}
