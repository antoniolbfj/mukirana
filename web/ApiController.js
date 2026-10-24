/** Única fronteira de RPC da interface. Não propaga exceções ou dados internos. */
function api(request) {
  if (!request || typeof request !== "object" || typeof request.action !== "string") {
    return { status: "invalid_request" };
  }
  try {
    switch (request.action) {
      case "auth.request":
        return AuthService_.requestCode(request.email);
      case "auth.verify":
        return AuthService_.verifyCode(request.challengeId, request.code);
      case "auth.resolve":
        return AuthService_.resolveSession(request.token);
      case "auth.logout":
        return AuthService_.logout(request.token, request.allDevices);
      case "accounts.list":
        return AccountService_.list(request.token);
      case "accounts.save":
        return AccountService_.save(request.token, request.account);
      case "accounts.delete":
        return AccountService_.remove(request.token, request.id, request.version);
      case "categories.list":
        return CategoryService_.list(request.token);
      case "categories.save":
        return CategoryService_.save(request.token, request.category);
      case "categories.delete":
        return CategoryService_.remove(request.token, request.id, request.version);
      case "transactions.list":
        return EntryService_.list(request.token, request.filter);
      case "transactions.save":
        return EntryService_.save(request.token, request.entry);
      case "transactions.delete":
        return EntryService_.remove(request.token, request.id, request.version, request.kind);
      case "transfers.list":
        return TransferService_.list(request.token, request.filter);
      case "transfers.save":
        return TransferService_.save(request.token, request.entry);
      case "transfers.delete":
        return TransferService_.remove(request.token, request.id, request.version);
      case "tests.catalog":
        AuthService_.requireSession(request.token);
        return { status: "ready", version: "0.4.1", scenarios: DiagnosticsService_.catalog() };
      case "tests.run":
        return DiagnosticsService_.run(request.token, request.id);
      default:
        return { status: "invalid_request" };
    }
  } catch (error) {
    // Exceções de serviços externos podem conter destinatário, token ou credencial.
    return { status: error.message === "AUTH_REQUIRED" ? "invalid_session" : "unavailable" };
  }
}
