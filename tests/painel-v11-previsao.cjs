const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),{ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs');
assert.equal(process.env.MUKIRANA_TEST_DB,'rateios_v4_test');
sql('DELETE FROM public.acertos_rateios; DELETE FROM public.rateios;');
const C=ctx.lancamentosNovoRegras_(),P=vm.runInContext('painelNovoRegras_()',ctx),id=()=>crypto.randomUUID(),bank='40000000-4000-4000-8000-400000000001',otherBank=id(),period={Mes_Selecionado:'2026-08',Considerar_Historico_Anterior:false};let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++;};
ctx.contasTiposSalvar('other-token',{id:otherBank,version:0,operationId:id(),name:'Conta previsões '+otherBank,type:'Consumo',openingAmountCents:'0',openingDate:'2026-07-01',shared:false,participants:[]});
const category=ctx.lancamentosNovoListar('owner-token',period).categories.find(c=>c.global&&c.type==='Despesa').id;
function panel(token){return P.compute(ctx.painelNovoListar(token,period),false,C);}
const month=(p,m)=>p.months.find(x=>x.month===m).availableCents;
const baseOwner=panel('owner-token'),baseOther=panel('other-token'),history=token=>P.compute(ctx.painelNovoListar(token,{...period,Considerar_Historico_Anterior:true}),false,C),baseHistory=history('owner-token');
for(const [amount,date] of [['10000','2026-07-05'],['30000','2026-08-05']])ctx.lancamentosNovoSalvar('owner-token',{id:id(),operationId:id(),version:0,type:'expense',description:'Rateio previsão mensal teste',amountCents:amount,date,origin:bank,category,classification:'variable',mode:'single',status:'pending',shares:[{id:actors.owner,cents:String(Number(amount)/2)},{id:actors.other,cents:String(Number(amount)/2)}]});
const owner=panel('owner-token'),other=panel('other-token');
eq(owner.summary.cashResultCents,C.add(baseOwner.summary.cashResultCents,'-30000'));eq(owner.summary.availableCents,C.add(baseOwner.summary.availableCents,'-15000')); // caixa de agosto e posição a receber de julho+agosto
for(const [m,delta] of [['2026-07','-5000'],['2026-08','-15000'],['2026-09','0']]){eq(month(owner,m),C.add(month(baseOwner,m),delta));eq(month(other,m),C.add(month(baseOther,m),delta));}
eq(history('owner-token').summary.availableCents,C.add(baseHistory.summary.availableCents,'-20000'));eq(month(history('owner-token'),'2026-09'),C.add(month(baseHistory,'2026-09'),'-20000'));
// Dívida não desaparece: só o card mensal deixa de transportar o estoque anterior.
eq(owner.receivableCents,'15000');eq(other.payableCents,'15000');eq(other.summary.availableCents,C.add(baseOther.summary.availableCents,'-15000'));
const partial=ctx.rateiosNovoMutar('other-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.owner,amountCents:'10000',date:'2026-08-10',account:otherBank}).settlement;
eq(panel('owner-token').summary.availableCents,owner.summary.availableCents);eq(panel('other-token').summary.availableCents,other.summary.availableCents);eq(month(panel('owner-token'),'2026-08'),month(owner,'2026-08'));eq(month(panel('other-token'),'2026-08'),month(other,'2026-08'));
ctx.rateiosNovoMutar('owner-token',{action:'settle',id:partial.id,operationId:id(),entryId:id(),version:partial.version,side:'receive',other:actors.other,amountCents:'10000',date:'2026-08-11',account:bank});eq(panel('owner-token').summary.availableCents,owner.summary.availableCents);eq(month(panel('owner-token'),'2026-08'),month(owner,'2026-08'));
// Pagamento no fim de agosto e recebimento em setembro: a previsão vira realizado uma vez.
const remaining=ctx.rateiosNovoMutar('other-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.owner,amountCents:'10000',date:'2026-08-30',account:otherBank}).settlement;
ctx.rateiosNovoMutar('owner-token',{action:'settle',id:remaining.id,operationId:id(),entryId:id(),version:remaining.version,side:'receive',other:actors.other,amountCents:'10000',date:'2026-09-02',account:bank});
for(const token of ['owner-token','other-token']){const p=panel(token),baseline=token==='owner-token'?owner:other;eq(p.summary.availableCents,baseline.summary.availableCents);eq(month(p,'2026-08'),month(baseline,'2026-08'));eq(month(p,'2026-09'),month(baseline,'2026-09'));}
// Ponta de recebimento anterior à data de pagamento: correção temporal simétrica.
const income=C.summarize([{type:'income',signedCents:'10000'}]),empty=C.summarize([]),dated={side:'receive',mode:'settlement',status:'Efetivado',amountCents:'10000',date:'2026-08-29',otherDate:'2026-09-01',ownRegistered:true};
eq(C.periodAvailability(income,[{movementCents:'0'}],[dated],'2026-08-01','2026-08-30').availableCents,'0');eq(C.periodAvailability(empty,[{movementCents:'-10000'}],[dated],'2026-09-01','2026-09-31').availableCents,'0');
// Um acerto ainda sem lançamento próprio, de um mês anterior, também não vaza para setembro.
const unbooked={...dated,date:null,otherDate:'2026-08-10',ownRegistered:false};eq(C.periodAvailability(empty,[{movementCents:'0'}],[unbooked],'2026-09-01','2026-09-31').availableCents,'0');
console.log(JSON.stringify({checks,result:'PASS',coverage:'monthly movements only; creditor and debtor forecast; no previous debt/claim carried into month cards; actual account cash unchanged; partial, two legs and cross-month receipts counted once'}));
