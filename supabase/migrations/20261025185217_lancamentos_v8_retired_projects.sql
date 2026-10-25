-- Projetos foi descontinuado; referência histórica inalterada não impede editar o lançamento.
LOCK TABLE public.lancamentos,public.rateios,public.pagamentos_faturas,public.contas,public.acertos_rateios,public.projetos IN SHARE MODE;
CREATE TEMP TABLE mk_hub_v8_preservacao ON COMMIT DROP AS SELECT jsonb_build_object('lancamentos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),'rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),'pagamentos_faturas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),'contas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),'acertos_rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t),'projetos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_projeto)) FROM public.projetos t)) AS hashes;
DO $$ BEGIN ASSERT (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.rpc_lancamentos_gravar_v3(uuid,uuid,jsonb,jsonb)'::regprocedure)='03a27ee739b635be7917de8d12bfd6f6','A função de gravação mudou; revisar antes de substituir'; END $$;
CREATE OR REPLACE FUNCTION public.rpc_lancamentos_gravar_v3(p_usuario uuid,p_operacao uuid,p_request jsonb,p_changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous jsonb;item jsonb;l public.lancamentos;uid uuid;origin uuid;dest uuid;cat uuid;proj uuid;amount numeric;g uuid;ids uuid[]:='{}';part jsonb;total numeric;members uuid[];anchor uuid;reply jsonb;action text:=p_changes->>'action';k text;sol uuid;versions jsonb:='{}';expected integer;exists_row boolean;original_ids uuid[];request_ids uuid[];prior_members jsonb:='{}';pending_approval boolean:=false;previous_flag text:=COALESCE(current_setting('mukirana_lancamentos.writing',true),'');
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_operacao IS NULL OR jsonb_typeof(p_request)<>'object' OR jsonb_typeof(p_changes)<>'object' THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_lancamentos:'||p_usuario::text,0));
 previous:=public.rpc_lancamentos_replay_v3(p_usuario,p_operacao,p_request);IF previous IS NOT NULL THEN RETURN previous;END IF;
 PERFORM set_config('mukirana_lancamentos.writing','1',true);
 IF action='quick-category' THEN
  IF length(btrim(p_changes->>'name')) NOT BETWEEN 1 AND 160 OR p_changes->>'type' NOT IN('Receita','Despesa') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
  cat:=NULLIF(p_changes->>'parent','')::uuid;
  IF cat IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categorias c WHERE c.id_categoria=cat AND (c.criado_por=p_usuario OR c.global) AND c.ativa AND c.id_categoria_pai IS NULL) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
  IF EXISTS(SELECT 1 FROM public.categorias c WHERE (c.criado_por=p_usuario OR c.global) AND c.id_categoria_pai IS NOT DISTINCT FROM cat AND mukirana_cartoes.chave_nome(c.nome)=mukirana_cartoes.chave_nome(p_changes->>'name')) THEN RAISE EXCEPTION 'LN:duplicate_name';END IF;
  uid:=(p_changes->>'id')::uuid;INSERT INTO public.categorias(id_categoria,nome,tipo,id_categoria_pai,global,ativa,criado_por) VALUES(uid,btrim(p_changes->>'name'),p_changes->>'type',cat,false,true,p_usuario);reply:=jsonb_build_object('id',uid);
 ELSIF action='quick-account' THEN
  IF length(btrim(p_changes->>'name')) NOT BETWEEN 1 AND 160 OR p_changes->>'type' NOT IN('Consumo','Investimento') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.contas c WHERE mukirana_lancamentos.conta(p_usuario,c.id_conta) AND mukirana_cartoes.chave_nome(c.nome_conta)=mukirana_cartoes.chave_nome(p_changes->>'name')) THEN RAISE EXCEPTION 'LN:duplicate_name';END IF;
  uid:=(p_changes->>'id')::uuid;INSERT INTO public.contas(id_conta,id_usuario,nome_conta,saldo_inicial,saldo_inicial_data,tipo_conta_v3) VALUES(uid,p_usuario,btrim(p_changes->>'name'),0,(now() AT TIME ZONE 'America/Sao_Paulo')::date,p_changes->>'type');reply:=jsonb_build_object('id',uid);
 ELSIF action IN('save','status','delete') THEN
  IF jsonb_typeof(p_changes->'rows')<>'array' OR jsonb_array_length(p_changes->'rows') NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
  -- Mesma ordem usada pelos acertos; evita liquidar um saldo que está mudando.
  FOR k IN SELECT DISTINCT mukirana_rateios.par(q.central,q.pessoa) FROM(
   SELECT r.id_usuario_credor central,r.id_usuario_responsavel pessoa FROM public.rateios r WHERE r.id_lancamento IN(SELECT (v->>'id')::uuid FROM jsonb_array_elements(p_changes->'rows') v)
   UNION ALL SELECT CASE WHEN v->>'sourceKind'='Cartão' THEN (SELECT g.id_titular FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=(v->>'origin')::uuid) ELSE (SELECT id_usuario FROM public.contas WHERE id_conta=(v->>'origin')::uuid) END,(share_item->>'id')::uuid FROM jsonb_array_elements(p_changes->'rows') v CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v->'shares','[]')) share_item) q WHERE q.central IS NOT NULL AND q.pessoa<>q.central ORDER BY 1 LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_rateios:'||k,0));
  END LOOP;
  -- Todas as linhas são bloqueadas na mesma ordem, inclusive contra gravações legadas.
  PERFORM 1 FROM public.lancamentos x WHERE x.id_lancamento IN(SELECT (v->>'id')::uuid FROM jsonb_array_elements(p_changes->'rows') v) ORDER BY x.id_lancamento FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(p_changes->'rows') LOOP
   uid:=(item->>'id')::uuid;expected:=(item->>'version')::integer;SELECT * INTO l FROM public.lancamentos WHERE id_lancamento=uid;exists_row:=FOUND;
   IF exists_row THEN
    IF NOT mukirana_lancamentos.gerir(p_usuario,l) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    IF l.criado_por_id<>p_usuario AND EXISTS(SELECT 1 FROM public.rateios WHERE id_lancamento=uid AND status<>'Cancelado') THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    IF mukirana_rateios.legado_vinculado(uid) THEN RAISE EXCEPTION 'RT:linked_settlement';END IF;
    IF l.id_conta_saldo_inicial IS NOT NULL THEN RAISE EXCEPTION 'LN:protected_opening';END IF;
    IF l.versao_v3<>expected THEN RAISE EXCEPTION 'LN:conflict';END IF;
    IF EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=uid AND r.status='Acertado') OR EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE a.status<>'Cancelado' AND (a.id_lancamento_pagamento=uid OR a.id_lancamento_recebimento=uid)) THEN RAISE EXCEPTION 'LN:settled';END IF;
   ELSIF expected<>0 OR action<>'save' THEN RAISE EXCEPTION 'LN:conflict';END IF;
   ids:=array_append(ids,uid);
  END LOOP;
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
  original_ids:=ids;
  SELECT COALESCE(jsonb_object_agg(x.anchor::text,x.people),'{}'::jsonb) INTO prior_members FROM(
   SELECT COALESCE(tx.id_conjunto_v3,tx.id_grupo_parcela,tx.id_lancamento) anchor,jsonb_agg(DISTINCT r.id_usuario_responsavel) people FROM public.lancamentos tx JOIN public.rateios r USING(id_lancamento)
   WHERE r.status<>'Cancelado' AND COALESCE(tx.id_conjunto_v3,tx.id_grupo_parcela,tx.id_lancamento) IN(SELECT COALESCE(z.id_conjunto_v3,z.id_grupo_parcela,z.id_lancamento) FROM public.lancamentos z WHERE z.id_lancamento=ANY(ids)) GROUP BY 1) x;
  IF p_changes->'group' IS NOT NULL AND p_changes->'group'<>'null'::jsonb THEN
   g:=(p_changes->'group'->>'id')::uuid;
   IF EXISTS(SELECT 1 FROM mukirana_lancamentos.conjuntos WHERE id=g) THEN RAISE EXCEPTION 'LN:conflict';END IF;
   IF p_changes->'group'->>'mode' NOT IN('installment','recurring') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
   INSERT INTO mukirana_lancamentos.conjuntos(id,id_usuario,modalidade,config) VALUES(g,p_usuario,p_changes->'group'->>'mode',p_changes->'group'->'config');
   IF p_changes->'group'->'config'->>'renewFrom' IS NOT NULL THEN
    UPDATE mukirana_lancamentos.conjuntos SET renovado_por=g WHERE id=(p_changes->'group'->'config'->>'renewFrom')::uuid AND id_usuario=p_usuario AND modalidade='recurring' AND renovado_por IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'LN:conflict';END IF;
   END IF;
  END IF;
  IF action='save' THEN
   FOR item IN SELECT value FROM jsonb_array_elements(p_changes->'rows') LOOP
    uid:=(item->>'id')::uuid;SELECT * INTO l FROM public.lancamentos WHERE id_lancamento=uid;exists_row:=FOUND;
    origin:=(item->>'origin')::uuid;dest:=NULLIF(item->>'destination','')::uuid;cat:=NULLIF(item->>'category','')::uuid;proj:=NULLIF(item->>'project','')::uuid;
    IF item->>'type' NOT IN('income','expense','transfer') OR item->>'status' NOT IN('done','pending') OR length(btrim(item->>'description')) NOT BETWEEN 1 AND 160 OR item->>'classification' NOT IN('fixed','variable') OR NOT(item->>'amountCents'~'^[1-9][0-9]{0,13}$') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
    amount:=(item->>'amountCents')::numeric/100;
    IF amount>999999999999.99 THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
    IF item->>'sourceKind'='Conta' THEN
     IF NOT EXISTS(SELECT 1 FROM public.contas c WHERE c.id_conta=origin AND (c.id_usuario=p_usuario OR (exists_row AND l.id_origem=origin AND l.criado_por_id=p_usuario)) AND (c.ativa OR (exists_row AND l.id_origem=origin))) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    ELSIF item->>'sourceKind'='Cartão' THEN
     IF NOT EXISTS(SELECT 1 FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=origin AND (c.id_usuario=p_usuario OR g.id_titular=p_usuario) AND ((c.ativo AND g.ativo) OR (exists_row AND l.id_origem=origin))) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    ELSE RAISE EXCEPTION 'LN:invalid_request';END IF;
    IF item->>'type'='transfer' THEN
     IF item->>'sourceKind'<>'Conta' OR origin=dest OR dest IS NULL OR NOT EXISTS(SELECT 1 FROM public.contas c WHERE c.id_conta=dest AND c.id_usuario=p_usuario AND (c.ativa OR (exists_row AND l.id_destino=dest))) OR jsonb_array_length(COALESCE(item->'shares','[]'))>0 THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
     cat:=NULL;
    ELSIF cat IS NULL OR NOT EXISTS(SELECT 1 FROM public.categorias c WHERE c.id_categoria=cat AND (c.criado_por=p_usuario OR c.global) AND (c.ativa OR (exists_row AND l.id_categoria=cat))) THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
    IF proj IS NOT NULL AND NOT (exists_row AND proj IS NOT DISTINCT FROM l.id_projeto) AND NOT EXISTS(SELECT 1 FROM public.projetos p WHERE p.id_projeto=proj AND (p.criado_por=p_usuario OR EXISTS(SELECT 1 FROM public.projetos_compartilhamentos x WHERE x.id_projeto=p.id_projeto AND x.id_usuario=p_usuario))) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    IF exists_row THEN
     UPDATE public.lancamentos SET tipo=CASE item->>'type' WHEN 'income' THEN 'Receita' WHEN 'expense' THEN 'Despesa' ELSE 'Transferência' END,descricao=btrim(item->>'description'),valor_total=amount,data_ocorrencia=(item->>'date')::date,id_categoria=cat,tipo_origem=item->>'sourceKind',id_origem=origin,id_destino=dest,id_projeto=proj,status=CASE item->>'status' WHEN 'done' THEN 'Efetivado' ELSE 'Pendente' END,alterado_por_id=p_usuario,updated_at=now(),classificacao_v3=item->>'classification' WHERE id_lancamento=uid;
    ELSE
     INSERT INTO public.lancamentos(id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,id_categoria,tipo_origem,id_origem,id_destino,id_projeto,status,criado_por_id,classificacao_v3,id_conjunto_v3,indice_v3,id_grupo_parcela,numero_parcela,total_parcelas)
     VALUES(uid,CASE item->>'type' WHEN 'income' THEN 'Receita' WHEN 'expense' THEN 'Despesa' ELSE 'Transferência' END,btrim(item->>'description'),amount,(item->>'date')::date,date_trunc('month',(item->>'date')::date),cat,item->>'sourceKind',origin,dest,proj,CASE item->>'status' WHEN 'done' THEN 'Efetivado' ELSE 'Pendente' END,p_usuario,item->>'classification',g,NULLIF(item->>'index','')::integer,CASE WHEN p_changes->'group'->>'mode'='installment' THEN g ELSE NULL END,CASE WHEN p_changes->'group'->>'mode'='installment' THEN (item->>'index')::integer ELSE NULL END,CASE WHEN p_changes->'group'->>'mode'='installment' THEN jsonb_array_length(p_changes->'rows') ELSE NULL END);
    END IF;
    IF item ? 'shares' THEN
     UPDATE public.rateios SET status='Cancelado' WHERE id_lancamento=uid AND status<>'Cancelado' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'shares') p WHERE (p->>'id')::uuid=public.rateios.id_usuario_responsavel);
     IF jsonb_array_length(item->'shares')>0 THEN
      SELECT sum((v->>'cents')::numeric) INTO total FROM jsonb_array_elements(item->'shares') v;
      IF total<>amount*100 OR jsonb_array_length(item->'shares')<2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'shares') v WHERE (v->>'id')::uuid=p_usuario) OR (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(item->'shares') v)<>jsonb_array_length(item->'shares') THEN RAISE EXCEPTION 'LN:invalid_shares';END IF;
      FOR part IN SELECT value FROM jsonb_array_elements(item->'shares') LOOP
       IF NOT(part->>'cents'~'^[1-9][0-9]*$') OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id_usuario=(part->>'id')::uuid AND u.ativo AND mukirana_lancamentos.pessoa(p_usuario,u.id_usuario)) THEN RAISE EXCEPTION 'LN:invalid_shares';END IF;
       INSERT INTO public.rateios(id_lancamento,id_usuario_responsavel,id_usuario_credor,valor_rateado,percentual,status,criado_por_id,modo_rateio,id_categoria_v4)
       VALUES(uid,(part->>'id')::uuid,(SELECT mukirana_rateios.financeiro(x) FROM public.lancamentos x WHERE x.id_lancamento=uid),(part->>'cents')::numeric/100,round((part->>'cents')::numeric/(amount*100)*100,4),'Pendente',p_usuario,'Valor',CASE WHEN (part->>'id')::uuid=p_usuario THEN cat ELSE NULL END)
       ON CONFLICT(id_lancamento,id_usuario_responsavel) DO UPDATE SET valor_rateado=EXCLUDED.valor_rateado,percentual=EXCLUDED.percentual,status='Pendente',id_usuario_credor=EXCLUDED.id_usuario_credor,id_categoria_v4=COALESCE(public.rateios.id_categoria_v4,EXCLUDED.id_categoria_v4),alterado_por_id=p_usuario,updated_at=now();
      END LOOP;
     END IF;
    END IF;
   END LOOP;
  ELSIF action='status' THEN
   IF p_changes->>'status' NOT IN('done','pending') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
   UPDATE public.lancamentos SET status=CASE p_changes->>'status' WHEN 'done' THEN 'Efetivado' ELSE 'Pendente' END,alterado_por_id=p_usuario,updated_at=now() WHERE id_lancamento=ANY(ids);
  END IF;
  -- Uma solicitação por conjunto; inclui os participantes anteriores ao ajuste.
  FOR anchor IN SELECT DISTINCT COALESCE(tx.id_conjunto_v3,tx.id_grupo_parcela,tx.id_lancamento) FROM public.lancamentos tx WHERE tx.id_lancamento=ANY(original_ids) LOOP
   SELECT array_agg(DISTINCT x.id) INTO members FROM(
    SELECT r.id_usuario_responsavel id FROM public.rateios r JOIN public.lancamentos tx USING(id_lancamento) WHERE COALESCE(tx.id_conjunto_v3,tx.id_grupo_parcela,tx.id_lancamento)=anchor AND r.status<>'Cancelado'
    UNION SELECT mukirana_rateios.financeiro(tx) FROM public.lancamentos tx WHERE COALESCE(tx.id_conjunto_v3,tx.id_grupo_parcela,tx.id_lancamento)=anchor AND EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=tx.id_lancamento AND r.status<>'Cancelado') UNION SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(COALESCE(prior_members->anchor::text,'[]'::jsonb)) v) x;
   SELECT array_agg(tx.id_lancamento ORDER BY tx.id_lancamento) INTO request_ids FROM public.lancamentos tx WHERE COALESCE(tx.id_conjunto_v3,tx.id_grupo_parcela,tx.id_lancamento)=anchor AND (action<>'delete' OR tx.id_lancamento=ANY(original_ids));
   IF cardinality(members)>1 THEN
    DELETE FROM mukirana_lancamentos.solicitacoes WHERE ancora=anchor;
    SELECT jsonb_object_agg(tx.id_lancamento::text,tx.versao_v3) INTO versions FROM public.lancamentos tx WHERE tx.id_lancamento=ANY(request_ids);
    sol:=gen_random_uuid();INSERT INTO mukirana_lancamentos.solicitacoes(id,ancora,autor,tipo,ids,versoes) VALUES(sol,anchor,p_usuario,CASE action WHEN 'delete' THEN 'delete' ELSE 'update' END,to_jsonb(request_ids),versions);
    INSERT INTO mukirana_lancamentos.decisoes(id_solicitacao,id_usuario,decisao) SELECT sol,u,CASE WHEN u=p_usuario THEN 'approved' ELSE 'pending' END FROM unnest(members) u;
    pending_approval:=true;
   ELSIF action='delete' THEN DELETE FROM public.lancamentos WHERE id_lancamento=ANY(request_ids);
   END IF;
  END LOOP;
  reply:=jsonb_build_object('ids',original_ids,'pendingApproval',pending_approval);
  IF p_changes->'favorite' IS NOT NULL AND p_changes->'favorite'<>'null'::jsonb THEN
   INSERT INTO mukirana_lancamentos.favoritos(id,id_usuario,nome,modelo) VALUES(p_operacao,p_usuario,p_changes->'favorite'->>'description',p_changes->'favorite') ON CONFLICT(id_usuario,mukirana_cartoes.chave_nome(nome)) DO UPDATE SET modelo=EXCLUDED.modelo,updated_at=now();
  END IF;
 ELSE RAISE EXCEPTION 'LN:invalid_request';END IF;
 INSERT INTO mukirana_lancamentos.operacoes(id_usuario,id,assinatura,resposta) VALUES(p_usuario,p_operacao,md5(p_request::text),reply);
 PERFORM set_config('mukirana_lancamentos.writing',previous_flag,true);
 RETURN reply;
END $$;
DO $$ BEGIN ASSERT (SELECT hashes FROM mk_hub_v8_preservacao) IS NOT DISTINCT FROM jsonb_build_object('lancamentos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),'rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),'pagamentos_faturas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),'contas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),'acertos_rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t),'projetos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_projeto)) FROM public.projetos t)),'A migração modificou dados existentes'; END $$;
