-- Contexto da fatura e categoria individual padrão. Sem reclassificar histórico.
LOCK TABLE public.lancamentos,public.rateios,public.pagamentos_faturas,public.contas,public.acertos_rateios IN SHARE MODE;
CREATE TEMP TABLE mk_v9_preservacao ON COMMIT DROP AS SELECT jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)) AS hashes;

-- A categoria global é compartilhada; categorias privadas são copiadas/reutilizadas
-- na árvore do participante, sem conceder acesso às demais categorias do autor.
CREATE FUNCTION mukirana_rateios.categoria_padrao_v9(p_usuario uuid,p_categoria uuid,p_nivel integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.categorias;parent uuid;category_id uuid;
BEGIN
 IF p_categoria IS NULL THEN RETURN NULL;END IF;
 IF p_nivel>30 THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
 SELECT * INTO c FROM public.categorias WHERE id_categoria=p_categoria;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF c.global OR c.criado_por=p_usuario THEN RETURN c.id_categoria;END IF;
 parent:=mukirana_rateios.categoria_padrao_v9(p_usuario,c.id_categoria_pai,p_nivel+1);
 PERFORM pg_advisory_xact_lock(hashtextextended('mk:categoria:rateio',0));
 SELECT id_categoria INTO category_id FROM public.categorias x WHERE (x.criado_por=p_usuario OR x.global) AND x.tipo=c.tipo AND x.id_categoria_pai IS NOT DISTINCT FROM parent AND mukirana_cartoes.chave_nome(x.nome)=mukirana_cartoes.chave_nome(c.nome) ORDER BY x.global DESC,x.id_categoria LIMIT 1;
 IF category_id IS NULL THEN INSERT INTO public.categorias(nome,tipo,id_categoria_pai,global,ativa,criado_por) VALUES(c.nome,c.tipo,parent,false,true,p_usuario) RETURNING id_categoria INTO category_id;END IF;
 RETURN category_id;
END $$;
CREATE FUNCTION mukirana_rateios.categoria_inicial_v9() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cat uuid;
BEGIN
 IF TG_OP='INSERT' AND NEW.id_categoria_v4 IS NULL THEN
  SELECT id_categoria INTO cat FROM public.lancamentos WHERE id_lancamento=NEW.id_lancamento;
  NEW.id_categoria_v4:=mukirana_rateios.categoria_padrao_v9(NEW.id_usuario_responsavel,cat);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rateios_categoria_inicial_v9 BEFORE INSERT ON public.rateios FOR EACH ROW EXECUTE FUNCTION mukirana_rateios.categoria_inicial_v9();

-- Participações autorizadas também fazem parte da lista central. Elas não dão
-- acesso à conta de quem pagou e são apresentadas com impacto de caixa zero.
CREATE OR REPLACE FUNCTION public.rpc_lancamentos_listar_v3(p_usuario uuid,p_inicio date,p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;entries jsonb;known jsonb;
BEGIN
 result:=public.rpc_lancamentos_listar_base_v8(p_usuario,p_inicio,p_fim);
 SELECT COALESCE(jsonb_object_agg(e->>'id',true),'{}'::jsonb) INTO known FROM jsonb_array_elements(result->'entries') e;
 entries:=COALESCE(result->'entries','[]'::jsonb)||COALESCE((
  SELECT jsonb_agg(mukirana_lancamentos.dto(l,p_usuario))
  FROM public.lancamentos l JOIN public.rateios r ON r.id_lancamento=l.id_lancamento AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado'
  WHERE (p_inicio IS NULL OR l.data_ocorrencia>=p_inicio) AND (p_fim IS NULL OR l.data_ocorrencia<=p_fim)
  AND NOT (known ? l.id_lancamento::text)
 ),'[]'::jsonb);
 RETURN result||jsonb_build_object('entries',COALESCE((
  SELECT jsonb_agg(e||jsonb_build_object(
   'categoryVersion',COALESCE(r.versao_v4,0),
   'displayCategory',CASE WHEN r.id_rateio IS NOT NULL THEN COALESCE(r.id_categoria_v4,CASE WHEN c.global OR c.criado_por=p_usuario THEN c.id_categoria END) ELSE NULLIF(e->>'category','')::uuid END,
   'canCategorize',COALESCE(e->>'type' IN('income','expense') AND NOT (e->>'opening')::boolean AND COALESCE(e->>'special','')='' AND (r.id_rateio IS NOT NULL OR ((e->>'canEdit')::boolean AND jsonb_array_length(COALESCE(e->'shares','[]'))=0)),false)
  )) FROM jsonb_array_elements(entries) e
  LEFT JOIN public.rateios r ON r.id_lancamento=(e->>'id')::uuid AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado'
  LEFT JOIN public.categorias c ON c.id_categoria=(e->>'category')::uuid
 ),'[]'::jsonb));
END $$;

-- O mês explícito só existe dentro da RPC autenticada e da transação de gravação.
CREATE OR REPLACE FUNCTION mukirana_cartoes.competencia_compra() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE fechamento integer;context_month text:=NULLIF(current_setting('mukirana.invoice_month',true),'');context_group text:=NULLIF(current_setting('mukirana.invoice_group',true),'');
BEGIN
 IF NEW.tipo_origem='Cartão' THEN
  IF context_month IS NOT NULL AND EXISTS(SELECT 1 FROM public.cartoes c WHERE c.id_cartao=NEW.id_origem AND c.id_grupo_cartao::text=context_group) THEN
   NEW.mes_referencia:=(context_month||'-01')::date;
  ELSIF TG_OP='UPDATE' AND OLD.tipo_origem=NEW.tipo_origem AND OLD.id_origem=NEW.id_origem AND OLD.data_ocorrencia=NEW.data_ocorrencia THEN
   NEW.mes_referencia:=OLD.mes_referencia;
  ELSE
   SELECT g.dia_fechamento INTO fechamento FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=NEW.id_origem;
   IF fechamento IS NULL THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
   NEW.mes_referencia:=(date_trunc('month',NEW.data_ocorrencia)+CASE WHEN extract(day FROM NEW.data_ocorrencia)>fechamento THEN interval '1 month' ELSE interval '0 month' END)::date;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.rpc_lancamentos_fatura_v9(p_usuario uuid,p_operacao uuid,p_request jsonb,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE card public.cartoes;g public.grupos_cartoes;item jsonb;result jsonb;month text:=p_request->>'invoiceMonth';gid uuid:=(p_request->>'invoiceGroup')::uuid;old_month text:=COALESCE(current_setting('mukirana.invoice_month',true),'');old_group text:=COALESCE(current_setting('mukirana.invoice_group',true),'');
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF month IS NULL OR month!~'^[0-9]{4}-(0[1-9]|1[0-2])$' OR month<'0001-01' OR gid IS NULL OR p_request->>'type' NOT IN('income','expense') OR p_request->>'mode'<>'single' OR COALESCE((p_request->>'version')::integer,-1)<>0 OR jsonb_array_length(p_changes->'rows')<>1 OR COALESCE(p_changes->'group','null'::jsonb) IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
 SELECT * INTO g FROM public.grupos_cartoes WHERE id_grupo_cartao=gid AND ativo FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LN:forbidden';END IF;
 item:=p_changes->'rows'->0;
 SELECT * INTO card FROM public.cartoes WHERE id_cartao=(item->>'origin')::uuid AND id_grupo_cartao=gid AND ativo FOR SHARE;
 IF NOT FOUND OR NOT(card.id_usuario=p_usuario OR g.id_titular=p_usuario) OR item->>'sourceKind'<>'Cartão' OR (p_request->>'origin')::uuid<>card.id_cartao OR (item->>'version')::integer<>0 THEN RAISE EXCEPTION 'LN:forbidden';END IF;
 PERFORM set_config('mukirana.invoice_month',month,true);PERFORM set_config('mukirana.invoice_group',gid::text,true);
 result:=public.rpc_lancamentos_gravar_v3(p_usuario,p_operacao,p_request,p_changes);
 PERFORM set_config('mukirana.invoice_month',old_month,true);PERFORM set_config('mukirana.invoice_group',old_group,true);
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION mukirana_rateios.categoria_padrao_v9(uuid,uuid,integer),mukirana_rateios.categoria_inicial_v9(),public.rpc_lancamentos_fatura_v9(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mukirana_rateios.categoria_padrao_v9(uuid,uuid,integer),mukirana_rateios.categoria_inicial_v9(),public.rpc_lancamentos_fatura_v9(uuid,uuid,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
DO $$ BEGIN ASSERT (SELECT hashes FROM mk_v9_preservacao) IS NOT DISTINCT FROM jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)),'Histórico financeiro alterado';END $$;
