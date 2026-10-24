/** Contratos dos conjuntos e das operações coletivas; geração das datas pertence ao banco. */
const OccurrenceDomain_ = Object.freeze({
  modalities: Object.freeze(["installment", "recurring"]),
  frequencies: Object.freeze(["weekly", "fortnightly", "monthly", "bimonthly", "quarterly", "semiannual", "yearly"]),
  fields: Object.freeze(["description", "amountCents", "date", "accountId", "categoryId", "classification", "nature"]),
  schedule: function (r) {
    const s = r && r.series;
    if (!r || !s || !this.modalities.includes(r.modality) || !this.frequencies.includes(s.frequency) ||
      !Number.isSafeInteger(r.amountCents) || r.amountCents < 1 || r.amountCents > 99999999999999 || !TransactionDomain_.date(r.date)) return null;
    if (r.modality === "installment" && (!Number.isInteger(s.quantity) || s.quantity < 1 || s.quantity > 1000 || r.amountCents < s.quantity)) return null;
    if (r.modality === "recurring" && (!Number.isInteger(s.durationMonths) || s.durationMonths < 1 || s.durationMonths > 1200)) return null;
    const renewFromId = s.renewFromId == null ? null : s.renewFromId;
    const renewFromVersion = s.renewFromVersion == null ? null : s.renewFromVersion;
    if (renewFromId !== null && (r.modality !== "recurring" || !AuthDomain_.challenge(renewFromId) || !AccountDomain_.validVersion(renewFromVersion, false))) return null;
    if (renewFromId === null && renewFromVersion !== null) return null;
    return { modality: r.modality, amountCents: r.amountCents, date: r.date, frequency: s.frequency,
      quantity: r.modality === "installment" ? s.quantity : null, durationMonths: r.modality === "recurring" ? s.durationMonths : null,
      renewFromId: renewFromId, renewFromVersion: renewFromVersion };
  },
  create: function (r) {
    const base = r && TransactionDomain_.input(Object.assign({}, r, { modality: "single" }));
    const schedule = this.schedule(r);
    return base && base.version === 0 && schedule ? { entry: base, schedule: schedule } : null;
  },
  mutation: function (batch, action) {
    if (!batch || !AuthDomain_.challenge(batch.groupId) || !AccountDomain_.validVersion(batch.groupVersion, false) ||
      !AuthDomain_.challenge(batch.operationId) || !(action === "save" ? ["one", "following", "all"] : ["one", "following", "preceding", "all"]).includes(batch.scope)) return null;
    return { groupId: batch.groupId, groupVersion: batch.groupVersion, operationId: batch.operationId, scope: batch.scope };
  },
  change: function (r) {
    const base = r && TransactionDomain_.input(Object.assign({}, r, { modality: "single" }));
    const batch = r && this.mutation(r.batch, "save");
    if (!base || base.version < 1 || !batch || !Array.isArray(r.batch.fields) || !r.batch.fields.every(function (key) { return OccurrenceDomain_.fields.includes(key); })) return null;
    const patch = {};
    for (const key of r.batch.fields) patch[key] = base[key];
    return { entry: base, batch: batch, patch: patch };
  },
  group: function (r) {
    if (!r || !AuthDomain_.challenge(r.id) || !AccountDomain_.validVersion(r.version, false) || !["income", "expense"].includes(r.nature) ||
      !this.modalities.includes(r.modality) || !this.frequencies.includes(r.frequency) || !TransactionDomain_.date(r.startDate) ||
      !Number.isInteger(r.anchorDay) || r.anchorDay < 1 || r.anchorDay > 31 || !Number.isInteger(r.plannedCount) || r.plannedCount < 1 || r.plannedCount > 1000 ||
      !Number.isInteger(r.count) || r.count < 0 || r.count > r.plannedCount || !TransactionDomain_.integerText(r.totalCents) || r.totalCents.startsWith("-") ||
      typeof r.renewed !== "boolean" || typeof r.canRenew !== "boolean" ||
      (r.count > 0 && (!TransactionDomain_.date(r.firstDate) || !TransactionDomain_.date(r.lastDate))) ||
      (r.nextDate !== null && !TransactionDomain_.date(r.nextDate)) ||
      (r.modality === "recurring" && (!Number.isInteger(r.durationMonths) || r.durationMonths < 1 || r.durationMonths > 1200))) throw new Error("Conjunto de lançamentos inválido.");
    return { id: r.id, version: r.version, nature: r.nature, modality: r.modality, frequency: r.frequency, startDate: r.startDate,
      anchorDay: r.anchorDay, durationMonths: r.durationMonths, plannedCount: r.plannedCount, count: r.count, totalCents: r.totalCents,
      firstDate: r.firstDate, lastDate: r.lastDate, nextDate: r.nextDate, renewed: r.renewed, canRenew: r.canRenew };
  },
  notice: function (r) {
    if (!r || typeof r.description !== "string" || Array.from(r.description).length > 160 || !TransactionDomain_.date(r.date)) throw new Error("Aviso de recorrência inválido.");
    return { group: this.group(r.group), description: r.description, date: r.date };
  },
  preview: function (r) {
    if (!r || !Number.isInteger(r.count) || r.count < 1 || r.count > 1000 || !TransactionDomain_.integerText(r.totalCents) || r.totalCents.startsWith("-") ||
      !TransactionDomain_.date(r.firstDate) || !TransactionDomain_.date(r.lastDate) || !Number.isSafeInteger(r.firstAmountCents) || r.firstAmountCents < 1 ||
      !Number.isSafeInteger(r.regularAmountCents) || r.regularAmountCents < 1 || !Array.isArray(r.samples)) throw new Error("Prévia de lançamentos inválida.");
    return { count: r.count, totalCents: r.totalCents, firstDate: r.firstDate, lastDate: r.lastDate,
      firstAmountCents: r.firstAmountCents, regularAmountCents: r.regularAmountCents };
  },
});
