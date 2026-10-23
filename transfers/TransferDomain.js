/** Transferência própria: uma operação, duas contas e um valor positivo em centavos. */
const TransferDomain_ = Object.freeze({
  input: function (request) {
    if (!request || !AuthDomain_.challenge(request.id) || !AccountDomain_.validVersion(request.version, true) ||
      typeof request.description !== "string" || /[\u0000-\u001f\u007f]/.test(request.description) ||
      !Number.isSafeInteger(request.amountCents) || request.amountCents < 1 || request.amountCents > 99999999999999 ||
      !TransactionDomain_.date(request.date) || !AuthDomain_.challenge(request.sourceAccountId) ||
      !AuthDomain_.challenge(request.destinationAccountId) || request.sourceAccountId === request.destinationAccountId) return null;
    const description = request.description.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!description || Array.from(description).length > 160) return null;
    return { id: request.id, version: request.version, description: description, amountCents: request.amountCents,
      date: request.date, sourceAccountId: request.sourceAccountId, destinationAccountId: request.destinationAccountId };
  },
  dto: function (row) {
    const value = this.input(row);
    if (!value || value.version < 1) throw new Error("Contrato de transferência inválido.");
    return value;
  },
  filters: function (request) {
    const f = TransactionDomain_.filters(request);
    if (!f) return null;
    return { startDate: f.startDate, endDate: f.endDate, accountId: f.accountId, query: f.query,
      cursorDate: f.cursorDate, cursorId: f.cursorId, limit: f.limit };
  },
});
