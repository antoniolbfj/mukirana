const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{ctx,sql,actors}=require('./lancamentos-v3-gateway.cjs');
sql(`BEGIN;
DO $$ DECLARE a public.acertos_rateios;dto jsonb;n bigint;u uuid;BEGIN
 SELECT count(*) INTO n FROM public.lancamentos;
 INSERT INTO public.acertos_rateios(id_usuario_devedor,id_usuario_credor,valor,mes_referencia,data_pagamento,data_recebimento,modalidade,status,observacao_credor,criado_por_id)
 VALUES('${actors.additional}','${actors.owner}',0.02,'2026-09-01','2026-09-30','2026-09-30','Perda','Efetivado','Conciliação histórica sem caixa','${actors.owner}') RETURNING * INTO a;
 FOREACH u IN ARRAY ARRAY['${actors.additional}'::uuid,'${actors.owner}'::uuid] LOOP
  dto:=mukirana_rateios.acerto_dto(a,u);
  ASSERT dto->>'mode'='adjustment';ASSERT NOT (dto->>'canAttach')::boolean;ASSERT NOT (dto->>'canCorrect')::boolean;ASSERT NOT (dto->>'canReject')::boolean;
  ASSERT dto->>'adjustmentNote'='Conciliação histórica sem caixa';ASSERT dto->>'amountCents'='2';
 END LOOP;
 ASSERT n=(SELECT count(*) FROM public.lancamentos),'Ajuste criou lançamento bancário';
END $$;
ROLLBACK;`);
let html='';const C=vm.runInContext('lancamentosNovoRegras_()',ctx),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
ctx.document={addEventListener(){}};
vm.runInContext(fs.readFileSync('Rateios_Novo_Client.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
const rateios={balances:[],items:[],approvals:[],invitations:[],settlements:[{mode:'adjustment',id:'adjust',otherName:'Pessoa teste',amountCents:'2',date:'2026-09-30',status:'Efetivado',adjustmentNote:'Conciliação <script>injetado</script>',canAttach:false}]};
ctx.criarRateiosNovo({core:C,esc:escape,data:()=>({rateios}),panel:(a,b,body)=>{html=body;}}).open();
assert(html.includes('Quitação histórica'));assert(html.includes('Sem movimentação bancária'));assert(!html.includes('data-rt-attach'));assert(!html.includes('Sua ponta ainda não registrada'));assert(!html.includes('<script>injetado'));assert(html.includes('&lt;script&gt;'));
console.log('Ajustes v7: sem caixa, sem botões de pagamento/recebimento/correção, leitura para ambas as pessoas e nota escapada: PASS');
