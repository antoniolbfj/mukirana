/** Contratos monetários e cadastrais do módulo. initialCents não é saldo atual. */
const AccountDomain_ = Object.freeze({
  types: Object.freeze(["consumption", "investment", "credit"]),
  validVersion: function (value, creating) {
    return Number.isInteger(value) && value >= (creating ? 0 : 1) && value <= 2147483647;
  },
  validAmount: function (value) {
    return value === null || (Number.isSafeInteger(value) && Math.abs(value) <= 99999999999999);
  },
  /** Aceita somente campos conhecidos; identidade nunca faz parte do cadastro. */
  input: function (request) {
    if (
      !request ||
      !AuthDomain_.challenge(request.id) ||
      !this.validVersion(request.version, true) ||
      typeof request.name !== "string" ||
      !this.types.includes(request.type) ||
      !this.validAmount(request.initialCents) ||
      typeof request.confirmTypeChange !== "boolean"
    )
      return null;
    if (request.openingDate != null && !TransactionDomain_.date(request.openingDate)) return null;
    const name = request.name.trim();
    if (
      Array.from(name).length < 1 ||
      Array.from(name).length > 80 ||
      /[\u0000-\u001f\u007f]/.test(name)
    )
      return null;
    return {
      id: request.id,
      version: request.version,
      name: name,
      type: request.type,
      initialCents: request.initialCents,
      confirmTypeChange: request.confirmTypeChange,
      openingDate: request.openingDate || null,
    };
  },
  dto: function (row) {
    const value = this.input(Object.assign({}, row, { confirmTypeChange: false }));
    if (!value || !this.validVersion(value.version, false))
      throw new Error("Contrato de conta inválido.");
    if (typeof row.balanceCents !== "string" || !/^-?(0|[1-9]\d*)$/.test(row.balanceCents) ||
      (value.initialCents !== null && !TransactionDomain_.date(value.openingDate)))
      throw new Error("Saldo de conta inválido.");
    const result = {
      id: value.id,
      version: value.version,
      name: value.name,
      type: value.type,
      initialCents: value.initialCents,
      openingDate: value.openingDate,
      balanceCents: row.balanceCents,
    };
    if (row.projectedCents !== undefined) {
      if (typeof row.projectedCents !== "string" || !/^-?(0|[1-9]\d*)$/.test(row.projectedCents))
        throw new Error("Projeção de conta inválida.");
      result.projectedCents = row.projectedCents;
    }
    return result;
  },
});
