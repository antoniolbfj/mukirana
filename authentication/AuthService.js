/** Mecanismo único de OTP/sessão, reutilizado por todas as funcionalidades. */
const AuthService_ = Object.freeze({
  /**
   * Emite e envia um OTP. O retorno público nunca inclui o código.
   * O bloqueio protege a quota compartilhada; limites por e-mail persistem no banco.
   */
  requestCode: function (email) {
    const normalized = AuthDomain_.email(email);
    if (!normalized) return { status: "invalid_request" };
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return { status: "busy" };
    try {
      if (MailApp.getRemainingDailyQuota() < 1) return { status: "delivery_unavailable" };
      const challenge = AuthDao_.issue(normalized);
      if (challenge.status === "rate_limited") {
        return {
          status: "rate_limited",
          retryAfterSeconds: Math.max(1, Math.min(3600, Number(challenge.retryAfterSeconds) || 60)),
        };
      }
      if (
        challenge.status !== "created" ||
        !AuthDomain_.challenge(challenge.challengeId) ||
        !AuthDomain_.code(challenge.code) ||
        !Number.isFinite(Date.parse(challenge.expiresAt))
      ) {
        throw new Error("Contrato de emissão inválido.");
      }
      try {
        MailApp.sendEmail({
          to: normalized,
          name: "Mukirana",
          subject: "Seu código de acesso ao Mukirana",
          body:
            "Seu código de acesso é: " +
            challenge.code +
            "\n\nEle vale por 10 minutos e só pode ser usado uma vez. Não compartilhe este código." +
            "\nSe você não solicitou este acesso, ignore esta mensagem.",
        });
      } catch (error) {
        // Mesmo se a invalidação falhar, o desafio pendente não pode ser consumido.
        try {
          AuthDao_.delivery(challenge.challengeId, false);
        } catch (ignored) {
          /* Falha fechada. */
        }
        return { status: "delivery_unavailable" };
      }
      // Envio aceito pelo Google não garante recebimento; confirmação falha não é sucesso.
      if (AuthDao_.delivery(challenge.challengeId, true) !== true) {
        return { status: "delivery_unconfirmed" };
      }
      return {
        status: "code_sent",
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        retryAfterSeconds: 60,
      };
    } finally {
      lock.releaseLock();
    }
  },
  verifyCode: function (id, code) {
    if (!AuthDomain_.challenge(id) || !AuthDomain_.code(code)) return { status: "invalid_code" };
    const result = AuthDao_.verify(id, code);
    if (result.status === "invalid_code") return { status: "invalid_code" };
    const dto = AuthDomain_.sessionDto(result, true);
    if (dto.status !== "authenticated") throw new Error("Verificação inconclusiva.");
    return dto;
  },
  resolveSession: function (token) {
    if (!AuthDomain_.token(token)) return { status: "invalid_session" };
    return AuthDomain_.sessionDto(AuthDao_.resolve(token), false);
  },
  /** Operações protegidas derivam identidade exclusivamente do token validado. */
  requireSession: function (token) {
    const session = this.resolveSession(token);
    if (session.status !== "authenticated") throw new Error("AUTH_REQUIRED");
    return session;
  },
  logout: function (token, allDevices) {
    if (!AuthDomain_.token(token) || typeof allDevices !== "boolean")
      return { status: "invalid_session" };
    const result = AuthDao_.revoke(token, allDevices);
    return { status: result.status === "logged_out" ? "logged_out" : "invalid_session" };
  },
});
