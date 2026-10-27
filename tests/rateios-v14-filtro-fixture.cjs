// Casos exclusivamente fictícios no PostgreSQL local.
const {ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.MUKIRANA_TEST_DB,'rateios_v4_browser');
const id=()=>crypto.randomUUID(),bank='40000000-4000-4000-8000-400000000001',otherBank='40000000-4000-4000-8000-400000000002',cat=sql("select id_categoria from categorias where nome='Categoria teste' limit 1"),prefix='Filtro rateio v14 ';sql('delete from acertos_rateios;delete from rateios;');
const entries={};
function create(name,date,extra={}){const r={id:id(),operationId:id(),version:0,type:'expense',description:prefix+name,amountCents:'20000',date,origin:bank,category:cat,classification:'variable',mode:'single',status:date>'2026-10-27'?'pending':'done',shares:[{id:actors.owner,cents:'10000'},{id:actors.additional,cents:'10000'}],...extra};ctx.lancamentosNovoSalvar('owner-token',r);entries[name]=r.id;return r;}
for(const [name,date] of [['july','2026-07-02'],['september','2026-09-10'],['october','2026-10-05'],['november','2026-11-10'],['december','2026-12-10']])create(name,date);
create('group','2026-09-12',{mode:'installment',frequency:'monthly',quantity:3,amountCents:'9000',shares:[{id:actors.owner,cents:'4500'},{id:actors.additional,cents:'4500'}]});
const payments={};for(const [name,date,amountCents] of [['july','2026-07-15','2000'],['september','2026-09-20','3000'],['october','2026-10-20','4000']]){const p=ctx.rateiosNovoMutar('additional-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.owner,amountCents,date,account:otherBank}).settlement;payments[name]=p.id;if(name==='july')ctx.rateiosNovoMutar('owner-token',{action:'settle',id:p.id,version:p.version,operationId:id(),entryId:id(),side:'receive',other:actors.additional,amountCents,date:'2026-08-02',account:bank});}
const receivedExpense={id:id(),operationId:id(),version:0,type:'expense',description:prefix+'received expense',amountCents:'200000',date:'2026-09-15',origin:otherBank,category:cat,classification:'variable',mode:'single',status:'done',shares:[{id:actors.owner,cents:'100000'},{id:actors.additional,cents:'100000'}]};ctx.lancamentosNovoSalvar('additional-token',receivedExpense);entries.received=receivedExpense.id;
const ownPayment=ctx.rateiosNovoMutar('owner-token',{action:'settle',id:id(),operationId:id(),entryId:id(),version:0,side:'pay',other:actors.additional,amountCents:'2000',date:'2026-09-25',account:bank}).settlement;payments.own=ownPayment.id;
const pack=ctx.lancamentosNovoListar('owner-token',{Mes_Inicial:'',Mes_Final:'2026-12'}),approvals={};for(const [name,entry] of Object.entries(entries))approvals[name]=pack.rateios.approvals.find(a=>(a.occurrences||[]).some(o=>o.id===entry)).id;
const group=pack.entries.filter(e=>e.description===prefix+'group').sort((a,b)=>a.date.localeCompare(b.date));assert.equal(group.length,3);
const cases=[
 {month:'2026-09',history:false,entries:[entries.september,entries.received,group[0].id],settlements:[payments.september,payments.own],approvals:[approvals.september,approvals.received,approvals.group],totals:{expenses:'100000',paid:'2000',payable:'81500',receivable:'0',received:'0'}},
 {month:'2026-09',history:true,entries:[entries.july,entries.september,entries.received,group[0].id],settlements:[payments.july,payments.september,payments.own],approvals:[approvals.july,approvals.september,approvals.received,approvals.group],totals:{expenses:'100000',paid:'2000',payable:'81500',receivable:'0',received:'2000'}},
 {month:'2026-11',history:false,entries:[entries.november,group[2].id],settlements:[],approvals:[approvals.november,approvals.group],totals:{expenses:'0',paid:'0',payable:'62500',receivable:'0',received:'0'}},
 {month:'2026-06',history:false,entries:[],settlements:[],approvals:[],totals:{expenses:'0',paid:'0',payable:'0',receivable:'0',received:'0'}},
 // A data do recebimento próprio rege o acerto concluído do credor.
 {month:'2026-07',history:false,entries:[entries.july],settlements:[],approvals:[approvals.july],totals:{expenses:'0',paid:'0',payable:'0',receivable:'8000',received:'0'}},
 {month:'2026-08',history:false,entries:[],settlements:[payments.july],approvals:[],totals:{expenses:'0',paid:'0',payable:'0',receivable:'8000',received:'2000'}}
];
console.log(JSON.stringify({cases,groupApproval:approvals.group,groupSize:3}));
