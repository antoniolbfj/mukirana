/**
 * Módulo: Login_Controller.gs
 * Responsabilidade:
 * - Autenticar usuários reais do sistema.
 * - Validar status da conta.
 * - Bloquear usuários virtuais sem acesso interativo ao app.
 * - Emitir token de sessão seguro após autenticação bem-sucedida.
 */


/**
 * Autentica um usuário a partir de e-mail e senha/PIN.
 *
 * Regras de negócio:
 * - E-mail e senha/PIN são obrigatórios.
 * - Mensagem de erro de credencial deve ser genérica para não revelar se o e-mail existe.
 * - Usuário inativo não pode acessar o sistema.
 * - Usuário com papel "Usuário Virtual" não pode acessar o sistema.
 * - Sessão só é criada após todas as validações.
 *
 * @param {string} emailDigitado E-mail informado na tela de login.
 * @param {string} senhaDigitada Senha/PIN informado na tela de login.
 * @returns {Object} Dados seguros da sessão para o front-end.
 */
function autenticarUsuario(emailDigitado, senhaDigitada) {
  if (!emailDigitado || !senhaDigitada) {
    throw new Error("O e-mail e a senha são obrigatórios.");
  }

  const emailLower = emailDigitado.toString().trim().toLowerCase();
  const senhaLimpa = senhaDigitada.toString().trim();
  const usuarioEncontrado = typeof buscarUsuarioPorEmailModel_ === "function"
    ? buscarUsuarioPorEmailModel_(emailLower)
    : buscarUsuarioPorEmailLoginController_(emailLower);

  // Erro genérico para evitar enumeração de usuários.
  if (!usuarioEncontrado) {
    throw new Error("E-mail ou senha incorretos.");
  }

  const usuarioAtivo = normalizarBooleanoLoginController_(usuarioEncontrado.Ativo);

  if (!usuarioAtivo) {
    throw new Error("Acesso negado: sua conta está inativa. Contacte um Administrador.");
  }

  const papelUsuario = usuarioEncontrado.Papel
    ? usuarioEncontrado.Papel.toString().trim()
    : "Usuário";

  if (papelUsuario === "Usuário Virtual") {
    throw new Error("Acesso negado: usuários virtuais não podem fazer login no sistema.");
  }

  const senhaRegistrada = usuarioEncontrado.Senha
    ? usuarioEncontrado.Senha.toString().trim()
    : "";

  if (senhaLimpa !== senhaRegistrada) {
    throw new Error("E-mail ou senha incorretos.");
  }

  const tokenSessao = criarSessaoUsuario_(usuarioEncontrado);

  return {
    token: tokenSessao,
    id: usuarioEncontrado.ID_Usuario,
    nome: usuarioEncontrado.Nome,
    email: usuarioEncontrado.Email.toString().trim().toLowerCase(),
    papel: papelUsuario,
    tema: usuarioEncontrado.Preferencia_Tema || "Claro"
  };
}


function buscarUsuarioPorEmailLoginController_(emailLower) {
  const todosUsuarios = typeof listarUsuariosModel_ === "function"
    ? listarUsuariosModel_()
    : [];

  return todosUsuarios.find(function(usuario) {
    const emailUsuario = usuario.Email
      ? usuario.Email.toString().trim().toLowerCase()
      : "";

    return emailUsuario === emailLower;
  }) || null;
}


function normalizarBooleanoLoginController_(valor) {
  return valor === true || valor === "true" || valor === "True" || valor === 1;
}
