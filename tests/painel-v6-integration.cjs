// Integração real dos controllers/RPCs com PostgreSQL exclusivamente fictício.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),{ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs'),C=vm.runInContext('lancamentosNovoRegras_()',ctx),P=vm.runInContext('painelNovoRegras_()',ctx),id=()=>crypto.randomUUID();
const reserve='61000000-6100-4100-8100-610000000001',goals='61000000-6100-4100-8100-610000000002',foreign='61000000-6100-4100-8100-610000000003',period={Mes_Inicial:'2026-10',Mes_Final:'2026-10'};
function account(token,uid,name,amount,shared=false){return ctx.contasTiposSalvar(token,{id:uid,operationId:id(),version:0,name,type:'Investimento',openingAmountCents:amount,openingDate:'2026-09-01',shared,participants:shared?[actors.owner]:[]});}
account('owner-token',reserve,'Reserva v6','1720000');account('owner-token',goals,'Objetivos v6','120000');account('other-token',foreign,'Investimento privado v6','987654321',true);
const category=sql(`insert into categorias(nome,tipo,criado_por) values ('Rendimentos v6','Receita','${actors.owner}') returning id_categoria` ).split('\n')[0];
function movement(type,origin,destination,cents,date,status='done'){return ctx.lancamentosNovoSalvar('owner-token',{id:id(),version:0,operationId:id(),type,origin,destination,category:type==='transfer'?'':category,amountCents:cents,date,status,description:'Movimento investimento v6',mode:'single',classification:'variable',shares:[]});}
movement('income',reserve,'','124000','2026-10-02');movement('transfer',reserve,goals,'20000','2026-10-03');movement('income',reserve,'','7000','2026-10-04','pending');movement('income',reserve,'','5000','2026-11-10','pending');
// Recorrência legada prevista na conta: não é materializada para desenhar o gráfico.
sql(`insert into recorrencias(id_usuario,descricao,tipo,valor_base,data_inicio,periodicidade_tipo,modo_geracao,status_recorrencia,tipo_origem,id_origem,criado_por_id) values ('${actors.owner}','Aporte previsto v6','Receita',20,'2026-11-15','Mensal','Manual','Ativa','Conta','${reserve}','${actors.owner}')`);
const before=sql('select count(*) from lancamentos');
const pack=ctx.painelNovoListar('owner-token',period),s=P.compute(pack,false,C),at=(p,uid,m)=>p.wealth.accounts.find(a=>a.id===uid).points.find(p=>p.month===m);
assert.equal(pack.wealth.accounts.length,2);assert(pack.accounts.some(a=>a.id===foreign));assert(!JSON.stringify(pack.wealth).includes(foreign));
assert.equal(at(pack,reserve,'2026-09').cents,'1720000');assert.equal(at(pack,reserve,'2026-10').cents,'1824000');assert.equal(at(pack,goals,'2026-10').cents,'140000');
assert.equal(C.add(at(pack,reserve,'2026-10').cents,at(pack,goals,'2026-10').cents),s.positions.find(p=>p.type==='Investimento').currentCents);
assert.equal(at(pack,reserve,'2026-11').cents,'1838000');assert.equal(at(pack,reserve,'2026-12').cents,'1840000');
const november=ctx.painelNovoListar('owner-token',{Mes_Referencia:'2026-11'}),np=P.compute(november,false,C).positions.find(p=>p.type==='Investimento');assert.equal(C.add(at(november,reserve,'2026-11').cents,at(november,goals,'2026-11').cents),np.forecastCents);
assert.equal(before,sql('select count(*) from lancamentos'));
assert.equal(ctx.painelNovoListar('additional-token',period).wealth.accounts.length,0);
assert.throws(()=>ctx.painelNovoListar('expired',period),/Sessão/);
assert.equal(ctx.painelNovoListar('owner-token',{Mes_Referencia:'2027-01'}).months.join(','),'2026-12,2027-01,2027-02');
const a=ctx.contasTiposListar('owner-token',period).accounts.find(a=>a.id===goals);ctx.contasTiposStatus('owner-token',{id:goals,version:a.version,active:false,operationId:id()});assert.equal(ctx.painelNovoListar('owner-token',period).wealth.accounts.find(a=>a.id===goals).active,false);
console.log('Painel v6 integração: contas próprias/privacidade de compartilhada, inicial único, realizado e projeção conciliados com Contas, recorrência sem gravar, inativas, sessão e referência mensal: PASS');
