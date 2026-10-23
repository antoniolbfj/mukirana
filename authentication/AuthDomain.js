/** Valida contratos externos antes de alcançar APIs Google ou PostgreSQL. */
const AuthDomain_ = Object.freeze({
  email: function (value) {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    // Recusa separadores e delimitadores de listas aceitos pelo MailApp.
    return email.length <= 254 &&
      /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)
      ? email
      : null;
  },
  challenge: function (value) {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    );
  },
  code: function (value) {
    return typeof value === "string" && /^[0-9]{6}$/.test(value);
  },
  token: function (value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  },
  /** Reconstrói a identidade; nunca repassa registros completos à View. */
  sessionDto: function (result, includeToken) {
    if (!result || result.status !== "authenticated") return { status: "invalid_session" };
    if (
      !result.user ||
      !this.challenge(result.user.id) ||
      !this.email(result.user.email) ||
      !Number.isFinite(Date.parse(result.expiresAt)) ||
      (includeToken && !this.token(result.sessionToken))
    ) {
      throw new Error("Contrato de sessão inválido.");
    }
    const dto = {
      status: "authenticated",
      expiresAt: result.expiresAt,
      user: { id: result.user.id, email: result.user.email },
    };
    if (includeToken) dto.sessionToken = result.sessionToken;
    return dto;
  },
});
