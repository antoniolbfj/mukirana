/** Regras puras compartilhadas entre Apps Script e navegador via Function.toString(). */
function lancamentosNovoRegras_() {
  'use strict';
  const dimensions = ['type','account','category','mode','status','sharing'];
  function add(a,b) {
    a=String(a);b=String(b);let negative=a[0]==='-',same=negative===(b[0]==='-');
    let x=negative?a.slice(1):a,y=b[0]==='-'?b.slice(1):b,out='',carry=0;
    if(!same&&(x.length<y.length||(x.length===y.length&&x<y))){let t=x;x=y;y=t;negative=!negative;}
    for(let i=x.length-1,j=y.length-1;i>=0||j>=0;i--,j--){let n=Number(x[i]||0)+(same?Number(y[j]||0):-Number(y[j]||0))+carry;if(same){carry=n>=10?1:0;n%=10;}else{carry=n<0?-1:0;if(n<0)n+=10;}out=n+out;}
    if(same&&carry)out=carry+out;out=out.replace(/^0+(?=\d)/,'');return(negative&&out!=='0'?'-':'')+out;
  }
  function compare(a,b){const d=add(a,negate(b));return d==='0'?0:d[0]==='-'?-1:1;}
  function multiply(a,n){if(!Number.isSafeInteger(n)||n<0)throw Error('Multiplicador inválido.');let result='0',value=a;while(n){if(n%2)result=add(result,value);n=Math.floor(n/2);if(n)value=add(value,value);}return result;}
  function negate(value){value=String(value);return value==='0'?'0':value[0]==='-'?value.slice(1):'-'+value;}
  function cents(value){return typeof value==='string'&&/^-?(0|[1-9]\d*)$/.test(value)&&value.length<=32;}
  function money(value){if(!cents(String(value)))return '—';const negative=String(value)[0]==='-';let s=negative?String(value).slice(1):String(value);s=s.padStart(3,'0');return(negative?'− ':'')+'R$ '+s.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+s.slice(-2);}
  function clean(input){const f={};for(const key of dimensions)f[key]=String(input&&input[key]||'');f.search=String(input&&input.search||'').trim().toLocaleLowerCase('pt-BR');return f;}
  function matches(row,f,except){
    for(const key of dimensions)if(key!==except&&f[key]&&String(row[key]||'')!==f[key]&&!(key==='category'&&(row.categoryPath||[]).indexOf(f[key])>=0))return false;
    if(f.search&&String(row.searchText||row.description||'').toLocaleLowerCase('pt-BR').indexOf(f.search)<0)return false;
    return true;
  }
  function windowRows(rows,input){const account=input&&input.account;return rows.filter(function(r){return account&&r.billingAccount===account?r.inInvoicePeriod!==false:r.inPeriod!==false;});}
  function facets(rows,input){const f=clean(input),result={};rows=windowRows(rows,f);for(const key of dimensions){const values={};for(const row of rows)if(matches(row,f,key)){const value=String(row[key]||'');if(value)values[value]=true;if(key==='category')for(const parent of row.categoryPath||[])if(parent)values[parent]=true;}result[key]=Object.keys(values);}return result;}
  function valid(rows,input){const f=clean(input);if(!dimensions.some(k=>f[k]))return true;return windowRows(rows,f).some(row=>matches(row,f));}
  function normalize(rows,input,changed){const f=clean(input),cleared=[];if(!changed||changed==='search'||valid(rows,f))return {filters:f,cleared:cleared};
    // Conta é sempre selecionável, inclusive sem movimentos. Recargas não apagam o recorte.
    const order=dimensions.filter(k=>k!=='account'&&k!==changed);
    for(const key of order){if(f[key]){f[key]='';cleared.push(key);if(valid(rows,f))break;}}
    return {filters:f,cleared:cleared};
  }
  function summarize(rows){let income='0',expense='0',incoming='0',outgoing='0',opening='0';
    for(const row of rows){const value=String(row.signedCents);if(!cents(value))throw Error('Valor inválido.');if(row.special==='opening')opening=add(opening,value);
      if(row.type==='income')income=add(income,value);
      else if(row.type==='expense')expense=add(expense,negate(value));
      else if(row.type==='transfer'){if(value[0]==='-')outgoing=add(outgoing,negate(value));else incoming=add(incoming,value);}
      else if(row.type==='opening')opening=add(opening,value);
    }
    const transfers=add(incoming,negate(outgoing));
    return {incomeCents:income,expenseCents:expense,transferInCents:incoming,transferOutCents:outgoing,transferCents:transfers,openingCents:opening,resultCents:add(add(income,negate(expense)),transfers),count:rows.length};
  }
  function spendingRows(rows,accounts,includeInvestment){const catalog=new Map((accounts||[]).map(a=>[a.id,a]));return rows.filter(r=>includeInvestment===true||catalog.get(r.account)?.type!=='Investimento');}
  // Compensa a diferença entre a data bilateral do acerto e a ponta de caixa própria.
  function settlementGap(settlements,end){
    let pay='0',receive='0',timing='0';
    for(const s of settlements||[]){if(!['pay','receive'].includes(s.side)||s.mode==='adjustment'||!['Aguardando_Credor','Efetivado'].includes(s.status))continue;const effective=s.side==='pay'?(s.date||s.otherDate):(s.otherDate||s.date);if(!effective)continue;const amount=String(s.amountCents);if(!cents(amount)||compare(amount,'0')<0)throw Error('Acerto inválido.');const applied=!end||effective<=end,own=s.ownRegistered&&s.date&&(!end||s.date<=end);if(applied&&!own){if(s.side==='pay')pay=add(pay,amount);else receive=add(receive,amount);}else if(own&&!applied)timing=add(timing,s.side==='pay'?amount:negate(amount));}
    return {payCents:pay,receiveCents:receive,timingCents:timing,totalCents:add(add(receive,negate(pay)),timing)};
  }
  function rateioBalances(balances,first){return (balances||[]).map(b=>Object.assign({},b,{balanceCents:first&&b.movementCents!==undefined?b.movementCents:b.balanceCents}));}
  // O mesmo recorte rege caixa, rateios e acertos: mês ou histórico, conforme a escolha global.
  function availability(summary,balances,settlements,end,first){
    let payable='0',receivable='0';
    for(const b of rateioBalances(balances,first)){const value=String(b.balanceCents);if(!cents(value))throw Error('Saldo de rateio inválido.');if(compare(value,'0')<0)payable=add(payable,negate(value));else receivable=add(receivable,value);}
    const ending=settlementGap(settlements,end);let opening={payCents:'0',receiveCents:'0',timingCents:'0',totalCents:'0'};
    if(first){const date=new Date(first+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);opening=settlementGap(settlements,date.toISOString().slice(0,10));}
    const pay=add(ending.payCents,negate(opening.payCents)),receive=add(ending.receiveCents,negate(opening.receiveCents)),timing=add(ending.timingCents,negate(opening.timingCents)),gap=add(ending.totalCents,negate(opening.totalCents)),movement=add(receivable,negate(payable)),effect=add(movement,gap);
    return Object.assign({},summary,{cashResultCents:summary.resultCents,rateioPayableCents:payable,rateioReceivableCents:receivable,pendingSettlementCents:pay,pendingReceiptCents:receive,settlementTimingCents:timing,settlementGapCents:gap,reservedCents:add(payable,pay),expectedReceiptsCents:add(receivable,receive),rateioMovementCents:movement,rateioEffectCents:effect,availableCents:add(summary.resultCents,effect)});
  }
  function periodAvailability(summary,balances,settlements,first,last){return availability(summary,balances,settlements,last,first);}
  // Totais informativos do recorte; a posição de dívida vem do resumo bilateral.
  function rateioTotals(items,settlements,balances,viewer,first,last){
    const inside=date=>!!date&&(!first||date>=first)&&(!last||date<=last),value=n=>{if(!cents(n)||compare(n,'0')<0)throw Error('Valor de rateio inválido.');return n;};
    let expenses='0',paid='0',received='0',expenseCredits='0',incomeCredits='0',incomeDebts='0',adjustments='0',payable='0',receivable='0';
    for(const item of items||[]){
      if(!inside(item.date)||!['Despesa','Receita'].includes(item.type))continue;
      if(item.financeOwner===viewer){const others=(item.shares||[]).filter(p=>p.id!==viewer).reduce((sum,p)=>add(sum,value(p.cents)),'0');if(item.type==='Despesa')expenseCredits=add(expenseCredits,others);else incomeDebts=add(incomeDebts,others);}
      else if(item.type==='Despesa')expenses=add(expenses,value(item.myCents));else incomeCredits=add(incomeCredits,value(item.myCents));
    }
    for(const s of settlements||[]){
      if(!['Aguardando_Credor','Efetivado'].includes(s.status))continue;
      if(s.mode==='adjustment'){if(inside(s.date||s.otherDate))adjustments=add(adjustments,s.side==='pay'?value(s.amountCents):negate(value(s.amountCents)));continue;}
      if(!s.ownRegistered||!inside(s.date))continue;
      if(s.side==='pay')paid=add(paid,value(s.amountCents));else if(s.side==='receive'&&(!s.invoice||s.ownEntry))received=add(received,value(s.amountCents));
    }
    for(const b of balances||[]){if(!cents(b.balanceCents))throw Error('Saldo de rateio inválido.');if(compare(b.balanceCents,'0')<0)payable=add(payable,negate(b.balanceCents));else receivable=add(receivable,b.balanceCents);}
    return {expensesCents:expenses,paidCents:paid,receivedCents:received,payableCents:payable,receivableCents:receivable,expenseCreditsCents:expenseCredits,incomeCreditsCents:incomeCredits,incomeDebtsCents:incomeDebts,adjustmentsCents:adjustments,pendingPaymentCents:settlementGap(settlements,last).payCents};
  }
  function categoryLabel(category,categories){if(!category)return '';if(!category.parent)return category.name;const parent=(categories||[]).find(c=>c.id===category.parent);return category.name+(parent?' (subcategoria de '+parent.name+')':' (subcategoria)');}
  function query(rows,input){const f=clean(input),filtered=windowRows(rows,f).filter(r=>matches(r,f));return {rows:filtered,filters:f,options:facets(rows,f),summary:summarize(filtered)};}
  return {rateioTotals:rateioTotals,rateioBalances:rateioBalances,spendingRows:spendingRows,availability:availability,periodAvailability:periodAvailability,categoryLabel:categoryLabel,windowRows:windowRows,dimensions:dimensions,add:add,compare:compare,multiply:multiply,negate:negate,cents:cents,money:money,clean:clean,matches:matches,facets:facets,valid:valid,normalize:normalize,summarize:summarize,query:query};
}
