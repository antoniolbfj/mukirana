/** Cenários reais e somente leitura; não criam contas ou movimentações de teste. */
const AccountDiagnostics_ = Object.freeze({
  catalog: function () {
    return [
      {
        id: "accounts.schema",
        title: "Estrutura de Contas",
        objective: "Conferir a tabela privada e o saldo inicial registrado como lançamento.",
        expected: "Estrutura de Contas na revisão 2.",
        criterion: "Fundação de Contas",
      },
      {
        id: "accounts.read",
        title: "Consultar minhas contas",
        objective: "Consultar suas contas e validar os dados retornados pelo serviço real.",
        expected: "Consulta autorizada com valores em centavos.",
        criterion: "CA-CON-01 / CA-CON-03",
      },
      {
        id: "accounts.rejection",
        title: "Recusar consulta sem sessão",
        objective: "Tentar consultar Contas sem fornecer uma sessão.",
        expected: "Consulta recusada antes do acesso aos dados.",
        criterion: "RQ-CON-01",
      },
    ];
  },
  run: function (token, id) {
    let passed = false;
    let evidence = "";
    if (id === "accounts.schema") {
      AccountDao_.health();
      passed = true;
      evidence = "O banco confirmou a tabela de Contas e o saldo inicial integrado aos lançamentos.";
    } else if (id === "accounts.read") {
      const result = AccountService_.list(token);
      if (result.status === "invalid_session") return { status: "invalid_session" };
      passed =
        result.status === "ok" &&
        result.accounts.every(function (account) {
          return AccountDomain_.validAmount(account.initialCents);
        });
      evidence = passed
        ? "Sua consulta retornou " + result.accounts.length + " conta(s), com contratos válidos."
        : "A consulta não concluiu a validação.";
    } else if (id === "accounts.rejection") {
      try {
        AccountService_.list("");
      } catch (error) {
        passed = error.message === "AUTH_REQUIRED";
      }
      evidence = passed
        ? "A consulta sem sessão foi recusada."
        : "A consulta sem sessão foi aceita indevidamente.";
    } else return { status: "invalid_request" };
    return { status: passed ? "passed" : "failed", id: id, evidence: evidence };
  },
});
