const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const uid='10000000-1000-4000-8000-100000000001',gid='20000000-2000-4000-8000-200000000001',op='30000000-3000-4000-8000-300000000001';
let valid=true,calls=[],response;
const group={id:gid,version:1,name:'Principal',ownerId:uid,ownerName:'Dono',canEdit:true,active:true,role:'owner',limitCents:'1000000',closingDay:10,dueDay:17,cardsCount:1,participants:[],senha_pin:'private'};
const c=vm.createContext({obterSessaoObrigatoria:t=>{if(!valid||t!=='ok')throw Error('expired');return{id:uid};},bancoUsaSupabase_:()=>true,supabaseRpc_:(n,p)=>{calls.push({n,p});return response;},Utilities:{formatDate:d=>d.toISOString().slice(0,10)}});
for(const file of ['Contas_Nova_Controller.js','Cartoes_Novo_Controller.js','Consolidados_Controller.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
response={group};const request={id:gid,version:0,operationId:op,name:' Principal ',limitCents:'1000000',closingDay:10,dueDay:17,participants:[],ownerId:op};
let r=c.cartoesNovoSalvar('ok',request);assert.equal(calls.at(-1).p.p_usuario,uid);assert.equal(calls.at(-1).p.p_nome,'Principal');assert.equal(r.group.senha_pin,undefined);
for(const patch of [{id:'x'},{version:-1},{limitCents:1.20},{limitCents:'-1'},{limitCents:'9'.repeat(10000)},{limitCents:'100000000000000'},{closingDay:0},{closingDay:32},{dueDay:31.5},{participants:[{}]}])assert.throws(()=>c.cartoesNovoSalvar('ok',{...request,...patch}));
valid=false;for(const method of ['cartoesNovoListar','cartoesNovoDetalhar','cartoesNovoSalvar','cartoesNovoStatus','cartoesNovoUsuarios','cartoesNovoPrevisoes'])assert.throws(()=>c[method]('ok',request));valid=true;
response={groups:[{...group,registeredCents:'1000',paidCents:'200',scheduledPaymentsCents:'300',openCents:'800',creditCents:'0'}]};r=c.cartoesNovoListar('ok',{Mes_Inicial:'2026-10',Mes_Final:'2026-11'});assert.equal(r.period.multi,true);assert.equal(calls.at(-1).p.p_inicio,'2026-10-01');assert.equal(calls.at(-1).p.p_fim,'2026-11-01');
r=c.cartoesNovoListar('ok',{Mes_Inicial:'',Mes_Final:''});assert.equal(r.period.start,null);assert.equal(calls.at(-1).p.p_inicio,null);
assert.throws(()=>c.cartoesNovoListar('ok',{Mes_Inicial:'2026-11',Mes_Final:'2026-10'}));
assert.equal(c.obterMesCompetenciaCartaoLancamentoConsolidadoController_({Tipo_Origem:'Cartão',Mes_Referencia:'2026-11',Data_Ocorrencia:'2026-10-15'},{cartoesTodos:[]}), '2026-11');
// Recorrência diária antiga: a janela não desaparece após as primeiras 400 ocorrências.
c.calcularProximaDataRecorrenciaConsolidadoController_=(r,d)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+Number(r.Intervalo_Dias));return x.toISOString().slice(0,10)};
c.recorrenciaJaGerouLancamentoConsolidadoController_=(r,ctx,date)=>date==='2026-10-02';
const dates=vm.runInContext("CartoesNovo_.dates({Data_Inicio:'2020-01-01',Periodicidade_Tipo:'Personalizada',Intervalo_Dias:1},{},'2026-10-01','2026-10-03')",c);
assert.deepEqual([...dates],['2026-10-01','2026-10-03']);
// DTO adicional nunca aceita números do consolidado privado como se fossem seus.
response={groups:[{...group,role:'additional',canEdit:false,limitCents:null,participants:[],registeredCents:'28500',paidCents:null,scheduledPaymentsCents:null,openCents:null,creditCents:null}]};r=c.cartoesNovoListar('ok',{Mes_Inicial:'2026-10'});assert.equal(r.groups[0].paidCents,null);
response.groups[0].paidCents='1';assert.throws(()=>c.cartoesNovoListar('ok',{Mes_Inicial:'2026-10'}));
const router=vm.createContext({obterSessaoObrigatoria:()=>({id:uid}),HtmlService:{createTemplateFromFile:n=>({evaluate:()=>({getContent:()=>n})}),createHtmlOutputFromFile:n=>({getContent:()=>n})}});vm.runInContext(fs.readFileSync('App_Main.js','utf8'),router);
assert.equal(router.obterHtmlDaTela('Cartoes','ok'),'Cartoes_Novo_View');assert.equal(router.obterHtmlDaTela('CartoesNovo','ok'),'Cartoes_Novo_View');
const index=fs.readFileSync('Index.html','utf8');assert(!index.includes('Cartões (novo)'));assert(index.includes("navegarPara('Cartoes')"));
console.log('Cartões backend: sessão, ator, DTOs, centavos, filtros, competência, recorrência antiga e rotas: PASS');
