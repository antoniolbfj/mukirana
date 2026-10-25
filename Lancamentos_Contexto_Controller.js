/** Contextos autenticados da mesma lista central, sem ampliar permissões. */
function lancamentosContextoListar(token,request){
 const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const r=Object.assign({},request||{}),H=LancamentosNovo_,p=H.period(r.period||{});
 const invoice=(H.uuid(r.group)||H.uuid(r.card))&&r.invoice===true;
 delete r.invoiceContext;
 let data;
 if(invoice){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month||''))throw new Error('Escolha o mês desta fatura.');
  data=H.read(user,{first:null,last:null,includeProjections:false});
  const chosenGroup=r.group||data.accounts.find(function(a){return a.kind==='Cartão'&&a.id===r.card;})?.group;
  const instruments=data.accounts.filter(function(a){return a.kind==='Cartão'&&a.group===chosenGroup&&(!r.card||a.id===r.card);});
  if(!instruments.length)throw new Error('Fatura não encontrada ou sem acesso.');
  const origins={};instruments.forEach(function(a){origins[a.id]=true;});
  data.entries=data.entries.filter(function(e){return origins[e.origin]&&e.sourceKind==='Cartão'&&e.competence===r.month;});
  const cp=H.period({Mes_Inicial:r.month,Mes_Final:r.month});H.projections(data,cp);
  data.entries=data.entries.filter(function(e){return origins[e.origin]&&e.sourceKind==='Cartão'&&e.competence===r.month;});
  data.rateios.items=(data.rateios.items||[]).filter(function(i){return data.entries.some(function(e){return e.id===i.id;});});
  data.invoiceContext=true;
  const writable=instruments.filter(function(a){return a.active&&a.canUse;});
  r.invoiceContext={group:chosenGroup,month:r.month,origins:writable.map(function(a){return a.id;})};
 }else{data=H.read(user,Object.assign({invoiceCalendar:true},p));if(r.account&&!data.accounts.some(function(a){return a.id===r.account&&a.kind==='Conta';}))throw new Error('Conta não encontrada ou sem acesso.');}
 return {user:{id:user.id,name:user.nome||''},period:invoice?H.period({Mes_Inicial:r.month,Mes_Final:r.month}):p,rows:H.rows(data).filter(function(row){return !r.account||row.account===r.account;}),entries:data.entries,accounts:data.accounts,categories:data.categories,projects:data.projects,people:data.people,groups:data.groups,history:data.history,favorites:data.favorites,approvals:data.approvals,rateios:data.rateios,invoiceContext:r.invoiceContext||null};
}
