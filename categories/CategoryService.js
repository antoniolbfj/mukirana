/** Categorias individuais; categorias reservadas não são cadastráveis. */
const CategoryService_ = Object.freeze({
  list: function (token) {
    AuthService_.requireSession(token);
    const result = CategoryDao_.list(token);
    if (result.status === "invalid_session") return { status: "invalid_session" };
    if (result.status !== "ok" || !Array.isArray(result.categories))
      throw new Error("Lista de categorias incompleta.");
    return {
      status: "ok",
      deletionAvailable: result.deletionAvailable === true,
      categories: result.categories.map(function (row) { return CategoryDomain_.dto(row); })
        .filter(function (row) { return row.systemKey === null || row.linkedCount > 0; }),
    };
  },
  save: function (token, request) {
    AuthService_.requireSession(token);
    const input = CategoryDomain_.input(request);
    if (!input) return { status: "invalid_request" };
    const result = CategoryDao_.save(token, input);
    if (result.status === "saved")
      return { status: "saved", category: CategoryDomain_.dto(result.category) };
    return this.failure(result.status);
  },
  remove: function (token, id, version) {
    AuthService_.requireSession(token);
    if (!AuthDomain_.challenge(id) || !CategoryDomain_.version(version, false))
      return { status: "invalid_request" };
    const result = CategoryDao_.remove(token, id, version);
    if (result.status === "deleted") return { status: "deleted" };
    return this.failure(result.status);
  },
  failure: function (status) {
    if (!["invalid_session", "invalid_request", "invalid_name", "invalid_parent", "not_found",
      "conflict", "duplicate", "reserved", "reserved_name", "has_children", "linked"].includes(status))
      throw new Error("Operação de categoria inconclusiva.");
    return { status: status };
  },
});
