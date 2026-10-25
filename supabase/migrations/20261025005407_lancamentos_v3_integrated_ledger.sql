CREATE TEMP TABLE lancamentos_v3_preservacao ON COMMIT DROP AS SELECT
 (SELECT md5(string_agg((to_jsonb(l)-ARRAY['versao_v3','classificacao_v3','id_conjunto_v3','indice_v3'])::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) ledger_hash,
 (SELECT md5(string_agg((to_jsonb(c)-'tipo_conta_v3')::text,'' ORDER BY id_conta)) FROM public.contas c) accounts_hash,
 (SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id_rateio)) FROM public.rateios r) shares_hash,
 (SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas p) payments_hash;
-- Aditiva: não reclassifica, exclui ou altera valores dos movimentos anteriores.
CREATE SCHEMA mukirana_lancamentos;
REVOKE ALL ON SCHEMA mukirana_lancamentos FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA mukirana_lancamentos TO service_role;
CREATE TABLE mukirana_lancamentos.conjuntos(id uuid PRIMARY KEY,id_usuario uuid NOT NULL REFERENCES public.usuarios(id_usuario),modalidade text NOT NULL CHECK(modalidade IN('installment','recurring')),config jsonb NOT NULL,renovado_por uuid REFERENCES mukirana_lancamentos.conjuntos(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX conjuntos_usuario_v3 ON mukirana_lancamentos.conjuntos(id_usuario);
CREATE TABLE mukirana_lancamentos.operacoes(id_usuario uuid NOT NULL REFERENCES public.usuarios(id_usuario),id uuid NOT NULL,assinatura text NOT NULL,resposta jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(id_usuario,id));
CREATE TABLE mukirana_lancamentos.favoritos(id uuid PRIMARY KEY,id_usuario uuid NOT NULL REFERENCES public.usuarios(id_usuario),nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 160),modelo jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX favoritos_nome_usuario_v3 ON mukirana_lancamentos.favoritos(id_usuario,mukirana_cartoes.chave_nome(nome));
CREATE TABLE mukirana_lancamentos.solicitacoes(id uuid PRIMARY KEY,ancora uuid NOT NULL UNIQUE,autor uuid NOT NULL REFERENCES public.usuarios(id_usuario),tipo text NOT NULL CHECK(tipo IN('update','delete')),ids jsonb NOT NULL,versoes jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','superseded')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mukirana_lancamentos.decisoes(id_solicitacao uuid NOT NULL REFERENCES mukirana_lancamentos.solicitacoes(id) ON DELETE CASCADE,id_usuario uuid NOT NULL REFERENCES public.usuarios(id_usuario),decisao text NOT NULL CHECK(decisao IN('pending','approved','rejected')),id_categoria uuid REFERENCES public.categorias(id_categoria),justificativa text,PRIMARY KEY(id_solicitacao,id_usuario));
CREATE INDEX decisoes_usuario_v3 ON mukirana_lancamentos.decisoes(id_usuario,id_solicitacao);
ALTER TABLE public.lancamentos ADD COLUMN versao_v3 integer NOT NULL DEFAULT 1 CHECK(versao_v3>0),ADD COLUMN classificacao_v3 text CHECK(classificacao_v3 IN('fixed','variable')),ADD COLUMN id_conjunto_v3 uuid REFERENCES mukirana_lancamentos.conjuntos(id),ADD COLUMN indice_v3 integer CHECK(indice_v3>0);
CREATE INDEX lancamentos_conjunto_v3 ON public.lancamentos(id_conjunto_v3) WHERE id_conjunto_v3 IS NOT NULL;
ALTER TABLE public.contas ADD COLUMN tipo_conta_v3 text NOT NULL DEFAULT 'Consumo' CHECK(tipo_conta_v3 IN('Consumo','Investimento'));
CREATE FUNCTION mukirana_lancamentos.versionar() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id_lancamento<>OLD.id_lancamento OR NEW.criado_por_id<>OLD.criado_por_id THEN RAISE EXCEPTION 'LN:immutable';END IF;
 NEW.versao_v3:=OLD.versao_v3+1;
 IF COALESCE(current_setting('mukirana_lancamentos.writing',true),'')<>'1' THEN
  UPDATE mukirana_lancamentos.solicitacoes SET status='superseded' WHERE status IN('pending','rejected') AND ids ? OLD.id_lancamento::text;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lancamentos_versionar_v3 BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION mukirana_lancamentos.versionar();
CREATE FUNCTION mukirana_lancamentos.conta(p_usuario uuid,p_conta uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.contas c WHERE c.id_conta=p_conta AND (c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.contas_compartilhamentos v WHERE v.id_conta=c.id_conta AND v.id_usuario=p_usuario)));
$$;
CREATE FUNCTION mukirana_lancamentos.cartao(p_usuario uuid,p_cartao uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=p_cartao AND (c.id_usuario=p_usuario OR g.id_titular=p_usuario));
$$;
CREATE FUNCTION mukirana_lancamentos.ler(p_usuario uuid,l public.lancamentos) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT l.criado_por_id=p_usuario OR (l.tipo_origem='Conta' AND (mukirana_lancamentos.conta(p_usuario,l.id_origem) OR (l.tipo='Transferência' AND mukirana_lancamentos.conta(p_usuario,l.id_destino)))) OR (l.tipo_origem='Cartão' AND mukirana_lancamentos.cartao(p_usuario,l.id_origem));
$$;
CREATE FUNCTION mukirana_lancamentos.gerir(p_usuario uuid,l public.lancamentos) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT l.criado_por_id=p_usuario OR (l.tipo_origem='Conta' AND EXISTS(SELECT 1 FROM public.contas c WHERE c.id_conta=l.id_origem AND c.id_usuario=p_usuario) AND (l.tipo<>'Transferência' OR EXISTS(SELECT 1 FROM public.contas c WHERE c.id_conta=l.id_destino AND c.id_usuario=p_usuario))) OR (l.tipo_origem='Cartão' AND EXISTS(SELECT 1 FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=l.id_origem AND g.id_titular=p_usuario));
$$;
CREATE FUNCTION mukirana_lancamentos.pessoa(p_usuario uuid,p_outro uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_usuario=p_outro OR EXISTS(SELECT 1 FROM public.contas c WHERE (c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.contas_compartilhamentos x WHERE x.id_conta=c.id_conta AND x.id_usuario=p_usuario)) AND (c.id_usuario=p_outro OR EXISTS(SELECT 1 FROM public.contas_compartilhamentos x WHERE x.id_conta=c.id_conta AND x.id_usuario=p_outro))) OR EXISTS(SELECT 1 FROM public.cartoes a JOIN public.cartoes b USING(id_grupo_cartao) WHERE a.id_usuario=p_usuario AND b.id_usuario=p_outro) OR EXISTS(SELECT 1 FROM public.projetos p WHERE (p.criado_por=p_usuario OR EXISTS(SELECT 1 FROM public.projetos_compartilhamentos x WHERE x.id_projeto=p.id_projeto AND x.id_usuario=p_usuario)) AND (p.criado_por=p_outro OR EXISTS(SELECT 1 FROM public.projetos_compartilhamentos x WHERE x.id_projeto=p.id_projeto AND x.id_usuario=p_outro)));
$$;
CREATE FUNCTION mukirana_lancamentos.dto(l public.lancamentos,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',l.id_lancamento,'version',l.versao_v3,'description',l.descricao,'type',CASE l.tipo WHEN 'Receita' THEN 'income' WHEN 'Despesa' THEN 'expense' WHEN 'Transferência' THEN 'transfer' ELSE 'opening' END,'amountCents',(l.valor_total*100)::numeric(20,0)::text,'date',l.data_ocorrencia,'competence',to_char(l.mes_referencia,'YYYY-MM'),'sourceKind',l.tipo_origem,'origin',l.id_origem,'destination',l.id_destino,'category',l.id_categoria,'project',l.id_projeto,'author',l.criado_por_id,'status',CASE l.status WHEN 'Efetivado' THEN 'done' ELSE 'pending' END,'classification',l.classificacao_v3,'group',COALESCE(l.id_conjunto_v3,l.id_grupo_parcela,l.id_recorrencia_origem),'index',COALESCE(l.indice_v3,l.numero_parcela),'mode',COALESCE((SELECT modalidade FROM mukirana_lancamentos.conjuntos WHERE id=l.id_conjunto_v3),CASE WHEN l.id_grupo_parcela IS NOT NULL THEN 'installment' WHEN l.id_recorrencia_origem IS NOT NULL THEN 'recurring' ELSE 'single' END),'canEdit',l.id_conta_saldo_inicial IS NULL AND mukirana_lancamentos.gerir(p_usuario,l) AND (l.criado_por_id=p_usuario OR NOT EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado')),'opening',l.id_conta_saldo_inicial IS NOT NULL,'shares',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id_usuario_responsavel,'name',u.nome,'cents',(r.valor_rateado*100)::numeric(20,0)::text,'status',r.status)) FROM public.rateios r JOIN public.usuarios u ON u.id_usuario=r.id_usuario_responsavel WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado'),'[]'::jsonb));
$$;
CREATE FUNCTION public.rpc_lancamentos_listar_v3(p_usuario uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_inicio>p_fim THEN RAISE EXCEPTION 'LN:invalid_period';END IF;
 WITH visiveis AS(SELECT l.* FROM public.lancamentos l WHERE mukirana_lancamentos.ler(p_usuario,l) AND (p_inicio IS NULL OR CASE WHEN l.tipo_origem='Cartão' THEN l.mes_referencia ELSE l.data_ocorrencia END>=p_inicio) AND (p_fim IS NULL OR CASE WHEN l.tipo_origem='Cartão' THEN l.mes_referencia ELSE l.data_ocorrencia END<=p_fim))
 SELECT jsonb_build_object('entries',COALESCE((SELECT jsonb_agg(mukirana_lancamentos.dto(l,p_usuario) ORDER BY l.data_ocorrencia DESC,l.id_lancamento) FROM visiveis l),'[]'::jsonb),
 'accounts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id_conta,'name',c.nome_conta,'kind','Conta','type',c.tipo_conta_v3,'active',c.ativa,'canUse',c.id_usuario=p_usuario,'owner',c.id_usuario)) FROM public.contas c WHERE mukirana_lancamentos.conta(p_usuario,c.id_conta)),'[]'::jsonb)||COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id_cartao,'name',g.nome_grupo||' · '||u.nome,'kind','Cartão','type','Cartão','group',g.id_grupo_cartao,'groupName',g.nome_grupo,'closing',g.dia_fechamento,'active',c.ativo AND g.ativo,'canUse',c.id_usuario=p_usuario OR g.id_titular=p_usuario,'owner',c.id_usuario)) FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) JOIN public.usuarios u ON u.id_usuario=c.id_usuario WHERE mukirana_lancamentos.cartao(p_usuario,c.id_cartao)),'[]'::jsonb),
 'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id_categoria,'name',c.nome,'parent',c.id_categoria_pai,'type',c.tipo,'active',c.ativa,'global',c.global)) FROM public.categorias c WHERE c.criado_por=p_usuario OR c.global),'[]'::jsonb),
 'projects',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id_projeto,'name',p.nome,'active',p.ativo)) FROM public.projetos p WHERE p.criado_por=p_usuario OR EXISTS(SELECT 1 FROM public.projetos_compartilhamentos v WHERE v.id_projeto=p.id_projeto AND v.id_usuario=p_usuario)),'[]'::jsonb),
 'people',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id_usuario,'name',u.nome)) FROM public.usuarios u WHERE u.ativo AND mukirana_lancamentos.pessoa(p_usuario,u.id_usuario)),'[]'::jsonb),
 'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id_pagamento_fatura,'origin',f.id_conta,'group',f.id_grupo_cartao,'groupName',g.nome_grupo,'amountCents',(f.valor*100)::numeric(20,0)::text,'date',f.data_pagamento,'competence',to_char(f.mes_referencia,'YYYY-MM'),'status',CASE f.status WHEN 'Efetivado' THEN 'done' ELSE 'pending' END,'canSeeDestination',g.id_titular=p_usuario OR EXISTS(SELECT 1 FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND c.id_usuario=p_usuario))) FROM public.pagamentos_faturas f JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE (mukirana_lancamentos.conta(p_usuario,f.id_conta) OR g.id_titular=p_usuario) AND (p_inicio IS NULL OR f.data_pagamento>=p_inicio) AND (p_fim IS NULL OR f.data_pagamento<=p_fim)),'[]'::jsonb),
 'groups',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'mode',g.modalidade,'config',g.config,'createdDate',to_char(g.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'),'renewed',g.renovado_por IS NOT NULL,'lastId',(SELECT id_lancamento FROM public.lancamentos WHERE id_conjunto_v3=g.id ORDER BY data_ocorrencia DESC,id_lancamento DESC LIMIT 1),'lastDate',(SELECT max(data_ocorrencia) FROM public.lancamentos WHERE id_conjunto_v3=g.id),'count',(SELECT count(*) FROM public.lancamentos WHERE id_conjunto_v3=g.id),'totalCents',(SELECT (COALESCE(sum(valor_total),0)*100)::numeric(30,0)::text FROM public.lancamentos WHERE id_conjunto_v3=g.id))) FROM mukirana_lancamentos.conjuntos g WHERE g.id_usuario=p_usuario),'[]'::jsonb),
 'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id_lancamento,'description',h.descricao,'origin',h.id_origem,'category',h.id_categoria,'classification',h.classificacao_v3,'type',CASE h.tipo WHEN 'Receita' THEN 'income' ELSE 'expense' END,'author',h.criado_por_id)) FROM(SELECT * FROM(SELECT DISTINCT ON(lower(descricao)) l.id_lancamento,l.descricao,l.id_origem,l.id_categoria,l.classificacao_v3,l.tipo,l.criado_por_id,l.data_ocorrencia FROM public.lancamentos l WHERE l.criado_por_id=p_usuario AND l.tipo IN('Receita','Despesa') ORDER BY lower(descricao),data_ocorrencia DESC) x ORDER BY data_ocorrencia DESC LIMIT 200) h),'[]'::jsonb),
 'favorites',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.nome,'model',f.modelo)) FROM mukirana_lancamentos.favoritos f WHERE f.id_usuario=p_usuario),'[]'::jsonb),
 'legacyRecurrences',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id_recorrencia,'description',r.descricao,'type',CASE r.tipo WHEN 'Despesa' THEN 'expense' WHEN 'Receita' THEN 'income' ELSE 'transfer' END,'amountCents',(r.valor_base*100)::numeric(20,0)::text,'start',r.data_inicio,'frequency',r.periodicidade_tipo,'days',r.intervalo_dias,'sourceKind',r.tipo_origem,'origin',r.id_origem,'destination',r.id_destino,'category',r.id_categoria,'project',r.id_projeto,'author',r.criado_por_id)) FROM public.recorrencias r WHERE r.status_recorrencia='Ativa' AND ((r.tipo_origem='Conta' AND mukirana_lancamentos.conta(p_usuario,r.id_origem)) OR (r.tipo_origem='Cartão' AND mukirana_lancamentos.cartao(p_usuario,r.id_origem)))),'[]'::jsonb),
 'legacyGenerated',COALESCE((SELECT jsonb_agg(DISTINCT key) FROM (SELECT l.id_recorrencia_origem::text||':'||l.data_ocorrencia_recorrencia::text key FROM public.lancamentos l WHERE l.id_recorrencia_origem IS NOT NULL AND mukirana_lancamentos.ler(p_usuario,l) UNION SELECT o.id_recorrencia::text||':'||o.data_ocorrencia::text FROM public.recorrencias_ocorrencias o JOIN public.recorrencias r USING(id_recorrencia) WHERE r.id_usuario=p_usuario OR (r.tipo_origem='Conta' AND mukirana_lancamentos.conta(p_usuario,r.id_origem)) OR (r.tipo_origem='Cartão' AND mukirana_lancamentos.cartao(p_usuario,r.id_origem))) x),'[]'::jsonb),
 'approvals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'anchor',s.ancora,'author',s.autor,'action',s.tipo,'ids',s.ids,'status',s.status,'myDecision',d.decisao,'preview',(SELECT jsonb_build_object('description',l.descricao,'type',l.tipo,'amountCents',(l.valor_total*100)::numeric(20,0)::text) FROM public.lancamentos l WHERE l.id_lancamento=(s.ids->>0)::uuid))) FROM mukirana_lancamentos.solicitacoes s LEFT JOIN mukirana_lancamentos.decisoes d ON d.id_solicitacao=s.id AND d.id_usuario=p_usuario WHERE s.autor=p_usuario OR d.id_usuario=p_usuario),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.rpc_lancamentos_replay_v3(p_usuario uuid,p_operacao uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE o mukirana_lancamentos.operacoes;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);SELECT * INTO o FROM mukirana_lancamentos.operacoes WHERE id_usuario=p_usuario AND id=p_operacao;
 IF NOT FOUND THEN RETURN NULL;END IF;IF o.assinatura<>md5(p_request::text) THEN RAISE EXCEPTION 'LN:conflict';END IF;RETURN o.resposta;
END $$;
CREATE FUNCTION public.rpc_lancamentos_gravar_v3(p_usuario uuid,p_operacao uuid,p_request jsonb,p_changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
  -- Todas as linhas são bloqueadas na mesma ordem, inclusive contra gravações legadas.
  PERFORM 1 FROM public.lancamentos x WHERE x.id_lancamento IN(SELECT (v->>'id')::uuid FROM jsonb_array_elements(p_changes->'rows') v) ORDER BY x.id_lancamento FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(p_changes->'rows') LOOP
   uid:=(item->>'id')::uuid;expected:=(item->>'version')::integer;SELECT * INTO l FROM public.lancamentos WHERE id_lancamento=uid;exists_row:=FOUND;
   IF exists_row THEN
    IF NOT mukirana_lancamentos.gerir(p_usuario,l) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    IF l.criado_por_id<>p_usuario AND EXISTS(SELECT 1 FROM public.rateios WHERE id_lancamento=uid AND status<>'Cancelado') THEN RAISE EXCEPTION 'LN:forbidden';END IF;
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
    IF proj IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projetos p WHERE p.id_projeto=proj AND (p.criado_por=p_usuario OR EXISTS(SELECT 1 FROM public.projetos_compartilhamentos x WHERE x.id_projeto=p.id_projeto AND x.id_usuario=p_usuario))) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
    IF exists_row THEN
     UPDATE public.lancamentos SET tipo=CASE item->>'type' WHEN 'income' THEN 'Receita' WHEN 'expense' THEN 'Despesa' ELSE 'Transferência' END,descricao=btrim(item->>'description'),valor_total=amount,data_ocorrencia=(item->>'date')::date,id_categoria=cat,tipo_origem=item->>'sourceKind',id_origem=origin,id_destino=dest,id_projeto=proj,status=CASE item->>'status' WHEN 'done' THEN 'Efetivado' ELSE 'Pendente' END,alterado_por_id=p_usuario,updated_at=now(),classificacao_v3=item->>'classification' WHERE id_lancamento=uid;
    ELSE
     INSERT INTO public.lancamentos(id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,id_categoria,tipo_origem,id_origem,id_destino,id_projeto,status,criado_por_id,classificacao_v3,id_conjunto_v3,indice_v3,id_grupo_parcela,numero_parcela,total_parcelas)
     VALUES(uid,CASE item->>'type' WHEN 'income' THEN 'Receita' WHEN 'expense' THEN 'Despesa' ELSE 'Transferência' END,btrim(item->>'description'),amount,(item->>'date')::date,date_trunc('month',(item->>'date')::date),cat,item->>'sourceKind',origin,dest,proj,CASE item->>'status' WHEN 'done' THEN 'Efetivado' ELSE 'Pendente' END,p_usuario,item->>'classification',g,NULLIF(item->>'index','')::integer,CASE WHEN p_changes->'group'->>'mode'='installment' THEN g ELSE NULL END,CASE WHEN p_changes->'group'->>'mode'='installment' THEN (item->>'index')::integer ELSE NULL END,CASE WHEN p_changes->'group'->>'mode'='installment' THEN jsonb_array_length(p_changes->'rows') ELSE NULL END);
    END IF;
    IF item ? 'shares' THEN
     DELETE FROM public.rateios WHERE id_lancamento=uid;
     IF jsonb_array_length(item->'shares')>0 THEN
      SELECT sum((v->>'cents')::numeric) INTO total FROM jsonb_array_elements(item->'shares') v;
      IF total<>amount*100 OR jsonb_array_length(item->'shares')<2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'shares') v WHERE (v->>'id')::uuid=p_usuario) OR (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(item->'shares') v)<>jsonb_array_length(item->'shares') THEN RAISE EXCEPTION 'LN:invalid_shares';END IF;
      FOR part IN SELECT value FROM jsonb_array_elements(item->'shares') LOOP
       IF NOT(part->>'cents'~'^[1-9][0-9]*$') OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id_usuario=(part->>'id')::uuid AND u.ativo AND mukirana_lancamentos.pessoa(p_usuario,u.id_usuario)) THEN RAISE EXCEPTION 'LN:invalid_shares';END IF;
       INSERT INTO public.rateios(id_lancamento,id_usuario_responsavel,id_usuario_credor,valor_rateado,percentual,status,criado_por_id,modo_rateio) VALUES(uid,(part->>'id')::uuid,p_usuario,(part->>'cents')::numeric/100,round((part->>'cents')::numeric/(amount*100)*100,4),'Pendente',p_usuario,'Valor');
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
    UNION SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(COALESCE(prior_members->anchor::text,'[]'::jsonb)) v) x;
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
CREATE FUNCTION public.rpc_lancamentos_decidir_v3(p_usuario uuid,p_solicitacao uuid,p_aprovar boolean,p_categoria uuid,p_motivo text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s mukirana_lancamentos.solicitacoes;d mukirana_lancamentos.decisoes;item jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);SELECT * INTO s FROM mukirana_lancamentos.solicitacoes WHERE id=p_solicitacao FOR UPDATE;
 IF NOT FOUND OR s.status NOT IN('pending','rejected') THEN RAISE EXCEPTION 'LN:conflict';END IF;
 SELECT * INTO d FROM mukirana_lancamentos.decisoes WHERE id_solicitacao=s.id AND id_usuario=p_usuario;
 IF NOT FOUND THEN RAISE EXCEPTION 'LN:forbidden';END IF;
 IF p_aprovar THEN IF p_categoria IS NULL OR NOT EXISTS(SELECT 1 FROM public.categorias c WHERE c.id_categoria=p_categoria AND (c.criado_por=p_usuario OR c.global) AND c.ativa) THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
 ELSE IF length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LN:invalid_reason';END IF;END IF;
 UPDATE mukirana_lancamentos.decisoes SET decisao=CASE WHEN p_aprovar THEN 'approved' ELSE 'rejected' END,id_categoria=CASE WHEN p_aprovar THEN p_categoria ELSE NULL END,justificativa=CASE WHEN p_aprovar THEN NULL ELSE btrim(p_motivo) END WHERE id_solicitacao=s.id AND id_usuario=p_usuario;
 IF NOT p_aprovar THEN UPDATE mukirana_lancamentos.solicitacoes SET status='rejected' WHERE id=s.id;
 ELSIF NOT EXISTS(SELECT 1 FROM mukirana_lancamentos.decisoes WHERE id_solicitacao=s.id AND decisao<>'approved') THEN
  FOR item IN SELECT value FROM jsonb_array_elements(s.ids) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.id_lancamento=(item#>>'{}')::uuid AND l.versao_v3=(s.versoes->>(item#>>'{}'))::integer) THEN RAISE EXCEPTION 'LN:conflict';END IF;
  END LOOP;
  IF s.tipo='delete' THEN
   IF EXISTS(SELECT 1 FROM public.rateios WHERE id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v) AND status='Acertado') THEN RAISE EXCEPTION 'LN:settled';END IF;
   DELETE FROM public.lancamentos WHERE id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v);
  END IF;
  UPDATE mukirana_lancamentos.solicitacoes SET status='approved' WHERE id=s.id;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
ALTER TABLE mukirana_lancamentos.conjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mukirana_lancamentos.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mukirana_lancamentos.favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mukirana_lancamentos.solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mukirana_lancamentos.decisoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mukirana_lancamentos FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA mukirana_lancamentos TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mukirana_lancamentos FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_lancamentos TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_lancamentos_listar_v3(uuid,date,date),public.rpc_lancamentos_replay_v3(uuid,uuid,jsonb),public.rpc_lancamentos_gravar_v3(uuid,uuid,jsonb,jsonb),public.rpc_lancamentos_decidir_v3(uuid,uuid,boolean,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_lancamentos_listar_v3(uuid,date,date),public.rpc_lancamentos_replay_v3(uuid,uuid,jsonb),public.rpc_lancamentos_gravar_v3(uuid,uuid,jsonb,jsonb),public.rpc_lancamentos_decidir_v3(uuid,uuid,boolean,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';

DO $$ BEGIN
 ASSERT (SELECT ledger_hash FROM lancamentos_v3_preservacao) IS NOT DISTINCT FROM (SELECT md5(string_agg((to_jsonb(l)-ARRAY['versao_v3','classificacao_v3','id_conjunto_v3','indice_v3'])::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l),'Dados anteriores de lançamentos foram alterados';
 ASSERT (SELECT accounts_hash FROM lancamentos_v3_preservacao) IS NOT DISTINCT FROM (SELECT md5(string_agg((to_jsonb(c)-'tipo_conta_v3')::text,'' ORDER BY id_conta)) FROM public.contas c),'Dados anteriores de contas foram alterados';
 ASSERT (SELECT shares_hash FROM lancamentos_v3_preservacao) IS NOT DISTINCT FROM (SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id_rateio)) FROM public.rateios r),'Dados anteriores de rateios foram alterados';
 ASSERT (SELECT payments_hash FROM lancamentos_v3_preservacao) IS NOT DISTINCT FROM (SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas p),'Dados anteriores de pagamentos foram alterados';
END $$;
