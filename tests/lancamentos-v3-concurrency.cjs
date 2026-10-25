const assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),{ctx}=require('./lancamentos-v3-gateway.cjs');
function call(method,request){return new Promise(resolve=>cp.execFile('node',['tests/lancamentos-v3-gateway.cjs',method,JSON.stringify(['owner-token',request])],{encoding:'utf8'},(_e,out)=>resolve(JSON.parse(out))));}
(async()=>{
 const pack=ctx.lancamentosNovoListar('owner-token',{}),account=pack.accounts.find(a=>a.kind==='Conta'&&a.canUse),cat=pack.categories.find(c=>c.active);
 const create={id:crypto.randomUUID(),operationId:crypto.randomUUID(),version:0,description:'CONCORRENCIA_LN',type:'expense',amountCents:'10000',date:'2026-10-20',origin:account.id,category:cat.id,classification:'variable',mode:'single',status:'done',shares:[]};
 const replay=await Promise.all([call('lancamentosNovoSalvar',create),call('lancamentosNovoSalvar',create)]);assert(replay.every(x=>x.ok),replay);
 const detail=ctx.lancamentosNovoDetalhar('owner-token',create.id);assert.equal(detail.entry.version,1);
 const updates=await Promise.all([call('lancamentosNovoSalvar',{...create,version:1,operationId:crypto.randomUUID(),amountCents:'10100'}),call('lancamentosNovoSalvar',{...create,version:1,operationId:crypto.randomUUID(),amountCents:'10200'})]);assert.equal(updates.filter(x=>x.ok).length,1);
 const current=ctx.lancamentosNovoDetalhar('owner-token',create.id);assert.equal(current.entry.version,2);assert(['10100','10200'].includes(current.entry.amountCents));
 const remove={id:create.id,version:2,operationId:crypto.randomUUID(),action:'delete',scope:'one'};const deletions=await Promise.all([call('lancamentosNovoAcao',remove),call('lancamentosNovoAcao',remove)]);assert(deletions.every(x=>x.ok),deletions);
 console.log('Concorrência real: criação repetida sem duplicar, edições concorrentes com um vencedor e exclusão repetida: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
