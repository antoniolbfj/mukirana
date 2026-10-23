/** Catálogo incremental. Estes cenários consultam serviços reais, sem gravar fixtures. */
const DiagnosticsService_ = Object.freeze({
  catalog: function () {
    return [
      {
        id: "auth.schema",
        title: "Estrutura de autenticação",
        objective: "Conferir a revisão e as três tabelas privadas.",
        expected: "Estrutura na revisão 1.",
        criterion: "Fundação de persistência",
      },
      {
        id: "auth.session",
        title: "Minha sessão",
        objective: "Resolver novamente a sessão atual no banco.",
        expected: "Mesma identidade autenticada.",
        criterion: "RQ-AUT: sessão válida",
      },
      {
        id: "auth.rejection",
        title: "Acesso sem sessão",
        objective: "Recusar uma solicitação sem token.",
        expected: "Acesso protegido recusado.",
        criterion: "RQ-AUT: acesso protegido",
      },
    ].concat(AccountDiagnostics_.catalog(), CategoryDiagnostics_.catalog(), TransactionDiagnostics_.catalog());
  },
  /** Cada cenário revalida a sessão; não recebe identidade ou SQL do navegador. */
  run: function (token, id) {
    const session = AuthService_.requireSession(token);
    if (
      !this.catalog().some(function (item) {
        return item.id === id;
      })
    )
      return { status: "invalid_request" };
    let passed = false;
    let evidence = "";
    try {
      if (id.indexOf("accounts.") === 0) return AccountDiagnostics_.run(token, id);
      if (id.indexOf("categories.") === 0) return CategoryDiagnostics_.run(token, id);
      if (id.indexOf("transactions.") === 0) return TransactionDiagnostics_.run(token, id);
      if (id === "auth.schema") {
        const health = AuthDao_.health();
        passed = health.tables === 3 && health.revision === 1;
        evidence = "O banco confirmou três tabelas e revisão 1.";
      } else if (id === "auth.session") {
        const resolved = AuthService_.resolveSession(token);
        passed = resolved.status === "authenticated" && resolved.user.id === session.user.id;
        evidence = passed
          ? "A consulta ao banco confirmou sua identidade."
          : "A sessão deixou de ser válida.";
      } else {
        try {
          AuthService_.requireSession("");
        } catch (error) {
          passed = error.message === "AUTH_REQUIRED";
        }
        evidence = passed
          ? "A operação sem token foi recusada."
          : "A operação sem token foi aceita indevidamente.";
      }
      return { status: passed ? "passed" : "failed", id: id, evidence: evidence };
    } catch (error) {
      return {
        status: "blocked",
        id: id,
        evidence: "Não foi possível consultar o serviço. Tente novamente.",
      };
    }
  },
});
