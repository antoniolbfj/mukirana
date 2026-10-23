/** A sessão e a propriedade de ambas as contas são revalidadas dentro da RPC. */
const TransferDao_ = Object.freeze({
  list: function (token, f) {
    return SupabaseDao_.rpc("mukirana_transfers_list", { p_session_token: token,
      p_start_date: f.startDate, p_end_date: f.endDate, p_account_id: f.accountId, p_query: f.query,
      p_cursor_date: f.cursorDate, p_cursor_id: f.cursorId, p_limit: f.limit });
  },
  save: function (token, entry) {
    return SupabaseDao_.rpc("mukirana_transfers_save", { p_session_token: token, p_transfer_id: entry.id,
      p_expected_version: entry.version, p_description: entry.description, p_amount_cents: entry.amountCents,
      p_occurred_on: entry.date, p_source_account_id: entry.sourceAccountId, p_destination_account_id: entry.destinationAccountId });
  },
  remove: function (token, id, version) {
    return SupabaseDao_.rpc("mukirana_transfers_delete", { p_session_token: token,
      p_transfer_id: id, p_expected_version: version });
  },
  health: function () {
    const r = SupabaseDao_.rpc("mukirana_transfers_health_check", {});
    if (!r || r.service !== "mukirana" || r.module !== "transfers" || r.revision !== 1 ||
      r.amountUnit !== "cents" || r.pairedMovements !== true) throw new Error("Estrutura de transferências incompatível.");
    return { module: "transfers", revision: 1 };
  },
});
