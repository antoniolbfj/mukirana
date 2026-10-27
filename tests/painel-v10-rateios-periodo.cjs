// PostgreSQL efêmero: partes em despesas/receitas, duas pontas, corte e antecipações.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),{ctx,sql,rpc,actors}=require('./lancamentos-v3-gateway.cjs');
const id=()=>crypto.randomUUID(),owner=actors.owner,other=actors.other,bank='40000000-4000-4000-8000-400000000001',otherBank='41000000-4100-4100-8100-410000000010';
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++;},ok=v=>{assert(v);checks++;};
const category=ctx.lancamentosNovoListar('owner-token',{}).categories.find(c=>c.global&&c.type==='Despesa').id;
const income=sql("INSERT INTO categorias(nome,tipo,global) VALUES('Receitas rateadas v10','Receita',true) RETURNING id_categoria").split('\n')[0];
ctx.contasTiposSalvar('other-token',{id:otherBank,operationId:id(),version:0,name:'Conta Carla v10',type:'Consumo',openingAmountCents:'0',openingDate:'2026-06-01',shared:false,participants:[]});
const create=(type,amount,date)=>ctx.lancamentosNovoSalvar('owner-token',{id:id(),operationId:id(),version:0,type,description:'Rateio período v10',amountCents:amount,date,origin:bank,category:type==='income'?income:category,classification:'variable',mode:'single',status:date>'2026-10-25'?'pending':'done',shares:[{id:owner,cents:String(Number(amount)/2)},{id:other,cents:String(Number(amount)/2)}]});
const summary=(month,history=false,actor=owner)=>rpc('rpc_painel_rateios_periodo_v10',{p_usuario:actor,p_inicio:history?null:month+'-01',p_fim:new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).toISOString().slice(0,10)});
const balance=(m,h=false,actor=owner)=>summary(m,h,actor).balances.find(b=>b.id===(actor===owner?other:owner))?.balanceCents||'0';
const settle=(amount,date)=>ctx.rateiosNovoMutar('other-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:owner,amountCents:amount,date,account:otherBank}).settlement;
create('expense','30000','2026-07-05');create('income','6000','2026-07-06');eq(balance('2026-07'),'12000');eq(balance('2026-07',false,other),'-12000');
const payment=settle('12000','2026-07-31');eq(balance('2026-07'),'0');
ctx.rateiosNovoMutar('owner-token',{action:'settle',id:payment.id,operationId:id(),entryId:id(),version:payment.version,side:'receive',other,amountCents:'12000',date:'2026-08-02',account:bank});eq(balance('2026-07'),'0');eq(balance('2026-08'),'0');
create('expense','20000','2026-11-10');create('expense','40000','2026-12-10');
for(const month of ['2026-06','2026-07','2026-08','2026-09','2026-10']){eq(balance(month),'0');eq(balance(month,true),'0');}
eq(balance('2026-11'),'10000');eq(balance('2026-11',true),'10000');eq(balance('2026-12'),'30000');eq(balance('2026-12',true),'30000');eq(summary('2026-12').balances.find(b=>b.id===other).movementCents,'20000');eq(balance('2026-11',false,other),'-10000');
const nov=summary('2026-11').balances.find(b=>b.id===other);eq(nov.obligationsCents,'10000');eq(nov.settlementsCents,'0');
const jul=summary('2026-07').balances.find(b=>b.id===other);eq(jul.obligationsCents,'12000');eq(jul.settlementsCents,'-12000');
// Parcial, rejeição e nova quitação: um acerto rejeitado não reduz a dívida.
create('expense','10000','2026-09-02');const partial=settle('2000','2026-09-10');eq(balance('2026-09'),'3000');
ctx.rateiosNovoMutar('owner-token',{action:'settle-reject',id:partial.id,version:partial.version,operationId:id(),reason:'Correção de teste local'});eq(balance('2026-09'),'5000');settle('5000','2026-09-30');eq(balance('2026-09'),'0');eq(balance('2026-10',true),'0');
// A posição bilateral preserva a antecipação; o movimento do mês permanece separado.
const advance=settle('1000','2026-10-24');eq(balance('2026-11',false,other),'-9000');eq(balance('2026-11',true,other),'-9000');eq(summary('2026-11',false,other).balances[0].movementCents,'-10000');
ctx.rateiosNovoMutar('other-token',{action:'settle-remove',id:advance.id,version:advance.version,operationId:id()});eq(balance('2026-10',false,other),'0');eq(balance('2026-11',false,other),'-10000');
const C=vm.runInContext('lancamentosNovoRegras_()',ctx),P=vm.runInContext('painelNovoRegras_()',ctx),count=sql('SELECT count(*) FROM lancamentos');
const october=ctx.painelNovoListar('other-token',{Mes_Selecionado:'2026-10',Considerar_Historico_Anterior:false}),octCalc=P.compute(october,false,C);eq(octCalc.payableCents,'0');eq(octCalc.receivableCents,'0');
const november=ctx.painelNovoListar('other-token',{Mes_Selecionado:'2026-11',Considerar_Historico_Anterior:false});eq(P.compute(november,false,C).payableCents,'10000');ok(november.rateios.balances.some(b=>b.balanceCents==='-30000'));eq(november.rateiosSummary.end,'2026-11-30');
const december=ctx.painelNovoListar('other-token',{Mes_Selecionado:'2026-12',Considerar_Historico_Anterior:false}),decHistory=ctx.painelNovoListar('other-token',{Mes_Selecionado:'2026-12',Considerar_Historico_Anterior:true});eq(P.compute(december,false,C).payableCents,'30000');eq(P.compute(decHistory,false,C).payableCents,'30000');eq(count,sql('SELECT count(*) FROM lancamentos'));
const modal=ctx.lancamentosContextoListar('other-token',{rateiosPeriod:true,period:{Mes_Selecionado:'2026-10',Considerar_Historico_Anterior:false}});eq(modal.rateios.scopedSummary.balances[0].balanceCents,'0');
eq(sql("SELECT has_function_privilege('anon','public.rpc_painel_rateios_periodo_v10(uuid,date,date)','execute')"),'f');eq(sql("SELECT has_function_privilege('authenticated','public.rpc_painel_rateios_periodo_v10(uuid,date,date)','execute')"),'f');
assert.throws(()=>rpc('rpc_painel_rateios_periodo_v10',{p_usuario:other,p_inicio:'2026-11-01',p_fim:'2026-10-31'}),/invalid_request/);checks++;
assert.throws(()=>ctx.painelNovoListar('expired',{}),/expirada/);checks++;
console.log(JSON.stringify({checks,result:'PASS',coverage:'closed months, expense/income signs, single settlement for two legs, partial/rejected, future cutoff, history checkbox, panel/modal consistency, permissions and no writes on reads'}));
