/** Uma fronteira de lançamentos; cada operação conserva suas regras financeiras. */
const EntryService_ = Object.freeze({
  list: function (token, request) {
    AuthService_.requireSession(token);
    const f = EntryDomain_.filters(request);
    if (!f) return { status: "invalid_request" };
    const onlyTransfers = f.nature === "transfer";
    const standard = TransactionService_.page(TransactionDao_.list(token, Object.assign({}, f, {
      nature: onlyTransfers ? null : f.nature, cursorDate: f.cursor.standard && f.cursor.standard.date,
      cursorId: f.cursor.standard && f.cursor.standard.id, limit: onlyTransfers ? 1 : f.limit,
    })));
    if (standard.status !== "ok") return standard;
    if (onlyTransfers) {
      standard.entries = []; standard.hasMore = false;
      standard.summary = { count: 0, incomeCents: "0", expenseCents: "0", resultCents: "0" };
    }
    let transfers = { entries: [], hasMore: false, summary: { count: 0 } };
    if ((!f.nature || onlyTransfers) && !f.categoryId && !f.classification) {
      transfers = TransferService_.page(TransferDao_.list(token, Object.assign({}, f, {
        cursorDate: f.cursor.transfer && f.cursor.transfer.date, cursorId: f.cursor.transfer && f.cursor.transfer.id,
      })));
      if (transfers.status !== "ok") return transfers;
    }
    return EntryDomain_.merge(standard, transfers, f);
  },
  save: function (token, request) {
    if (request && request.nature === "transfer") {
      const r = TransferService_.save(token, request);
      return r.status === "saved" ? { status: "saved", entry: EntryDomain_.dto(Object.assign({}, r.entry, { kind: "transfer" })) } : r;
    }
    if (request && request.batch) return OccurrenceService_.update(token, request);
    if (request && ["installment", "recurring"].includes(request.modality)) return OccurrenceService_.create(token, request);
    return TransactionService_.save(token, request);
  },
  remove: function (token, id, version, kind, batch) {
    if (kind === "transfer") return TransferService_.remove(token, id, version);
    if (kind != null && !["standard", "opening_balance"].includes(kind)) {
      AuthService_.requireSession(token); return { status: "invalid_request" };
    }
    if (batch) return OccurrenceService_.remove(token, id, version, batch);
    return TransactionService_.remove(token, id, version);
  },
});
