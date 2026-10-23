/** DAO de autenticação: parâmetros nomeados e transações pertencem às RPCs versionadas. */
const AuthDao_ = Object.freeze({
  issue: function (email) {
    return SupabaseDao_.rpc("mukirana_auth_issue_code", { p_email: email });
  },
  delivery: function (id, succeeded) {
    return SupabaseDao_.rpc("mukirana_auth_mark_delivery", {
      p_challenge_id: id,
      p_succeeded: succeeded,
    });
  },
  verify: function (id, code) {
    return SupabaseDao_.rpc("mukirana_auth_verify_code", { p_challenge_id: id, p_code: code });
  },
  resolve: function (token) {
    return SupabaseDao_.rpc("mukirana_auth_resolve_session", { p_session_token: token });
  },
  revoke: function (token, allDevices) {
    return SupabaseDao_.rpc("mukirana_auth_revoke_session", {
      p_session_token: token,
      p_all_devices: allDevices,
    });
  },
  health: function () {
    const result = SupabaseDao_.rpc("mukirana_auth_health_check", {});
    if (
      !result ||
      result.service !== "mukirana" ||
      result.module !== "authentication" ||
      result.revision !== 1 ||
      result.tables !== 3
    )
      throw new Error("Estrutura de autenticação incompatível.");
    return { service: "mukirana", module: "authentication", revision: 1, tables: 3 };
  },
});
