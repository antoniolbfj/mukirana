/** Operações de conjunto em uma transação por ação. */
const OccurrenceDao_ = Object.freeze({
  preview: function (token, s) {
    return SupabaseDao_.rpc("mukirana_occurrences_preview", { p_session_token: token, p_modality: s.modality, p_amount_cents: s.amountCents,
      p_start_on: s.date, p_frequency: s.frequency, p_quantity: s.quantity, p_duration_months: s.durationMonths, p_renew_from_id: s.renewFromId });
  },
  create: function (token, input) {
    const e = input.entry, s = input.schedule;
    return SupabaseDao_.rpc("mukirana_occurrences_create", { p_session_token: token, p_group_id: e.id, p_nature: e.nature,
      p_description: e.description, p_amount_cents: s.amountCents, p_start_on: s.date, p_frequency: s.frequency, p_modality: s.modality,
      p_quantity: s.quantity, p_duration_months: s.durationMonths, p_account_id: e.accountId, p_category_id: e.categoryId,
      p_classification: e.classification, p_renew_from_id: s.renewFromId, p_renew_from_version: s.renewFromVersion });
  },
  get: function (token, id, groupId) {
    return SupabaseDao_.rpc("mukirana_occurrences_get", { p_session_token: token, p_transaction_id: id, p_group_id: groupId });
  },
  change: function (token, id, version, batch, action, patch) {
    return SupabaseDao_.rpc("mukirana_occurrences_change", { p_session_token: token, p_group_id: batch.groupId,
      p_expected_group_version: batch.groupVersion, p_transaction_id: id, p_expected_version: version,
      p_operation_id: batch.operationId, p_action: action, p_scope: batch.scope, p_patch: patch });
  },
  dismiss: function (token, id, version) {
    return SupabaseDao_.rpc("mukirana_occurrences_dismiss", { p_session_token: token, p_group_id: id, p_expected_version: version });
  },
  health: function () {
    const r = SupabaseDao_.rpc("mukirana_occurrences_health_check", {});
    if (!r || r.module !== "occurrences" || r.revision !== 1 || r.exclusiveEnd !== true || r.individualDeletion !== true) throw new Error("Estrutura de ocorrências incompatível.");
    return { module: "occurrences", revision: 1 };
  },
});
