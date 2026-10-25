/** Fronteira autenticada de Lançamentos. Identidade vem somente da sessão. */
const LancamentosNovo_ = {
  core: function(){return lancamentosNovoRegras_();},
  uuid: function(v){return ContasNova_.uuid(v);},
  date: function(v){return ContasNova_.date(v);},
  rpc: function(name,args){
    try{return supabaseRpc_(name,args);}catch(e){
      const messages={conflict:'Os dados foram alterados. Atualize a lista e revise antes de tentar novamente.',forbidden:'Você não tem permissão para essa operação.',invalid_request:'Confira os campos do lançamento.',invalid_category:'Escolha uma categoria acessível.',invalid_period:'Confira os meses selecionados.',invalid_shares:'As partes devem ser positivas e somar exatamente o total.',invalid_reason:'Informe o motivo da rejeição.',protected_opening:'Ajuste o saldo inicial no cadastro da conta.',duplicate_name:'Já existe um cadastro com este nome neste nível.',settled:'Este lançamento já participa de um acerto. Regularize o acerto antes de alterá-lo.'};
      const match=String(e&&e.message||e).match(/(?:LN|CN):([a-z_]+)/);throw new Error(match&&messages[match[1]]||'Não foi possível concluir a operação. Tente novamente.');
    }
  },
  period: function(f){
    f=f||{};const month=ContasNova_.today().slice(0,7),valid=function(v){return typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='0001-01';};
    let start=f.Mes_Inicial!==undefined?f.Mes_Inicial:f.Mes_Referencia!==undefined?f.Mes_Referencia:month,end=f.Mes_Final!==undefined?f.Mes_Final:start;
    if((start&&!valid(start))||(end&&!valid(end)))throw new Error('Confira os meses selecionados.');
    if(start&&!end)end=month;if(start&&end&&start>end)throw new Error('O mês inicial deve ser anterior ou igual ao final.');
    const d=end?new Date(end+'-01T12:00:00Z'):null;if(d){d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);}
    return {start:start||'',end:end||'',first:start?start+'-01':null,last:d?d.toISOString().slice(0,10):null};
  },
  read: function(user,period){const data=this.rpc('rpc_lancamentos_listar_v3',{p_usuario:user.id,p_inicio:period.first,p_fim:period.last});if(!data||!Array.isArray(data.entries)||!Array.isArray(data.accounts))throw new Error('Não foi possível carregar os lançamentos.');if(period.includeProjections!==false)this.projections(data,period);return data;},
  projections: function(data,period){
    const accounts={};data.accounts.forEach(function(a){accounts[a.id]=a;});const generated={};(data.legacyGenerated||[]).forEach(function(k){generated[k]=true;});
    const limit=new Date(ContasNova_.today().slice(0,7)+'-01T12:00:00Z');limit.setUTCMonth(limit.getUTCMonth()+1);limit.setUTCDate(0);const end=period.last||limit.toISOString().slice(0,10);
    (data.legacyRecurrences||[]).forEach(function(r){
      const source=accounts[r.origin];if(!source||!ContasNova_.date(r.start))return;
      const initial=new Date(r.start+'T12:00:00Z');let begin=period.first||r.start;if(source.kind==='Cartão'&&period.first){const back=new Date(period.first+'T12:00:00Z');back.setUTCMonth(back.getUTCMonth()-1);begin=back.toISOString().slice(0,10);}
      const step=Math.max(1,Number(r.days)||1);let index=0;
      if(r.frequency==='Mensal')index=Math.max(0,(Number(begin.slice(0,4))-initial.getUTCFullYear())*12+Number(begin.slice(5,7))-1-initial.getUTCMonth()-1);
      else index=Math.max(0,Math.floor((new Date(begin+'T12:00:00Z')-initial)/86400000/step)-1);
      for(let limit=0;limit<20000;limit++,index++){
        const d=new Date(initial);if(r.frequency==='Mensal'){const anchor=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+index);const last=new Date(d);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);d.setUTCDate(Math.min(anchor,last.getUTCDate()));}else d.setUTCDate(d.getUTCDate()+index*step);
        const date=d.toISOString().slice(0,10);if(date>end)break;if(generated[r.id+':'+date])continue;
        const comp=new Date(d);comp.setUTCDate(1);if(source.kind==='Cartão'&&d.getUTCDate()>source.closing)comp.setUTCMonth(comp.getUTCMonth()+1);const reference=source.kind==='Cartão'?comp.toISOString().slice(0,10):date;
        if((period.first&&reference<period.first)||(period.last&&reference>period.last))continue;
        data.entries.push({id:'projection:'+r.id+':'+date,version:0,description:r.description,type:r.type,amountCents:r.amountCents,date:date,competence:comp.toISOString().slice(0,7),sourceKind:r.sourceKind,origin:r.origin,destination:r.destination,category:r.category,project:r.project,author:r.author,status:'pending',classification:null,group:r.id,index:0,mode:'recurring',canEdit:false,opening:false,shares:[],special:'projection'});
        if(data.entries.length>25000)throw new Error('O período tem muitos lançamentos. Selecione um intervalo menor.');
      }
    });
  },
  rows: function(data){
    const core=this.core(),accounts={},categories={},projects={},result=[];
    data.accounts.forEach(function(a){accounts[a.id]=a;});data.categories.forEach(function(c){categories[c.id]=c;});data.projects.forEach(function(p){projects[p.id]=p;});
    function categoryPath(id){let seen={},path=[],c=categories[id];while(c&&c.parent&&!seen[c.parent]){seen[c.parent]=true;path.push(c.parent);c=categories[c.parent];}return path;}
    function append(e,account,signed,suffix,name,special){
      const cat=categories[e.category],proj=projects[e.project];
      result.push({key:e.id+':'+suffix,entryId:e.id,type:e.type,description:e.description,date:e.date,competence:e.competence,account:account,accountName:name,origin:e.origin,destination:e.destination,category:e.category||'',categoryName:cat?cat.name:'',categoryPath:categoryPath(e.category),project:e.project||'',projectName:proj?proj.name:'',mode:e.mode||'single',status:e.status,amountCents:e.amountCents,signedCents:signed,classification:e.classification||'',group:e.group||'',index:e.index||0,version:e.version||0,canEdit:e.canEdit===true,special:special||'',side:suffix,searchText:[e.description,name,cat&&cat.name,proj&&proj.name].filter(Boolean).join(' ')});
    }
    data.entries.forEach(function(e){
      if(!core.cents(e.amountCents)||!ContasNova_.date(e.date))throw new Error('Resposta financeira inválida.');
      if(e.type==='transfer'){
        if(accounts[e.origin])append(e,e.origin,core.negate(e.amountCents),'out',accounts[e.origin].name,'');
        if(accounts[e.destination])append(e,e.destination,e.amountCents,'in',accounts[e.destination].name,'');
      }else{
        const a=accounts[e.origin];append(e,a?e.origin:'history:'+e.origin,e.type==='expense'?core.negate(e.amountCents):e.amountCents,'entry',a?a.name:'Origem histórica',e.special|| (e.opening?'opening':''));
      }
    });
    (data.payments||[]).forEach(function(p){
      const e={id:'invoice:'+p.id,description:'Pagamento da fatura '+p.groupName,type:'transfer',date:p.date,competence:p.competence,origin:p.origin,destination:'invoice:'+p.group,amountCents:p.amountCents,status:p.status,mode:'single',canEdit:false};
      if(accounts[p.origin])append(e,p.origin,core.negate(p.amountCents),'out',accounts[p.origin].name,'invoice');
      if(p.canSeeDestination)append(e,'invoice:'+p.group,p.amountCents,'in','Fatura '+p.groupName,'invoice');
    });
    result.sort(function(a,b){return b.date.localeCompare(a.date)||a.key.localeCompare(b.key);});return result;
  },
  request: function(r){
    r=r||{};if(!this.uuid(r.operationId))throw new Error('Operação inválida. Atualize a tela.');
    const keys=['operationId','action','id','version','scope','description','type','amountCents','date','origin','destination','category','classification','mode','frequency','quantity','duration','status','project','favorite','name','parent','kind','approvalId','approve','reason','renewFrom'];const clean={};
    keys.forEach(function(k){if(r[k]!==undefined)clean[k]=r[k];});
    if(r.shares!==undefined){if(!Array.isArray(r.shares)||r.shares.length>100)throw new Error('Confira os participantes.');clean.shares=r.shares.map(function(p){return {id:p.id,cents:p.cents};});}
    if(r.selected!==undefined){if(!Array.isArray(r.selected)||r.selected.length>6000)throw new Error('Seleção inválida.');clean.selected=r.selected.map(function(p){return{id:p.id,version:p.version};});}
    return clean;
  },
  schedule: function(r){
    const amount=Number(r.amountCents),dates=[],monthSteps={monthly:1,bimonthly:2,quarterly:3,semiannual:6,annual:12};
    const addMonths=function(date,n){const d=new Date(date+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(d);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);d.setUTCDate(Math.min(day,last.getUTCDate()));return d.toISOString().slice(0,10);};
    const at=function(i){if(monthSteps[r.frequency])return addMonths(r.date,i*monthSteps[r.frequency]);const d=new Date(r.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i*(r.frequency==='weekly'?7:15));return d.toISOString().slice(0,10);};
    if(r.mode==='single'||r.version>0)return [{date:r.date,amountCents:r.amountCents}];
    if(['weekly','fortnightly','monthly','bimonthly','quarterly','semiannual','annual'].indexOf(r.frequency)<0)throw new Error('Escolha uma frequência.');
    if(r.mode==='installment'){
      if(!Number.isInteger(r.quantity)||r.quantity<2||r.quantity>240||amount<r.quantity)throw new Error('Confira a quantidade de parcelas.');
      for(let i=0;i<r.quantity;i++)dates.push({date:at(i),amountCents:String(Math.floor(amount/r.quantity)+(i===0?amount%r.quantity:0))});
    }else{
      if(!Number.isInteger(r.duration)||r.duration<1||r.duration>120)throw new Error('Informe a duração em meses.');
      const end=addMonths(r.date,r.duration);for(let i=0;i<6000;i++){const date=at(i);if(date>=end)break;dates.push({date:date,amountCents:r.amountCents});}
    }
    return dates;
  },
  portions: function(total,remaining,futureRows){
    const sum=remaining.reduce(function(n,p){return n+Number(p.cents);},0);
    const row=remaining.map(function(p){return{id:p.id,cents:Math.max(1,Math.min(Number(p.cents)-futureRows,Math.floor(total*Number(p.cents)/sum)))};});
    let difference=total-row.reduce(function(n,p){return n+p.cents;},0);
    row.forEach(function(p){const cap=Number(remaining.find(function(x){return x.id===p.id;}).cents)-futureRows;const change=difference>0?Math.min(difference,cap-p.cents):-Math.min(-difference,p.cents-1);p.cents+=change;difference-=change;});
    if(difference||row.some(function(p){return p.cents<1;}))throw new Error('Cada pessoa precisa ter ao menos R$ 0,01 em cada parcela.');
    return row.map(function(p){return{id:p.id,cents:String(p.cents)};});
  },
  childId: function(id,index){if(index===0)return id;const hex=id.replace(/-/g,'').slice(0,24)+((parseInt(id.replace(/-/g,'').slice(24),16)+index)>>>0).toString(16).padStart(8,'0');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
};
function lancamentosNovoListar(token,filters){
  const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const period=LancamentosNovo_.period(filters),data=LancamentosNovo_.read(user,period);
  return {user:{id:user.id,name:user.nome||''},period:period,rows:LancamentosNovo_.rows(data),entries:data.entries,accounts:data.accounts,categories:data.categories,projects:data.projects,people:data.people,groups:data.groups,history:data.history,favorites:data.favorites,approvals:data.approvals};
}
function lancamentosNovoConsultar(token,period,filters){
  const data=lancamentosNovoListar(token,period),core=LancamentosNovo_.core();if(!core.valid(data.rows,filters))throw new Error('Essa combinação de filtros não possui lançamentos. Revise a seleção.');return core.query(data.rows,filters);
}
function lancamentosNovoDetalhar(token,id){
  const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();if(!LancamentosNovo_.uuid(id))throw new Error('Lançamento inválido.');
  const all=LancamentosNovo_.read(user,{first:null,last:null,includeProjections:false}),entry=all.entries.find(function(e){return e.id===id;});if(!entry)throw new Error('Lançamento não encontrado ou sem acesso.');
  const group=entry.group?all.entries.filter(function(e){return e.group===entry.group;}):[entry];return {entry:entry,group:group};
}
function lancamentosNovoSalvar(token,request){
  const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const r=LancamentosNovo_.request(request),helper=LancamentosNovo_,core=helper.core();
  const replay=helper.rpc('rpc_lancamentos_replay_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r});if(replay)return replay;
  if(!helper.uuid(r.id)||!Number.isInteger(r.version)||r.version<0||['income','expense','transfer'].indexOf(r.type)<0||typeof r.description!=='string'||!r.description.trim()||r.description.trim().length>160||!core.cents(r.amountCents)||Number(r.amountCents)<1||Number(r.amountCents)>99999999999999||!helper.date(r.date)||!helper.uuid(r.origin)||['fixed','variable'].indexOf(r.classification)<0||['single','installment','recurring'].indexOf(r.mode)<0||['done','pending'].indexOf(r.status)<0)throw new Error('Confira os campos do lançamento.');
  if(r.renewFrom&&(!helper.uuid(r.renewFrom)||r.version!==0||r.mode!=='recurring'))throw new Error('Confira a recorrência que deseja renovar.');
  if(r.type==='transfer'&&(r.mode!=='single'||!helper.uuid(r.destination)||r.origin===r.destination||(r.shares&&r.shares.length)))throw new Error('Transferências exigem contas diferentes e não têm parcelas ou rateio.');
  if(r.type!=='transfer'&&!helper.uuid(r.category))throw new Error('Escolha uma categoria.');
  const data=helper.read(user,{first:null,last:null,includeProjections:false}),original=data.entries.find(function(e){return e.id===r.id;}),source=data.accounts.find(function(a){return a.id===r.origin;});
  if(!source||(!source.canUse&&!(original&&original.author===user.id&&original.origin===r.origin)))throw new Error('Conta ou cartão inacessível para gravação.');
  if(r.version>0&&(!original||!original.canEdit))throw new Error('Você não pode editar este lançamento.');
  if(original&&(original.mode!==r.mode||(original.group&&original.type!==r.type)))throw new Error('O conjunto preserva sua natureza e modalidade.');
  if(original&&original.version!==r.version){const again=helper.rpc('rpc_lancamentos_replay_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r});if(again)return again;throw new Error('Os dados foram alterados. Atualize a lista.');}
  if(original&&original.shares.length&&original.author!==user.id)throw new Error('Somente o autor altera um lançamento rateado.');
  let selected=original?[original]:[],schedule=helper.schedule(r),shares=r.shares||[],remaining=shares.map(function(p){return{id:p.id,cents:p.cents};});
  if(shares.length){if(shares.length<2||shares.some(function(p){return!helper.uuid(p.id)||!core.cents(p.cents)||Number(p.cents)<1;})||!shares.some(function(p){return p.id===user.id;})||shares.reduce(function(n,p){return core.add(n,p.cents);},'0')!==r.amountCents)throw new Error('Confira as participações: a soma deve fechar o total.');}
  if(original&&r.scope&&r.scope!=='one'){
    if(!original.group||['next','all'].indexOf(r.scope)<0)throw new Error('Alcance inválido.');
    selected=data.entries.filter(function(e){return e.group===original.group&&(r.scope==='all'||(e.index||e.date)>=(original.index||original.date));});
  }
  const changes={action:'save',rows:[]};
  if(!original&&r.mode!=='single')changes.group={id:r.operationId,mode:r.mode,config:{frequency:r.frequency,start:r.date,duration:r.duration||null,count:schedule.length,renewFrom:r.renewFrom||null}};
  const rows=original?selected:schedule;
  rows.forEach(function(e,i){
    const editing=!!original,date=editing?(e.id===original.id?r.date:(r.date===original.date?e.date:new Date(new Date(e.date+'T12:00:00Z').getTime()+new Date(r.date+'T12:00:00Z').getTime()-new Date(original.date+'T12:00:00Z').getTime()).toISOString().slice(0,10))):e.date;
    let portions=shares;
    if(!editing&&r.mode==='installment'&&shares.length){if(shares.some(function(p){return Number(p.cents)<schedule.length;}))throw new Error('Cada pessoa precisa ter R$ 0,01 em cada parcela.');portions=helper.portions(Number(e.amountCents),remaining,schedule.length-i-1);remaining=remaining.map(function(p){return{id:p.id,cents:String(Number(p.cents)-Number(portions.find(function(x){return x.id===p.id;}).cents))};});}
    changes.rows.push({id:editing?e.id:helper.childId(r.id,i),version:editing?e.version:0,description:r.description.trim(),type:r.type,amountCents:editing?r.amountCents:e.amountCents,date:date,sourceKind:source.kind,origin:r.origin,destination:r.type==='transfer'?r.destination:null,category:r.type==='transfer'?null:r.category,project:r.project||null,classification:r.classification,status:editing?(e.id===original.id?r.status:e.status):i===0?r.status:'pending',index:i+1,shares:portions});
  });
  if(r.favorite)changes.favorite={description:r.description.trim(),type:r.type,origin:r.origin,category:r.category,classification:r.classification};
  return helper.rpc('rpc_lancamentos_gravar_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r,p_changes:changes});
}
function lancamentosNovoAcao(token,request){
  const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const r=LancamentosNovo_.request(request),h=LancamentosNovo_;
  const replay=h.rpc('rpc_lancamentos_replay_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r});if(replay)return replay;
  if(['delete','status'].indexOf(r.action)<0)throw new Error('Ação inválida.');const data=h.read(user,{first:null,last:null,includeProjections:false});let selected=[];
  if(r.selected){if(r.selected.some(function(s){const e=data.entries.find(function(x){return x.id===s.id;});return !e||e.version!==s.version;})){const again=h.rpc('rpc_lancamentos_replay_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r});if(again)return again;throw new Error('A seleção foi alterada. Atualize a lista.');}selected=r.selected.map(function(s){return data.entries.find(function(x){return x.id===s.id;});});}
  else {const e=data.entries.find(function(x){return x.id===r.id;});if(!e||e.version!==r.version){const again=h.rpc('rpc_lancamentos_replay_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r});if(again)return again;throw new Error('Os dados foram alterados. Atualize a lista.');}selected=[e];if(e.group&&r.scope&&r.scope!=='one'){if(['all','next','previous'].indexOf(r.scope)<0)throw new Error('Alcance inválido.');selected=data.entries.filter(function(x){return x.group===e.group&&(r.scope==='all'||r.scope==='next'&&(x.index||x.date)>=(e.index||e.date)||r.scope==='previous'&&(x.index||x.date)<=(e.index||e.date));});}}
  if(!selected.length||selected.some(function(e){return!e.canEdit;}))throw new Error('Seleção sem permissão.');
  return h.rpc('rpc_lancamentos_gravar_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r,p_changes:{action:r.action,status:r.status,rows:selected.map(function(e){return{id:e.id,version:e.version};})}});
}
function lancamentosNovoCadastroRapido(token,request){
  const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const r=LancamentosNovo_.request(request);if(!LancamentosNovo_.uuid(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.trim().length>160||['quick-account','quick-category'].indexOf(r.action)<0)throw new Error('Confira o cadastro.');
  return LancamentosNovo_.rpc('rpc_lancamentos_gravar_v3',{p_usuario:user.id,p_operacao:r.operationId,p_request:r,p_changes:{action:r.action,id:r.id,name:r.name.trim(),type:r.kind,parent:r.parent||null}});
}
function lancamentosNovoDecidir(token,request){
  const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const r=request||{};if(!LancamentosNovo_.uuid(r.id)||typeof r.approve!=='boolean'||r.approve&&!LancamentosNovo_.uuid(r.category)||!r.approve&&(typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>500))throw new Error('Confira a decisão e a categoria ou justificativa.');
  return LancamentosNovo_.rpc('rpc_lancamentos_decidir_v3',{p_usuario:user.id,p_solicitacao:r.id,p_aprovar:r.approve,p_categoria:r.approve?r.category:null,p_motivo:r.approve?null:r.reason.trim()});
}
