/**
 * Modulo: Dashboard_Controller.gs
 * Responsabilidade:
 * - Entregar ao Dashboard um pacote pronto para exibicao.
 * - Manter a tela focada em apresentacao, usando o motor de consolidados.
 */


function obterPacoteDashboard(tokenSessao, filtros) {
  return obterConsolidadoFinanceiroUsuario(tokenSessao, filtros);
}
