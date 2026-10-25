/** Compatibilidade de chamadas antigas. Projetos foi retirado por decisão do usuário.
 * Os dados e referências históricos continuam preservados no banco.
 */
function processarSalvarProjeto(dadosFormulario,tokenSessao){
 obterSessaoObrigatoria(tokenSessao);
 throw new Error('Projetos foi descontinuado. Organize os assuntos com categorias e subcategorias.');
}
function alternarStatusProjeto(idProjeto,tokenSessao){
 obterSessaoObrigatoria(tokenSessao);
 throw new Error('Projetos foi descontinuado. Organize os assuntos com categorias e subcategorias.');
}
function obterListaProjetos(tokenSessao){obterSessaoObrigatoria(tokenSessao);return [];}
function obterUsuariosCompartilhaveisProjeto(idProjeto,tokenSessao){obterSessaoObrigatoria(tokenSessao);return [];}
