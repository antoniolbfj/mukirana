/** Views do aplicativo e protótipo de avaliação; nenhuma propriedade do script entra na View. */
function doGet(event) {
  const categoriesPrototype =
    event && event.parameter && event.parameter.prototype === "categories";
  const output = categoriesPrototype
    ? HtmlService.createHtmlOutputFromFile("prototypes/Categories")
    : HtmlService.createTemplateFromFile("generated/App").evaluate();
  return output
    .setTitle(categoriesPrototype ? "Mukirana · Categorias — protótipo" : "Mukirana")
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
    );
}

/** Includes fixos e privados. Nenhum nome de arquivo vem da requisição. */
function includeCategoriesView_() {
  return HtmlService.createHtmlOutputFromFile("categories/CategoriesView").getContent();
}
function includeCategoryClient_() {
  return HtmlService.createHtmlOutputFromFile("categories/CategoryClient").getContent();
}
function includeFinanceStyles_() {
  return HtmlService.createHtmlOutputFromFile("web/FinanceStyles").getContent();
}
function includeFinanceClient_() {
  return HtmlService.createHtmlOutputFromFile("web/FinanceClient").getContent();
}
function includeTransactionsView_() {
  return HtmlService.createTemplateFromFile("transactions/TransactionsView").evaluate().getContent();
}
function includeTransactionClient_() {
  return HtmlService.createHtmlOutputFromFile("transactions/TransactionClient").getContent();
}

/** Executar no editor para conceder o novo escopo de e-mail; não envia mensagens. */
function authorizeMukirana() {
  const activeEmail = Session.getActiveUser().getEmail();
  const effectiveEmail = Session.getEffectiveUser().getEmail();
  if (!activeEmail || activeEmail !== effectiveEmail)
    throw new Error("Execute pela conta proprietária no editor.");
  const health = AuthDao_.health();
  const quota = MailApp.getRemainingDailyQuota();
  const result = { status: "ok", module: health.module, emailAvailable: quota > 0 };
  console.log(JSON.stringify(result));
  return result;
}
