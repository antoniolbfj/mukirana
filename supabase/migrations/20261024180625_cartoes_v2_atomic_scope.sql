-- Aplicar em uma única transação; preserva IDs, valores e competências anteriores.
CREATE TEMP TABLE cartoes_v2_conferencia ON COMMIT DROP AS SELECT
 (SELECT md5(string_agg(to_jsonb(g)::text,'' ORDER BY id_grupo_cartao)) FROM public.grupos_cartoes g) grupos_hash,
 (SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY id_cartao)) FROM public.cartoes c) cartoes_hash,
 (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) lancamentos_hash,
 (SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas f) pagamentos_hash;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.lancamentos l JOIN public.cartoes c ON c.id_cartao=l.id_origem JOIN public.grupos_cartoes g USING(id_grupo_cartao)
 WHERE l.tipo_origem='Cartão' AND l.mes_referencia IS DISTINCT FROM (date_trunc('month',l.data_ocorrencia)+CASE WHEN extract(day FROM l.data_ocorrencia)>g.dia_fechamento THEN interval '1 month' ELSE interval '0 month' END)::date)
 THEN RAISE EXCEPTION 'CK:legacy_competence_review_required'; END IF;
END $$;
CREATE SCHEMA mukirana_cartoes;
REVOKE ALL ON SCHEMA mukirana_cartoes FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA mukirana_cartoes TO service_role;
CREATE FUNCTION mukirana_cartoes.chave_nome(p_nome text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT lower(btrim(regexp_replace(regexp_replace(normalize(p_nome,NFD),U&'[\0300-\036f]','','g'),'\s+',' ','g')));
$$;
ALTER TABLE public.grupos_cartoes ADD COLUMN versao integer NOT NULL DEFAULT 1 CHECK(versao>0);
ALTER TABLE public.grupos_cartoes ADD COLUMN ultima_operacao_id uuid;
ALTER TABLE public.grupos_cartoes ADD COLUMN ultima_operacao_hash text;
ALTER TABLE public.grupos_cartoes ADD CONSTRAINT grupos_cartoes_limite_valido CHECK(limite>=0);
ALTER TABLE public.grupos_cartoes ADD CONSTRAINT grupos_cartoes_nome_valido CHECK(length(btrim(nome_grupo)) BETWEEN 1 AND 160);
CREATE UNIQUE INDEX grupos_cartoes_nome_por_titular_v2 ON public.grupos_cartoes(id_titular,mukirana_cartoes.chave_nome(nome_grupo));

CREATE FUNCTION mukirana_cartoes.preparar_grupo() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id_grupo_cartao<>OLD.id_grupo_cartao OR NEW.id_titular<>OLD.id_titular THEN RAISE EXCEPTION 'CK:immutable'; END IF;
  NEW.versao:=OLD.versao+1;
 ELSE NEW.versao:=1; END IF;
 NEW.nome_grupo:=btrim(NEW.nome_grupo);NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER grupos_preparar_v2 BEFORE INSERT OR UPDATE ON public.grupos_cartoes FOR EACH ROW EXECUTE FUNCTION mukirana_cartoes.preparar_grupo();

CREATE FUNCTION mukirana_cartoes.preparar_cartao() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE titular uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id_cartao<>OLD.id_cartao OR NEW.id_grupo_cartao<>OLD.id_grupo_cartao OR NEW.id_usuario<>OLD.id_usuario) THEN RAISE EXCEPTION 'CK:immutable'; END IF;
 SELECT id_titular INTO titular FROM public.grupos_cartoes WHERE id_grupo_cartao=NEW.id_grupo_cartao;
 IF titular IS NULL OR (NEW.tipo_cartao='Titular')<>(NEW.id_usuario=titular) THEN RAISE EXCEPTION 'CK:invalid_card'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER cartoes_preparar_v2 BEFORE INSERT OR UPDATE ON public.cartoes FOR EACH ROW EXECUTE FUNCTION mukirana_cartoes.preparar_cartao();
CREATE FUNCTION mukirana_cartoes.invalidar_versao_grupo() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF COALESCE(current_setting('mukirana_cartoes.sincronizando',true),'')<>'1' THEN
  UPDATE public.grupos_cartoes SET updated_at=now() WHERE id_grupo_cartao=COALESCE(NEW.id_grupo_cartao,OLD.id_grupo_cartao);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER cartoes_versao_grupo_v2 AFTER INSERT OR UPDATE OR DELETE ON public.cartoes FOR EACH ROW EXECUTE FUNCTION mukirana_cartoes.invalidar_versao_grupo();

-- Competência persistida é a referência: novo fechamento não muda compras já registradas.
CREATE FUNCTION mukirana_cartoes.competencia_compra() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE fechamento integer;
BEGIN
 IF NEW.tipo_origem='Cartão' THEN
  IF TG_OP='UPDATE' AND OLD.tipo_origem=NEW.tipo_origem AND OLD.id_origem=NEW.id_origem AND OLD.data_ocorrencia=NEW.data_ocorrencia THEN
   NEW.mes_referencia:=OLD.mes_referencia;
  ELSE
   SELECT g.dia_fechamento INTO fechamento FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=NEW.id_origem;
   IF fechamento IS NULL THEN RAISE EXCEPTION 'CK:invalid_card'; END IF;
   NEW.mes_referencia:=(date_trunc('month',NEW.data_ocorrencia) + CASE WHEN extract(day FROM NEW.data_ocorrencia)>fechamento THEN interval '1 month' ELSE interval '0 month' END)::date;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lancamentos_competencia_cartao_v2 BEFORE INSERT OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION mukirana_cartoes.competencia_compra();

CREATE FUNCTION mukirana_cartoes.acessiveis(p_usuario uuid) RETURNS SETOF public.grupos_cartoes LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT g.* FROM public.grupos_cartoes g WHERE g.id_titular=p_usuario OR EXISTS(
  SELECT 1 FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND (c.id_usuario=p_usuario OR
   EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.tipo_origem='Cartão' AND l.id_origem=c.id_cartao AND l.criado_por_id=p_usuario) OR
   EXISTS(SELECT 1 FROM public.recorrencias r WHERE r.tipo_origem='Cartão' AND r.id_origem=c.id_cartao AND (r.id_usuario=p_usuario OR r.criado_por_id=p_usuario))));
$$;
CREATE FUNCTION mukirana_cartoes.lancamentos(p_usuario uuid,p_grupo uuid) RETURNS SETOF public.lancamentos LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT l.* FROM public.lancamentos l JOIN public.cartoes c ON c.id_cartao=l.id_origem JOIN public.grupos_cartoes g USING(id_grupo_cartao)
 WHERE l.tipo_origem='Cartão' AND g.id_grupo_cartao=p_grupo AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR l.criado_por_id=p_usuario);
$$;
CREATE FUNCTION mukirana_cartoes.dto(g public.grupos_cartoes,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',g.id_grupo_cartao,'version',g.versao,'name',g.nome_grupo,'ownerId',g.id_titular,
  'ownerName',(SELECT nome FROM public.usuarios WHERE id_usuario=g.id_titular),'canEdit',g.id_titular=p_usuario,'active',g.ativo,
  'role',CASE WHEN g.id_titular=p_usuario THEN 'owner' WHEN EXISTS(SELECT 1 FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND c.id_usuario=p_usuario AND c.ativo) THEN 'additional' ELSE 'history' END,
  'limitCents',CASE WHEN g.id_titular=p_usuario THEN (g.limite*100)::numeric(20,0)::text ELSE NULL END,
  'closingDay',g.dia_fechamento,'dueDay',g.dia_vencimento,
  'cardsCount',(SELECT count(*) FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.tipo_origem='Cartão' AND l.id_origem=c.id_cartao AND l.criado_por_id=p_usuario))),
  'participants',CASE WHEN g.id_titular=p_usuario THEN COALESCE((SELECT jsonb_agg(c.id_usuario ORDER BY c.id_usuario) FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND c.tipo_cartao='Adicional' AND c.ativo),'[]'::jsonb) ELSE '[]'::jsonb END);
$$;
CREATE FUNCTION mukirana_cartoes.totais(p_usuario uuid,p_grupo uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH dono AS(SELECT id_titular=p_usuario AS sim FROM public.grupos_cartoes WHERE id_grupo_cartao=p_grupo),
 compras AS(SELECT l.mes_referencia AS mes,sum(CASE l.tipo WHEN 'Despesa' THEN l.valor_total WHEN 'Receita' THEN -l.valor_total ELSE 0 END) AS registrado
  FROM mukirana_cartoes.lancamentos(p_usuario,p_grupo) l WHERE (p_inicio IS NULL OR l.mes_referencia>=p_inicio) AND (p_fim IS NULL OR l.mes_referencia<=p_fim) GROUP BY l.mes_referencia),
 pagamentos AS(SELECT mes_referencia AS mes,sum(valor) FILTER(WHERE status='Efetivado') AS pago,sum(valor) FILTER(WHERE status='Pendente') AS programado
  FROM public.pagamentos_faturas WHERE id_grupo_cartao=p_grupo AND (SELECT sim FROM dono) AND (p_inicio IS NULL OR mes_referencia>=p_inicio) AND (p_fim IS NULL OR mes_referencia<=p_fim) GROUP BY mes_referencia),
 meses AS(SELECT mes FROM compras UNION SELECT mes FROM pagamentos),
 totais AS(SELECT m.mes,COALESCE(c.registrado,0) AS registrado,COALESCE(p.pago,0) AS pago,COALESCE(p.programado,0) AS programado,
  greatest(0,COALESCE(c.registrado,0)-COALESCE(p.pago,0)) AS aberto,greatest(0,COALESCE(p.pago,0)-COALESCE(c.registrado,0)) AS credito
  FROM meses m LEFT JOIN compras c USING(mes) LEFT JOIN pagamentos p USING(mes))
 SELECT jsonb_build_object('registeredCents',(COALESCE(sum(registrado),0)*100)::numeric(30,0)::text,
  'paidCents',CASE WHEN (SELECT sim FROM dono) THEN (COALESCE(sum(pago),0)*100)::numeric(30,0)::text ELSE NULL END,
  'scheduledPaymentsCents',CASE WHEN (SELECT sim FROM dono) THEN (COALESCE(sum(programado),0)*100)::numeric(30,0)::text ELSE NULL END,
  'openCents',CASE WHEN (SELECT sim FROM dono) THEN (COALESCE(sum(aberto),0)*100)::numeric(30,0)::text ELSE NULL END,
  'creditCents',CASE WHEN (SELECT sim FROM dono) THEN (COALESCE(sum(credito),0)*100)::numeric(30,0)::text ELSE NULL END,
  'months',COALESCE(jsonb_agg(jsonb_build_object('month',to_char(mes,'YYYY-MM'),'registeredCents',(registrado*100)::numeric(30,0)::text,
   'paidCents',CASE WHEN (SELECT sim FROM dono) THEN (pago*100)::numeric(30,0)::text ELSE NULL END,
   'scheduledPaymentsCents',CASE WHEN (SELECT sim FROM dono) THEN (programado*100)::numeric(30,0)::text ELSE NULL END,
   'openCents',CASE WHEN (SELECT sim FROM dono) THEN (aberto*100)::numeric(30,0)::text ELSE NULL END,
   'creditCents',CASE WHEN (SELECT sim FROM dono) THEN (credito*100)::numeric(30,0)::text ELSE NULL END) ORDER BY mes),'[]'::jsonb)) FROM totais;
$$;
CREATE FUNCTION public.rpc_cartoes_listar_v2(p_usuario uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE dados jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF (p_inicio IS NOT NULL AND extract(day FROM p_inicio)<>1) OR (p_fim IS NOT NULL AND extract(day FROM p_fim)<>1) OR (p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_fim<p_inicio) THEN RAISE EXCEPTION 'CK:invalid_period'; END IF;
 SELECT COALESCE(jsonb_agg((mukirana_cartoes.dto(g,p_usuario)|| (mukirana_cartoes.totais(p_usuario,g.id_grupo_cartao,p_inicio,p_fim)-'months')) ORDER BY g.nome_grupo),'[]'::jsonb) INTO dados FROM mukirana_cartoes.acessiveis(p_usuario) g;
 RETURN jsonb_build_object('groups',dados);
END $$;
CREATE FUNCTION public.rpc_cartoes_detalhar_v2(p_usuario uuid,p_grupo uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.grupos_cartoes;cartoes jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 SELECT * INTO g FROM mukirana_cartoes.acessiveis(p_usuario) WHERE id_grupo_cartao=p_grupo;
 IF NOT FOUND THEN RAISE EXCEPTION 'CK:forbidden'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id_cartao,'userId',c.id_usuario,'name',c.nome_cartao,'userName',u.nome,
  'type',c.tipo_cartao,'active',c.ativo,'userActive',u.ativo,
  'registeredCents',(COALESCE((SELECT sum(CASE l.tipo WHEN 'Despesa' THEN l.valor_total WHEN 'Receita' THEN -l.valor_total ELSE 0 END)
   FROM mukirana_cartoes.lancamentos(p_usuario,p_grupo) l WHERE l.id_origem=c.id_cartao AND (p_inicio IS NULL OR l.mes_referencia>=p_inicio) AND (p_fim IS NULL OR l.mes_referencia<=p_fim)),0)*100)::numeric(30,0)::text)
  ORDER BY c.tipo_cartao DESC,u.nome),'[]'::jsonb) INTO cartoes FROM public.cartoes c JOIN public.usuarios u USING(id_usuario)
  WHERE c.id_grupo_cartao=p_grupo AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.tipo_origem='Cartão' AND l.id_origem=c.id_cartao AND l.criado_por_id=p_usuario));
 RETURN jsonb_build_object('group',mukirana_cartoes.dto(g,p_usuario)||mukirana_cartoes.totais(p_usuario,p_grupo,p_inicio,p_fim),'cards',cartoes);
END $$;
CREATE FUNCTION public.rpc_cartoes_salvar_v2(p_usuario uuid,p_grupo uuid,p_versao integer,p_operacao uuid,p_nome text,p_limite_cents bigint,p_fechamento integer,p_vencimento integer,p_adicionais uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.grupos_cartoes;existe boolean;assinatura text;ids uuid[];anterior text;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);PERFORM 1 FROM public.usuarios WHERE id_usuario=p_usuario FOR UPDATE;
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
CREATE FUNCTION public.rpc_cartoes_status_v2(p_usuario uuid,p_grupo uuid,p_versao integer,p_operacao uuid,p_ativo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.grupos_cartoes;assinatura text;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_operacao IS NULL OR p_versao IS NULL OR p_versao<1 OR p_ativo IS NULL THEN RAISE EXCEPTION 'CK:invalid_request'; END IF;
 SELECT * INTO g FROM public.grupos_cartoes WHERE id_grupo_cartao=p_grupo FOR UPDATE;
 IF NOT FOUND OR g.id_titular<>p_usuario THEN RAISE EXCEPTION 'CK:forbidden'; END IF;
 assinatura:=md5(jsonb_build_array('status',p_ativo)::text);
 IF g.ultima_operacao_id=p_operacao THEN
  IF g.ultima_operacao_hash<>assinatura THEN RAISE EXCEPTION 'CK:conflict'; END IF;
  RETURN jsonb_build_object('group',mukirana_cartoes.dto(g,p_usuario),'replayed',true);
 END IF;
 IF g.versao<>p_versao THEN RAISE EXCEPTION 'CK:conflict'; END IF;
 UPDATE public.grupos_cartoes SET ativo=p_ativo,ultima_operacao_id=p_operacao,ultima_operacao_hash=assinatura WHERE id_grupo_cartao=p_grupo RETURNING * INTO g;
 RETURN jsonb_build_object('group',mukirana_cartoes.dto(g,p_usuario),'replayed',false);
END $$;
CREATE FUNCTION public.rpc_cartoes_usuarios_v2(p_usuario uuid,p_busca text,p_grupo uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE dados jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_grupo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.grupos_cartoes WHERE id_grupo_cartao=p_grupo AND id_titular=p_usuario) THEN RAISE EXCEPTION 'CK:forbidden'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id_usuario,'name',u.nome,'email',u.email,'active',u.ativo) ORDER BY u.nome),'[]'::jsonb) INTO dados
 FROM (SELECT u.id_usuario,u.nome,u.email,u.ativo FROM public.usuarios u WHERE u.id_usuario<>p_usuario AND
  ((u.ativo AND length(btrim(COALESCE(p_busca,'')))>=2 AND (strpos(lower(u.nome),lower(btrim(p_busca)))>0 OR strpos(lower(u.email),lower(btrim(p_busca)))>0)) OR
   (p_grupo IS NOT NULL AND EXISTS(SELECT 1 FROM public.cartoes c WHERE c.id_grupo_cartao=p_grupo AND c.id_usuario=u.id_usuario AND c.tipo_cartao='Adicional' AND c.ativo))) ORDER BY u.nome LIMIT 50) u;
 RETURN jsonb_build_object('users',dados);
END $$;
CREATE FUNCTION public.rpc_cartoes_previsoes_v2(p_usuario uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE dados jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim>p_inicio+interval '51 years' THEN RAISE EXCEPTION 'CK:invalid_period'; END IF;
 WITH grupos AS MATERIALIZED(SELECT * FROM mukirana_cartoes.acessiveis(p_usuario) WHERE ativo),
 cartoes AS MATERIALIZED(SELECT c.* FROM public.cartoes c JOIN grupos g USING(id_grupo_cartao) WHERE c.ativo AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.recorrencias r WHERE r.tipo_origem='Cartão' AND r.id_origem=c.id_cartao AND (r.id_usuario=p_usuario OR r.criado_por_id=p_usuario)))),
 recorrencias AS MATERIALIZED(SELECT r.* FROM public.recorrencias r JOIN cartoes c ON c.id_cartao=r.id_origem JOIN grupos g USING(id_grupo_cartao) WHERE r.tipo_origem='Cartão' AND r.status_recorrencia='Ativa' AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR r.id_usuario=p_usuario OR r.criado_por_id=p_usuario))
 SELECT jsonb_build_object('groups_snapshot',(public.rpc_cartoes_listar_v2(p_usuario,(p_inicio+interval '1 month')::date,date_trunc('month',p_fim)::date)->'groups'),'grupos_cartoes',COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM grupos g),'[]'::jsonb),
  'cartoes',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM cartoes c),'[]'::jsonb),
  'recorrencias',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recorrencias r),'[]'::jsonb),
  'recorrencias_ocorrencias',COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.recorrencias_ocorrencias o JOIN recorrencias r USING(id_recorrencia) WHERE o.data_ocorrencia BETWEEN p_inicio AND p_fim),'[]'::jsonb),
  'lancamentos',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM public.lancamentos l JOIN cartoes c ON c.id_cartao=l.id_origem JOIN grupos g USING(id_grupo_cartao) WHERE l.tipo_origem='Cartão' AND l.data_ocorrencia BETWEEN p_inicio AND p_fim AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR l.criado_por_id=p_usuario)),'[]'::jsonb)) INTO dados;
 RETURN dados;
END $$;

-- Compatibilidade do pagamento existente: teto global, sem misturar subtotal do adicional.
CREATE FUNCTION public.rpc_cartoes_pagamento_base_v2(p_usuario uuid,p_grupo uuid,p_mes date,p_excluir uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE registrado numeric;pago numeric;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_mes IS NULL OR extract(day FROM p_mes)<>1 THEN RAISE EXCEPTION 'CK:invalid_period'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.grupos_cartoes g JOIN public.cartoes c USING(id_grupo_cartao)
 WHERE g.id_grupo_cartao=p_grupo AND g.ativo AND c.ativo AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario)) THEN RAISE EXCEPTION 'CK:forbidden'; END IF;
 IF p_excluir IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pagamentos_faturas WHERE id_pagamento_fatura=p_excluir AND id_grupo_cartao=p_grupo) THEN RAISE EXCEPTION 'CK:forbidden'; END IF;
 SELECT COALESCE(sum(CASE l.tipo WHEN 'Despesa' THEN l.valor_total WHEN 'Receita' THEN -l.valor_total ELSE 0 END),0) INTO registrado
 FROM public.lancamentos l JOIN public.cartoes c ON c.id_cartao=l.id_origem WHERE l.tipo_origem='Cartão' AND c.id_grupo_cartao=p_grupo AND l.mes_referencia=p_mes;
 SELECT COALESCE(sum(valor),0) INTO pago FROM public.pagamentos_faturas WHERE id_grupo_cartao=p_grupo AND mes_referencia=p_mes AND status='Efetivado' AND (p_excluir IS NULL OR id_pagamento_fatura<>p_excluir);
 RETURN jsonb_build_object('maxCents',(greatest(0,registrado-pago)*100)::numeric(30,0)::text);
END $$;
REVOKE EXECUTE ON FUNCTION public.rpc_cartoes_pagamento_base_v2(uuid,uuid,date,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cartoes_pagamento_base_v2(uuid,uuid,date,uuid) TO service_role;

ALTER TABLE public.grupos_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes_compartilhados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_faturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grupos_cartoes,public.cartoes,public.cartoes_compartilhados,public.pagamentos_faturas FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.grupos_cartoes,public.cartoes,public.cartoes_compartilhados,public.pagamentos_faturas TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_cartoes FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_cartoes TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_cartoes_listar_v2(uuid,date,date),public.rpc_cartoes_detalhar_v2(uuid,uuid,date,date),
 public.rpc_cartoes_salvar_v2(uuid,uuid,integer,uuid,text,bigint,integer,integer,uuid[]),public.rpc_cartoes_status_v2(uuid,uuid,integer,uuid,boolean),
 public.rpc_cartoes_usuarios_v2(uuid,text,uuid),public.rpc_cartoes_previsoes_v2(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cartoes_listar_v2(uuid,date,date),public.rpc_cartoes_detalhar_v2(uuid,uuid,date,date),
 public.rpc_cartoes_salvar_v2(uuid,uuid,integer,uuid,text,bigint,integer,integer,uuid[]),public.rpc_cartoes_status_v2(uuid,uuid,integer,uuid,boolean),
 public.rpc_cartoes_usuarios_v2(uuid,text,uuid),public.rpc_cartoes_previsoes_v2(uuid,date,date) TO service_role;

DO $$ DECLARE antes record; BEGIN
 SELECT * INTO antes FROM cartoes_v2_conferencia;
 IF antes.grupos_hash IS DISTINCT FROM (SELECT md5(string_agg((to_jsonb(g)-'versao'-'ultima_operacao_id'-'ultima_operacao_hash')::text,'' ORDER BY id_grupo_cartao)) FROM public.grupos_cartoes g)
 OR antes.cartoes_hash IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY id_cartao)) FROM public.cartoes c)
 OR antes.lancamentos_hash IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l)
 OR antes.pagamentos_hash IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas f)
 THEN RAISE EXCEPTION 'CK:migration_changed_existing_data'; END IF;
END $$;
