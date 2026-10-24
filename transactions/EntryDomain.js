/** Contrato comum de receitas, despesas, saldo inicial e transferências. */
const EntryDomain_ = Object.freeze({
  dto: function (row) {
    return row && row.kind === "transfer"
      ? Object.assign(TransferDomain_.dto(row), { kind: "transfer", nature: "transfer" })
      : TransactionDomain_.dto(row);
  },
  filters: function (request) {
    const r = request || {};
    const f = TransactionDomain_.filters(Object.assign({}, r, { nature: r.nature === "transfer" ? null : r.nature }));
    if (!f || (r.cursor != null && (typeof r.cursor !== "object" || Array.isArray(r.cursor)))) return null;
    f.nature = r.nature === "transfer" ? "transfer" : f.nature;
    f.cursor = { standard: null, transfer: null };
    for (const key of ["standard", "transfer"]) {
      const c = r.cursor && r.cursor[key];
      if (c == null) continue;
      if (!TransactionDomain_.date(c.date) || !AuthDomain_.challenge(c.id)) return null;
      f.cursor[key] = { date: c.date, id: c.id };
    }
    return f;
  },
  /** Cada origem avança apenas pelos registros efetivamente entregues nesta página. */
  merge: function (standard, transfers, filter) {
    const all = standard.entries.concat(transfers.entries.map(function (row) {
      return EntryDomain_.dto(Object.assign({}, row, { kind: "transfer" }));
    }));
    all.sort(function (a, b) {
      if (a.date !== b.date) return a.date > b.date ? -1 : 1;
      if (a.id !== b.id) return a.id > b.id ? -1 : 1;
      return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
    });
    const entries = all.slice(0, filter.limit);
    const cursor = { standard: filter.cursor.standard, transfer: filter.cursor.transfer };
    for (const row of entries) cursor[row.kind === "transfer" ? "transfer" : "standard"] = { date: row.date, id: row.id };
    const count = standard.summary.count + transfers.summary.count;
    if (!Number.isSafeInteger(count)) throw new Error("Quantidade de lançamentos inválida.");
    return { status: "ok", entries: entries, accounts: standard.accounts, categories: standard.categories,
      groups: standard.groups || [], renewals: standard.renewals || [],
      today: standard.today, hasMore: standard.hasMore || transfers.hasMore || all.length > filter.limit,
      nextCursor: cursor, summary: { count: count, incomeCents: standard.summary.incomeCents,
        expenseCents: standard.summary.expenseCents, resultCents: standard.summary.resultCents } };
  },
});
