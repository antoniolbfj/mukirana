/** As RPCs revalidam sessão e propriedade dentro da transação. */
const CategoryDao_ = Object.freeze({
  list: function (token) {
    return SupabaseDao_.rpc("mukirana_categories_list", { p_session_token: token });
  },
  save: function (token, category) {
    return SupabaseDao_.rpc("mukirana_categories_save", {
      p_session_token: token, p_category_id: category.id,
      p_expected_version: category.version, p_name: category.name, p_parent_id: category.parentId,
    });
  },
  remove: function (token, id, version) {
    return SupabaseDao_.rpc("mukirana_categories_delete", {
      p_session_token: token, p_category_id: id, p_expected_version: version,
    });
  },
  health: function () {
    const result = SupabaseDao_.rpc("mukirana_categories_health_check", {});
    if (!result || result.service !== "mukirana" || result.module !== "categories" ||
        result.revision !== 1 || result.tables !== 1 || result.levels !== 2)
      throw new Error("Estrutura de categorias incompatível.");
    return { module: "categories", revision: 1, tables: 1, levels: 2 };
  },
});
