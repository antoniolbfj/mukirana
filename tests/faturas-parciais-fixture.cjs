// Exclusivamente PostgreSQL local: uma fatura futura com pagamento parcial.
const {ctx,sql,actors}=require('./faturas-transferencias-gateway.cjs'),crypto=require('node:crypto');
function seed(){
 if(!/^rateios_v4_(browser|accounts)$/.test(process.env.MUKIRANA_TEST_DB||''))throw Error('Somente PostgreSQL efêmero');
 const uuid=()=>crypto.randomUUID(),token='owner-token',group=uuid(),bank='40000000-4000-4000-8000-400000000001';
 ctx.supabaseRpc_('rpc_cartoes_salvar_v2',{p_usuario:actors.owner,p_grupo:group,p_versao:0,p_operacao:uuid(),p_nome:'Fatura parcial '+group.slice(0,8),p_limite_cents:'100000',p_fechamento:26,p_vencimento:3,p_adicionais:'{}'});
 const info=ctx.cartoesNovoDetalhar(token,group,{Mes_Inicial:'2026-11',Mes_Final:'2026-11'}),card=info.cards.find(c=>c.userId===actors.owner)||info.cards[0];
 const pack=ctx.lancamentosNovoListar(token,{Mes_Selecionado:'2026-11'}),category=pack.categories.find(c=>c.active&&c.type==='Despesa');
 const entry=uuid();ctx.lancamentosNovoSalvar(token,{id:entry,operationId:uuid(),version:0,type:'expense',description:'Compra da fatura parcial',amountCents:'10000',date:'2026-10-28',origin:card.id,category:category.id,classification:'variable',mode:'single',status:'done',shares:[]});
 const observation='Primeiro parcial '+group;
 ctx.registrarPagamentoFaturaCartao(token,{ID_Grupo_Cartao:group,Mes_Referencia:'2026-11',ID_Conta:bank,Valor:60,Data_Pagamento:'2026-10-26',Status:'Efetivado',Observacao:observation});
 const payment=JSON.parse(sql("SELECT to_jsonb(p) FROM pagamentos_faturas p WHERE id_grupo_cartao='"+group+"' AND observacao='"+observation+"'"));
 return {group,bank,card:card.id,entry,payment:payment.id_pagamento_fatura,month:'2026-11',totalCents:'10000',partialCents:'6000',openCents:'4000'};
}
if(require.main===module)process.stdout.write(JSON.stringify(seed()));
module.exports={seed,ctx,sql,actors};
