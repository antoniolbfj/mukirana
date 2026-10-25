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
  // Capacidade de gasto: caixa do recorte menos obrigações ainda sem saída própria.
  function availability(summary,balances,settlements,end){
    let payable='0',receivable='0',pendingPayments='0';
    for(const b of balances||[]){const value=String(b.balanceCents);if(!cents(value))throw Error('Saldo de rateio inválido.');if(compare(value,'0')<0)payable=add(payable,negate(value));else receivable=add(receivable,value);}
    for(const s of settlements||[]){if(s.side!=='pay'||s.mode==='adjustment'||!['Aguardando_Credor','Efetivado'].includes(s.status))continue;const effective=s.date||s.otherDate;if(!effective||(end&&effective>end))continue;if(s.ownRegistered&&s.date&&(!end||s.date<=end))continue;const amount=String(s.amountCents);if(!cents(amount)||compare(amount,'0')<0)throw Error('Acerto inválido.');pendingPayments=add(pendingPayments,amount);}
    const reserved=add(payable,pendingPayments);return Object.assign({},summary,{cashResultCents:summary.resultCents,rateioPayableCents:payable,rateioReceivableCents:receivable,pendingSettlementCents:pendingPayments,reservedCents:reserved,availableCents:add(summary.resultCents,negate(reserved))});
  }
  function categoryLabel(category,categories){if(!category)return '';if(!category.parent)return category.name;const parent=(categories||[]).find(c=>c.id===category.parent);return category.name+(parent?' (subcategoria de '+parent.name+')':' (subcategoria)');}
  function query(rows,input){const f=clean(input),filtered=windowRows(rows,f).filter(r=>matches(r,f));return {rows:filtered,filters:f,options:facets(rows,f),summary:summarize(filtered)};}
  return {availability:availability,categoryLabel:categoryLabel,windowRows:windowRows,dimensions:dimensions,add:add,compare:compare,multiply:multiply,negate:negate,cents:cents,money:money,clean:clean,matches:matches,facets:facets,valid:valid,normalize:normalize,summarize:summarize,query:query};
}
