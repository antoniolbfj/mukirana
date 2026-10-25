// Dados sintéticos exclusivamente no PostgreSQL local dos testes existentes.
const {ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs'),crypto=require('node:crypto');
const uid=()=>crypto.randomUUID(),bank='40000000-4000-4000-8000-400000000001',investment='40000000-4000-4000-8000-400000000011',empty='40000000-4000-4000-8000-400000000012',inactive='40000000-4000-4000-8000-400000000013',catA='50000000-5000-4000-8000-500000000011',catB='50000000-5000-4000-8000-500000000012',income='50000000-5000-4000-8000-500000000013',project='60000000-6000-4000-8000-600000000011';
function seed(){
 if(!/^rateios_v4_(browser|accounts|ledger)$/.test(process.env.MUKIRANA_TEST_DB||''))throw Error('Somente banco local de testes');
 sql("INSERT INTO categorias(id_categoria,nome,tipo,global,criado_por,id_categoria_pai) VALUES('"+catA+"','Hub Alimentação','Despesa',false,'"+actors.owner+"',NULL),('"+catB+"','Hub Restaurante','Despesa',false,'"+actors.owner+"','"+catA+"'),('"+income+"','Hub Rendimentos','Receita',false,'"+actors.owner+"',NULL) ON CONFLICT DO NOTHING");
 sql("INSERT INTO projetos(id_projeto,nome,criado_por) VALUES('"+project+"','Hub Projeto','"+actors.owner+"') ON CONFLICT DO NOTHING");
 const all=ctx.contasTiposListar('owner-token',{Mes_Inicial:'2026-10',Mes_Final:'2026-10'}).accounts;
 for(const [id,name,type] of [[investment,'Hub Patrimônio','Investimento'],[empty,'Hub Sem movimentos','Consumo'],[inactive,'Hub Inativa','Consumo']])if(!all.some(a=>a.id===id)){const a=ctx.contasTiposSalvar('owner-token',{operationId:uid(),id,version:0,name,type,openingAmountCents:'0',openingDate:'2026-09-01',shared:false,participants:[]}).account;if(id===inactive)ctx.contasTiposStatus('owner-token',{id,version:a.version,operationId:uid(),active:false});}
 return {ctx,sql,actors,uid,bank,investment,empty,inactive,catA,catB,income,project};
}
module.exports={seed};
