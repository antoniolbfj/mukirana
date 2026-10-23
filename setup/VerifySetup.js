/**
 * Ponto de entrada para execução manual pelo editor Apps Script.
 * Por ter nome público, recusa chamadas anônimas ou de outra conta de execução.
 * Não substitui a autenticação financeira; a futura aplicação executará como seu
 * proprietário. Este diagnóstico administrativo não será usado pela View.
 * @return {{status: string, service: string, purpose: string, revision: number}} Resultado seguro.
 */
function verifySupabaseSetup() {
  const activeEmail = Session.getActiveUser().getEmail();
  const effectiveEmail = Session.getEffectiveUser().getEmail();
  if (!activeEmail || !effectiveEmail || activeEmail !== effectiveEmail) {
    throw new Error("Execute o diagnóstico pelo editor, na própria conta Google de execução.");
  }
  return verifySupabaseSetup_();
}

/**
 * Diagnóstico interno. O sufixo '_' impede chamadas por google.script.run.
 * @return {{status: string, service: string, purpose: string, revision: number}} Resultado seguro.
 */
function verifySupabaseSetup_() {
  const health = SupabaseDao_.checkConnection();
  const result = {
    status: "ok",
    service: health.service,
    purpose: health.purpose,
    revision: health.revision,
  };
  console.log(JSON.stringify(result));
  return result;
}
