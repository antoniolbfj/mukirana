/** Painel conectado: mesmas projeções e mesma aritmética de Lançamentos. */
function painelNovoListar(token,filters){
 const u=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const H=LancamentosNovo_,C=H.core(),P=painelNovoRegras_(),p=H.period(filters),start=p.first,end=p.last,today=ContasNova_.today(),reference=p.end||today.slice(0,7);
 const months=[-1,0,1].map(function(n){return P.shiftMonth(reference,n);});
 const calendarEnd=P.monthEnd(months[2]),queryEnd=[end||'',calendarEnd,reference.slice(0,4)+'-12-31',today].sort().pop();
 const data=H.read(u,{first:null,last:queryEnd}),allRows=H.rows(data),personalRows=P.participations(data,u.id,allRows,C),analysisRows=personalRows.filter(function(r){return (!start||r.date>=start)&&r.date<=(end||calendarEnd);}),rows=allRows.filter(function(r){return (!start||r.date>=start)&&r.date<=(end||calendarEnd);}),calendarRows=allRows.filter(function(r){return r.date>=months[0]+'-01'&&r.date<=calendarEnd;});
 const positions=contasTiposListar(token,filters),forecast={deltas:{},periodDeltas:{}};
 allRows.filter(function(r){return r.special==='projection'&&r.date<=(end||ContasNova_.today());}).forEach(function(r){forecast.deltas[r.account]=C.add(forecast.deltas[r.account]||'0',r.signedCents);if(!start||r.date>=start)forecast.periodDeltas[r.account]=C.add(forecast.periodDeltas[r.account]||'0',r.signedCents);});

 return {user:{id:u.id,name:u.nome||''},period:p,today:today,rows:rows,analysisRows:analysisRows,calendarRows:calendarRows,months:months,accounts:data.accounts,categories:data.categories,rateios:data.rateios,goals:RateiosNovo_.rpc('rpc_painel_metas_v4',{p_usuario:u.id}),positions:positions.accounts.filter(function(a){return a.ownerId===u.id;}),forecast:forecast,wealth:P.wealth(data.accounts.filter(function(a){return a.owner===u.id&&a.type==='Investimento';}),allRows,today,reference,C)};
}
/** Consolidação compartilhada também pelo navegador, sem arredondar dinheiro. */
function painelNovoRegras_(){
 function shiftMonth(month,n){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
 function monthEnd(month){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);}
 function chartMonths(reference,mode){const year=reference.slice(0,4),start=mode==='three'?shiftMonth(reference,-1):year+(mode==='half'&&Number(reference.slice(5,7))>6?'-07':'-01');return Array.from({length:mode==='three'?3:mode==='half'?6:12},function(_,i){return shiftMonth(start,i);});}
 function balanceSignal(cents,C){return C.compare(cents,'0')<0?'danger':cents==='0'?'warning':'good';}
 function goalSignal(goal,C){if(goal.income)return C.compare(goal.actualCents,goal.targetCents)>=0?'good':C.compare(C.multiply(goal.actualCents,5),C.multiply(goal.targetCents,4))>=0?'warning':'danger';return C.compare(goal.actualCents,goal.targetCents)>0?'danger':C.compare(C.multiply(goal.actualCents,5),C.multiply(goal.targetCents,4))>=0?'warning':'good';}
 function wealth(accounts,rows,today,reference,C){
  const months=Array.from(new Set(chartMonths(reference,'year').concat(chartMonths(reference,'three')))).sort(),now=today.slice(0,7);
  return {reference:reference,months:months,accounts:accounts.map(function(a){
   const movements=rows.filter(function(r){return r.account===a.id;}).sort(function(a,b){return a.date.localeCompare(b.date);});let cursor=0,actual='0',projected='0';
   return {id:a.id,name:a.name,active:a.active,points:months.map(function(month){const future=month>now,date=month===now?today:monthEnd(month);while(cursor<movements.length&&movements[cursor].date<=date){const r=movements[cursor++];if(!C.cents(r.signedCents))throw Error('Movimento patrimonial inválido.');projected=C.add(projected,r.signedCents);if(r.status==='done'&&r.date<=today&&r.special!=='projection')actual=C.add(actual,r.signedCents);}return {month:month,date:date,projected:future,cents:future?projected:actual};})};
  })};
 }
 function participations(data,actor,financialRows,C){
  const categories=new Map(data.categories.map(c=>[c.id,c])),items=data.rateios?.items||[],rated=new Set(items.filter(i=>i.shares?.length).map(i=>i.id));
  function path(id){const seen=new Set(),parents=[];let c=categories.get(id);while(c?.parent&&!seen.has(c.parent)){seen.add(c.parent);parents.push(c.parent);c=categories.get(c.parent);}return parents;}
  const result=financialRows.filter(r=>r.special!=='settlement'&&!rated.has(r.entryId)).map(r=>({...r,accountType:data.accounts.find(a=>a.id===r.account)?.type||null}));
  for(const item of items){
   if(!item.shares?.length||item.myCents==='0')continue;
   if(!C.cents(item.myCents)||C.compare(item.myCents,'0')<0||!['Receita','Despesa'].includes(item.type)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date))throw Error('Participação inválida. Atualize os dados.');
   result.push({key:'participation:'+item.id,entryId:item.id,type:item.type==='Receita'?'income':'expense',description:item.description,date:item.date,amountCents:item.myCents,signedCents:item.type==='Receita'?item.myCents:C.negate(item.myCents),category:item.myCategory||'awaiting-category',categoryName:categories.get(item.myCategory)?.name||'Aguardando Categorização',categoryPath:path(item.myCategory),accountType:item.accountType||null,classification:item.classification||'',status:item.status||'pending',special:'participation',mode:item.mode,group:item.group,financeName:item.financeName});
  }
  return result;
 }
 function compute(pack,includeInvestment,C){
  const accounts=new Map(pack.accounts.map(a=>[a.id,a])),cats=new Map(pack.categories.map(c=>[c.id,c]));
  const scope=rows=>rows.filter(r=>includeInvestment||accounts.get(r.account)?.type!=='Investimento');
  const rows=scope(pack.rows),summary=C.summarize(rows),months=pack.months.map(month=>({month,...C.summarize(scope(pack.calendarRows.filter(r=>r.date.slice(0,7)===month)))}));
  const analysisRows=(pack.analysisRows||pack.rows.filter(r=>r.special!=='settlement')).filter(r=>includeInvestment||(r.accountType||accounts.get(r.account)?.type)!=='Investimento');
  const consumption=C.summarize(analysisRows);
  const totals=new Map(),root=id=>{let c=cats.get(id),seen=new Set();while(c?.parent&&!seen.has(c.parent)){seen.add(c.parent);c=cats.get(c.parent)||c;}return c?.id||id||'uncategorized';};
  for(const r of analysisRows){if(r.type!=='expense')continue;const key=root(r.category||(r.special==='settlement'?'settlement':'uncategorized')),current=totals.get(key)||{id:key,name:cats.get(key)?.name||(key==='awaiting-category'?'Aguardando Categorização':'Sem categoria'),cents:'0'};current.cents=C.add(current.cents,r.amountCents);totals.set(key,current);}
  const categories=[...totals.values()].sort((a,b)=>C.compare(b.cents,a.cents)),top=categories.slice(0,3),other=categories.slice(3).reduce((s,c)=>C.add(s,c.cents),'0');if(other!=='0')top.push({id:'others',name:'Outras',cents:other});
  let monthCount=1;const goalStart=pack.period.start||(analysisRows.map(r=>r.date.slice(0,7)).sort()[0]||pack.period.end);if(goalStart&&pack.period.end)monthCount=(Number(pack.period.end.slice(0,4))-Number(goalStart.slice(0,4)))*12+Number(pack.period.end.slice(5,7))-Number(goalStart.slice(5,7))+1;
  const goals=pack.goals.map(g=>{const cat=cats.get(g.category),income=cat?.type==='Receita',type=income?'income':'expense';const actual=analysisRows.filter(r=>r.type===type&&(r.category===g.category||r.categoryPath.includes(g.category))).reduce((s,r)=>C.add(s,r.amountCents),'0'),target=C.multiply(g.amountCents,monthCount);return {...g,name:cat?.name||'Categoria',income,actualCents:actual,targetCents:target,differenceCents:income?C.add(actual,C.negate(target)):C.add(target,C.negate(actual)),months:monthCount};}).sort((a,b)=>C.compare(a.differenceCents,b.differenceCents));
  const positions=['Consumo','Cartão de Crédito','Investimento'].map(type=>{const items=pack.positions.filter(a=>a.type===type);return {type,items,currentCents:items.reduce((s,a)=>C.add(s,a.currentCents),'0'),periodCents:items.reduce((s,a)=>C.add(s,C.add(a.periodCents,pack.forecast.periodDeltas[a.id]||'0')),'0'),forecastCents:items.reduce((s,a)=>C.add(s,C.add(a.registeredForecastCents,pack.forecast.deltas[a.id]||'0')),'0')};});
  const balances=pack.rateios?.balances||[],receivable=balances.reduce((s,b)=>C.add(s,C.compare(b.balanceCents,'0')>0?b.balanceCents:'0'),'0'),payable=balances.reduce((s,b)=>C.add(s,C.compare(b.balanceCents,'0')<0?C.negate(b.balanceCents):'0'),'0');
  const unclassified=analysisRows.some(r=>['income','expense'].includes(r.type)&&!r.classification),fixedIncome=analysisRows.filter(r=>r.type==='income'&&r.classification==='fixed').reduce((s,r)=>C.add(s,r.amountCents),'0'),fixedExpense=analysisRows.filter(r=>r.type==='expense'&&r.classification==='fixed').reduce((s,r)=>C.add(s,r.amountCents),'0');
  return {summary,consumption,analysisRows,months,categories:top,goals,positions,receivableCents:receivable,payableCents:payable,approvalCount:(pack.rateios?.approvals||[]).filter(a=>a.myDecision==='pending'&&['pending','rejected'].includes(a.status)).length,commitmentSignal:unclassified||fixedIncome==='0'?null:goalSignal({actualCents:fixedExpense,targetCents:fixedIncome,income:false},C),commitment:unclassified?'Há registros sem classificação':fixedIncome==='0'?'Sem renda fixa registrada':(Number(fixedExpense)/Number(fixedIncome)*100).toFixed(1).replace('.',',')+'% da renda fixa comprometida'};
 }
 return {participations,compute,shiftMonth,monthEnd,chartMonths,balanceSignal,goalSignal,wealth};
}
