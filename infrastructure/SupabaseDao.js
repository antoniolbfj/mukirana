/** Acesso compartilhado ao banco. Nenhuma função deste arquivo é exposta à View. */
const SupabaseDao_ = Object.freeze({
  /**
   * Confirma acesso à função de diagnóstico, restrita ao backend no PostgreSQL.
   * Não lê nem altera dados financeiros e não retorna detalhes de credenciais.
   * @return {{service: string, purpose: string, revision: number}} Diagnóstico validado.
   */
  rpc: function (name, parameters) {
    if (!/^mukirana_[a-z_]+$/.test(name)) throw new Error("Operação de banco inválida.");
    const config = readSupabaseConfig_();
    let response;
    try {
      response = UrlFetchApp.fetch(config.url + "/rest/v1/rpc/" + name, {
        method: "post",
        contentType: "application/json",
        headers: { apikey: config.secretKey },
        payload: JSON.stringify(parameters || {}),
        muteHttpExceptions: true,
        followRedirects: false,
        validateHttpsCertificates: true,
      });
    } catch (error) {
      // Exceções externas podem carregar detalhes de requisição; não as retransmita.
      throw new Error(
        "Não foi possível conectar ao Supabase. Verifique a disponibilidade do serviço.",
      );
    }

    const status = response.getResponseCode();
    if (status === 401 || status === 403) {
      throw new Error("Supabase recusou o acesso. Verifique a secret key e a permissão da função.");
    }
    if (status === 404) {
      throw new Error(
        "A função de diagnóstico não foi encontrada. Aplique a migração de configuração.",
      );
    }
    if (status !== 200) {
      throw new Error("O diagnóstico do Supabase falhou. Código HTTP: " + status + ".");
    }

    let result;
    try {
      result = JSON.parse(response.getContentText());
    } catch (error) {
      throw new Error("O Supabase retornou uma resposta de diagnóstico inválida.");
    }
    return result;
  },

  checkConnection: function () {
    const result = this.rpc("mukirana_health_check", {});
    if (
      !result ||
      result.service !== "mukirana" ||
      result.purpose !== "connectivity" ||
      result.revision !== 1
    ) {
      throw new Error("A resposta não corresponde ao diagnóstico esperado do Mukirana.");
    }

    // Reconstrói a saída para não propagar campos inesperados retornados pelo servidor.
    return { service: result.service, purpose: result.purpose, revision: result.revision };
  },
});
