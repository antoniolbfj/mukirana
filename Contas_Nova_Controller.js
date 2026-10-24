/** Fronteira autenticada de Contas; ambas as interfaces usam os mesmos contratos. */
const ContasNova_ = Object.freeze({
  uuid: function (value) { return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value); },
  date: function (value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' &&
      !isNaN(new Date(value + 'T12:00:00Z').getTime()) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
  },
  cents: function (value) { return typeof value === 'string' && value.length <= 32 && /^-?(0|[1-9]\d*)$/.test(value); },
  // Soma decimal textual: mantém agregados exatos sem depender de BigInt no Apps Script.
  addCents: function (left, right) {
    const a = String(left), b = String(right), sa = a.charAt(0) === '-', sb = b.charAt(0) === '-';
    let x = sa ? a.slice(1) : a, y = sb ? b.slice(1) : b, result = '', carry = 0, negative = sa;
    if (sa !== sb && (x.length < y.length || (x.length === y.length && x < y))) {
      const temp = x; x = y; y = temp; negative = sb;
    }
    for (let i = x.length - 1, j = y.length - 1; i >= 0 || j >= 0; i--, j--) {
      let digit = Number(x.charAt(i) || 0) + (sa === sb ? Number(y.charAt(j) || 0) : -Number(y.charAt(j) || 0)) + carry;
      if (sa === sb) { carry = digit >= 10 ? 1 : 0; digit %= 10; }
      else { carry = digit < 0 ? -1 : 0; if (digit < 0) digit += 10; }
      result = digit + result;
    }
    if (sa === sb && carry) result = carry + result;
    result = result.replace(/^0+(?=\d)/, '');
    return (negative && result !== '0' ? '-' : '') + result;
  },
  today: function () { return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd'); },
  period: function (filters) {
    const today = this.today(), month = today.slice(0,7), f = filters || {};
    const valid = function (v) { return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v); };
    const start = valid(f.Mes_Inicial || f.Mes_Referencia) ? (f.Mes_Inicial || f.Mes_Referencia) : month;
    const end = valid(f.Mes_Final) && f.Mes_Final >= start ? f.Mes_Final : start;
    const date = new Date(end + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth()+1); date.setUTCDate(0);
    const last = date.toISOString().slice(0,10);
    return { start: start, end: end, asOf: today < last ? today : last, forecastDate: last, today: today };
  },
  rpc: function (name, args) {
    try { return supabaseRpc_(name, args); }
    catch (error) {
      const messages = {
        conflict: 'Esta conta foi alterada. Feche e reabra o cadastro para revisar os dados antes de salvar.',
        duplicate_name: 'Já existe uma conta com este nome entre as contas que você acessa.',
        invalid_participant: 'Revise os participantes: selecione usuários ativos e não inclua o proprietário.',
        forbidden: 'Você não tem permissão para esta operação.', not_found: 'Conta não encontrada.',
        invalid_session: 'Sessão expirada. Faça login novamente.', invalid_request: 'Revise os campos informados.',
        invalid_name: 'Informe um nome com até 160 caracteres.', protected_opening: 'Ajuste o saldo inicial pelo cadastro da conta.'
      };
      const match = String(error && error.message || '').match(/CN:([a-z_]+)/);
      throw new Error(match && messages[match[1]] ? messages[match[1]] : 'Não foi possível concluir a operação. Tente novamente.');
    }
  },
  account: function (row) {
    if (!row || !this.uuid(row.id) || !Number.isInteger(row.version) || row.version < 1 ||
      typeof row.name !== 'string' || typeof row.ownerName !== 'string' ||
      !this.uuid(row.ownerId) || !this.cents(row.openingAmountCents) || !this.date(row.openingDate) ||
      typeof row.canEdit !== 'boolean' || typeof row.active !== 'boolean' || typeof row.shared !== 'boolean' ||
      !Array.isArray(row.participants) || !row.participants.every(this.uuid) ||
      (row.openingId !== null && !this.uuid(row.openingId))) throw new Error('Resposta de contas inválida. Atualize a tela.');
    const result = { id: row.id, version: row.version, name: row.name, ownerId: row.ownerId,
      ownerName: row.ownerName, canEdit: row.canEdit, active: row.active, shared: row.shared,
      openingAmountCents: row.openingAmountCents, openingDate: row.openingDate, openingId: row.openingId,
      participants: row.participants.slice() };
    if (row.currentCents !== undefined) {
      if (!this.cents(row.currentCents) || !this.cents(row.registeredForecastCents)) throw new Error('Saldo inválido. Atualize a tela.');
      result.currentCents = row.currentCents; result.registeredForecastCents = row.registeredForecastCents;
    }
    return result;
  },
  requireSupabase: function () {
    if (!bancoUsaSupabase_()) throw new Error('A nova tela de Contas requer a fonte Supabase ativa.');
  }
});

function contasNovaListar(token, filters) {
  const user = obterSessaoObrigatoria(token); ContasNova_.requireSupabase();
  const period = ContasNova_.period(filters);
  const r = ContasNova_.rpc('rpc_contas_listar_v2', { p_usuario: user.id, p_data_corte: period.asOf, p_data_fim: period.forecastDate });
  if (!r || !Array.isArray(r.accounts)) throw new Error('Não foi possível carregar as contas.');
  return { accounts: r.accounts.map(function(a) { return ContasNova_.account(a); }),
    asOf: period.asOf, forecastDate: period.forecastDate, today: period.today };
}

function contasNovaSalvar(token, request) {
  const user = obterSessaoObrigatoria(token); ContasNova_.requireSupabase(); const r = request || {};
  if (!ContasNova_.uuid(r.id) || !ContasNova_.uuid(r.operationId) || !Number.isInteger(r.version) || r.version < 0 ||
    typeof r.name !== 'string' || !r.name.trim() || r.name.trim().length > 160 ||
    !ContasNova_.cents(r.openingAmountCents) || Number(r.openingAmountCents) > 99999999999999 ||
    Number(r.openingAmountCents) < -99999999999999 || !ContasNova_.date(r.openingDate) ||
    typeof r.shared !== 'boolean' || !Array.isArray(r.participants) || r.participants.length > 500 ||
    !r.participants.every(ContasNova_.uuid)) throw new Error('Revise os campos informados.');
  const result = ContasNova_.rpc('rpc_contas_salvar_v2', { p_usuario: user.id, p_conta: r.id,
    p_versao: r.version, p_operacao: r.operationId, p_nome: r.name.trim(), p_saldo_cents: r.openingAmountCents,
    p_data: r.openingDate, p_compartilhada: r.shared, p_participantes: r.shared ? r.participants : [] });
  return { account: ContasNova_.account(result.account) };
}

function contasNovaStatus(token, request) {
  const user = obterSessaoObrigatoria(token); ContasNova_.requireSupabase(); const r = request || {};
  if (!ContasNova_.uuid(r.id) || !ContasNova_.uuid(r.operationId) || !Number.isInteger(r.version) || r.version < 1 ||
    typeof r.active !== 'boolean') throw new Error('Conta ou versão inválida. Atualize a lista.');
  const result = ContasNova_.rpc('rpc_contas_status_v2', { p_usuario: user.id, p_conta: r.id,
    p_versao: r.version, p_operacao: r.operationId, p_ativa: r.active });
  return { account: ContasNova_.account(result.account) };
}

function contasNovaUsuarios(token, search, accountId) {
  const user = obterSessaoObrigatoria(token); ContasNova_.requireSupabase();
  if (typeof search !== 'string' || search.length > 100 || (accountId != null && !ContasNova_.uuid(accountId))) throw new Error('Busca inválida.');
  const r = ContasNova_.rpc('rpc_contas_usuarios_v2', { p_usuario: user.id, p_busca: search.trim(), p_conta: accountId || null });
  if (!r || !Array.isArray(r.users)) throw new Error('Não foi possível buscar participantes.');
  return { users: r.users.map(function(u) {
    if (!ContasNova_.uuid(u.id) || typeof u.name !== 'string' || typeof u.email !== 'string') throw new Error('Participante inválido.');
    return { id: u.id, name: u.name, email: u.email };
  }) };
}

function contasNovaMovimentos(token, accountId, cursor) {
  const user = obterSessaoObrigatoria(token); ContasNova_.requireSupabase();
  if (!ContasNova_.uuid(accountId) || (cursor != null && (!ContasNova_.date(cursor.date) ||
    typeof cursor.key !== 'string' || !/^[lf]:[0-9a-f-]{36}$/i.test(cursor.key)))) throw new Error('Consulta inválida.');
  const r = ContasNova_.rpc('rpc_contas_movimentos_v2', { p_usuario: user.id, p_conta: accountId,
    p_antes_data: cursor ? cursor.date : null, p_antes_chave: cursor ? cursor.key : null, p_limite: 50 });
  if (!r || !Array.isArray(r.items)) throw new Error('Não foi possível carregar os lançamentos.');
  return { items: r.items.map(function(e) {
    if (!ContasNova_.uuid(e.id) || !ContasNova_.date(e.date) || !ContasNova_.cents(e.amountCents) ||
      typeof e.description !== 'string' || typeof e.type !== 'string' || typeof e.opening !== 'boolean' || typeof e.key !== 'string') throw new Error('Lançamento inválido.');
    return { id: e.id, key: e.key, date: e.date, description: e.description, type: e.type,
      opening: e.opening, amountCents: e.amountCents };
  }), nextCursor: r.nextCursor || null };
}

/** Segunda etapa: a lista já fica utilizável enquanto as recorrências são calculadas. */
function contasNovaPrevisoes(token, filters) {
  const user = obterSessaoObrigatoria(token); ContasNova_.requireSupabase(); const period = ContasNova_.period(filters);
  const base = obterContextoFinanceiroSupabaseRpc_(user.id, period.end, true);
  if (!base) throw new Error('Previsão indisponível. Tente atualizar a tela.');
  const context = montarContextoConsolidadosAPartirBase_(user, base, null, 'RPC');
  const allowed = {};
  (context.contasTodas || []).forEach(function(a) {
    if (a.Ativa && usuarioPodeVisualizarContaController_(a,user.id)) allowed[a.ID_Conta] = '0';
  });
  const generated = gerarLancamentosProgramadosRecorrenciasConsolidadoController_(context,
    { Mes_Inicial: period.start < period.today.slice(0,7) ? period.start : period.today.slice(0,7), Mes_Final: period.end, Mes_Referencia: period.start });
  (generated.lancamentos || []).forEach(function(e) {
    const amount = Math.round(Number(e.Valor_Total) * 100);
    if (!Number.isSafeInteger(amount)) throw new Error('Valor de previsão inválido.');
    const source = e.ID_Origem, target = e.ID_Destino;
    if (e.Tipo_Origem === 'Conta' && allowed[source] !== undefined) {
      allowed[source] = ContasNova_.addCents(allowed[source], String(e.Tipo === 'Receita' ? amount : -amount));
    }
    if (e.Tipo === 'Transferência' && allowed[target] !== undefined) allowed[target] = ContasNova_.addCents(allowed[target], String(amount));
  });
  const deltas = {}; Object.keys(allowed).forEach(function(id) { deltas[id] = allowed[id].toString(); });
  return { deltas: deltas, forecastDate: period.forecastDate };
}

/** Somente apresentação: não entra no contexto de receitas, despesas ou rateios. */
function montarSaldosIniciaisParaTela_(contexto) {
  if (!bancoUsaSupabase_()) return [];
  const today = ContasNova_.today();
  const result = ContasNova_.rpc('rpc_contas_listar_v2', {
    p_usuario: contexto.idLogado, p_data_corte: today, p_data_fim: today
  });
  return (result.accounts || []).filter(function(a) { return a.openingId && a.openingAmountCents !== '0'; }).map(function(row) {
    const a = ContasNova_.account(row);
    return { ID_Lancamento: a.openingId, Tipo: 'Saldo Inicial',
      Descricao: 'Saldo Inicial da Conta ' + a.name, Valor_Total: Number(a.openingAmountCents) / 100,
      Data_Ocorrencia: a.openingDate, Mes_Referencia: a.openingDate.slice(0,7),
      Tipo_Origem: 'Conta', ID_Origem: a.id, ID_Destino: '', ID_Categoria: '', ID_Projeto: '',
      Status: 'Efetivado', Criado_Por_ID: a.ownerId, Nome_Conta: a.name, _Saldo_Inicial: true };
  });
}
