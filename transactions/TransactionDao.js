/** RPCs restritas a service_role; identidade e vínculos são revalidados no banco. */
const TransactionDao_ = Object.freeze({
  list: function (token, f) {
    return SupabaseDao_.rpc("mukirana_transactions_list", {
      p_session_token: token, p_start_date: f.startDate, p_end_date: f.endDate,
      p_nature: f.nature, p_account_id: f.accountId, p_category_id: f.categoryId,
      p_classification: f.classification, p_query: f.query,
      p_cursor_date: f.cursorDate, p_cursor_id: f.cursorId, p_limit: f.limit,
    });
  },
  save: function (token, entry) {
    return SupabaseDao_.rpc("mukirana_transactions_save", {
      p_session_token: token, p_transaction_id: entry.id, p_expected_version: entry.version,
      p_nature: entry.nature, p_description: entry.description, p_amount_cents: entry.amountCents,
      p_occurred_on: entry.date, p_account_id: entry.accountId, p_category_id: entry.categoryId,
      p_classification: entry.classification,
    });
  },
  remove: function (token, id, version) {
    return SupabaseDao_.rpc("mukirana_transactions_delete", {
      p_session_token: token, p_transaction_id: id, p_expected_version: version,
    });
  },
  health: function () {
    const r = SupabaseDao_.rpc("mukirana_transactions_health_check", {});
    if (!r || r.service !== "mukirana" || r.module !== "transactions" || r.revision !== 1 ||
      r.amountUnit !== "cents" || r.modality !== "single") throw new Error("Estrutura de lançamentos incompatível.");
    return { module: "transactions", revision: 1 };
  },
});
