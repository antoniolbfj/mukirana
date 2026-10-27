// Prepara um caso por vez para o navegador, somente no PostgreSQL fictício.
const {ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
assert.equal(process.env.MUKIRANA_TEST_DB,'rateios_v4_browser');const mode=process.argv[2];assert(['single','multiple','invoice'].includes(mode));
const id=()=>crypto.randomUUID(),bank='40000000-4000-4000-8000-400000000001',otherBank='40000000-4000-4000-8000-400000000002',date='2026-10-26',category=sql("select id_categoria from categorias where nome='Categoria teste' limit 1");
ctx.lancamentosNovoSalvar('owner-token',{id:id(),operationId:id(),version:0,type:'expense',description:'UX aceite v13 '+mode,amountCents:'6000',date,origin:bank,category,classification:'variable',mode:'single',status:'done',shares:[{id:actors.owner,cents:'3000'},{id:actors.additional,cents:'3000'}]});
const payments=[];for(let i=0;i<(mode==='multiple'?2:1);i++){
 const amountCents=mode==='multiple'?'1500':'3000',request={action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.owner,amountCents,date,account:otherBank};
 if(mode==='invoice'){const invoice=id(),credit=ctx.lancamentosNovoListar('additional-token',{}).accounts.find(a=>a.linkedGroup==='20000000-2000-4000-8000-200000000001');ctx.lancamentosNovoSalvar('additional-token',{id:invoice,operationId:id(),version:0,type:'transfer',description:'Fatura fixture v13',classification:'variable',amountCents,date,origin:otherBank,destination:credit.id,mode:'single',status:'done',shares:[],invoiceMonth:'2026-10'});request.existingInvoice=invoice;}
 const p=ctx.rateiosNovoMutar('additional-token',request).settlement;payments.push({id:p.id,amountCents});
}
console.log(JSON.stringify({payments,account:bank,other:actors.additional,mode}));
