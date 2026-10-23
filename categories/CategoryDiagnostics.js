/** Cenários de leitura dos serviços reais, sem registros de teste. */
const CategoryDiagnostics_ = Object.freeze({
  catalog: function () {
    return [
      { id: "categories.schema", title: "Estrutura de Categorias",
        objective: "Conferir a tabela única e os serviços de categorias e subcategorias.",
        expected: "Estrutura de Categorias na revisão 1.", criterion: "Fundação de Categorias" },
      { id: "categories.read", title: "Consultar minhas categorias",
        objective: "Validar os contratos e a visibilidade das classificações automáticas.",
        expected: "Somente suas categorias e classificações automáticas em uso.", criterion: "Consulta de Categorias" },
      { id: "categories.rejection", title: "Recusar categorias sem sessão",
        objective: "Tentar consultar categorias sem uma sessão.",
        expected: "Consulta recusada.", criterion: "Acesso protegido" },
    ];
  },
  run: function (token, id) {
    let passed = false; let evidence = "";
    if (id === "categories.schema") {
      CategoryDao_.health(); passed = true;
      evidence = "O banco confirmou a tabela única e a revisão 1 de Categorias.";
    } else if (id === "categories.read") {
      const result = CategoryService_.list(token);
      if (result.status === "invalid_session") return { status: "invalid_session" };
      passed = result.status === "ok" && result.categories.every(function (row) {
        return row.systemKey === null || row.linkedCount > 0;
      });
      evidence = passed ? "Consulta autorizada: " + result.categories.length + " classificação(ões) disponível(is)."
        : "A consulta não concluiu a validação.";
    } else if (id === "categories.rejection") {
      try { CategoryService_.list(""); } catch (error) { passed = error.message === "AUTH_REQUIRED"; }
      evidence = passed ? "A consulta sem sessão foi recusada." : "A consulta sem sessão foi aceita indevidamente.";
    } else return { status: "invalid_request" };
    return { status: passed ? "passed" : "failed", id: id, evidence: evidence };
  },
});
