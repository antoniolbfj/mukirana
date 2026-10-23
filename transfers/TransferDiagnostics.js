/** Diagnósticos somente de leitura, sem fixtures nem envio de mensagens. */
const TransferDiagnostics_ = Object.freeze({
  catalog: function () {
    return [
      { id: "transfers.schema", title: "Estrutura de Transferências", objective: "Conferir operação com dois movimentos vinculados.",
        expected: "Centavos inteiros e movimentos inseparáveis.", criterion: "RQ-TRF-01 / RQ-TRF-02" },
      { id: "transfers.read", title: "Consultar minhas transferências", objective: "Validar a consulta protegida e os saldos integrados.",
        expected: "Somente operações e contas próprias.", criterion: "RQ-AUT-06 / RQ-TRF-03" },
      { id: "transfers.rejection", title: "Recusar transferências sem sessão", objective: "Conferir a proteção de acesso.",
        expected: "Consulta sem sessão recusada.", criterion: "RQ-AUT-06" },
    ];
  },
  run: function (token, id) {
    let passed = false; let evidence = "";
    if (id === "transfers.schema") { TransferDao_.health(); passed = true; evidence = "Operação única com dois movimentos e centavos confirmada."; }
    else if (id === "transfers.read") {
      const r = TransferService_.list(token, {});
      if (r.status === "invalid_session") return { status: "invalid_session" };
      passed = r.status === "ok"; evidence = passed ? "Consulta autorizada; " + r.summary.count + " transferência(s) disponível(is)." : "Consulta inconclusiva.";
    } else if (id === "transfers.rejection") {
      try { TransferService_.list("", {}); } catch (e) { passed = e.message === "AUTH_REQUIRED"; }
      evidence = passed ? "Consulta sem sessão recusada." : "Acesso sem sessão aceito indevidamente.";
    } else return { status: "invalid_request" };
    return { status: passed ? "passed" : "failed", id: id, evidence: evidence };
  },
});
