/** Operações individuais atômicas. Nunca aceita usuário/proprietário da interface. */
const TransactionService_ = Object.freeze({
  list: function (token, request) {
    AuthService_.requireSession(token);
    const input = TransactionDomain_.filters(request);
    if (!input) return { status: "invalid_request" };
    const r = TransactionDao_.list(token, input);
    return this.page(r);
  },
  page: function (r) {
    if (r.status !== "ok") return this.failure(r.status);
    if (!Array.isArray(r.entries) || !Array.isArray(r.accounts) || !Array.isArray(r.categories) ||
      typeof r.hasMore !== "boolean" || !TransactionDomain_.date(r.today) || !r.summary ||
      !Number.isSafeInteger(r.summary.count) || r.summary.count < 0 ||
      !["incomeCents", "expenseCents", "resultCents"].every(function (key) {
        return TransactionDomain_.integerText(r.summary[key]);
      })) throw new Error("Consulta de lançamentos incompleta.");
    return { status: "ok", entries: r.entries.map(function (row) { return TransactionDomain_.dto(row); }),
      accounts: r.accounts.map(function (row) { return AccountDomain_.dto(row); }),
      categories: r.categories.map(function (row) { return CategoryDomain_.dto(row); }),
      today: r.today, hasMore: r.hasMore, summary: { count: r.summary.count, incomeCents: r.summary.incomeCents,
        expenseCents: r.summary.expenseCents, resultCents: r.summary.resultCents } };
  },
  save: function (token, request) {
    AuthService_.requireSession(token);
    const input = TransactionDomain_.input(request);
    if (!input) return { status: "invalid_request" };
    const r = TransactionDao_.save(token, input);
    return r.status === "saved" ? { status: "saved", entry: TransactionDomain_.dto(r.entry) } : this.failure(r.status);
  },
  remove: function (token, id, version) {
    AuthService_.requireSession(token);
    if (!AuthDomain_.challenge(id) || !AccountDomain_.validVersion(version, false)) return { status: "invalid_request" };
    const r = TransactionDao_.remove(token, id, version);
    return r.status === "deleted" ? { status: "deleted" } : this.failure(r.status);
  },
  failure: function (status) {
    if (!["invalid_session", "invalid_request", "invalid_account", "invalid_category", "not_found", "conflict",
      "opening_balance_only_in_account"].includes(status)) throw new Error("Operação de lançamento inconclusiva.");
    return { status: status };
  },
});
