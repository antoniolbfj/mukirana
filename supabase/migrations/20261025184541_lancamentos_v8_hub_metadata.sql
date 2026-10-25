LOCK TABLE public.lancamentos,public.rateios,public.pagamentos_faturas,public.contas,public.acertos_rateios,public.projetos IN SHARE MODE;
CREATE TEMP TABLE mk_hub_v8_preservacao ON COMMIT DROP AS SELECT jsonb_build_object('lancamentos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),'rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),'pagamentos_faturas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),'contas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),'acertos_rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t),'projetos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_projeto)) FROM public.projetos t)) AS hashes;
-- Hub de Lançamentos: metadados privados e categorização em lote atômica.
-- Nenhuma movimentação, participação ou saldo existente é reescrito pela migração.
ALTER FUNCTION public.rpc_lancamentos_listar_v3(uuid,date,date) RENAME TO rpc_lancamentos_listar_base_v8;
CREATE FUNCTION public.rpc_lancamentos_listar_v3(p_usuario uuid,p_inicio date,p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.rpc_lancamentos_listar_base_v8(p_usuario,p_inicio,p_fim);
 RETURN result||jsonb_build_object('entries',COALESCE((
  SELECT jsonb_agg(e||jsonb_build_object(
   'categoryVersion',COALESCE(r.versao_v4,0),
   'displayCategory',CASE WHEN r.id_rateio IS NOT NULL THEN r.id_categoria_v4 ELSE NULLIF(e->>'category','')::uuid END,
   'canCategorize',COALESCE(e->>'type' IN('income','expense') AND NOT (e->>'opening')::boolean AND COALESCE(e->>'special','')='' AND (r.id_rateio IS NOT NULL OR ((e->>'canEdit')::boolean AND jsonb_array_length(COALESCE(e->'shares','[]'))=0)),false)
  )) FROM jsonb_array_elements(result->'entries') e
  LEFT JOIN public.rateios r ON r.id_lancamento=(e->>'id')::uuid AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado'
 ),'[]'::jsonb));
END $$;

CREATE FUNCTION public.rpc_lancamentos_hub_v8(p_usuario uuid,p_operacao uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prev jsonb;result jsonb;item jsonb;l public.lancamentos;r public.rateios;cat public.categorias;
 field text:=p_request->>'field';value text:=p_request->>'value';uid uuid;ids uuid[]:='{}';flag text:=COALESCE(current_setting('mukirana_lancamentos.writing',true),'');
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_operacao IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR field IS NULL OR field NOT IN('category','classification') OR jsonb_typeof(p_request->'selected') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'selected') NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_lancamentos:'||p_usuario::text,0));
 prev:=public.rpc_lancamentos_replay_v3(p_usuario,p_operacao,p_request);IF prev IS NOT NULL THEN RETURN prev;END IF;
 IF field='category' THEN
  SELECT * INTO cat FROM public.categorias c WHERE c.id_categoria=value::uuid AND c.ativa AND (c.criado_por=p_usuario OR c.global);
  IF NOT FOUND THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
 ELSIF field='classification' THEN
  IF value IS NULL OR value NOT IN('fixed','variable') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;

 END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_request->'selected') x)<>jsonb_array_length(p_request->'selected') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
 -- Ordem única de bloqueio. Uma falha em qualquer item reverte o lote inteiro.
 PERFORM 1 FROM public.lancamentos x WHERE x.id_lancamento IN(SELECT (v->>'id')::uuid FROM jsonb_array_elements(p_request->'selected') v) ORDER BY x.id_lancamento FOR UPDATE;
 PERFORM 1 FROM public.rateios x WHERE x.id_usuario_responsavel=p_usuario AND x.id_lancamento IN(SELECT (v->>'id')::uuid FROM jsonb_array_elements(p_request->'selected') v) ORDER BY x.id_rateio FOR UPDATE;
 PERFORM set_config('mukirana_lancamentos.writing','1',true);
 FOR item IN SELECT v FROM jsonb_array_elements(p_request->'selected') v LOOP
  uid:=(item->>'id')::uuid;SELECT * INTO l FROM public.lancamentos WHERE id_lancamento=uid;
  IF NOT FOUND OR l.versao_v3 IS DISTINCT FROM (item->>'version')::integer THEN RAISE EXCEPTION 'LN:conflict';END IF;
  IF l.id_conta_saldo_inicial IS NOT NULL OR l.tipo NOT IN('Receita','Despesa') OR EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE l.id_lancamento IN(a.id_lancamento_pagamento,a.id_lancamento_recebimento)) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
  SELECT * INTO r FROM public.rateios WHERE id_lancamento=uid AND id_usuario_responsavel=p_usuario AND status<>'Cancelado';
  IF field='category' AND r.id_rateio IS NOT NULL THEN
   IF r.versao_v4 IS DISTINCT FROM (item->>'categoryVersion')::integer THEN RAISE EXCEPTION 'LN:conflict';END IF;
   IF cat.tipo<>l.tipo THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
   UPDATE public.rateios SET id_categoria_v4=cat.id_categoria WHERE id_rateio=r.id_rateio;
  ELSE
   IF NOT COALESCE((mukirana_lancamentos.dto(l,p_usuario)->>'canEdit')::boolean,false) OR EXISTS(SELECT 1 FROM public.rateios x WHERE x.id_lancamento=uid AND x.status<>'Cancelado') THEN RAISE EXCEPTION 'LN:forbidden';END IF;
   IF field='category' THEN
    IF cat.tipo<>l.tipo THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
    UPDATE public.lancamentos SET id_categoria=cat.id_categoria,alterado_por_id=p_usuario,updated_at=now() WHERE id_lancamento=uid;
   ELSE
    UPDATE public.lancamentos SET classificacao_v3=value,alterado_por_id=p_usuario,updated_at=now() WHERE id_lancamento=uid;
   END IF;
  END IF;
  ids:=array_append(ids,uid);
 END LOOP;
 result:=jsonb_build_object('ids',ids,'count',cardinality(ids));
 INSERT INTO mukirana_lancamentos.operacoes(id_usuario,id,assinatura,resposta) VALUES(p_usuario,p_operacao,md5(p_request::text),result);
 PERFORM set_config('mukirana_lancamentos.writing',flag,true);
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.rpc_lancamentos_listar_base_v8(uuid,date,date),public.rpc_lancamentos_listar_v3(uuid,date,date),public.rpc_lancamentos_hub_v8(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_lancamentos_listar_base_v8(uuid,date,date),public.rpc_lancamentos_listar_v3(uuid,date,date),public.rpc_lancamentos_hub_v8(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';

DO $$ BEGIN ASSERT (SELECT hashes FROM mk_hub_v8_preservacao) IS NOT DISTINCT FROM jsonb_build_object('lancamentos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),'rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),'pagamentos_faturas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),'contas',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),'acertos_rateios',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t),'projetos',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_projeto)) FROM public.projetos t)),'A migração modificou dados existentes'; END $$;
