/** API autenticada da tela provisória Cartões; contratos comuns às duas interfaces. */
const CartoesNovo_ = Object.freeze({
  uuid: function(v) { return ContasNova_.uuid(v); },
  cents: function(v) { return ContasNova_.cents(v); },
  period: function(filters) {
    if(filters&&filters.Mes_Selecionado!==undefined){const p=LancamentosNovo_.period(filters);return {start:p.start||null,end:p.end||null,multi:!p.start||p.start!==p.end,today:ContasNova_.today()};}
    const f=filters||{},today=ContasNova_.today(),current=today.slice(0,7);
    const valid=function(v){return typeof v==='string'&&/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(v);};
    const supplied=Object.prototype.hasOwnProperty.call(f,'Mes_Inicial')||Object.prototype.hasOwnProperty.call(f,'Mes_Referencia');
    let start=supplied?(f.Mes_Inicial||f.Mes_Referencia||''):current,end=f.Mes_Final||start;
    if((start&&!valid(start))||(end&&!valid(end))||(start&&end&&start>end))throw new Error('Período inválido.');
    if(!start&&end)start=end;
    if(start&&end&&((Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5))-Number(start.slice(5)))>600)throw new Error('Escolha um intervalo de até 50 anos.');
    return {start:start||null,end:end||null,multi:!start||start!==end,today:today};
  },
  rpc: function(name,args) {
    if(!bancoUsaSupabase_())throw new Error('A nova tela de Cartões requer o Supabase.');
    try{return supabaseRpc_(name,args);}catch(e){
      const errors={conflict:'Este cartão foi alterado. Atualize a lista e reabra o cadastro antes de salvar.',forbidden:'Você não tem permissão para esta operação.',invalid_request:'Revise os campos informados.',duplicate_name:'Você já tem uma fatura com este nome.',invalid_participant:'Selecione somente adicionais ativos e não inclua o titular.',invalid_card:'Cartão não encontrado ou vínculo inválido.',invalid_period:'Período inválido.',invalid_session:'Sessão expirada. Faça login novamente.'};
      const match=String(e&&e.message||'').match(/(?:CK|CN):([a-z_]+)/);
      throw new Error(match&&errors[match[1]]?errors[match[1]]:'Não foi possível concluir. Tente novamente.');
    }
  },
  group: function(g) {
    if(!g||!this.uuid(g.id)||!Number.isInteger(g.version)||g.version<1||typeof g.name!=='string'||!this.uuid(g.ownerId)||typeof g.ownerName!=='string'||typeof g.canEdit!=='boolean'||typeof g.active!=='boolean'||['owner','additional','history'].indexOf(g.role)<0||!Number.isInteger(g.closingDay)||g.closingDay<1||g.closingDay>31||!Number.isInteger(g.dueDay)||g.dueDay<1||g.dueDay>31||!Number.isInteger(g.cardsCount)||!Array.isArray(g.participants)||!g.participants.every(this.uuid)||(g.canEdit?!this.cents(g.limitCents):g.limitCents!==null))throw new Error('Resposta de cartões inválida. Atualize a tela.');
    const result={id:g.id,version:g.version,name:g.name,ownerId:g.ownerId,ownerName:g.ownerName,canEdit:g.canEdit,active:g.active,role:g.role,limitCents:g.limitCents,closingDay:g.closingDay,dueDay:g.dueDay,cardsCount:g.cardsCount,participants:g.canEdit?g.participants.slice():[]};
    if(g.openingCents!==undefined){if(g.canEdit? !this.cents(g.openingCents):g.openingCents!==null)throw new Error('Saldo inicial de crédito inválido.');result.openingCents=g.openingCents;result.openingDate=g.openingDate||null;}
    if(g.registeredCents!==undefined){
      if(!this.cents(g.registeredCents))throw new Error('Valor de cartão inválido.');result.registeredCents=g.registeredCents;
      ['paidCents','scheduledPaymentsCents','openCents','creditCents'].forEach(function(k){if(g.canEdit?!ContasNova_.cents(g[k]):g[k]!==null)throw new Error('Resumo de cartão inválido.');result[k]=g[k];});
    }
    if(g.months!==undefined){
      if(!Array.isArray(g.months))throw new Error('Competências inválidas.');
      result.months=g.months.map(function(m){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month)||!ContasNova_.cents(m.registeredCents))throw new Error('Competência inválida.');
        const row={month:m.month,registeredCents:m.registeredCents};['paidCents','scheduledPaymentsCents','openCents','creditCents'].forEach(function(k){if(g.canEdit?!ContasNova_.cents(m[k]):m[k]!==null)throw new Error('Valor de competência inválido.');row[k]=m[k];});return row;});
    }
    return result;
  },
  detail: function(userId,groupId,period) {
    const r=this.rpc('rpc_cartoes_detalhar_v2',{p_usuario:userId,p_grupo:groupId,p_inicio:period.start?period.start+'-01':null,p_fim:period.end?period.end+'-01':null});
    if(!r||!Array.isArray(r.cards))throw new Error('Não foi possível carregar os cartões vinculados.');
    return {group:this.group(r.group),cards:r.cards.map(function(c){if(!ContasNova_.uuid(c.id)||!ContasNova_.uuid(c.userId)||typeof c.name!=='string'||typeof c.userName!=='string'||['Titular','Adicional'].indexOf(c.type)<0||typeof c.active!=='boolean'||typeof c.userActive!=='boolean'||!ContasNova_.cents(c.registeredCents))throw new Error('Cartão vinculado inválido.');
      return {id:c.id,userId:c.userId,name:c.name,userName:c.userName,type:c.type,active:c.active,userActive:c.userActive,registeredCents:c.registeredCents};})};
  },
  // Recorrências antigas podem ter mais de 400 ocorrências: avançar até a janela sem truncar silenciosamente.
  dates: function(r,ctx,start,end) {
    let date=r.Data_Inicio,iterations=0;const result=[];
    if(r.Periodicidade_Tipo==='Personalizada'&&Number.isInteger(Number(r.Intervalo_Dias))&&Number(r.Intervalo_Dias)>0&&date<start){
      const step=Number(r.Intervalo_Dias),diff=(Date.parse(start+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000;
      const moved=new Date(date+'T12:00:00Z');moved.setUTCDate(moved.getUTCDate()+Math.ceil(diff/step)*step);date=moved.toISOString().slice(0,10);
    }
    while(date&&date<=end){
      if(++iterations>120000)throw new Error('Não foi possível concluir a previsão deste período.');
      if(date>=start&&!recorrenciaJaGerouLancamentoConsolidadoController_(r,ctx,date))result.push(date);
      const next=calcularProximaDataRecorrenciaConsolidadoController_(r,date);
      if(next&&next<=date)throw new Error('Periodicidade de recorrência inválida.');date=next;
    }
    return result;
  },
  forecasts: function(userId,period) {
    const result={groups:{},cards:{},snapshot:[]};if(!period.start||!period.end)return result;
    const before=new Date(period.start+'-01T12:00:00Z');before.setUTCMonth(before.getUTCMonth()-1);
    const last=new Date(period.end+'-01T12:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
    const start=before.toISOString().slice(0,10),end=last.toISOString().slice(0,10);
    const raw=this.rpc('rpc_cartoes_previsoes_v2',{p_usuario:userId,p_inicio:start,p_fim:end});
    result.snapshot=(raw.groups_snapshot||[]).map(function(g){return CartoesNovo_.group(g);});
    const ctx=montarContextoFinanceiroAPartirRpc_(raw||{}),groups={},cards={};
    (ctx.gruposCartoesTodos||[]).forEach(function(g){groups[g.ID_Grupo_Cartao]=g;result.groups[g.ID_Grupo_Cartao]='0';});
    (ctx.cartoesTodos||[]).forEach(function(c){cards[c.ID_Cartao]=c;});
    (ctx.recorrenciasTodos||[]).forEach(function(r){const card=cards[r.ID_Origem];if(!card||!groups[card.ID_Grupo_Cartao]||r.Status_Recorrencia!=='Ativa')return;
      const amount=Math.round(Number(r.Valor_Base)*100);if(!Number.isSafeInteger(amount))throw new Error('Valor de previsão inválido.');
      const impact=r.Tipo==='Despesa'?amount:r.Tipo==='Receita'?-amount:0;if(!impact)return;
      CartoesNovo_.dates(r,ctx,start,end).forEach(function(date){const month=calcularMesCompetenciaCartaoPorDataConsolidadoController_(date,card.Dia_Fechamento);if(month<period.start||month>period.end)return;
        if(!result.cards[card.ID_Cartao])result.cards[card.ID_Cartao]={totalCents:'0',count:0,occurrences:[]};const row=result.cards[card.ID_Cartao];
        row.totalCents=ContasNova_.addCents(row.totalCents,String(impact));row.count++;
        row.occurrences.push({cardId:card.ID_Cartao,recurrenceId:r.ID_Recorrencia,date:date,month:month,type:r.Tipo,amountCents:String(amount),description:r.Descricao||'',categoryId:r.ID_Categoria||'',projectId:r.ID_Projeto||''});
        result.groups[card.ID_Grupo_Cartao]=ContasNova_.addCents(result.groups[card.ID_Grupo_Cartao],String(impact));
      });
    });return result;
  },
  legacyNumber: function(value) {const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Valor agregado acima do limite desta tela. Consulte Cartões (novo).');return n/100;}
});
function cartoesNovoListar(token,filters) {
  const user=obterSessaoObrigatoria(token),period=CartoesNovo_.period(filters),r=CartoesNovo_.rpc('rpc_cartoes_listar_v2',{p_usuario:user.id,p_inicio:period.start?period.start+'-01':null,p_fim:period.end?period.end+'-01':null});
  if(!r||!Array.isArray(r.groups))throw new Error('Não foi possível carregar os cartões.');
  return {groups:r.groups.map(function(g){return CartoesNovo_.group(g);}),period:period};
}
function cartoesNovoDetalhar(token,id,filters) {
  const user=obterSessaoObrigatoria(token);if(!CartoesNovo_.uuid(id))throw new Error('Cartão inválido.');
  return CartoesNovo_.detail(user.id,id,CartoesNovo_.period(filters));
}
function cartoesNovoSalvar(token,request) {
  const user=obterSessaoObrigatoria(token),r=request||{};
  if(!CartoesNovo_.uuid(r.id)||!CartoesNovo_.uuid(r.operationId)||!Number.isInteger(r.version)||r.version<0||typeof r.name!=='string'||!r.name.trim()||r.name.trim().length>160||!CartoesNovo_.cents(r.limitCents)||Number(r.limitCents)<0||Number(r.limitCents)>99999999999999||!Number.isInteger(r.closingDay)||r.closingDay<1||r.closingDay>31||!Number.isInteger(r.dueDay)||r.dueDay<1||r.dueDay>31||!Array.isArray(r.participants)||r.participants.length>500||!r.participants.every(CartoesNovo_.uuid))throw new Error('Revise os campos informados.');
  const result=CartoesNovo_.rpc('rpc_cartoes_salvar_v2',{p_usuario:user.id,p_grupo:r.id,p_versao:r.version,p_operacao:r.operationId,p_nome:r.name.trim(),p_limite_cents:r.limitCents,p_fechamento:r.closingDay,p_vencimento:r.dueDay,p_adicionais:r.participants});
  return {group:CartoesNovo_.group(result.group)};
}
function cartoesNovoStatus(token,request) {
  const user=obterSessaoObrigatoria(token),r=request||{};
  if(!CartoesNovo_.uuid(r.id)||!CartoesNovo_.uuid(r.operationId)||!Number.isInteger(r.version)||r.version<1||typeof r.active!=='boolean')throw new Error('Atualize a lista para rever este cartão.');
  const result=CartoesNovo_.rpc('rpc_cartoes_status_v2',{p_usuario:user.id,p_grupo:r.id,p_versao:r.version,p_operacao:r.operationId,p_ativo:r.active});return {group:CartoesNovo_.group(result.group)};
}
function cartoesNovoUsuarios(token,search,id) {
  const user=obterSessaoObrigatoria(token);if(typeof search!=='string'||search.length>100||(id!=null&&!CartoesNovo_.uuid(id)))throw new Error('Busca inválida.');
  const r=CartoesNovo_.rpc('rpc_cartoes_usuarios_v2',{p_usuario:user.id,p_busca:search.trim(),p_grupo:id||null});if(!r||!Array.isArray(r.users))throw new Error('Não foi possível buscar adicionais.');
  return {users:r.users.map(function(u){if(!CartoesNovo_.uuid(u.id)||typeof u.name!=='string'||typeof u.email!=='string'||typeof u.active!=='boolean')throw new Error('Adicional inválido.');return {id:u.id,name:u.name,email:u.email,active:u.active};})};
}
function cartoesNovoPrevisoes(token,filters) {
  const user=obterSessaoObrigatoria(token),period=CartoesNovo_.period(filters),data=CartoesNovo_.forecasts(user.id,period);return {groups:data.groups,snapshot:data.snapshot,enabled:Boolean(period.start&&period.end)};
}

/** Adaptadores: telas existentes usam os mesmos conceitos sem reintroduzir soma de previsões. */
function resumoCartoesNovoLegado_(sessao,intervalo) {
 const period=CartoesNovo_.period(intervalo),base=CartoesNovo_.rpc('rpc_cartoes_listar_v2',{p_usuario:sessao.id,p_inicio:period.start?period.start+'-01':null,p_fim:period.end?period.end+'-01':null});
 const future=CartoesNovo_.forecasts(sessao.id,period),map={};
 (future.snapshot.length?future.snapshot:(base.groups||[])).forEach(function(raw){const g=CartoesNovo_.group(raw),limit=g.canEdit?CartoesNovo_.legacyNumber(g.limitCents):0,open=g.canEdit?CartoesNovo_.legacyNumber(g.openCents):0;
  map[g.id]={ID_Grupo_Cartao:g.id,Limite_Total:limit,Valor_Fatura:CartoesNovo_.legacyNumber(g.registeredCents),Valor_Pago:g.canEdit?CartoesNovo_.legacyNumber(g.paidCents):null,
   Valor_Em_Aberto:g.canEdit?open:null,Valor_Recorrencias_Previstas:CartoesNovo_.legacyNumber(future.groups[g.id]||'0'),Escopo_Parcial:!g.canEdit,
   Limite_Comparavel:g.canEdit&&!period.multi,Limite_Disponivel:g.canEdit&&!period.multi?Math.max(0,limit-open):null,Limite_Excedido:g.canEdit&&!period.multi?Math.max(0,open-limit):null,
   Percentual_Utilizado:g.canEdit&&!period.multi&&limit>0?(open/limit)*100:null,Quantidade_Lancamentos:0,Quantidade_Recorrencias_Previstas:0};
 });return map;
}
function previsoesCartoesNovoParaFatura_(contexto,cartoes,intervalo,categorias) {
 const data=CartoesNovo_.forecasts(contexto.idLogado,CartoesNovo_.period(intervalo));
 return (cartoes||[]).map(function(c){const row=data.cards[c.ID_Cartao];if(!row)return null;let total='0';const ocorrencias=row.occurrences.filter(function(o){return !Object.keys(categorias||{}).length||categorias[o.categoryId]===true;}).map(function(o){
  total=ContasNova_.addCents(total,o.type==='Receita'?'-'+o.amountCents:o.amountCents);
  return {ID_Cartao:o.cardId,ID_Recorrencia:o.recurrenceId,Data_Ocorrencia:o.date,Mes_Referencia:o.month,Descricao:o.description,Tipo:o.type,Valor_Total:CartoesNovo_.legacyNumber(o.amountCents),ID_Categoria:o.categoryId,ID_Projeto:o.projectId};
 });return {ID_Cartao:c.ID_Cartao,Valor_Total:CartoesNovo_.legacyNumber(total),Quantidade:ocorrencias.length,Ocorrencias:ocorrencias};}).filter(function(v){return v&&v.Quantidade>0;});
}
function aplicarResumoCartoesNovoNaFatura_(pacote,sessao,intervalo,detalhe,contexto) {
 const period=CartoesNovo_.period(intervalo),g=detalhe.group,future=CartoesNovo_.forecasts(sessao.id,period),toNumber=CartoesNovo_.legacyNumber;
 const limit=g.canEdit?toNumber(g.limitCents):0,open=g.canEdit?toNumber(g.openCents):0;
 pacote.Valor_Total=toNumber(g.registeredCents);pacote.Valor_Recorrencias_Previstas=toNumber(future.groups[g.id]||'0');
 pacote.Valor_Pago=g.canEdit?toNumber(g.paidCents):null;pacote.Valor_Pagamentos_Programados=g.canEdit?toNumber(g.scheduledPaymentsCents):null;
 pacote.Valor_Em_Aberto=g.canEdit?open:null;pacote.Valor_Credito=g.canEdit?toNumber(g.creditCents):null;
 pacote.Limite_Total=g.canEdit?limit:null;pacote.Escopo_Parcial=!g.canEdit;pacote.Limite_Comparavel=g.canEdit&&!period.multi;
 pacote.Limite_Disponivel=pacote.Limite_Comparavel?Math.max(0,limit-open):null;pacote.Limite_Excedido=pacote.Limite_Comparavel?Math.max(0,open-limit):null;
 pacote.Percentual_Utilizado=pacote.Limite_Comparavel&&limit>0?(open/limit)*100:null;
 pacote.Pode_Registrar_Pagamento=!period.multi&&g.active&&(contexto.cartoesAcessiveis||[]).some(function(c){return c.ID_Grupo_Cartao===g.id;});
 pacote.Motivo_Bloqueio_Pagamento=period.multi?'Selecione uma única competência para registrar pagamentos.':'Este cartão está disponível somente para consultar o histórico.';
 pacote.Resumo_Escopo=g.canEdit?'Resumo da fatura inteira. Filtros de categoria afetam somente a lista.':'Seus lançamentos. Pagamentos globais não abatem este subtotal; você pode pagar com as contas às quais tem acesso.';
 if(period.multi)pacote.Resumo_Escopo+=' Para pagar, selecione uma única competência na barra de período.';
 if(g.canEdit&&g.openingCents&&g.openingCents!=='0'&&g.openingDate.slice(0,7)>=period.start&&g.openingDate.slice(0,7)<=period.end)pacote.Resumo_Escopo+=' Inclui saldo inicial da conta em '+g.openingDate.split('-').reverse().join('/')+': '+lancamentosNovoRegras_().money(g.openingCents)+'. Ajuste em Contas.';
 pacote.Meses_Resumo=g.months;
 return pacote;
}
