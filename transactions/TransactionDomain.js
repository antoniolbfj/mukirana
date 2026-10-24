/** Contratos do módulo: datas civis, centavos inteiros e somente modalidades suportadas. */
const TransactionDomain_ = Object.freeze({
  date: function (value) {
    if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  },
  input: function (request) {
    if (!request || !AuthDomain_.challenge(request.id) || !AccountDomain_.validVersion(request.version, true) ||
      !["income", "expense"].includes(request.nature) ||
      typeof request.description !== "string" || /[\u0000-\u001f\u007f]/.test(request.description) ||
      !Number.isSafeInteger(request.amountCents) || request.amountCents < 1 || request.amountCents > 99999999999999 ||
      !this.date(request.date) || !AuthDomain_.challenge(request.accountId) || !AuthDomain_.challenge(request.categoryId) ||
      !["fixed", "variable"].includes(request.classification) || request.modality !== "single") return null;
    const description = request.description.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!description || Array.from(description).length > 160) return null;
    return { id: request.id, version: request.version, nature: request.nature, description: description,
      amountCents: request.amountCents, date: request.date, accountId: request.accountId,
      categoryId: request.categoryId, classification: request.classification, modality: "single" };
  },
  dto: function (row) {
    if (!row || !["standard", "opening_balance"].includes(row.kind)) throw new Error("Tipo de lançamento inválido.");
    if (!["single", "installment", "recurring"].includes(row.modality) || (row.modality !== "single" && (row.kind !== "standard" || !AuthDomain_.challenge(row.groupId) || !Number.isInteger(row.occurrenceIndex) || row.occurrenceIndex < 1 || row.occurrenceIndex > 1000))) throw new Error("Modalidade de lançamento inválida.");
    const zeroOpening = row.kind === "opening_balance" && row.amountCents === 0;
    const value = this.input(Object.assign({}, row, { amountCents: zeroOpening ? 1 : row.amountCents, modality: "single" }));
    if (!value || value.version < 1) throw new Error("Contrato de lançamento inválido.");
    value.amountCents = row.amountCents;
    value.kind = row.kind; value.modality = row.modality;
    if (row.modality !== "single") { value.groupId = row.groupId; value.occurrenceIndex = row.occurrenceIndex; }
    return value;
  },
  filters: function (request) {
    const r = request || {};
    const value = {};
    for (const key of ["startDate", "endDate", "cursorDate"]) {
      value[key] = r[key] == null ? null : r[key];
      if (value[key] !== null && !this.date(value[key])) return null;
    }
    for (const key of ["accountId", "categoryId", "cursorId"]) {
      value[key] = r[key] == null ? null : r[key];
      if (value[key] !== null && !AuthDomain_.challenge(value[key])) return null;
    }
    if ((value.cursorDate === null) !== (value.cursorId === null) ||
      (value.startDate && value.endDate && value.startDate > value.endDate)) return null;
    value.nature = r.nature == null ? null : r.nature;
    value.classification = r.classification == null ? null : r.classification;
    value.query = r.query == null ? "" : r.query;
    value.limit = r.limit == null ? 50 : r.limit;
    if ((value.nature !== null && !["income", "expense"].includes(value.nature)) ||
      (value.classification !== null && !["fixed", "variable"].includes(value.classification)) ||
      typeof value.query !== "string" || Array.from(value.query).length > 160 ||
      !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100) return null;
    return value;
  },
  integerText: function (value) { return typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value); },
});
