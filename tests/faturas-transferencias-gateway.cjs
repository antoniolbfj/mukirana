// Somente PostgreSQL local fictício: controller/model reais da Fatura e leitor do Lançamentos.
const fs=require('node:fs'),vm=require('node:vm'),base=require('./lancamentos-v3-gateway.cjs');
const {ctx,sql,render}=base;
if(!/^rateios_v4_(browser|accounts)$/.test(process.env.MUKIRANA_TEST_DB||''))throw Error('Use banco efêmero de teste');
const quote=v=>v==null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replace(/'/g,"''")+"'";
const parse=q=>JSON.parse(sql(q));
const fields=new Set('id_pagamento_fatura id_grupo_cartao id_conta valor data_pagamento mes_referencia status observacao criado_por_id alterado_por_id created_at updated_at'.split(' '));
function columns(table,row){if(table!=='pagamentos_faturas'||Object.keys(row).some(k=>!fields.has(k)))throw Error('Escrita inválida');return Object.keys(row);}
function where(table,filter){columns(table,{});if(!/^id_pagamento_fatura=eq\.[0-9a-f-]{36}$/.test(filter))throw Error('Filtro inválido');return 'id_pagamento_fatura='+quote(filter.split('eq.')[1]);}
ctx.Logger={log:()=>{}};
const originalRpc=ctx.supabaseRpc_;
ctx.supabaseRpc_=(name,params)=>{
  if(name!=='rpc_fatura_cartao_mukirana')return originalRpc(name,params);
  return parse('SELECT public.rpc_fatura_cartao_mukirana('+quote(params.p_id_usuario)+','+quote(params.p_mes_referencia)+','+quote(params.p_id_grupo_cartao)+');');
};
ctx.supabaseSelecionar_=(table)=>{columns(table,{});return parse("SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY data_pagamento),'[]') FROM pagamentos_faturas p");};
ctx.supabaseInserir_=(table,row)=>{const keys=columns(table,row);return parse("WITH saved AS (INSERT INTO pagamentos_faturas ("+keys.join(',')+") VALUES ("+keys.map(k=>quote(row[k])).join(',')+") RETURNING *) SELECT jsonb_agg(to_jsonb(saved)) FROM saved");};
ctx.supabaseAtualizar_=(table,filter,row)=>{const keys=columns(table,row);sql('UPDATE pagamentos_faturas SET '+keys.map(k=>k+'='+quote(row[k])).join(',')+' WHERE '+where(table,filter));};
ctx.supabaseExcluir_=(table,filter)=>sql('DELETE FROM pagamentos_faturas WHERE '+where(table,filter));
for(const file of ['Lancamentos_Controller.js','Cartoes_Controller.js','Pagamentos_Faturas_Model.js','Faturas_Cartao_Controller.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
if(require.main===module){try{
  const method=process.argv[2],args=JSON.parse(process.argv[3]||'[]');
  if(method==='render')process.stdout.write(JSON.stringify({ok:true,result:render(args[0])}));
  else{
    if(!/^(?:obterPacoteFaturaCartao|registrarPagamentoFaturaCartao|atualizarPagamentoFaturaCartao|excluirPagamentoFaturaCartao|lancamentosContextoListar|lancamentosHubAtualizar|lancamentosNovo(?:Listar|Consultar|Detalhar|Salvar|Acao|CadastroRapido|Decidir)|contasTipos(?:Listar|Previsoes|Salvar|Status|Excluir)|contasNovaUsuarios|rateiosNovo(?:Mutar|Candidatos)|painelNovoListar)$/.test(method))throw Error('Método inválido');
    process.stdout.write(JSON.stringify({ok:true,result:ctx[method](...args)}));
  }
}catch(e){process.stdout.write(JSON.stringify({ok:false,error:e.stack}));process.exitCode=1;}}
module.exports=base;
