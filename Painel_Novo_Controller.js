/** Painel conectado: mesmas projeções e mesma aritmética de Lançamentos. */
function painelNovoListar(token,filters){
 const u=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const H=LancamentosNovo_,C=H.core(),p=H.period(filters),start=p.first,end=p.last,now=ContasNova_.today().slice(0,7);
 const months=[-1,0,1].map(function(n){const d=new Date(now+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);});
 const nextEnd=new Date(months[2]+'-01T12:00:00Z');nextEnd.setUTCMonth(nextEnd.getUTCMonth()+1);nextEnd.setUTCDate(0);const calendarEnd=nextEnd.toISOString().slice(0,10),queryEnd=end&&end>calendarEnd?end:calendarEnd;
 const data=H.read(u,{first:null,last:queryEnd}),allRows=H.rows(data),rows=allRows.filter(function(r){return (!start||r.date>=start)&&(!end||r.date<=end);}),calendarRows=allRows.filter(function(r){return r.date>=months[0]+'-01'&&r.date<=calendarEnd;});
 const positions=contasTiposListar(token,filters),forecast={deltas:{},periodDeltas:{}};
 allRows.filter(function(r){return r.special==='projection'&&r.date<=(end||ContasNova_.today());}).forEach(function(r){forecast.deltas[r.account]=C.add(forecast.deltas[r.account]||'0',r.signedCents);if(!start||r.date>=start)forecast.periodDeltas[r.account]=C.add(forecast.periodDeltas[r.account]||'0',r.signedCents);});

 return {user:{id:u.id,name:u.nome||''},period:p,today:ContasNova_.today(),rows:rows,calendarRows:calendarRows,months:months,accounts:data.accounts,categories:data.categories,rateios:data.rateios,goals:RateiosNovo_.rpc('rpc_painel_metas_v4',{p_usuario:u.id}),positions:positions.accounts.filter(function(a){return a.ownerId===u.id;}),forecast:forecast};
}
/** Consolidação compartilhada também pelo navegador, sem arredondar dinheiro. */
function painelNovoRegras_(){
 function compute(pack,includeInvestment,C){
  const accounts=new Map(pack.accounts.map(a=>[a.id,a])),cats=new Map(pack.categories.map(c=>[c.id,c]));
  const scope=rows=>rows.filter(r=>includeInvestment||accounts.get(r.account)?.type!=='Investimento');
  const rows=scope(pack.rows),summary=C.summarize(rows),months=pack.months.map(month=>({month,...C.summarize(scope(pack.calendarRows.filter(r=>r.date.slice(0,7)===month)))}));
  const totals=new Map(),root=id=>{let c=cats.get(id),seen=new Set();while(c?.parent&&!seen.has(c.parent)){seen.add(c.parent);c=cats.get(c.parent)||c;}return c?.id||id||'uncategorized';};
  for(const r of rows){if(r.type!=='expense')continue;const key=root(r.category||(r.special==='settlement'?'settlement':'uncategorized')),current=totals.get(key)||{id:key,name:cats.get(key)?.name||(r.special==='settlement'?'Acerto de rateio':'Sem categoria'),cents:'0'};current.cents=C.add(current.cents,r.amountCents);totals.set(key,current);}
  const categories=[...totals.values()].sort((a,b)=>C.compare(b.cents,a.cents)),top=categories.slice(0,3),other=categories.slice(3).reduce((s,c)=>C.add(s,c.cents),'0');if(other!=='0')top.push({id:'others',name:'Outras',cents:other});
  let monthCount=1;if(pack.period.start&&pack.period.end)monthCount=(Number(pack.period.end.slice(0,4))-Number(pack.period.start.slice(0,4)))*12+Number(pack.period.end.slice(5,7))-Number(pack.period.start.slice(5,7))+1;
  const goals=pack.goals.map(g=>{const cat=cats.get(g.category),income=cat?.type==='Receita',type=income?'income':'expense';const actual=rows.filter(r=>r.type===type&&(r.category===g.category||r.categoryPath.includes(g.category))).reduce((s,r)=>C.add(s,r.amountCents),'0'),target=C.multiply(g.amountCents,monthCount);return {...g,name:cat?.name||'Categoria',income,actualCents:actual,targetCents:target,differenceCents:income?C.add(actual,C.negate(target)):C.add(target,C.negate(actual)),months:monthCount};}).sort((a,b)=>C.compare(a.differenceCents,b.differenceCents));
  const positions=['Consumo','Cartão de Crédito','Investimento'].map(type=>{const items=pack.positions.filter(a=>a.type===type);return {type,items,currentCents:items.reduce((s,a)=>C.add(s,a.currentCents),'0'),periodCents:items.reduce((s,a)=>C.add(s,C.add(a.periodCents,pack.forecast.periodDeltas[a.id]||'0')),'0'),forecastCents:items.reduce((s,a)=>C.add(s,C.add(a.registeredForecastCents,pack.forecast.deltas[a.id]||'0')),'0')};});
  const balances=pack.rateios?.balances||[],receivable=balances.reduce((s,b)=>C.add(s,C.compare(b.balanceCents,'0')>0?b.balanceCents:'0'),'0'),payable=balances.reduce((s,b)=>C.add(s,C.compare(b.balanceCents,'0')<0?C.negate(b.balanceCents):'0'),'0');
  const unclassified=rows.some(r=>['income','expense'].includes(r.type)&&!r.classification),fixedIncome=rows.filter(r=>r.type==='income'&&r.classification==='fixed').reduce((s,r)=>C.add(s,r.amountCents),'0'),fixedExpense=rows.filter(r=>r.type==='expense'&&r.classification==='fixed').reduce((s,r)=>C.add(s,r.amountCents),'0');
  return {summary,months,categories:top,goals,positions,receivableCents:receivable,payableCents:payable,approvalCount:(pack.rateios?.approvals||[]).filter(a=>a.myDecision==='pending'&&['pending','rejected'].includes(a.status)).length,commitment:unclassified?'Há registros sem classificação':fixedIncome==='0'?'Sem renda fixa registrada':(Number(fixedExpense)/Number(fixedIncome)*100).toFixed(1).replace('.',',')+'% da renda fixa comprometida'};
 }
 return {compute};
}
