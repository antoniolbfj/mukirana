/** Cadastro sem identidade de usuário ou campos de sistema recebidos da View. */
const CategoryDomain_ = Object.freeze({
  version: function (value, creating) {
    return Number.isInteger(value) && value >= (creating ? 0 : 1) && value <= 2147483647;
  },
  input: function (request) {
    if (!request || !AuthDomain_.challenge(request.id) ||
        !this.version(request.version, true) || typeof request.name !== "string" ||
        (request.parentId !== null && !AuthDomain_.challenge(request.parentId)) ||
        /[\u0000-\u001f\u007f]/.test(request.name)) return null;
    const name = request.name.normalize("NFC").trim().replace(/\s+/g, " ");
    if (Array.from(name).length < 1 || Array.from(name).length > 80) return null;
    return { id: request.id, version: request.version, name: name, parentId: request.parentId };
  },
  dto: function (row) {
    const value = this.input(row);
    if (!value || !this.version(value.version, false) ||
        (row.systemKey !== null && (typeof row.systemKey !== "string" ||
          !/^[a-z][a-z0-9_]{0,79}$/.test(row.systemKey))) ||
        !Number.isSafeInteger(row.linkedCount) || row.linkedCount < 0)
      throw new Error("Contrato de categoria inválido.");
    return Object.assign(value, { systemKey: row.systemKey, linkedCount: row.linkedCount });
  },
});
