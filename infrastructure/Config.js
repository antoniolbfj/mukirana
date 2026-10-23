/**
 * Lê somente as propriedades necessárias no backend.
 * A URL pública fica configurada por ambiente; a chave nunca vai para a View.
 * @return {{url: string, secretKey: string}} Configuração privada de execução.
 */
function readSupabaseConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const url = (properties.getProperty("SUPABASE_URL") || "").trim();
  const secretKey = (properties.getProperty("SUPABASE_SECRET_KEY") || "").trim();

  if (!url || !secretKey) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY nas propriedades do script.");
  }
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) {
    throw new Error("SUPABASE_URL deve ser a URL HTTPS do projeto, sem caminho ou barra final.");
  }
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY deve ser uma secret key de servidor do Supabase.");
  }

  return { url: url, secretKey: secretKey };
}
