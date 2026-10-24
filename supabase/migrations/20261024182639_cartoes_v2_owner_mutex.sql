-- Serializar por titular sem bloquear usuários referenciados pelos cartões adicionais.
CREATE OR REPLACE FUNCTION public.rpc_cartoes_salvar_v2(p_usuario uuid,p_grupo uuid,p_versao integer,p_operacao uuid,p_nome text,p_limite_cents bigint,p_fechamento integer,p_vencimento integer,p_adicionais uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.grupos_cartoes;existe boolean;assinatura text;ids uuid[];anterior text;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mukirana_cartoes:'||p_usuario::text,0));
 IF p_grupo IS NULL OR p_operacao IS NULL OR p_versao IS NULL OR p_versao<0 OR p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 1 AND 160 OR
  p_limite_cents IS NULL OR p_limite_cents<0 OR p_limite_cents>99999999999999 OR p_fechamento IS NULL OR p_fechamento NOT BETWEEN 1 AND 31 OR p_vencimento IS NULL OR p_vencimento NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'CK:invalid_request'; END IF;
 SELECT COALESCE(array_agg(DISTINCT x ORDER BY x),'{}'::uuid[]) INTO ids FROM unnest(COALESCE(p_adicionais,'{}'::uuid[])) x;
 IF cardinality(ids)>500 OR p_usuario=ANY(ids) OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id_usuario=x AND u.ativo)) THEN RAISE EXCEPTION 'CK:invalid_participant'; END IF;
 assinatura:=md5(jsonb_build_array('save',btrim(p_nome),p_limite_cents,p_fechamento,p_vencimento,ids)::text);
 SELECT * INTO g FROM public.grupos_cartoes WHERE id_grupo_cartao=p_grupo FOR UPDATE;existe:=FOUND;
 IF existe THEN
  IF g.id_titular<>p_usuario THEN RAISE EXCEPTION 'CK:forbidden'; END IF;
  IF g.ultima_operacao_id=p_operacao THEN
   IF g.ultima_operacao_hash<>assinatura THEN RAISE EXCEPTION 'CK:conflict'; END IF;
   RETURN jsonb_build_object('group',mukirana_cartoes.dto(g,p_usuario),'replayed',true);
  END IF;
  IF g.versao<>p_versao THEN RAISE EXCEPTION 'CK:conflict'; END IF;
 ELSIF p_versao<>0 THEN RAISE EXCEPTION 'CK:conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.grupos_cartoes WHERE id_titular=p_usuario AND id_grupo_cartao<>p_grupo AND mukirana_cartoes.chave_nome(nome_grupo)=mukirana_cartoes.chave_nome(p_nome)) THEN RAISE EXCEPTION 'CK:duplicate_name'; END IF;
 IF existe THEN UPDATE public.grupos_cartoes SET nome_grupo=btrim(p_nome),limite=p_limite_cents::numeric/100,dia_fechamento=p_fechamento,dia_vencimento=p_vencimento,ultima_operacao_id=p_operacao,ultima_operacao_hash=assinatura WHERE id_grupo_cartao=p_grupo RETURNING * INTO g;
 ELSE INSERT INTO public.grupos_cartoes(id_grupo_cartao,id_titular,nome_grupo,limite,dia_fechamento,dia_vencimento,ultima_operacao_id,ultima_operacao_hash)
 VALUES(p_grupo,p_usuario,btrim(p_nome),p_limite_cents::numeric/100,p_fechamento,p_vencimento,p_operacao,assinatura) RETURNING * INTO g; END IF;
 anterior:=COALESCE(current_setting('mukirana_cartoes.sincronizando',true),'');PERFORM set_config('mukirana_cartoes.sincronizando','1',true);
 INSERT INTO public.cartoes(id_grupo_cartao,id_usuario,nome_cartao,tipo_cartao,ativo)
 SELECT p_grupo,u.id_usuario,g.nome_grupo||' - '||CASE WHEN u.id_usuario=p_usuario THEN 'Titular' ELSE u.nome END,CASE WHEN u.id_usuario=p_usuario THEN 'Titular' ELSE 'Adicional' END,true
 FROM public.usuarios u WHERE u.id_usuario=p_usuario OR u.id_usuario=ANY(ids)
 ON CONFLICT(id_grupo_cartao,id_usuario) DO UPDATE SET nome_cartao=EXCLUDED.nome_cartao,tipo_cartao=EXCLUDED.tipo_cartao,ativo=true,updated_at=now();
 UPDATE public.cartoes SET ativo=false,updated_at=now() WHERE id_grupo_cartao=p_grupo AND tipo_cartao='Adicional' AND NOT(id_usuario=ANY(ids)) AND ativo;
 PERFORM set_config('mukirana_cartoes.sincronizando',anterior,true);
 RETURN jsonb_build_object('group',mukirana_cartoes.dto(g,p_usuario),'replayed',false);
END $$;
