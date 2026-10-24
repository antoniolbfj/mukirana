/** Parcelamentos/recorrências pertencem ao módulo de lançamentos e à sessão vigente. */
const OccurrenceService_ = Object.freeze({
  failure: function (status) {
    if (!["invalid_session", "invalid_request", "invalid_account", "invalid_category", "not_found", "conflict", "too_many_occurrences", "already_renewed", "not_due"].includes(status)) throw new Error("Operação de conjunto inconclusiva.");
    return { status: status };
  },
  saved: function (r) {
    if (r.status !== "saved") return this.failure(r.status);
    return { status: "saved", entry: TransactionDomain_.dto(r.entry), group: OccurrenceDomain_.group(r.group),
      affectedCount: r.affectedCount == null ? r.group.count : r.affectedCount };
  },
  preview: function (token, request) {
    AuthService_.requireSession(token); const input = OccurrenceDomain_.schedule(request);
    if (!input) return { status: "invalid_request" };
    const r = OccurrenceDao_.preview(token, input);
    return r.status === "ok" ? { status: "ok", preview: OccurrenceDomain_.preview(r.preview) } : this.failure(r.status);
  },
  create: function (token, request) {
    AuthService_.requireSession(token); const input = OccurrenceDomain_.create(request);
    return input ? this.saved(OccurrenceDao_.create(token, input)) : { status: "invalid_request" };
  },
  update: function (token, request) {
    AuthService_.requireSession(token); const input = OccurrenceDomain_.change(request);
    return input ? this.saved(OccurrenceDao_.change(token, input.entry.id, input.entry.version, input.batch, "save", input.patch)) : { status: "invalid_request" };
  },
  remove: function (token, id, version, request) {
    AuthService_.requireSession(token); const batch = OccurrenceDomain_.mutation(request, "delete");
    if (!batch || !AuthDomain_.challenge(id) || !AccountDomain_.validVersion(version, false)) return { status: "invalid_request" };
    const r = OccurrenceDao_.change(token, id, version, batch, "delete", {});
    return r.status === "deleted" ? { status: "deleted", affectedCount: r.affectedCount, group: OccurrenceDomain_.group(r.group) } : this.failure(r.status);
  },
  get: function (token, id, groupId) {
    AuthService_.requireSession(token);
    if ((id == null) === (groupId == null) || (id != null && !AuthDomain_.challenge(id)) || (groupId != null && !AuthDomain_.challenge(groupId))) return { status: "invalid_request" };
    const r = OccurrenceDao_.get(token, id || null, groupId || null);
    if (r.status !== "ok") return this.failure(r.status);
    if (!r.scopeCounts || !["one", "following", "preceding", "all"].every(function (key) { return Number.isInteger(r.scopeCounts[key]) && r.scopeCounts[key] > 0; })) throw new Error("Escopos inválidos.");
    return { status: "ok", entry: TransactionDomain_.dto(r.entry), group: OccurrenceDomain_.group(r.group),
      scopeCounts: { one: r.scopeCounts.one, following: r.scopeCounts.following, preceding: r.scopeCounts.preceding, all: r.scopeCounts.all } };
  },
  dismiss: function (token, id, version) {
    AuthService_.requireSession(token);
    if (!AuthDomain_.challenge(id) || !AccountDomain_.validVersion(version, false)) return { status: "invalid_request" };
    const r = OccurrenceDao_.dismiss(token, id, version);
    return r.status === "dismissed" ? { status: "dismissed" } : this.failure(r.status);
  },
});
