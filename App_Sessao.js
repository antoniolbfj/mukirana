/**
 * Módulo Global: App_Sessao.gs
 * Responsabilidade: Criar, validar e encerrar sessões seguras no servidor.
 *
 * Regra central:
 * O front-end guarda apenas o token.
 * O servidor valida o token e mantém um cache curto dos dados seguros do usuário.
 */

const CONFIG_SESSAO = {
  PREFIXO_PROPRIEDADE: "MUKIRANA_SESSAO_",
  PREFIXO_CACHE: "MUKIRANA_SESSAO_USUARIO_",
  PREFIXO_VERSAO_USUARIO: "MUKIRANA_USUARIO_VERSAO_",
  DURACAO_HORAS: 12,
  CACHE_USUARIO_SEGUNDOS: 300,
  ATUALIZAR_ATIVIDADE_A_CADA_MINUTOS: 10
};


/**
 * Cria uma nova sessão para um usuário autenticado.
 * O token puro é entregue ao front-end.
 * No servidor, armazenamos apenas o hash do token.
 */
function criarSessaoUsuario_(usuario) {
  if (!usuario || !usuario.ID_Usuario) {
    throw new Error("Não foi possível criar a sessão: usuário inválido.");
  }

  const token = gerarTokenSessao_();
  const hash = gerarHashToken_(token);

  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + CONFIG_SESSAO.DURACAO_HORAS * 60 * 60 * 1000);

  const sessao = {
    idUsuario: usuario.ID_Usuario.toString().trim(),
    criadoEm: agora.toISOString(),
    expiraEm: expiraEm.toISOString(),
    ultimaAtividade: agora.toISOString()
  };

  PropertiesService
    .getScriptProperties()
    .setProperty(CONFIG_SESSAO.PREFIXO_PROPRIEDADE + hash, JSON.stringify(sessao));

  gravarUsuarioSessaoEmCache_(hash, usuario, expiraEm);

  return token;
}


/**
 * Função pública usada pelo front-end para validar a sessão atual.
 * Retorna apenas dados seguros para montar a interface.
 */
function obterSessaoAtual(tokenSessao) {
  const sessao = obterSessaoObrigatoria(tokenSessao);

  return {
    id: sessao.id,
    nome: sessao.nome,
    email: sessao.email,
    papel: sessao.papel,
    tema: sessao.tema
  };
}


/**
 * Função pública usada no logout.
 */
function encerrarSessao(tokenSessao) {
  if (!tokenSessao) return true;

  const hash = gerarHashToken_(tokenSessao);

  PropertiesService
    .getScriptProperties()
    .deleteProperty(CONFIG_SESSAO.PREFIXO_PROPRIEDADE + hash);

  CacheService
    .getScriptCache()
    .remove(CONFIG_SESSAO.PREFIXO_CACHE + hash);

  return true;
}


/**
 * Função que todos os Controllers devem usar.
 * Se a sessão for inválida, expirada ou se o usuário estiver inativo, lança erro.
 */
function obterSessaoObrigatoria(tokenSessao) {
  if (!tokenSessao || tokenSessao.toString().trim() === "") {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const hash = gerarHashToken_(tokenSessao);
  const chave = CONFIG_SESSAO.PREFIXO_PROPRIEDADE + hash;

  const props = PropertiesService.getScriptProperties();
  const bruto = props.getProperty(chave);

  if (!bruto) {
    removerUsuarioSessaoDoCache_(hash);
    throw new Error("Sessão inválida ou expirada. Faça login novamente.");
  }

  let sessaoArmazenada;
  try {
    sessaoArmazenada = JSON.parse(bruto);
  } catch (e) {
    props.deleteProperty(chave);
    removerUsuarioSessaoDoCache_(hash);
    throw new Error("Sessão corrompida. Faça login novamente.");
  }

  const agora = new Date();
  const expiraEm = new Date(sessaoArmazenada.expiraEm);

  if (agora.getTime() > expiraEm.getTime()) {
    props.deleteProperty(chave);
    removerUsuarioSessaoDoCache_(hash);
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const usuarioCache = obterUsuarioSessaoDoCache_(hash, sessaoArmazenada.idUsuario, expiraEm);

  if (usuarioCache) {
    atualizarUltimaAtividadeSessaoSeNecessario_(props, chave, sessaoArmazenada, agora);
    return usuarioCache;
  }

  const usuarioAtual = buscarUsuarioPorId_(sessaoArmazenada.idUsuario);

  if (!usuarioAtual) {
    props.deleteProperty(chave);
    removerUsuarioSessaoDoCache_(hash);
    throw new Error("Usuário da sessão não encontrado. Faça login novamente.");
  }

  const ativo = normalizarBooleanoSessao_(usuarioAtual.Ativo);
  if (!ativo) {
    props.deleteProperty(chave);
    removerUsuarioSessaoDoCache_(hash);
    throw new Error("A sua conta está inativa. Contacte um Administrador.");
  }

  atualizarUltimaAtividadeSessaoSeNecessario_(props, chave, sessaoArmazenada, agora);
  gravarUsuarioSessaoEmCache_(hash, usuarioAtual, expiraEm);

  return montarUsuarioSeguroSessao_(usuarioAtual);
}


/**
 * Busca o usuário atual diretamente no Model.
 * Isso impede que papel, nome ou status fiquem congelados no localStorage.
 */
function buscarUsuarioPorId_(idUsuario) {
  const idStr = idUsuario ? idUsuario.toString().trim() : "";
  if (!idStr) return null;

  if (typeof buscarUsuarioPorIdModel_ === "function") {
    return buscarUsuarioPorIdModel_(idStr);
  }

  const usuarios = typeof listarUsuariosModel_ === "function" ? listarUsuariosModel_() : [];

  return usuarios.find(function(usuario) {
    const idAtual = usuario.ID_Usuario ? usuario.ID_Usuario.toString().trim() : "";
    return idAtual === idStr;
  }) || null;
}


function obterUsuarioSessaoDoCache_(hash, idUsuario, expiraEm) {
  const cache = CacheService.getScriptCache();
  const bruto = cache.get(CONFIG_SESSAO.PREFIXO_CACHE + hash);

  if (!bruto) {
    return null;
  }

  try {
    const cacheado = JSON.parse(bruto);
    const mesmoUsuario = cacheado.id === idUsuario;
    const mesmaVersaoUsuario = cacheado.versaoUsuario === obterVersaoUsuarioSessao_(idUsuario);
    const dentroDaValidade = new Date(cacheado.expiraEm).getTime() > Date.now();

    return mesmoUsuario && mesmaVersaoUsuario && dentroDaValidade ? cacheado.usuario : null;
  } catch (e) {
    removerUsuarioSessaoDoCache_(hash);
    return null;
  }
}


function gravarUsuarioSessaoEmCache_(hash, usuario, expiraEm) {
  const segundosAteExpirar = Math.max(
    1,
    Math.floor((expiraEm.getTime() - Date.now()) / 1000)
  );
  const ttl = Math.min(CONFIG_SESSAO.CACHE_USUARIO_SEGUNDOS, segundosAteExpirar);

  CacheService.getScriptCache().put(
    CONFIG_SESSAO.PREFIXO_CACHE + hash,
    JSON.stringify({
      id: usuario.ID_Usuario.toString().trim(),
      expiraEm: expiraEm.toISOString(),
      versaoUsuario: obterVersaoUsuarioSessao_(usuario.ID_Usuario),
      usuario: montarUsuarioSeguroSessao_(usuario)
    }),
    ttl
  );
}


function invalidarDadosUsuarioSessao_(idUsuario) {
  const id = idUsuario === null || idUsuario === undefined ? "" : idUsuario.toString().trim();

  if (!id) {
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const chave = CONFIG_SESSAO.PREFIXO_VERSAO_USUARIO + id;
  const atual = parseInt(props.getProperty(chave), 10);

  props.setProperty(chave, String(isNaN(atual) ? 1 : atual + 1));
}


function obterVersaoUsuarioSessao_(idUsuario) {
  const id = idUsuario === null || idUsuario === undefined ? "" : idUsuario.toString().trim();

  if (!id) {
    return "0";
  }

  return PropertiesService
    .getScriptProperties()
    .getProperty(CONFIG_SESSAO.PREFIXO_VERSAO_USUARIO + id) || "0";
}


function removerUsuarioSessaoDoCache_(hash) {
  CacheService.getScriptCache().remove(CONFIG_SESSAO.PREFIXO_CACHE + hash);
}


function montarUsuarioSeguroSessao_(usuarioAtual) {
  return {
    id: usuarioAtual.ID_Usuario.toString().trim(),
    nome: usuarioAtual.Nome || "Usuário",
    email: usuarioAtual.Email ? usuarioAtual.Email.toString().trim().toLowerCase() : "",
    papel: usuarioAtual.Papel || "Usuário",
    tema: usuarioAtual.Preferencia_Tema || "Claro"
  };
}


function atualizarUltimaAtividadeSessaoSeNecessario_(props, chave, sessaoArmazenada, agora) {
  const ultimaAtividade = new Date(sessaoArmazenada.ultimaAtividade || sessaoArmazenada.criadoEm);
  const intervaloMs = CONFIG_SESSAO.ATUALIZAR_ATIVIDADE_A_CADA_MINUTOS * 60 * 1000;

  if (isNaN(ultimaAtividade.getTime()) || agora.getTime() - ultimaAtividade.getTime() < intervaloMs) {
    return;
  }

  sessaoArmazenada.ultimaAtividade = agora.toISOString();
  props.setProperty(chave, JSON.stringify(sessaoArmazenada));
}


/**
 * Token com boa entropia para sessão do app.
 */
function gerarTokenSessao_() {
  return [
    Utilities.getUuid(),
    Utilities.getUuid(),
    new Date().getTime(),
    Math.floor(Math.random() * 1000000000)
  ].join(".");
}


/**
 * Gera hash SHA-256 do token.
 * O token puro nunca fica gravado no servidor.
 */
function gerarHashToken_(token) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    token.toString()
  );

  let hex = "";

  for (let i = 0; i < bytes.length; i++) {
    let valor = bytes[i];
    if (valor < 0) valor += 256;

    const parte = valor.toString(16);
    hex += parte.length === 1 ? "0" + parte : parte;
  }

  return hex;
}


function normalizarBooleanoSessao_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
