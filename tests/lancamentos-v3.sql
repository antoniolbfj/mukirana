-- Somente dados fictícios criados nesta transação. Sempre termina em ROLLBACK.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
<<lan_test>>
DECLARE u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();cat uuid:=gen_random_uuid();catv uuid:=gen_random_uuid();id uuid:=gen_random_uuid();op uuid:=gen_random_uuid();r jsonb;c jsonb;result jsonb;p jsonb;id2 uuid;op2 uuid;approval uuid;failed boolean;initial_count bigint;versions jsonb;
BEGIN
 INSERT INTO public.usuarios(id_usuario,nome,email) VALUES(u,'Teste transacional LAN A',u::text||'@example.invalid'),(v,'Teste transacional LAN B',v::text||'@example.invalid');
 INSERT INTO public.contas(id_conta,id_usuario,nome_conta) VALUES(a,u,'Conta origem teste LAN'),(b,u,'Conta destino teste LAN');
 INSERT INTO public.contas_compartilhamentos(id_conta,id_usuario,papel_na_conta) VALUES(a,v,'Participante');
 INSERT INTO public.categorias(id_categoria,nome,tipo,criado_por) VALUES(cat,'Categoria própria A','Despesa',u),(catv,'Categoria própria B','Despesa',v);
 ASSERT NOT has_function_privilege('anon','public.rpc_lancamentos_listar_v3(uuid,date,date)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.rpc_lancamentos_gravar_v3(uuid,uuid,jsonb,jsonb)','EXECUTE');
 ASSERT NOT has_schema_privilege('anon','mukirana_lancamentos','USAGE');
 ASSERT has_function_privilege('service_role','public.rpc_lancamentos_gravar_v3(uuid,uuid,jsonb,jsonb)','EXECUTE');
 r:=jsonb_build_object('id',id,'amountCents','12345');
 c:=jsonb_build_object('action','save','rows',jsonb_build_array(jsonb_build_object('id',id,'version',0,'type','expense','description','Despesa transacional LAN','amountCents','12345','date','2026-10-20','sourceKind','Conta','origin',a,'category',cat,'classification','variable','status','done','shares','[]'::jsonb)));
 result:=public.rpc_lancamentos_gravar_v3(u,op,r,c);
 ASSERT (SELECT valor_total=123.45 AND versao_v3=1 FROM public.lancamentos WHERE id_lancamento=id);
 ASSERT public.rpc_lancamentos_gravar_v3(u,op,r,c)=result;
 ASSERT (SELECT count(*)=1 FROM public.lancamentos WHERE id_lancamento=id);
 failed:=false;BEGIN PERFORM public.rpc_lancamentos_gravar_v3(u,op,r||'{"amountCents":"54321"}',c);EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='LN:conflict';failed:=true;END;ASSERT failed;
 ASSERT (SELECT valor_total=123.45 FROM public.lancamentos WHERE id_lancamento=id);
 p:=public.rpc_lancamentos_listar_v3(u,'2026-10-01','2026-10-31');ASSERT jsonb_array_length(p->'entries')=1;
 ASSERT NOT p::text LIKE '%senha_pin%';ASSERT NOT p::text LIKE '%access_token%';
 ASSERT (p->'history'->0->>'description')='Despesa transacional LAN';ASSERT NOT(p->'history'->0 ? 'amountCents');
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.rpc_lancamentos_listar_v3(v,'2026-10-01','2026-10-31')->'accounts') x WHERE x->>'id'=b::text);
 id2:=gen_random_uuid();op2:=gen_random_uuid();
 c:=jsonb_build_object('action','save','rows',jsonb_build_array(jsonb_build_object('id',id2,'version',0,'type','transfer','description','Transferência única LAN','amountCents','5000','date','2026-10-20','sourceKind','Conta','origin',a,'destination',b,'classification','variable','status','done','shares','[]'::jsonb)));
 PERFORM public.rpc_lancamentos_gravar_v3(u,op2,jsonb_build_object('id',id2),c);
 ASSERT (SELECT count(*)=1 FROM public.lancamentos WHERE id_lancamento=id2);
 ASSERT (SELECT id_origem=a AND id_destino=b AND valor_total=50 FROM public.lancamentos WHERE id_lancamento=id2);
 failed:=false;BEGIN PERFORM public.rpc_lancamentos_gravar_v3(v,gen_random_uuid(),'{}',jsonb_build_object('action','delete','rows',jsonb_build_array(jsonb_build_object('id',id2,'version',1))));EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='LN:forbidden';failed:=true;END;ASSERT failed;
 SELECT count(*) INTO initial_count FROM public.lancamentos;
 c:=jsonb_build_object('action','save','rows',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version',0,'type','expense','description','Não pode deixar metade','amountCents','100','date','2026-10-20','sourceKind','Conta','origin',a,'category',cat,'classification','variable','status','done','shares',jsonb_build_array(jsonb_build_object('id',u,'cents','50'),jsonb_build_object('id',gen_random_uuid(),'cents','50')))));
 failed:=false;BEGIN PERFORM public.rpc_lancamentos_gravar_v3(u,gen_random_uuid(),'{}',c);EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='LN:invalid_shares';failed:=true;END;ASSERT failed;
 ASSERT (SELECT count(*)=initial_count FROM public.lancamentos);
 -- Rateio atualiza financeiramente uma única operação e gera nova solicitação.
 c:=jsonb_build_object('action','save','rows',jsonb_build_array(jsonb_build_object('id',id,'version',1,'type','expense','description','Rateio LAN','amountCents','12345','date','2026-10-20','sourceKind','Conta','origin',a,'category',cat,'classification','variable','status','done','shares',jsonb_build_array(jsonb_build_object('id',u,'cents','7000'),jsonb_build_object('id',v,'cents','5345')))));
 PERFORM public.rpc_lancamentos_gravar_v3(u,gen_random_uuid(),'{}',c);
 ASSERT (SELECT sum(valor_rateado)=123.45 FROM public.rateios WHERE id_lancamento=id);
 SELECT s.id INTO approval FROM mukirana_lancamentos.solicitacoes s WHERE s.ancora=lan_test.id;
 ASSERT (SELECT count(*)=2 FROM mukirana_lancamentos.decisoes WHERE id_solicitacao=approval);
 failed:=false;BEGIN PERFORM public.rpc_lancamentos_decidir_v3(v,approval,false,NULL,'');EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='LN:invalid_reason';failed:=true;END;ASSERT failed;
 PERFORM public.rpc_lancamentos_decidir_v3(v,approval,true,catv,NULL);
 ASSERT (SELECT status='approved' FROM mukirana_lancamentos.solicitacoes s WHERE s.id=approval);
 -- Uma escrita legada incrementa versão e torna uma solicitação pendente obsoleta.
 PERFORM public.rpc_lancamentos_gravar_v3(u,gen_random_uuid(),'{}',jsonb_build_object('action','status','status','pending','rows',jsonb_build_array(jsonb_build_object('id',id,'version',2))));
 SELECT s.id INTO approval FROM mukirana_lancamentos.solicitacoes s WHERE s.ancora=lan_test.id;
 UPDATE public.lancamentos SET descricao='Alteração legada LAN' WHERE id_lancamento=id;
 ASSERT (SELECT status='superseded' FROM mukirana_lancamentos.solicitacoes s WHERE s.id=approval);
 failed:=false;BEGIN PERFORM public.rpc_lancamentos_decidir_v3(v,approval,true,catv,NULL);EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM='LN:conflict';failed:=true;END;ASSERT failed;
 -- Exclusão de rateio fica pendente; rejeição mantém o original; nova solicitação substitui a antiga.
 result:=public.rpc_lancamentos_gravar_v3(u,gen_random_uuid(),'{}',jsonb_build_object('action','delete','rows',jsonb_build_array(jsonb_build_object('id',id,'version',4))));ASSERT (result->>'pendingApproval')::boolean;
 ASSERT EXISTS(SELECT 1 FROM public.lancamentos WHERE id_lancamento=id);
 SELECT s.id INTO approval FROM mukirana_lancamentos.solicitacoes s WHERE s.ancora=lan_test.id;
 PERFORM public.rpc_lancamentos_decidir_v3(v,approval,false,NULL,'Rever a exclusão');ASSERT EXISTS(SELECT 1 FROM public.lancamentos WHERE id_lancamento=id);
 PERFORM public.rpc_lancamentos_gravar_v3(u,gen_random_uuid(),'{}',jsonb_build_object('action','delete','rows',jsonb_build_array(jsonb_build_object('id',id,'version',4))));
 SELECT s.id INTO approval FROM mukirana_lancamentos.solicitacoes s WHERE s.ancora=lan_test.id;
 PERFORM public.rpc_lancamentos_decidir_v3(v,approval,true,catv,NULL);ASSERT NOT EXISTS(SELECT 1 FROM public.lancamentos WHERE id_lancamento=id);
 ASSERT NOT EXISTS(SELECT 1 FROM public.rateios WHERE id_lancamento=id);
 PERFORM public.rpc_lancamentos_gravar_v3(u,gen_random_uuid(),'{}',jsonb_build_object('action','delete','rows',jsonb_build_array(jsonb_build_object('id',id2,'version',1))));ASSERT NOT EXISTS(SELECT 1 FROM public.lancamentos WHERE id_lancamento=id2);
END $$;
ROLLBACK;
