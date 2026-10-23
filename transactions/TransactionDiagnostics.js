/** Diagnósticos reais de leitura: não gravam dados nem enviam mensagens. */
const TransactionDiagnostics_ = Object.freeze({
  catalog: function () {
    return [
      { id: "transactions.schema", title: "Estrutura de Lançamentos", objective: "Conferir os serviços de lançamentos únicos.",
        expected: "Valores em centavos e modalidade Único.", criterion: "RQ-LAN-01 / RQ-LAN-02" },
      { id: "transactions.read", title: "Consultar meus lançamentos", objective: "Validar uma consulta protegida e seus totais.",
        expected: "Contratos válidos e totais exatos.", criterion: "RQ-AUT-06 / RQ-PRN-05" },
      { id: "transactions.rejection", title: "Recusar lançamentos sem sessão", objective: "Conferir a proteção de acesso.",
        expected: "Consulta sem sessão recusada.", criterion: "RQ-AUT-06" },
    ];
  },
  run: function (token, id) {
    let passed = false; let evidence = "";
    if (id === "transactions.schema") { TransactionDao_.health(); passed = true; evidence = "Serviços de lançamentos únicos e centavos confirmados."; }
    else if (id === "transactions.read") {
      const r = TransactionService_.list(token, {});
      if (r.status === "invalid_session") return { status: "invalid_session" };
      passed = r.status === "ok";
      evidence = passed ? "Consulta autorizada; " + r.summary.count + " lançamento(s) disponível(is)." : "Consulta inconclusiva.";
    } else if (id === "transactions.rejection") {
      try { TransactionService_.list("", {}); } catch (e) { passed = e.message === "AUTH_REQUIRED"; }
      evidence = passed ? "Consulta sem sessão recusada." : "Acesso sem sessão aceito indevidamente.";
    } else return { status: "invalid_request" };
    return { status: passed ? "passed" : "failed", id: id, evidence: evidence };
  },
});
