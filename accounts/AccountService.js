/** Contas protegidas; saldo inicial e ledger são atualizados atomicamente no banco. */
const AccountService_ = Object.freeze({
  list: function (token) {
    AuthService_.requireSession(token);
    const result = AccountDao_.list(token);
    if (result.status === "invalid_session") return { status: "invalid_session" };
    if (result.status !== "ok" || !Array.isArray(result.accounts))
      throw new Error("Lista de contas incompleta.");
    return {
      status: "ok",
      accounts: result.accounts.map(function (row) {
        return AccountDomain_.dto(row);
      }),
    };
  },
  save: function (token, request) {
    AuthService_.requireSession(token);
    const input = AccountDomain_.input(request);
    if (!input) return { status: "invalid_request" };
    const result = AccountDao_.save(token, input);
    if (result.status === "saved")
      return { status: "saved", account: AccountDomain_.dto(result.account) };
    return this.failure(result.status);
  },
  remove: function (token, id, version) {
    AuthService_.requireSession(token);
    if (!AuthDomain_.challenge(id) || !AccountDomain_.validVersion(version, false))
      return { status: "invalid_request" };
    const result = AccountDao_.remove(token, id, version);
    if (result.status === "deleted") return { status: "deleted" };
    return this.failure(result.status);
  },
  failure: function (status) {
    if (
      ![
        "invalid_session",
        "invalid_request",
        "not_found",
        "conflict",
        "type_confirmation_required",
        "linked",
      ].includes(status)
    )
      throw new Error("Operação de conta inconclusiva.");
    return { status: status };
  },
});
