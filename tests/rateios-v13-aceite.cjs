// Somente PostgreSQL efêmero: RPCs/controllers reais, sem dados ou API de produção.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),util=require('node:util'),vm=require('node:vm');
const {ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs');
assert.equal(process.env.MUKIRANA_TEST_DB,'rateios_v4_browser');
const id=()=>crypto.randomUUID(),owner=actors.owner,other=actors.additional,bank='40000000-4000-4000-8000-400000000001',otherBank='40000000-4000-4000-8000-400000000002',category=sql("select id_categoria from categorias where nome='Categoria teste' limit 1"),date='2026-10-26';
let checks=0;const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;},fail=(f,p)=>{assert.throws(f,p);checks++;};
// Limpeza exclusiva da fixture efêmera; nenhum comando remoto é usado neste teste.
sql('delete from acertos_rateios;delete from rateios;');
function shared(amount,day=date){return ctx.lancamentosNovoSalvar('owner-token',{id:id(),operationId:id(),version:0,type:'expense',description:'Aceite v13 fictício',amountCents:String(amount*2),date:day,origin:bank,category,classification:'variable',mode:'single',status:day>date?'pending':'done',shares:[{id:owner,cents:String(amount)},{id:other,cents:String(amount)}]});}
const req=(side,amount,extra={})=>({action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side,other:side==='pay'?owner:other,amountCents:String(amount),date,account:side==='pay'?otherBank:bank,...extra});
const mutate=(token,r)=>ctx.rateiosNovoMutar(token,r).settlement;
const balance=()=>ctx.rateiosNovoListar('owner-token',{}).balances.find(b=>b.id===other)?.balanceCents||'0';
const hashes=()=>sql("select jsonb_build_object('entries',(select md5(string_agg(to_jsonb(l)::text,'' order by id_lancamento)) from lancamentos l),'settlements',(select md5(string_agg(to_jsonb(a)::text,'' order by id_acerto_rateio)) from acertos_rateios a))");
const accept=(p,extra={})=>req('receive',p.amountCents,{id:p.id,version:p.version,...extra});
shared(15000);eq(balance(),'15000');const p=mutate('additional-token',req('pay',4000));eq(balance(),'11000');
// Um Receber novo não pode repetir o pagamento, mesmo com outra data/ID/operação.
const before=hashes();fail(()=>mutate('owner-token',req('receive',4000)),/acerto enviado/);fail(()=>mutate('owner-token',req('receive',4000,{date:'2026-10-27'})),/acerto enviado/);eq(hashes(),before);
const receive=accept(p),done=mutate('owner-token',receive);eq(done.id,p.id);eq(balance(),'11000');eq(done.ownRegistered,true);eq(done.otherRegistered,true);const h=hashes();mutate('owner-token',receive);eq(hashes(),h);
fail(()=>mutate('owner-token',accept(done)),/mudaram/);fail(()=>mutate('owner-token',req('receive',4000)),/já foi registrado/);eq(hashes(),h);
fail(()=>mutate('other-token',accept(p)),/não pode/);fail(()=>ctx.rateiosNovoMutar('invalid',receive),/expirada/);
// Recebimento avulso legítimo e confirmação inversa também usam um único acerto.
const r=mutate('owner-token',req('receive',3000));eq(balance(),'8000');fail(()=>mutate('additional-token',req('pay',3000)),/acerto enviado/);
mutate('additional-token',req('pay',3000,{id:r.id,version:r.version}));eq(balance(),'8000');
// Dois pagamentos reais com o mesmo valor/data são aceitos pelos IDs respectivos.
const p2=mutate('additional-token',req('pay',4000)),p3=mutate('additional-token',req('pay',4000));eq(balance(),'0');
for(const payment of [p2,p3]){const result=mutate('owner-token',accept(payment));eq(result.id,payment.id);eq(balance(),'0');}
eq(sql("select count(*) from acertos_rateios where id_usuario_devedor='"+other+"' and id_usuario_credor='"+owner+"'"),'4');
// Nova obrigação de novembro quitada antecipadamente em outubro: novembro fica zero.
shared(5000,'2026-11-05');const advance=mutate('additional-token',req('pay',5000));mutate('owner-token',accept(advance));
const C=ctx.lancamentosNovoRegras_(),P=vm.runInContext('painelNovoRegras_()',ctx);
for(const history of [false,true]){const period={Mes_Selecionado:'2026-11',Considerar_Historico_Anterior:history},pack=ctx.painelNovoListar('owner-token',period),result=P.compute(pack,false,C);eq(result.receivableCents,'0');eq(result.payableCents,'0');const modal=ctx.lancamentosContextoListar('owner-token',{rateiosPeriod:true,period});eq(modal.rateios.scopedSummary.balances.find(b=>b.id===other).balanceCents,'0');}
const october=ctx.painelNovoListar('owner-token',{Mes_Selecionado:'2026-10',Considerar_Historico_Anterior:false});eq(P.compute(october,false,C).payableCents,'5000');
// As permissões da RPC continuam restritas ao servidor.
for(const role of ['anon','authenticated'])eq(sql(`select has_function_privilege('${role}','public.rpc_rateios_mutar_v4(uuid,uuid,jsonb)','execute')`),'f');
(async()=>{
 // Duas sessões enviam Receber com IDs/operações diferentes: somente uma receita.
 shared(1000);const count=Number(sql('select count(*) from acertos_rateios')),run=util.promisify(cp.execFile),requests=[req('receive',1000),req('receive',1000)];
 const results=await Promise.all(requests.map(r=>run(process.execPath,['tests/lancamentos-v3-gateway.cjs','rateiosNovoMutar',JSON.stringify(['owner-token',r])],{env:process.env}).then(x=>JSON.parse(x.stdout),e=>JSON.parse(e.stdout))));
 eq(results.filter(x=>x.ok).length,1);eq(results.filter(x=>!x.ok&&/já foi registrado/.test(x.error)).length,1);eq(Number(sql('select count(*) from acertos_rateios')),count+1);eq(balance(),'0');
 // Completa a ponta do pagador para deixar a fixture sem acertos pendentes.
 const receipt=results.find(x=>x.ok).result.settlement;mutate('additional-token',req('pay',1000,{id:receipt.id,version:receipt.version}));
 // Fatura já transferida: nem uma sessão antiga pode forçar outra receita.
 const fixture=JSON.parse(cp.execFileSync(process.execPath,['tests/rateios-v13-fixture.cjs','invoice'],{env:process.env,encoding:'utf8'})),payment=fixture.payments[0],v=ctx.rateiosNovoListar('owner-token',{}).settlements.find(s=>s.id===payment.id),beforeInvoice=hashes();
 fail(()=>mutate('owner-token',accept(v,{invoiceExisting:false})),/Revise/);fail(()=>mutate('owner-token',req('receive',3000)),/acerto enviado/);eq(hashes(),beforeInvoice);
 const entries=sql('select count(*) from lancamentos');const recognized=mutate('owner-token',accept(v,{invoiceExisting:true}));eq(recognized.ownRegistered,true);eq(sql('select count(*) from lancamentos'),entries);eq(balance(),'0');
 console.log(JSON.stringify({checks,result:'PASS',coverage:'pending-payment guard; same-settlement acceptance; replay; fresh duplicate rejection; distinct real payments; concurrent receives; advance settlement and zero balance in panel/modal; permissions'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
