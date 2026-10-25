/** Alterações de metadados, individuais ou em lote, sem reconstruir rateios. */
function lancamentosHubAtualizar(token,request){
 const user=obterSessaoObrigatoria(token);ContasNova_.requireSupabase();const r=request||{},h=LancamentosNovo_;
 if(!h.uuid(r.operationId)||['category','classification'].indexOf(r.field)<0||!Array.isArray(r.selected)||r.selected.length<1||r.selected.length>6000||typeof r.value!=='string')throw new Error('Confira a seleção e o campo.');
 if((r.field==='category'&&!h.uuid(r.value))||(r.field==='classification'&&['fixed','variable'].indexOf(r.value)<0))throw new Error('Escolha um valor válido.');
 const selected=r.selected.map(function(e){if(!h.uuid(e.id)||!Number.isInteger(e.version)||e.version<1||!Number.isInteger(e.categoryVersion)||e.categoryVersion<0)throw new Error('A seleção foi alterada. Atualize a lista.');return {id:e.id,version:e.version,categoryVersion:e.categoryVersion};});
 return h.rpc('rpc_lancamentos_hub_v8',{p_usuario:user.id,p_operacao:r.operationId,p_request:{field:r.field,value:r.value,selected:selected}});
}
