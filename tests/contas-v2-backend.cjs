const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){let i=0;for(const m of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1].replace(/<\?[\s\S]*?\?>/g,'null'),{filename:file+':'+(++i)});}
const id='10000000-1000-4000-8000-100000000001',aid='20000000-2000-4000-8000-200000000002',op='30000000-3000-4000-8000-300000000003';
let calls=[],session=true,result;
const row={id:aid,version:1,name:'Teste',ownerId:id,ownerName:'Dono',canEdit:true,active:true,shared:false,openingAmountCents:'12345',openingDate:'2026-10-01',openingId:op,participants:[],senha_pin:'NUNCA RETORNAR',ultima_operacao_hash:'INTERNAL'};
const ctx=vm.createContext({Session:{getScriptTimeZone:()=> 'America/Sao_Paulo'},Utilities:{formatDate:d=>d.toISOString().slice(0,10)},obterSessaoObrigatoria:t=>{if(!session||t!=='valid')throw Error('expired');return{id};},bancoUsaSupabase_:()=>true,supabaseRpc_:(n,p)=>{calls.push({n,p});return result;}});
vm.runInContext(fs.readFileSync('Contas_Nova_Controller.js','utf8'),ctx);
const req={id:aid,version:0,operationId:op,name:' Teste ',openingAmountCents:'12345',openingDate:'2026-10-01',shared:false,participants:[],ownerId:op};
result={account:row};let r=ctx.contasNovaSalvar('valid',req);assert.equal(calls.at(-1).p.p_usuario,id);assert.equal(calls.at(-1).p.p_nome,'Teste');assert.equal(r.account.senha_pin,undefined);assert.equal(r.account.ultima_operacao_hash,undefined);
for(const change of [{version:-1},{openingAmountCents:123.45},{openingAmountCents:'100000000000000'},{openingAmountCents:'9'.repeat(10000)},{openingDate:'2026-02-30'},{openingDate:'0000-01-01'},{participants:[{}]},{id:'x'}])assert.throws(()=>ctx.contasNovaSalvar('valid',{...req,...change}));
session=false;for(const name of ['contasNovaListar','contasNovaSalvar','contasNovaStatus','contasNovaUsuarios','contasNovaMovimentos','contasNovaPrevisoes'])assert.throws(()=>ctx[name]('valid',req));session=true;
result={accounts:[{...row,currentCents:'900719925474099100',registeredForecastCents:'900719925474099101'}]};r=ctx.contasNovaListar('valid',{Mes_Inicial:'2026-09',Mes_Final:'2026-09'});assert.equal(r.asOf,'2026-09-30');assert.equal(r.accounts[0].currentCents,'900719925474099100');
result={accounts:[row]};const special=ctx.montarSaldosIniciaisParaTela_({idLogado:id});assert.equal(special[0].Descricao,'Saldo Inicial da Conta Teste');assert.equal(special[0].Tipo,'Saldo Inicial');assert.equal(special[0].Valor_Total,123.45);
vm.runInContext(fs.readFileSync('Lancamentos_Controller.js','utf8'),ctx);const enriched=ctx.enriquecerLancamentoParaTela_(special[0],{idLogado:id},{},[]);assert.equal(enriched.Pode_Editar,false);assert.equal(enriched.Pode_Excluir,false);assert.equal(enriched.Pode_Editar_Saldo_Inicial,true);
console.log('Syntax all JS/HTML + authenticated endpoints, money/dates, actor ownership, whitelist, historical filter and protected ledger: PASS');
vm.runInContext(fs.readFileSync('Consolidados_Controller.js','utf8'),ctx);
const account={ID_Conta:aid,ID_Usuario:id,Saldo_Inicial:100,Data_Saldo_Inicial:'2026-11-01'};
assert.equal(ctx.calcularSaldoContaAteDataConsolidadoController_(account,[],'2026-10-31'),0);
assert.equal(ctx.calcularSaldoContaAteDataConsolidadoController_(account,[],'2026-11-01'),100);
assert.equal(ctx.calcularMovimentoContaNoPeriodoConsolidadoController_(account,[],'2026-11-01','2026-11-30'),100);
assert.equal(ctx.calcularSaldoInicialUsuarioSaudeFinanceiraConsolidadoController_({idLogado:id,contasTodas:[account]},'2026-10-31'),0);
const opening={Data:'2026-11-01',Tipo:'Saldo Inicial',Impacto:100,Valor:0};
const summary=ctx.resumirMovimentosSaudeFinanceiraConsolidadoController_([opening]);assert.equal(summary.Resultado,0);assert.equal(summary.Receitas,0);assert.equal(summary.Total_Lancamentos,0);
console.log('Dated opening in balance/patrimony; excluded from operating totals: PASS');
const healthCtx={idLogado:id,contasTodas:[account],contasAcessiveis:[account],cartoesTodos:[],usuariosTodos:[],rateiosTodos:[]};
const october=ctx.calcularSaudeFinanceiraConsolidadoController_(healthCtx,[],{Mes_Inicial:'2026-10',Mes_Final:'2026-10',Mes_Referencia:'2026-10'},[],[],{},{});
assert.equal(october.Patrimonio_Acumulado.Total,0);
const november=ctx.calcularSaudeFinanceiraConsolidadoController_(healthCtx,[],{Mes_Inicial:'2026-11',Mes_Final:'2026-11',Mes_Referencia:'2026-11'},[],[],{},{});
assert.equal(november.Patrimonio_Acumulado.Total,100);assert.equal(november.Resultado_Periodo.Receitas,0);assert.equal(november.Patrimonio_Acumulado.Relatorio_Mensal[0].Saldo_Final,100);
console.log('Historical/future financial health and monthly patrimony reconciliation: PASS');
const add=(a,b)=>vm.runInContext('ContasNova_.addCents('+JSON.stringify(a)+','+JSON.stringify(b)+')',ctx);
for(const [a,b] of [['9999999999999999999999999','1'],['1000','-1'],['-1','1000'],['-300','-700'],['0','-1'],['-900','900'],['199','-299'],['-1000','1'],['99','99'],['900719925474099100','-1']])assert.equal(add(a,b),(BigInt(a)+BigInt(b)).toString());
for(let i=0;i<1000;i++){const a=String(Math.trunc((Math.random()-.5)*2e14)),b=String(Math.trunc((Math.random()-.5)*2e14));assert.equal(add(a,b),(BigInt(a)+BigInt(b)).toString());}
console.log('Exact decimal sum for Apps Script, including aggregates beyond safe Number: PASS');

// Homologação: a rota principal e os acessos contextuais abrem a tela aprovada.
const router = vm.createContext({obterSessaoObrigatoria:()=>({id}),HtmlService:{createTemplateFromFile:n=>({evaluate:()=>({getContent:()=>n})})}});
vm.runInContext(fs.readFileSync('App_Main.js','utf8'),router);
assert.equal(router.obterHtmlDaTela('Contas','valid'),'Contas_Tipos_View');
assert.equal(router.obterHtmlDaTela('ContasNova','valid'),'Contas_Tipos_View');
assert.equal((fs.readFileSync('Index.html','utf8').match(/onclick="navegarPara\('Contas'\)"/g)||[]).length,1);
assert.equal(fs.readFileSync('Index.html','utf8').includes('Contas (nova)'),false);
assert.equal(fs.readFileSync('Lancamentos_Novo_Client.html','utf8').includes("navegarPara('ContasNova')"),false);
console.log('Approved Accounts promoted to main route, single menu and compatible alias: PASS');
