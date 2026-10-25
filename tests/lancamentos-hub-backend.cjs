const assert=require('node:assert/strict'),{seed}=require('./lancamentos-hub-fixture.cjs');
const {ctx,sql,actors,uid,bank,investment,empty,inactive,catA,catB,income,project}=seed(),token='owner-token',period={Mes_Inicial:'2026-10',Mes_Final:'2026-10'};
let checks=0;const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;},ok=x=>{assert(x);checks++;},fail=(fn,re)=>{assert.throws(fn,re);checks++;};
const create=o=>{const r={id:uid(),operationId:uid(),version:0,type:'expense',description:'Hub backend',amountCents:'10000',date:'2026-10-05',origin:bank,category:catA,classification:'variable',mode:'single',status:'done',shares:[],...o};ctx.lancamentosNovoSalvar(token,r);return r;};
const detail=(id,t=token)=>ctx.lancamentosNovoDetalhar(t,id).entry;
const selected=(id,t=token)=>{const e=detail(id,t);return {id,version:e.version,categoryVersion:e.categoryVersion||0};};
const mutate=(field,value,ids,t=token)=>ctx.lancamentosHubAtualizar(t,{operationId:uid(),field,value,selected:ids.map(id=>selected(id,t))});
const a=create(),b=create({amountCents:'20000'}),i=create({type:'income',category:income}),tr=create({type:'transfer',destination:investment});
const balances=()=>ctx.contasTiposListar(token,period).accounts.map(a=>[a.id,a.currentCents,a.registeredForecastCents]);const before=balances();
eq(mutate('category',catB,[a.id,b.id]).count,2);eq(detail(a.id).displayCategory,catB);eq(detail(b.id).displayCategory,catB);eq(balances(),before);
mutate('classification','fixed',[a.id,b.id]);eq(detail(a.id).classification,'fixed');fail(()=>mutate('project',project,[a.id,b.id]),/campo/);
const replay={operationId:uid(),field:'category',value:catA,selected:[selected(a.id)]};const r=ctx.lancamentosHubAtualizar(token,replay);eq(ctx.lancamentosHubAtualizar(token,replay),r);fail(()=>ctx.lancamentosHubAtualizar(token,{...replay,value:catB}),/alterados/);
const stale=selected(a.id);mutate('category',catB,[a.id]);fail(()=>ctx.lancamentosHubAtualizar(token,{operationId:uid(),field:'category',value:catA,selected:[stale]}),/alterados/);
const old=detail(a.id);fail(()=>mutate('category',catA,[a.id,i.id]),/categoria/);eq(detail(a.id).version,old.version);eq(detail(a.id).displayCategory,old.displayCategory);
fail(()=>mutate('category',catA,[tr.id]),/permissão/);const globalCategory=ctx.lancamentosNovoListar(token,period).categories.find(c=>c.global&&c.type==='Despesa').id;fail(()=>ctx.lancamentosHubAtualizar('other-token',{operationId:uid(),field:'category',value:globalCategory,selected:[selected(a.id)]}),/permissão/);
fail(()=>ctx.lancamentosHubAtualizar('expired',replay),/expirada/);fail(()=>ctx.lancamentosHubAtualizar(token,{...replay,operationId:uid(),selected:[selected(a.id),selected(a.id)]}),/campos/);
// Categoria de rateio é individual: não muda total, participantes, aprovação ou dívida.
const shared=create({shares:[{id:actors.owner,cents:'5000'},{id:actors.additional,cents:'5000'}]});
const sharesBefore=sql("select jsonb_agg(to_jsonb(r)-ARRAY['id_categoria_v4','versao_v4'] order by id_rateio) from rateios r where id_lancamento='"+shared.id+"'");
const approvalBefore=sql("select jsonb_agg(to_jsonb(s)) from mukirana_lancamentos.solicitacoes s where ids ? '"+shared.id+"'");
const lBefore=detail(shared.id),partVersion=selected(shared.id);mutate('category',catB,[shared.id]);
eq(detail(shared.id).myCategory,catB);eq(detail(shared.id).version,lBefore.version);eq(detail(shared.id).category,catA);
eq(sharesBefore,sql("select jsonb_agg(to_jsonb(r)-ARRAY['id_categoria_v4','versao_v4'] order by id_rateio) from rateios r where id_lancamento='"+shared.id+"'"));
eq(approvalBefore,sql("select jsonb_agg(to_jsonb(s)) from mukirana_lancamentos.solicitacoes s where ids ? '"+shared.id+"'"));
fail(()=>ctx.lancamentosHubAtualizar(token,{operationId:uid(),field:'category',value:catA,selected:[partVersion]}),/alterados/);
fail(()=>mutate('classification','fixed',[shared.id]),/permissão/);
const addCat=uid();sql("INSERT INTO categorias(id_categoria,nome,tipo,criado_por,global) VALUES('"+addCat+"','Privada Bruno','Despesa','"+actors.additional+"',false)");
ctx.lancamentosHubAtualizar('additional-token',{operationId:uid(),field:'category',value:addCat,selected:[{id:shared.id,version:detail(shared.id).version,categoryVersion:Number(sql("select versao_v4 from rateios where id_lancamento='"+shared.id+"' and id_usuario_responsavel='"+actors.additional+"'"))}]});eq(detail(shared.id).myCategory,catB);eq(ctx.rateiosNovoListar('additional-token',period).items.find(e=>e.id===shared.id).myCategory,addCat);ok(!JSON.stringify(ctx.lancamentosNovoListar(token,period)).includes('Privada Bruno'));
// Catálogo inclui patrimônio, vazia e inativa sem depender das facetas de movimentos.
const pack=ctx.lancamentosNovoListar(token,period);ok(pack.accounts.some(a=>a.id===investment&&a.type==='Investimento'));ok(pack.accounts.some(a=>a.id===empty));ok(pack.accounts.some(a=>a.id===inactive&&!a.active));
const C=ctx.lancamentosNovoRegras_();eq(C.normalize(pack.rows,{account:empty,type:'expense'},'account').filters.account,empty);eq(C.query(pack.rows,{account:empty}).summary.resultCents,'0');eq(ctx.lancamentosNovoConsultar(token,period,{account:empty}).summary.resultCents,'0');eq(C.normalize(pack.rows,{account:empty,search:'ausente'}).filters.account,empty);
eq(sql("select has_function_privilege('anon','public.rpc_lancamentos_hub_v8(uuid,uuid,jsonb)','execute')"),'f');eq(sql("select has_function_privilege('authenticated','public.rpc_lancamentos_hub_v8(uuid,uuid,jsonb)','execute')"),'f');
// Referências de Projetos antigos são preservadas ao editar; o módulo foi descontinuado.
const historicalProject=uid();sql("INSERT INTO projetos(id_projeto,nome,criado_por) VALUES('"+historicalProject+"','Projeto antigo inacessível','"+actors.other+"')");
sql("update lancamentos set id_projeto='"+historicalProject+"' where id_lancamento='"+a.id+"'");const legacy=detail(a.id);ctx.lancamentosNovoSalvar(token,{...legacy,operationId:uid(),description:'Histórico com referência preservada',scope:'one'});eq(detail(a.id).project,historicalProject);
const vm=require('node:vm'),fs=require('node:fs');vm.runInContext(fs.readFileSync('Projetos_Controller.js','utf8'),ctx);fail(()=>ctx.processarSalvarProjeto({},token),/descontinuado/);fail(()=>ctx.alternarStatusProjeto(project,token),/descontinuado/);eq(ctx.obterListaProjetos(token),[]);
console.log(JSON.stringify({checks,result:'PASS',coverage:'atomic batch, replay, conflicts, balances, private shares/categories, approvals, catalog and service-only grants'}));
