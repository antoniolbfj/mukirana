// Integração exclusivamente em PostgreSQL fictício: saldo pessoal e quitação vinculada.
const assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),{ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs');
assert.equal(process.env.MUKIRANA_TEST_DB,'rateios_v4_accounts');
const C=ctx.lancamentosNovoRegras_(),P=ctx.painelNovoRegras_(),id=()=>crypto.randomUUID(),bank='40000000-4000-4000-8000-400000000001',otherBank='40000000-4000-4000-8000-400000000002',cat=sql("select id_categoria from categorias where nome='Categoria teste' limit 1");
sql('delete from acertos_rateios;delete from rateios;');let checks=0;
const eq=(a,b)=>{assert.equal(a,b);checks++;};
function create(type,amount,date,shares=[]){const r={id:id(),operationId:id(),version:0,type,description:'Quitação fictícia v15',amountCents:amount,date,origin:bank,category:cat,classification:'variable',mode:'single',status:'done',shares};ctx.lancamentosNovoSalvar('owner-token',r);return r;}
function statement(token,month,history=false){const filters={Mes_Selecionado:month,Considerar_Historico_Anterior:history},pack=ctx.painelNovoListar(token,filters),s=P.compute(pack,false,C).rateioFinancial,ledger=ctx.lancamentosNovoListar(token,filters);eq(JSON.stringify(s),JSON.stringify(C.rateioStatement(ledger.rateios.scopedSummary||ledger.rateiosSummary,ledger.period.first)));eq(C.add(s.incomeCents,C.negate(s.expenseCents)),s.resultCents);return s;}
create('expense','20000','2026-09-10',[{id:actors.owner,cents:'10000'},{id:actors.additional,cents:'10000'}]);
eq(statement('owner-token','2026-09').resultCents,'10000');eq(statement('additional-token','2026-09').resultCents,'-10000');
const req={action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.owner,amountCents:'6000',date:'2026-09-20',account:otherBank},before=Number(sql('select count(*) from lancamentos'));
const payment=ctx.rateiosNovoMutar('additional-token',req).settlement;
eq(statement('additional-token','2026-09').resultCents,'-4000');eq(statement('owner-token','2026-09').resultCents,'4000');eq(statement('additional-token','2026-09').paidCents,'6000');
ctx.rateiosNovoMutar('additional-token',req);eq(Number(sql('select count(*) from lancamentos')),before+1);
ctx.rateiosNovoMutar('owner-token',{action:'settle',id:payment.id,version:payment.version,operationId:id(),entryId:id(),side:'receive',other:actors.additional,amountCents:'6000',date:'2026-10-02',account:bank});
eq(statement('owner-token','2026-09').resultCents,'4000');eq(statement('owner-token','2026-10').resultCents,'0');eq(statement('additional-token','2026-09').resultCents,'-4000');
const pack=ctx.lancamentosNovoListar('owner-token',{Mes_Selecionado:'2026-10'}),receipt=pack.entries.find(e=>e.settlementId===payment.id);assert.ok(receipt);checks++;eq(receipt.special,'settlement');eq(receipt.sharing,'shared');eq(pack.rows.find(r=>r.entryId===receipt.id).sharing,'shared');
// Complemento no mês seguinte: apenas o recorte global define se a parte anterior entra.
ctx.rateiosNovoMutar('additional-token',{...req,id:id(),entryId:id(),operationId:id(),amountCents:'4000',date:'2026-10-10'});
eq(statement('additional-token','2026-10',true).resultCents,'0');eq(statement('owner-token','2026-10',true).resultCents,'0');eq(statement('additional-token','2026-10').resultCents,'4000');eq(statement('owner-token','2026-10').resultCents,'-4000');
// Receita compartilhada inverte a obrigação, mantendo a parte própria fora da dívida.
create('income','4000','2026-10-12',[{id:actors.owner,cents:'2000'},{id:actors.additional,cents:'2000'}]);
eq(statement('owner-token','2026-10',true).resultCents,'-2000');eq(statement('additional-token','2026-10',true).resultCents,'2000');
const entry=create('expense','2000','2026-10-15');const count=sql('select count(*) from lancamentos');
ctx.rateiosNovoMutar('owner-token',{action:'settle',id:id(),operationId:id(),version:0,side:'pay',other:actors.additional,amountCents:'2000',date:'2026-10-15',account:bank,existingEntry:entry.id});
eq(sql('select count(*) from lancamentos'),count);eq(statement('owner-token','2026-10',true).resultCents,'0');eq(statement('additional-token','2026-10',true).resultCents,'0');
// Privilégios e precisão: resumo somente leitura, sem EXECUTE público.
eq(sql("select has_function_privilege('anon','rpc_painel_rateios_periodo_v10(uuid,date,date)','EXECUTE')"),'f');eq(sql("select prosecdef from pg_proc where oid='rpc_painel_rateios_periodo_v10(uuid,date,date)'::regprocedure"),'f');
const huge='999999999999999999';eq(C.rateioStatement({balances:[{incomeCents:huge,expenseCents:'1',balanceCents:C.add(huge,'-1')}]},null).resultCents,C.add(huge,'-1'));
assert.throws(()=>C.rateioStatement({balances:[{incomeCents:'100',expenseCents:'0',balanceCents:'10'}]},null),/inconsistente/);checks++;
console.log(JSON.stringify({checks,result:'PASS',coverage:'personal debts and credits; partial/full/complement; same settlement acceptance across months; idempotency; existing entry; shared income; monthly/history; dashboard/modal agreement; shared filter; ACL; exact cents'}));
