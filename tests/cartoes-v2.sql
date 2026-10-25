-- Dados fictícios; rodar sempre em uma transação desfeita, inclusive no servidor.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE dono uuid:=gen_random_uuid();adicional uuid:=gen_random_uuid();outro uuid:=gen_random_uuid();gid uuid:=gen_random_uuid();op uuid:=gen_random_uuid();
 titular_card uuid;adicional_card uuid;compra uuid:=gen_random_uuid();r jsonb;g jsonb;v integer;falhou boolean;
BEGIN
 INSERT INTO public.usuarios(id_usuario,nome,email) VALUES(dono,'Titular teste',dono||'@example.invalid'),(adicional,'Adicional teste',adicional||'@example.invalid'),(outro,'Outro teste',outro||'@example.invalid');
 r:=public.rpc_cartoes_salvar_v2(dono,gid,0,op,'Principal teste',1000000,10,17,ARRAY[adicional]);
 ASSERT (r->'group'->>'version')::int=1,'single group version';
 ASSERT (SELECT count(*)=2 FROM public.cartoes WHERE id_grupo_cartao=gid),'automatic titular + additional';
 SELECT id_cartao INTO titular_card FROM public.cartoes WHERE id_grupo_cartao=gid AND id_usuario=dono;
 SELECT id_cartao INTO adicional_card FROM public.cartoes WHERE id_grupo_cartao=gid AND id_usuario=adicional;
 r:=public.rpc_cartoes_salvar_v2(dono,gid,0,op,'Principal teste',1000000,10,17,ARRAY[adicional]);
 ASSERT (r->>'replayed')::boolean AND (SELECT count(*)=2 FROM public.cartoes WHERE id_grupo_cartao=gid),'lost response replay';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_salvar_v2(dono,gid,1,op,'Diferente',1000000,10,17,ARRAY[adicional]);EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:conflict%';END;ASSERT falhou,'operation content cannot change';
 INSERT INTO public.lancamentos(id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id)
 VALUES(compra,'Despesa','Compra anterior',100,'2026-10-15','2026-10-01','Cartão',titular_card,'Pendente',dono);
 ASSERT (SELECT mes_referencia='2026-11-01' FROM public.lancamentos WHERE id_lancamento=compra),'after closing -> next competence';
 r:=public.rpc_cartoes_salvar_v2(dono,gid,1,gen_random_uuid(),'Principal renomeada',1000000,20,27,ARRAY[adicional]);
 ASSERT (SELECT mes_referencia='2026-11-01' FROM public.lancamentos WHERE id_lancamento=compra),'closing change preserves history';
 ASSERT (SELECT nome_cartao='Principal renomeada - Titular' FROM public.cartoes WHERE id_cartao=titular_card),'rename stable titular';
 ASSERT (SELECT id_cartao=adicional_card FROM public.cartoes WHERE id_grupo_cartao=gid AND id_usuario=adicional),'stable additional id';
 UPDATE public.lancamentos SET valor_total=120,mes_referencia='2026-10-01' WHERE id_lancamento=compra;
 ASSERT (SELECT mes_referencia='2026-11-01' FROM public.lancamentos WHERE id_lancamento=compra),'edit value cannot silently move competence';
 INSERT INTO public.lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id) VALUES
 ('Despesa','Nova compra',40,'2026-10-15','2026-11-01','Cartão',titular_card,'Efetivado',dono),
 ('Receita','Crédito',10,'2026-10-15','2026-11-01','Cartão',titular_card,'Efetivado',dono),
 ('Despesa','Compra adicional',20,'2026-10-15','2026-11-01','Cartão',adicional_card,'Efetivado',adicional);
 ASSERT (SELECT bool_and(mes_referencia='2026-10-01') FROM public.lancamentos WHERE descricao IN ('Nova compra','Crédito','Compra adicional') AND id_origem IN(titular_card,adicional_card)),'new closing for new purchases';
 INSERT INTO public.contas(id_usuario,nome_conta) VALUES(dono,'Conta pagamento teste');
 UPDATE public.lancamentos SET valor_total=200 WHERE id_lancamento=compra;
 INSERT INTO public.pagamentos_faturas(id_grupo_cartao,id_conta,valor,data_pagamento,mes_referencia,status,criado_por_id)
 SELECT gid,id_conta,x.valor,x.data,x.mes,x.status,dono FROM public.contas CROSS JOIN
 (VALUES(30,'2026-10-20'::date,'2026-10-01'::date,'Efetivado'),(5,'2026-10-23'::date,'2026-10-01'::date,'Pendente'),(200,'2026-11-20'::date,'2026-11-01'::date,'Efetivado')) x(valor,data,mes,status) WHERE id_usuario=dono AND nome_conta='Conta pagamento teste';
 UPDATE public.lancamentos SET valor_total=120 WHERE id_lancamento=compra;
 r:=public.rpc_cartoes_listar_v2(dono,'2026-10-01','2026-11-01');g:=r->'groups'->0;
 ASSERT g->>'registeredCents'='17000','registered includes credit, excludes projections';
 ASSERT g->>'paidCents'='23000' AND g->>'scheduledPaymentsCents'='500','paid vs scheduled';
 ASSERT g->>'openCents'='2000' AND g->>'creditCents'='8000','open and credit per competence';
 ASSERT g->>'limitCents'='1000000' AND (g->>'canEdit')::boolean,'owner config';
 r:=public.rpc_cartoes_listar_v2(adicional,'2026-10-01','2026-11-01');g:=r->'groups'->0;
 ASSERT g->>'registeredCents'='2000' AND g->>'role'='additional','additional own scope';
 ASSERT g->'paidCents'='null'::jsonb AND g->'openCents'='null'::jsonb AND g->'limitCents'='null'::jsonb AND g->'participants'='[]'::jsonb,'no group financial leak';
 r:=public.rpc_cartoes_detalhar_v2(adicional,gid,'2026-10-01','2026-11-01');ASSERT jsonb_array_length(r->'cards')=1 AND r->'cards'->0->>'id'=adicional_card::text,'details own card only';
 r:=public.rpc_cartoes_detalhar_v2(dono,gid,'2026-10-01','2026-11-01');ASSERT jsonb_array_length(r->'group'->'months')=2 AND jsonb_array_length(r->'cards')=2,'owner months/cards';
 ASSERT jsonb_array_length(public.rpc_cartoes_listar_v2(outro,NULL,NULL)->'groups')=0,'unrelated isolation';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_detalhar_v2(outro,gid,NULL,NULL);EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:forbidden%';END;ASSERT falhou,'no guessed group detail';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_status_v2(adicional,gid,2,gen_random_uuid(),false);EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:forbidden%';END;ASSERT falhou,'owner-only status';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_salvar_v2(adicional,gid,2,gen_random_uuid(),'Ataque',0,1,2,'{}');EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:forbidden%';END;ASSERT falhou,'owner-only edit';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_salvar_v2(dono,gid,1,gen_random_uuid(),'Stale',0,1,2,'{}');EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:conflict%';END;ASSERT falhou,'stale version';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_salvar_v2(dono,gid,2,gen_random_uuid(),'Não salvar',0,1,2,ARRAY[gen_random_uuid()]);EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:invalid_participant%';END;ASSERT falhou,'invalid participant';
 ASSERT (SELECT versao=2 AND nome_grupo='Principal renomeada' FROM public.grupos_cartoes WHERE id_grupo_cartao=gid) AND (SELECT count(*)=2 FROM public.cartoes WHERE id_grupo_cartao=gid AND ativo),'atomic failed save';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_salvar_v2(dono,gen_random_uuid(),0,gen_random_uuid(),' PRINCIPAL RENOMEADA ',0,1,2,'{}');EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:duplicate_name%';END;ASSERT falhou,'duplicate owner normalized name';
 r:=public.rpc_cartoes_salvar_v2(dono,gid,2,gen_random_uuid(),'Principal renomeada',1000000,20,27,'{}');
 ASSERT (SELECT NOT ativo FROM public.cartoes WHERE id_cartao=adicional_card),'remove additional inactivates';
 ASSERT (SELECT count(*)=1 FROM public.lancamentos WHERE id_origem=adicional_card),'additional history preserved';
 r:=public.rpc_cartoes_detalhar_v2(adicional,gid,'2026-10-01','2026-11-01');ASSERT r->'group'->>'role'='history' AND jsonb_array_length(r->'cards')=1,'former additional read-only history';
 r:=public.rpc_cartoes_salvar_v2(dono,gid,3,gen_random_uuid(),'Principal renomeada',1000000,20,27,ARRAY[adicional]);
 ASSERT (SELECT ativo AND id_cartao=adicional_card FROM public.cartoes WHERE id_grupo_cartao=gid AND id_usuario=adicional),'restore additional same id';
 UPDATE public.cartoes SET nome_cartao='Legado adicional' WHERE id_cartao=adicional_card;
 ASSERT (SELECT versao=5 FROM public.grupos_cartoes WHERE id_grupo_cartao=gid),'legacy card invalidates version';
 UPDATE public.grupos_cartoes SET limite=9000 WHERE id_grupo_cartao=gid;
 ASSERT (SELECT versao=6 FROM public.grupos_cartoes WHERE id_grupo_cartao=gid),'legacy group invalidates version';
 op:=gen_random_uuid();r:=public.rpc_cartoes_status_v2(dono,gid,6,op,false);
 ASSERT (r->'group'->>'active')::boolean=false,'inactivate group';
 r:=public.rpc_cartoes_status_v2(dono,gid,6,op,false);ASSERT (r->>'replayed')::boolean,'status replay';
 ASSERT jsonb_array_length(public.rpc_cartoes_previsoes_v2(dono,'2026-09-01','2026-11-30')->'grupos_cartoes')=0,'inactive no projections';
 r:=public.rpc_cartoes_status_v2(dono,gid,7,gen_random_uuid(),true);ASSERT (r->'group'->>'active')::boolean,'undo/restore';
 ASSERT jsonb_array_length(public.rpc_cartoes_usuarios_v2(dono,'',gid)->'users')=1,'selected additional lookup';
 ASSERT jsonb_array_length(public.rpc_cartoes_usuarios_v2(dono,'',NULL)->'users')=0,'deferred user search';
 ASSERT NOT has_function_privilege('anon','public.rpc_cartoes_listar_v2(uuid,date,date)','execute') AND NOT has_function_privilege('authenticated','public.rpc_cartoes_salvar_v2(uuid,uuid,integer,uuid,text,bigint,integer,integer,uuid[])','execute'),'private RPCs';
 ASSERT has_function_privilege('service_role','public.rpc_cartoes_listar_v2(uuid,date,date)','execute'),'backend access';

 ASSERT (public.rpc_cartoes_pagamento_base_v2(adicional,gid,'2026-10-01')->>'maxCents')='2000','additional keeps access to payment ceiling';
 falhou:=false;BEGIN PERFORM public.rpc_cartoes_salvar_v2(dono,gen_random_uuid(),0,gen_random_uuid(),' Príncipal   renomeada ',0,1,2,'{}');EXCEPTION WHEN OTHERS THEN falhou:=SQLERRM LIKE '%CK:duplicate_name%';END;ASSERT falhou,'accent/whitespace normalized duplicate';
 INSERT INTO public.recorrencias(id_usuario,descricao,tipo,valor_base,data_inicio,periodicidade_tipo,modo_geracao,status_recorrencia,tipo_origem,id_origem,criado_por_id) VALUES
 (dono,'Previsão titular teste','Despesa',10,'2026-10-25','Mensal','Manual','Ativa','Cartão',titular_card,dono),
 (adicional,'Previsão adicional teste','Despesa',5,'2026-10-25','Mensal','Manual','Ativa','Cartão',adicional_card,adicional);
 r:=public.rpc_cartoes_previsoes_v2(adicional,'2026-09-01','2026-11-30');
 ASSERT jsonb_array_length(r->'recorrencias')=1 AND r->'recorrencias'->0->>'id_usuario'=adicional::text,'projection authorization';
 ASSERT (r->'groups_snapshot'->0->>'paidCents') IS NULL AND r->'groups_snapshot'->0->>'registeredCents'='2000','same statement authorized summary snapshot';
 UPDATE public.lancamentos SET data_ocorrencia='2026-10-05' WHERE id_lancamento=compra;
 ASSERT (SELECT mes_referencia='2026-10-01' FROM public.lancamentos WHERE id_lancamento=compra),'explicit date correction recalculates competence';
 RAISE NOTICE 'Cartões v2: invariantes financeiras, autorização e concorrência verificadas';
END $$;
ROLLBACK;
