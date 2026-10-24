/** Nenhuma identidade enviada pela interface substitui o proprietário da sessão. */
const TransferService_ = Object.freeze({
  list: function (token, request) {
    AuthService_.requireSession(token);
    const input = TransferDomain_.filters(request);
    if (!input) return { status: "invalid_request" };
    const r = TransferDao_.list(token, input);
    return this.page(r);
  },
  page: function (r) {
    if (r.status !== "ok") return this.failure(r.status);
    if (!Array.isArray(r.entries) || !Array.isArray(r.accounts) || typeof r.hasMore !== "boolean" ||
      !TransactionDomain_.date(r.today) || !r.summary || !Number.isSafeInteger(r.summary.count) || r.summary.count < 0 ||
      !TransactionDomain_.integerText(r.summary.amountCents) || r.summary.amountCents.startsWith("-"))
      throw new Error("Consulta de transferências incompleta.");
    return { status: "ok", entries: r.entries.map(function (row) { return TransferDomain_.dto(row); }),
      accounts: r.accounts.map(function (row) { return AccountDomain_.dto(row); }), today: r.today,
      hasMore: r.hasMore, summary: { count: r.summary.count, amountCents: r.summary.amountCents } };
  },
  save: function (token, request) {
    AuthService_.requireSession(token);
    const input = TransferDomain_.input(request);
    if (!input) return { status: "invalid_request" };
    const r = TransferDao_.save(token, input);
    return r.status === "saved" ? { status: "saved", entry: TransferDomain_.dto(r.entry) } : this.failure(r.status);
  },
  remove: function (token, id, version) {
    AuthService_.requireSession(token);
    if (!AuthDomain_.challenge(id) || !AccountDomain_.validVersion(version, false)) return { status: "invalid_request" };
    const r = TransferDao_.remove(token, id, version);
    return r.status === "deleted" ? { status: "deleted" } : this.failure(r.status);
  },
  failure: function (status) {
    if (!["invalid_session", "invalid_request", "invalid_account", "same_account", "not_found", "conflict"].includes(status))
      throw new Error("Operação de transferência inconclusiva.");
    return { status: status };
  },
});
