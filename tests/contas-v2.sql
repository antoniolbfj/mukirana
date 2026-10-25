-- Fixtures fictícias, executadas em transação e sempre desfeitas.
BEGIN;
DO $$
DECLARE dono uuid:=gen_random_uuid(); membro uuid:=gen_random_uuid(); estranho uuid:=gen_random_uuid();
 conta uuid:=gen_random_uuid(); outra uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 r jsonb; h jsonb; primeiro uuid; grupo uuid:=gen_random_uuid(); v integer; fail boolean;
BEGIN
 INSERT INTO public.usuarios(id_usuario,nome,email) VALUES(dono,'Teste dono',dono||'@example.invalid'),(membro,'Teste membro',membro||'@example.invalid'),(estranho,'Teste estranho',estranho||'@example.invalid');
 r:=public.rpc_contas_salvar_v2(dono,conta,0,op,'Conta teste',12345,'2026-10-01',true,ARRAY[membro]);
 primeiro:=(r->'account'->>'openingId')::uuid;
 ASSERT primeiro IS NOT NULL AND (r->'account'->>'version')::int=1,'create/opening';
 ASSERT (SELECT descricao='Saldo Inicial da Conta Conta teste' AND valor_total=123.45 FROM public.lancamentos WHERE id_lancamento=primeiro),'opening shape';
 r:=public.rpc_contas_salvar_v2(dono,conta,0,op,'Conta teste',12345,'2026-10-01',true,ARRAY[membro]);
 ASSERT (r->>'replayed')::boolean AND (SELECT count(*)=1 FROM public.lancamentos WHERE id_conta_saldo_inicial=conta),'replay';
 r:=public.rpc_contas_listar_v2(dono,'2026-09-30','2026-10-31');
 ASSERT (SELECT x->>'currentCents'='0' AND x->>'registeredForecastCents'='12345' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=conta::text),'dated opening';
 ASSERT (SELECT jsonb_array_length(public.rpc_contas_listar_v2(estranho,'2026-10-24','2026-10-31')->'accounts')=0),'isolation';
 r:=public.rpc_contas_listar_v2(membro,'2026-10-24','2026-10-31');
 ASSERT (SELECT (x->>'canEdit')::boolean=false AND x->'participants'='[]'::jsonb FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=conta::text),'shared read-only';
 fail:=false; BEGIN PERFORM public.rpc_contas_salvar_v2(membro,conta,1,gen_random_uuid(),'Ataque',0,'2026-10-01',false,'{}'); EXCEPTION WHEN OTHERS THEN fail:=SQLERRM LIKE '%CN:forbidden%'; END; ASSERT fail,'owner-only save';
 fail:=false; BEGIN PERFORM public.rpc_contas_status_v2(membro,conta,1,gen_random_uuid(),false); EXCEPTION WHEN OTHERS THEN fail:=SQLERRM LIKE '%CN:forbidden%'; END; ASSERT fail,'owner-only status';
 fail:=false; BEGIN UPDATE public.lancamentos SET valor_total=500 WHERE id_lancamento=primeiro; EXCEPTION WHEN OTHERS THEN fail:=SQLERRM LIKE '%CN:protected_opening%'; END; ASSERT fail,'protected opening';
 fail:=false; BEGIN PERFORM public.rpc_contas_salvar_v2(dono,outra,0,gen_random_uuid(),' conta TESTE ',0,'2026-10-01',false,'{}'); EXCEPTION WHEN OTHERS THEN fail:=SQLERRM LIKE '%CN:duplicate_name%'; END; ASSERT fail,'duplicate trimmed casefold';
 fail:=false; BEGIN PERFORM public.rpc_contas_salvar_v2(dono,conta,1,gen_random_uuid(),'Nao salvar',10,'2026-10-01',true,ARRAY[gen_random_uuid()]); EXCEPTION WHEN OTHERS THEN fail:=SQLERRM LIKE '%CN:invalid_participant%'; END; ASSERT fail,'invalid share';
 ASSERT (SELECT nome_conta='Conta teste' AND versao=1 FROM public.contas WHERE id_conta=conta),'atomic rollback';
 r:=public.rpc_contas_salvar_v2(dono,conta,1,gen_random_uuid(),'Renomeada',-789,'2026-10-02',true,ARRAY[membro]);
 ASSERT (r->'account'->>'openingId')::uuid=primeiro,'stable opening id';
 ASSERT (SELECT descricao='Saldo Inicial da Conta Renomeada' AND valor_total=-7.89 FROM public.lancamentos WHERE id_lancamento=primeiro),'rename negative';
 fail:=false; BEGIN PERFORM public.rpc_contas_salvar_v2(dono,conta,1,gen_random_uuid(),'Stale',1,'2026-10-01',false,'{}'); EXCEPTION WHEN OTHERS THEN fail:=SQLERRM LIKE '%CN:conflict%'; END; ASSERT fail,'stale conflict';
 r:=public.rpc_contas_salvar_v2(dono,outra,0,gen_random_uuid(),'Outra',0,'2026-10-01',false,'{}');
 INSERT INTO public.lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,id_destino,status,criado_por_id)
 VALUES('Transferência','Transferência teste',10,'2026-10-03','2026-10-01','Conta',outra,conta,'Efetivado',dono),
 ('Receita','Receita teste',20,'2026-10-04','2026-10-01','Conta',conta,NULL,'Efetivado',dono),
 ('Despesa','Despesa teste',3,'2026-10-05','2026-10-01','Conta',conta,NULL,'Pendente',dono),
 ('Despesa','Futura teste',5,'2026-10-30','2026-10-01','Conta',conta,NULL,'Pendente',dono);
 r:=public.rpc_contas_listar_v2(dono,'2026-10-24','2026-10-31');
 ASSERT (SELECT x->>'currentCents'='1911' AND x->>'registeredForecastCents'='1411' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=conta::text),'ledger balances including transfer';
 ASSERT (SELECT x->>'currentCents'='-1000' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=outra::text),'transfer source';
 h:=public.rpc_contas_movimentos_v2(dono,conta,NULL,NULL,2);
 ASSERT jsonb_array_length(h->'items')=2 AND h->'nextCursor'<>'null'::jsonb,'history page1';
 h:=public.rpc_contas_movimentos_v2(dono,conta,(h->'nextCursor'->>'date')::date,h->'nextCursor'->>'key',100);
 ASSERT jsonb_array_length(h->'items')=3 AND h->'nextCursor'='null'::jsonb,'history page2';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.rpc_contexto_financeiro_mukirana(dono,'2026-10-01',true)->'lancamentos') x WHERE x->>'tipo'='Saldo Inicial'),'legacy excludes openings';
 INSERT INTO public.grupos_cartoes(id_grupo_cartao,id_titular,nome_grupo,dia_fechamento,dia_vencimento)
 VALUES(grupo,dono,'Fatura teste',10,20);
 INSERT INTO public.cartoes(id_grupo_cartao,id_usuario,nome_cartao,tipo_cartao) VALUES(grupo,dono,'Titular teste','Titular');
 INSERT INTO public.lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id) SELECT 'Despesa','Compra da fatura',10,'2026-10-03','2026-10-01','Cartão',id_cartao,'Efetivado',dono FROM public.cartoes WHERE id_grupo_cartao=grupo;
 INSERT INTO public.pagamentos_faturas(id_grupo_cartao,id_conta,valor,data_pagamento,mes_referencia,criado_por_id)
 VALUES(grupo,conta,2,'2026-10-06','2026-10-01',dono);
 r:=public.rpc_contas_listar_v2(dono,'2026-10-24','2026-10-31');
 ASSERT (SELECT x->>'currentCents'='1711' AND x->>'registeredForecastCents'='1211' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=conta::text),'invoice payment balance';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(public.rpc_contas_movimentos_v2(dono,conta)->'items') x WHERE x->>'type'='Pagamento de fatura' AND x->>'amountCents'='-200'),'invoice history';
 op:=gen_random_uuid();r:=public.rpc_contas_status_v2(dono,conta,2,op,false);
 ASSERT (r->'account'->>'active')::boolean=false,'inactivate';
 r:=public.rpc_contas_status_v2(dono,conta,2,op,false);ASSERT (r->>'replayed')::boolean,'status replay';
 r:=public.rpc_contas_status_v2(dono,conta,3,gen_random_uuid(),true);ASSERT (r->'account'->>'active')::boolean,'restore';
 UPDATE public.contas SET nome_conta='Legado' WHERE id_conta=conta;
 ASSERT (SELECT versao=5 FROM public.contas WHERE id_conta=conta),'legacy version';
 ASSERT (SELECT descricao='Saldo Inicial da Conta Legado' FROM public.lancamentos WHERE id_lancamento=primeiro),'legacy trigger sync';
 r:=public.rpc_contas_salvar_v2(dono,conta,5,gen_random_uuid(),'Sem saldo',0,'2026-10-02',false,'{}');
 ASSERT NOT EXISTS(SELECT 1 FROM public.lancamentos WHERE id_conta_saldo_inicial=conta),'zero removes opening';
 ASSERT (SELECT count(*)=4 FROM public.lancamentos WHERE id_origem=conta OR id_destino=conta),'ordinary entries preserved';
 ASSERT jsonb_array_length(public.rpc_contas_listar_v2(membro,'2026-10-24','2026-10-31')->'accounts')=0,'share revoked';
 ASSERT NOT has_function_privilege('anon','public.rpc_contas_listar_v2(uuid,date,date)','execute') AND NOT has_function_privilege('authenticated','public.rpc_contexto_financeiro_mukirana(uuid,date,boolean)','execute'),'private RPC ACL';
 ASSERT has_function_privilege('service_role','public.rpc_contas_salvar_v2(uuid,uuid,integer,uuid,text,bigint,date,boolean,uuid[])','execute'),'backend ACL';
 RAISE NOTICE 'contas-v2: 32 invariantes verificadas';
END $$;
ROLLBACK;
