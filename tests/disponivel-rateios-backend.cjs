const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),{ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs'),C=ctx.lancamentosNovoRegras_(),P=vm.runInContext('painelNovoRegras_()',ctx);
const id=()=>crypto.randomUUID(),period={Mes_Selecionado:'2026-10',Considerar_Historico_Anterior:false},bank='40000000-4000-4000-8000-400000000001',otherBank=id();let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++;};
ctx.contasTiposSalvar('other-token',{id:otherBank,version:0,operationId:id(),name:'Conta teste disponível '+otherBank,type:'Consumo',openingAmountCents:'0',openingDate:'2026-10-01',shared:false,participants:[]});
const expense=ctx.lancamentosNovoListar('owner-token',period).categories.find(c=>c.global&&c.type==='Despesa').id;
function state(){const pack=ctx.lancamentosNovoListar('owner-token',period),r=C.availability(C.query(pack.rows,{}).summary,pack.rateiosSummary.balances,pack.rateios.settlements,pack.period.last,pack.period.first);return {pack,r};}
function panel(){const p=ctx.painelNovoListar('owner-token',period);return {p,c:P.compute(p,false,C)};}
function recipientState(){const p=ctx.lancamentosNovoListar('other-token',period);return C.availability(C.query(p.rows,{}).summary,p.rateiosSummary.balances,p.rateios.settlements,p.period.last,p.period.first);}
let base=state(),basePanel=panel(),recipientBase=recipientState();
// Outra pessoa paga; sua parte é compromisso, sem criar uma saída bancária.
ctx.lancamentosNovoSalvar('other-token',{id:id(),operationId:id(),version:0,type:'expense',description:'Despesa externa para disponibilidade',amountCents:'20000',date:'2026-10-05',origin:otherBank,category:expense,classification:'variable',mode:'single',status:'done',shares:[{id:actors.owner,cents:'10000'},{id:actors.other,cents:'10000'}]});
let shared=state(),sharedPanel=panel(),recipientShared=recipientState();eq(recipientShared.cashResultCents,C.add(recipientBase.cashResultCents,'-20000'));eq(recipientShared.availableCents,C.add(recipientBase.availableCents,'-10000'));eq(shared.r.cashResultCents,base.r.cashResultCents);eq(shared.r.availableCents,C.add(base.r.availableCents,'-10000'));eq(sharedPanel.c.summary.availableCents,C.add(basePanel.c.summary.availableCents,'-10000'));eq(sharedPanel.c.months.find(m=>m.month==='2026-10').availableCents,sharedPanel.c.summary.availableCents);
// Parcial: a saída bancária substitui a reserva, sem descontar outra vez.
const pay=ctx.rateiosNovoMutar('owner-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.other,amountCents:'4000',date:'2026-10-10',account:bank}).settlement;
let partial=state();eq(partial.r.availableCents,shared.r.availableCents);eq(partial.r.reservedCents,C.add(shared.r.reservedCents,'-4000'));eq(partial.r.cashResultCents,C.add(shared.r.cashResultCents,'-4000'));
// A receita do credor se vincula ao mesmo acerto e não altera o caixa do devedor.
ctx.rateiosNovoMutar('other-token',{action:'settle',id:pay.id,operationId:id(),entryId:id(),version:pay.version,side:'receive',other:actors.owner,amountCents:'4000',date:'2026-10-11',account:otherBank});eq(state().r.availableCents,shared.r.availableCents);
// Recebimento iniciado pelo credor: manter reservado até o devedor registrar sua ponta.
const receive=ctx.rateiosNovoMutar('other-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'receive',other:actors.owner,amountCents:'6000',date:'2026-10-12',account:otherBank}).settlement;
let unbooked=state();eq(unbooked.r.availableCents,shared.r.availableCents);eq(unbooked.r.pendingSettlementCents,'6000');
ctx.rateiosNovoMutar('owner-token',{action:'settle',id:receive.id,operationId:id(),entryId:id(),version:receive.version,side:'pay',other:actors.other,amountCents:'6000',date:'2026-10-12',account:bank});let done=state();eq(done.r.availableCents,shared.r.availableCents);eq(done.r.pendingSettlementCents,'0');
// Quem pagou mantém o caixa integral; a previsão de recebimento é substituída pelo realizado.
const recipientPack=ctx.lancamentosNovoListar('other-token',period),recipient=C.availability(C.query(recipientPack.rows,{}).summary,recipientPack.rateiosSummary.balances,recipientPack.rateios.settlements,recipientPack.period.last,recipientPack.period.first);eq(recipient.availableCents,recipientShared.availableCents);
const n=sql('select count(*) from lancamentos');ctx.painelNovoListar('owner-token',period);ctx.lancamentosNovoListar('owner-token',period);eq(sql('select count(*) from lancamentos'),n);
console.log(JSON.stringify({checks,result:'PASS',coverage:'personal commitments in global/month cards; actual cash unchanged; partial/full/creditor-started settlement counted once; receivables included as forecast, receipts counted once; read-only APIs'}));
