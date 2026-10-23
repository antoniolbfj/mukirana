/** O banco revalida a sessão e a propriedade dentro de cada transação. */
const AccountDao_ = Object.freeze({
  list: function (token) {
    return SupabaseDao_.rpc("mukirana_accounts_list", { p_session_token: token });
  },
  save: function (token, account) {
    return SupabaseDao_.rpc("mukirana_accounts_save_opening", {
      p_session_token: token,
      p_account_id: account.id,
      p_expected_version: account.version,
      p_name: account.name,
      p_type: account.type,
      p_initial_cents: account.initialCents,
      p_confirm_type_change: account.confirmTypeChange,
      p_opening_date: account.openingDate,
    });
  },
  remove: function (token, id, version) {
    return SupabaseDao_.rpc("mukirana_accounts_delete", {
      p_session_token: token,
      p_account_id: id,
      p_expected_version: version,
    });
  },
  health: function () {
    const result = SupabaseDao_.rpc("mukirana_accounts_health_check", {});
    if (
      !result ||
      result.service !== "mukirana" ||
      result.module !== "accounts" ||
      result.revision !== 2 ||
      result.tables !== 1 ||
      result.initialBalanceMode !== "ledger"
    ) {
      throw new Error("Estrutura de contas incompatível.");
    }
    return { module: "accounts", revision: 2, tables: 1, initialBalanceMode: "ledger" };
  },
});
