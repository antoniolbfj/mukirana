// Posições de investimento, projeções e limites visuais com centavos exatos.
const assert=require('node:assert/strict'),vm=require('node:vm'),{ctx}=require('./lancamentos-v3-gateway.cjs'),C=vm.runInContext('lancamentosNovoRegras_()',ctx),P=vm.runInContext('painelNovoRegras_()',ctx);
const accounts=[{id:'reserve',name:'Reserva',active:true},{id:'goals',name:'Objetivos',active:false}];
const row=(account,date,cents,status='done',special='')=>({account,date,signedCents:cents,status,special});
const rows=[
 row('reserve','2025-12-10','10000'), // inicial contabilizado uma vez
 row('reserve','2026-09-01','2500'),
 row('reserve','2026-09-02','7000','pending'), // passado pendente não é realizado
 row('reserve','2026-10-03','500'),
 row('reserve','2026-10-04','-2000'),row('goals','2026-10-04','2000'), // transferência interna
 row('reserve','2026-10-26','999','done'), // efetivado com data futura fica fora de até hoje
 row('reserve','2026-11-02','1000','pending'),row('reserve','2026-11-05','200','pending','projection'),
 row('foreign','2026-10-01','999999999'),row('consumption','2026-10-01','999999999')
];
let w=P.wealth(accounts,rows,'2026-10-25','2026-10',C);
const point=(id,m)=>w.accounts.find(a=>a.id===id).points.find(p=>p.month===m);
assert.equal(w.accounts.length,2);assert.equal(w.months.length,12);
assert.equal(point('reserve','2026-09').cents,'12500');
assert.equal(point('reserve','2026-10').cents,'11000');
assert.equal(point('goals','2026-10').cents,'2000');
assert.equal(C.add(point('reserve','2026-10').cents,point('goals','2026-10').cents),'13000');
assert.equal(point('reserve','2026-11').cents,'20199');
assert.equal(point('reserve','2026-10').projected,false);assert.equal(point('reserve','2026-11').projected,true);
assert.equal(point('reserve','2026-10').date,'2026-10-25');assert.equal(point('reserve','2026-09').date,'2026-09-30');
assert.deepEqual(Array.from(P.chartMonths('2027-01','three')),['2026-12','2027-01','2027-02']);
assert.deepEqual(Array.from(P.chartMonths('2026-12','three')),['2026-11','2026-12','2027-01']);
assert.equal(P.chartMonths('2026-06','half')[0],'2026-01');assert.equal(P.chartMonths('2026-07','half')[0],'2026-07');
assert.equal(P.chartMonths('2026-10','year').length,12);assert.equal(P.monthEnd('2028-02'),'2028-02-29');
w=P.wealth(accounts,rows,'2026-10-25','2027-01',C);assert(w.months.includes('2026-12'));assert(w.months.includes('2027-12'));
assert.equal(P.wealth([],rows,'2026-10-25','2026-10',C).accounts.length,0);
assert.throws(()=>P.wealth(accounts,[row('reserve','2026-10-01','1.3')],'2026-10-25','2026-10',C),/inválido/);
const big='999999999999999999999';w=P.wealth([accounts[0]],[row('reserve','2026-09-01',big),row('reserve','2026-10-01','1')],'2026-10-25','2026-10',C);assert.equal(point('reserve','2026-10').cents,'1000000000000000000000');
for(const [actual,expected] of [['7999','good'],['8000','warning'],['10000','warning'],['10001','danger']])assert.equal(P.goalSignal({actualCents:actual,targetCents:'10000',income:false},C),expected);
for(const [actual,expected] of [['7999','danger'],['8000','warning'],['9999','warning'],['10000','good'],['10001','good']])assert.equal(P.goalSignal({actualCents:actual,targetCents:'10000',income:true},C),expected);
assert.equal(P.goalSignal({actualCents:'8000000000000000000',targetCents:'10000000000000000001',income:false},C),'good');
assert.equal(P.balanceSignal('-1',C),'danger');assert.equal(P.balanceSignal('0',C),'warning');assert.equal(P.balanceSignal('1',C),'good');
console.log('Painel v6: fechamento realizado/até hoje, futuros/pendentes/recorrências, transferências internas, contas isoladas/inativas, 3/6/12 meses, virada de ano, bissexto e limites exatos de semáforo: PASS');
