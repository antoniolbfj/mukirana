/**
 * Modulo: App_Performance.gs
 * Responsabilidade:
 * - Medir tempos de execucao de fluxos criticos sem alterar regras de negocio.
 * - Registrar metricas no Logger do Apps Script para diagnostico de desempenho.
 */


function criarMedidorPerformance_(nomeFluxo) {
  const agora = Date.now();

  return {
    nomeFluxo: nomeFluxo || "Fluxo sem nome",
    inicioMs: agora,
    ultimaMarcaMs: agora,
    etapas: [],
    contagens: {}
  };
}


function medirEtapaPerformance_(medidor, nomeEtapa, callback) {
  const inicio = Date.now();
  const resultado = callback();
  const fim = Date.now();

  registrarEtapaPerformance_(medidor, nomeEtapa, inicio, fim);
  return resultado;
}


function registrarEtapaPerformance_(medidor, nomeEtapa, inicioMs, fimMs) {
  if (!medidor) {
    return;
  }

  medidor.etapas.push({
    etapa: nomeEtapa,
    duracaoMs: fimMs - inicioMs
  });

  medidor.ultimaMarcaMs = fimMs;
}


function registrarContagemPerformance_(medidor, nomeContagem, valor) {
  if (!medidor) {
    return;
  }

  medidor.contagens[nomeContagem] = valor;
}


function finalizarPerformance_(medidor) {
  if (!medidor) {
    return null;
  }

  const fim = Date.now();
  const resumo = {
    nomeFluxo: medidor.nomeFluxo,
    fonteDados: typeof obterFonteDadosMukirana === "function" ? obterFonteDadosMukirana() : "DESCONHECIDA",
    totalMs: fim - medidor.inicioMs,
    etapas: medidor.etapas,
    contagens: medidor.contagens
  };

  Logger.log(JSON.stringify({
    tipo: "MUKIRANA_PERFORMANCE",
    resumo: resumo
  }, null, 2));

  return resumo;
}
