-- Executar numa transação. Snapshot completo dos campos preexistentes.
CREATE TEMP TABLE rateios_v4_snapshot ON COMMIT DROP AS SELECT
 (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) lancamentos,
 (SELECT jsonb_object_agg(r.id_rateio,to_jsonb(r)) FROM public.rateios r) rateios,
 (SELECT jsonb_object_agg(a.id_acerto_rateio,to_jsonb(a)) FROM public.acertos_rateios a) acertos,
 (SELECT jsonb_object_agg(o.id_orcamento,to_jsonb(o)) FROM public.orcamentos o) metas;
CREATE SCHEMA mukirana_rateios;
REVOKE ALL ON SCHEMA mukirana_rateios FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA mukirana_rateios TO service_role;
CREATE TABLE mukirana_rateios.operacoes(usuario uuid NOT NULL REFERENCES public.usuarios,id uuid NOT NULL,hash text NOT NULL,resposta jsonb NOT NULL,PRIMARY KEY(usuario,id));
CREATE TABLE mukirana_rateios.convites(id uuid PRIMARY KEY,remetente uuid NOT NULL REFERENCES public.usuarios,destinatario uuid REFERENCES public.usuarios,destino_hash text NOT NULL,estado text NOT NULL CHECK(estado IN('pending','approved','rejected')),versao integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),CHECK(remetente<>destinatario));
CREATE UNIQUE INDEX convites_destino_remetente_v4 ON mukirana_rateios.convites(remetente,destino_hash);
CREATE INDEX convites_destino_v4 ON mukirana_rateios.convites(destinatario,estado);
ALTER TABLE public.rateios ADD COLUMN id_categoria_v4 uuid REFERENCES public.categorias(id_categoria),ADD COLUMN versao_v4 integer NOT NULL DEFAULT 1;
UPDATE public.rateios r SET id_categoria_v4=l.id_categoria FROM public.lancamentos l JOIN public.categorias c USING(id_categoria) WHERE r.id_lancamento=l.id_lancamento AND r.id_usuario_responsavel=l.criado_por_id AND (c.criado_por=r.id_usuario_responsavel OR c.global);
CREATE UNIQUE INDEX rateios_pessoa_lancamento_v4 ON public.rateios(id_lancamento,id_usuario_responsavel);
CREATE INDEX rateios_categoria_v4 ON public.rateios(id_categoria_v4) WHERE id_categoria_v4 IS NOT NULL;
ALTER TABLE public.orcamentos ADD COLUMN automatica_v4 boolean NOT NULL DEFAULT false;
ALTER TABLE public.acertos_rateios ADD COLUMN versao_v4 integer NOT NULL DEFAULT 1,ADD COLUMN motivo_recusa_v4 text;
ALTER TABLE public.acertos_rateios DROP CONSTRAINT acertos_rateios_estado_valido,DROP CONSTRAINT acertos_rateios_status_check;
ALTER TABLE public.acertos_rateios ADD CONSTRAINT acertos_rateios_status_check CHECK(status IN('Aguardando_Credor','Efetivado','Cancelado','Rejeitado'));
ALTER TABLE public.acertos_rateios ADD CONSTRAINT acertos_rateios_estado_valido CHECK(
 (modalidade='Perda' AND status='Efetivado' AND id_lancamento_pagamento IS NULL AND id_lancamento_recebimento IS NULL AND id_pagamento_fatura IS NULL) OR
 (modalidade='Liquidacao' AND (status IN('Cancelado','Rejeitado') OR
  (status='Aguardando_Credor' AND (id_lancamento_pagamento IS NOT NULL OR id_pagamento_fatura IS NOT NULL) AND id_lancamento_recebimento IS NULL) OR
  (status='Efetivado' AND (id_lancamento_recebimento IS NOT NULL OR (forma_credor='Sem_Movimento' AND id_pagamento_fatura IS NOT NULL))))) );
CREATE UNIQUE INDEX acertos_pagamento_unico_v4 ON public.acertos_rateios(id_lancamento_pagamento) WHERE id_lancamento_pagamento IS NOT NULL;
CREATE UNIQUE INDEX acertos_recebimento_unico_v4 ON public.acertos_rateios(id_lancamento_recebimento) WHERE id_lancamento_recebimento IS NOT NULL;
CREATE UNIQUE INDEX acertos_fatura_unica_v4 ON public.acertos_rateios(id_pagamento_fatura) WHERE id_pagamento_fatura IS NOT NULL;
CREATE INDEX acertos_credor_status_v4 ON public.acertos_rateios(id_usuario_credor,status);
CREATE INDEX rateios_acertos_refs_v4 ON public.acertos_rateios USING gin(ids_rateios);
CREATE FUNCTION mukirana_rateios.financeiro(l public.lancamentos) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN l.tipo_origem='Conta' THEN (SELECT id_usuario FROM public.contas WHERE id_conta=l.id_origem) ELSE (SELECT g.id_titular FROM public.cartoes c JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE c.id_cartao=l.id_origem) END;
$$;
CREATE FUNCTION mukirana_rateios.par(a uuid,b uuid) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT least(a,b)::text||':'||greatest(a,b)::text; $$;
CREATE FUNCTION mukirana_rateios.lock_par(a uuid,b uuid) RETURNS void LANGUAGE sql SET search_path='' AS $$ SELECT pg_advisory_xact_lock(hashtextextended('mukirana_rateios:'||mukirana_rateios.par(a,b),0)); $$;
CREATE FUNCTION mukirana_rateios.legado_vinculado(p_lancamento uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.rateios r JOIN public.acertos_rateios a ON r.id_rateio=ANY(a.ids_rateios) WHERE r.id_lancamento=p_lancamento AND a.status NOT IN('Cancelado','Rejeitado'));
$$;
CREATE FUNCTION mukirana_rateios.proteger_parte() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id_rateio,NEW.id_lancamento,NEW.id_usuario_responsavel,NEW.valor_rateado,NEW.status,NEW.id_usuario_credor) IS DISTINCT FROM (OLD.id_rateio,OLD.id_lancamento,OLD.id_usuario_responsavel,OLD.valor_rateado,OLD.status,OLD.id_usuario_credor) THEN
  IF EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE OLD.id_rateio=ANY(a.ids_rateios) AND a.status NOT IN('Cancelado','Rejeitado')) THEN RAISE EXCEPTION 'RT:linked_settlement';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF (NEW.id_rateio,NEW.id_lancamento,NEW.id_usuario_responsavel) IS DISTINCT FROM (OLD.id_rateio,OLD.id_lancamento,OLD.id_usuario_responsavel) THEN RAISE EXCEPTION 'RT:immutable';END IF;
 NEW.versao_v4:=OLD.versao_v4+1;RETURN NEW;
END $$;
CREATE TRIGGER rateios_preservar_v4 BEFORE UPDATE OR DELETE ON public.rateios FOR EACH ROW EXECUTE FUNCTION mukirana_rateios.proteger_parte();
CREATE FUNCTION mukirana_rateios.versionar_acerto() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.id_acerto_rateio,NEW.id_usuario_devedor,NEW.id_usuario_credor) IS DISTINCT FROM (OLD.id_acerto_rateio,OLD.id_usuario_devedor,OLD.id_usuario_credor) THEN RAISE EXCEPTION 'RT:immutable';END IF;
 NEW.versao_v4:=OLD.versao_v4+1;NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER acertos_versionar_v4 BEFORE UPDATE ON public.acertos_rateios FOR EACH ROW EXECUTE FUNCTION mukirana_rateios.versionar_acerto();
CREATE FUNCTION mukirana_rateios.saldo(p_usuario uuid,p_outro uuid,p_ate date DEFAULT NULL) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT COALESCE((SELECT sum(CASE WHEN l.tipo='Receita' THEN -1 ELSE 1 END * CASE WHEN r.id_usuario_credor=p_usuario THEN 1 ELSE -1 END*r.valor_rateado)
  FROM public.rateios r JOIN public.lancamentos l USING(id_lancamento) WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor AND ((r.id_usuario_credor=p_usuario AND r.id_usuario_responsavel=p_outro) OR (r.id_usuario_responsavel=p_usuario AND r.id_usuario_credor=p_outro)) AND (p_ate IS NULL OR l.data_ocorrencia<=p_ate)),0)
 +COALESCE((SELECT sum(CASE WHEN a.id_usuario_devedor=p_usuario THEN a.valor ELSE -a.valor END) FROM public.acertos_rateios a WHERE a.status IN('Aguardando_Credor','Efetivado') AND ((a.id_usuario_devedor=p_usuario AND a.id_usuario_credor=p_outro) OR (a.id_usuario_credor=p_usuario AND a.id_usuario_devedor=p_outro)) AND (p_ate IS NULL OR COALESCE(a.data_pagamento,a.data_recebimento,a.created_at::date)<=p_ate)),0);
$$;
CREATE FUNCTION mukirana_rateios.replay(p_usuario uuid,p_operacao uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE o mukirana_rateios.operacoes;BEGIN SELECT * INTO o FROM mukirana_rateios.operacoes WHERE usuario=p_usuario AND id=p_operacao;IF NOT FOUND THEN RETURN NULL;END IF;IF o.hash<>md5(p_request::text) THEN RAISE EXCEPTION 'RT:conflict';END IF;RETURN o.resposta;END $$;
-- Relações existentes continuam elegíveis; o aceite de convite acrescenta vínculo
-- pessoal sem conceder acesso a conta, cartão ou projeto.
ALTER FUNCTION mukirana_lancamentos.pessoa(uuid,uuid) RENAME TO pessoa_base_v3;
CREATE FUNCTION mukirana_lancamentos.pessoa(p_usuario uuid,p_outro uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT mukirana_lancamentos.pessoa_base_v3(p_usuario,p_outro) OR EXISTS(SELECT 1 FROM mukirana_rateios.convites c WHERE c.estado='approved' AND least(c.remetente,c.destinatario)=least(p_usuario,p_outro) AND greatest(c.remetente,c.destinatario)=greatest(p_usuario,p_outro));
$$;

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
    IF proj IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projetos p WHERE p.id_projeto=proj AND (p.criado_por=p_usuario OR EXISTS(SELECT 1 FROM public.projetos_compartilhamentos x WHERE x.id_projeto=p.id_projeto AND x.id_usuario=p_usuario))) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
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
CREATE OR REPLACE FUNCTION public.rpc_lancamentos_decidir_v3(p_usuario uuid,p_solicitacao uuid,p_aprovar boolean,p_categoria uuid,p_motivo text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s mukirana_lancamentos.solicitacoes;d mukirana_lancamentos.decisoes;item jsonb;k text;has_part boolean;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_aprovar IS NULL THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
 SELECT * INTO s FROM mukirana_lancamentos.solicitacoes WHERE id=p_solicitacao;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM mukirana_lancamentos.decisoes WHERE id_solicitacao=s.id AND id_usuario=p_usuario) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
 FOR k IN SELECT DISTINCT mukirana_rateios.par(r.id_usuario_credor,r.id_usuario_responsavel) FROM public.rateios r WHERE r.id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v) AND r.id_usuario_credor<>r.id_usuario_responsavel ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_rateios:'||k,0));
 END LOOP;
 PERFORM 1 FROM public.lancamentos l WHERE l.id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v) ORDER BY l.id_lancamento FOR UPDATE;
 SELECT * INTO s FROM mukirana_lancamentos.solicitacoes WHERE id=p_solicitacao FOR UPDATE;
 SELECT * INTO d FROM mukirana_lancamentos.decisoes WHERE id_solicitacao=s.id AND id_usuario=p_usuario;
 IF s.status='superseded' OR NOT FOUND THEN RAISE EXCEPTION 'LN:conflict';END IF;
 IF d.decisao=(CASE WHEN p_aprovar THEN 'approved' ELSE 'rejected' END) AND d.id_categoria IS NOT DISTINCT FROM (CASE WHEN p_aprovar THEN p_categoria ELSE NULL::uuid END) AND d.justificativa IS NOT DISTINCT FROM (CASE WHEN NOT p_aprovar THEN btrim(p_motivo) ELSE NULL END) THEN RETURN jsonb_build_object('ok',true);END IF;
 IF s.status NOT IN('pending','rejected') THEN RAISE EXCEPTION 'LN:conflict';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(s.ids) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.id_lancamento=(item#>>'{}')::uuid AND l.versao_v3=(s.versoes->>(item#>>'{}'))::integer) THEN RAISE EXCEPTION 'LN:conflict';END IF;
 END LOOP;
 has_part:=EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v) AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado');
 IF p_aprovar AND s.tipo<>'delete' AND has_part THEN
  IF NOT EXISTS(SELECT 1 FROM public.categorias c WHERE c.id_categoria=p_categoria AND (c.criado_por=p_usuario OR c.global) AND c.ativa) THEN RAISE EXCEPTION 'LN:invalid_category';END IF;
  UPDATE public.rateios SET id_categoria_v4=p_categoria WHERE id_usuario_responsavel=p_usuario AND status<>'Cancelado' AND id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v);
 END IF;
 IF NOT p_aprovar AND length(btrim(COALESCE(p_motivo,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'LN:invalid_reason';END IF;
 UPDATE mukirana_lancamentos.decisoes SET decisao=CASE WHEN p_aprovar THEN 'approved' ELSE 'rejected' END,id_categoria=CASE WHEN p_aprovar THEN p_categoria ELSE NULL END,justificativa=CASE WHEN p_aprovar THEN NULL ELSE btrim(p_motivo) END WHERE id_solicitacao=s.id AND id_usuario=p_usuario;
 IF NOT p_aprovar THEN UPDATE mukirana_lancamentos.solicitacoes SET status='rejected' WHERE id=s.id;
 ELSIF NOT EXISTS(SELECT 1 FROM mukirana_lancamentos.decisoes WHERE id_solicitacao=s.id AND decisao<>'approved') THEN
  IF s.tipo='delete' THEN
   IF EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v) AND mukirana_rateios.legado_vinculado(l.id_lancamento)) THEN RAISE EXCEPTION 'LN:settled';END IF;
   DELETE FROM public.lancamentos WHERE id_lancamento IN(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(s.ids) v);
  END IF;
  UPDATE mukirana_lancamentos.solicitacoes SET status='approved' WHERE id=s.id;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION mukirana_lancamentos.dto(l public.lancamentos,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',l.id_lancamento,'version',l.versao_v3,'description',l.descricao,'type',CASE l.tipo WHEN 'Receita' THEN 'income' WHEN 'Despesa' THEN 'expense' WHEN 'Transferência' THEN 'transfer' ELSE 'opening' END,'amountCents',(l.valor_total*100)::numeric(20,0)::text,'date',l.data_ocorrencia,'competence',to_char(l.mes_referencia,'YYYY-MM'),'sourceKind',l.tipo_origem,'origin',l.id_origem,'destination',l.id_destino,'category',l.id_categoria,'project',l.id_projeto,'author',l.criado_por_id,'status',CASE l.status WHEN 'Efetivado' THEN 'done' ELSE 'pending' END,'classification',l.classificacao_v3,'group',COALESCE(l.id_conjunto_v3,l.id_grupo_parcela,l.id_recorrencia_origem),'index',COALESCE(l.indice_v3,l.numero_parcela),'mode',COALESCE((SELECT modalidade FROM mukirana_lancamentos.conjuntos WHERE id=l.id_conjunto_v3),CASE WHEN l.id_grupo_parcela IS NOT NULL THEN 'installment' WHEN l.id_recorrencia_origem IS NOT NULL THEN 'recurring' ELSE 'single' END),'canEdit',l.id_conta_saldo_inicial IS NULL AND mukirana_lancamentos.gerir(p_usuario,l) AND (l.criado_por_id=p_usuario OR NOT EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado')),'opening',l.id_conta_saldo_inicial IS NOT NULL,'shares',CASE WHEN l.criado_por_id=p_usuario OR mukirana_rateios.financeiro(l)=p_usuario OR EXISTS(SELECT 1 FROM public.rateios mine WHERE mine.id_lancamento=l.id_lancamento AND mine.id_usuario_responsavel=p_usuario AND mine.status<>'Cancelado') THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id_usuario_responsavel,'name',u.nome,'cents',(r.valor_rateado*100)::numeric(20,0)::text,'status',r.status,'category',CASE WHEN r.id_usuario_responsavel=p_usuario THEN r.id_categoria_v4 ELSE NULL END)) FROM public.rateios r JOIN public.usuarios u ON u.id_usuario=r.id_usuario_responsavel WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado'),'[]'::jsonb) ELSE '[]'::jsonb END)||jsonb_build_object('financeOwner',mukirana_rateios.financeiro(l),'myCategory',(SELECT id_categoria_v4 FROM public.rateios mine WHERE mine.id_lancamento=l.id_lancamento AND mine.id_usuario_responsavel=p_usuario AND mine.status<>'Cancelado'),'canEdit',l.id_conta_saldo_inicial IS NULL AND mukirana_lancamentos.gerir(p_usuario,l) AND NOT mukirana_rateios.legado_vinculado(l.id_lancamento) AND NOT EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE l.id_lancamento IN(a.id_lancamento_pagamento,a.id_lancamento_recebimento)) AND (l.criado_por_id=p_usuario OR NOT EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado')),'special',CASE WHEN EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE l.id_lancamento IN(a.id_lancamento_pagamento,a.id_lancamento_recebimento)) THEN 'settlement' ELSE NULL END,'settlementId',(SELECT a.id_acerto_rateio FROM public.acertos_rateios a WHERE l.id_lancamento IN(a.id_lancamento_pagamento,a.id_lancamento_recebimento) LIMIT 1));
$$;

CREATE FUNCTION mukirana_rateios.item(l public.lancamentos,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',l.id_lancamento,'version',l.versao_v3,'description',l.descricao,'type',l.tipo,'date',l.data_ocorrencia,'amountCents',(l.valor_total*100)::numeric(20,0)::text,'author',l.criado_por_id,'financeOwner',mukirana_rateios.financeiro(l),'financeName',(SELECT nome FROM public.usuarios WHERE id_usuario=mukirana_rateios.financeiro(l)),
 'group',COALESCE(l.id_conjunto_v3,l.id_grupo_parcela),'mode',CASE WHEN l.id_conjunto_v3 IS NOT NULL THEN (SELECT modalidade FROM mukirana_lancamentos.conjuntos WHERE id=l.id_conjunto_v3) WHEN l.id_grupo_parcela IS NOT NULL THEN 'installment' ELSE 'single' END,
 'myCents',COALESCE((SELECT (r.valor_rateado*100)::numeric(20,0)::text FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado'),'0'),'myCategory',(SELECT r.id_categoria_v4 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado'),
 'approval',COALESCE((SELECT s.status FROM mukirana_lancamentos.solicitacoes s WHERE s.ancora=COALESCE(l.id_conjunto_v3,l.id_grupo_parcela,l.id_lancamento)),'legacy'),'linkedSettlement',mukirana_rateios.legado_vinculado(l.id_lancamento),
 'shares',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id_usuario_responsavel,'name',u.nome,'cents',(r.valor_rateado*100)::numeric(20,0)::text,'category',CASE WHEN r.id_usuario_responsavel=p_usuario THEN r.id_categoria_v4 ELSE NULL END) ORDER BY u.nome) FROM public.rateios r JOIN public.usuarios u ON u.id_usuario=r.id_usuario_responsavel WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado'),'[]'::jsonb));
$$;
CREATE FUNCTION mukirana_rateios.acerto_dto(a public.acertos_rateios,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',a.id_acerto_rateio,'version',a.versao_v4,'other',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END,'otherName',(SELECT nome FROM public.usuarios WHERE id_usuario=CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END),'side',CASE WHEN a.id_usuario_devedor=p_usuario THEN 'pay' ELSE 'receive' END,'status',a.status,'amountCents',(a.valor*100)::numeric(20,0)::text,
 'date',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.data_pagamento ELSE a.data_recebimento END,'otherDate',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.data_recebimento ELSE a.data_pagamento END,
 'ownAccount',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_conta_devedor ELSE a.id_conta_credor END,'ownEntry',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento ELSE a.id_lancamento_recebimento END,
 'ownRegistered',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL ELSE a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento' END,
 'otherRegistered',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento' ELSE a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL END,
 'canAttach',a.status IN('Aguardando_Credor','Efetivado') AND CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento IS NULL AND a.id_pagamento_fatura IS NULL ELSE a.id_lancamento_recebimento IS NULL AND a.forma_credor IS DISTINCT FROM 'Sem_Movimento' END,
 'canReject',a.status='Aguardando_Credor' AND a.id_usuario_credor=p_usuario,'canCorrect',a.modalidade='Liquidacao' AND a.id_usuario_devedor=p_usuario AND a.id_lancamento_pagamento IS NOT NULL AND a.id_lancamento_recebimento IS NULL AND a.status IN('Aguardando_Credor','Rejeitado'),
 'reason',a.motivo_recusa_v4,'invoice',a.id_pagamento_fatura IS NOT NULL);
$$;
CREATE FUNCTION public.rpc_rateios_contexto_v4(p_usuario uuid,p_inicio date DEFAULT NULL,p_fim date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;cut date:=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')+interval '1 month - 1 day')::date;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_inicio>p_fim THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
 WITH partners AS(SELECT DISTINCT CASE WHEN r.id_usuario_credor=p_usuario THEN r.id_usuario_responsavel ELSE r.id_usuario_credor END id FROM public.rateios r WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor AND p_usuario IN(r.id_usuario_responsavel,r.id_usuario_credor)
  UNION SELECT CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END FROM public.acertos_rateios a WHERE p_usuario IN(a.id_usuario_devedor,a.id_usuario_credor)),
 balances AS(SELECT u.id_usuario,u.nome,mukirana_rateios.saldo(p_usuario,u.id_usuario,NULL) total,mukirana_rateios.saldo(p_usuario,u.id_usuario,cut) atual FROM partners p JOIN public.usuarios u ON u.id_usuario=p.id),
 visible AS(SELECT l.* FROM public.lancamentos l WHERE (p_inicio IS NULL OR l.data_ocorrencia>=p_inicio) AND (p_fim IS NULL OR l.data_ocorrencia<=p_fim) AND (EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND r.status<>'Cancelado' AND (p_usuario IN(r.id_usuario_responsavel,r.id_usuario_credor) OR l.criado_por_id=p_usuario)) OR (l.criado_por_id=p_usuario AND mukirana_rateios.financeiro(l)<>p_usuario)))
 SELECT jsonb_build_object('today',today,'debtCut',cut,
 'items',COALESCE((SELECT jsonb_agg(mukirana_rateios.item(l,p_usuario) ORDER BY l.data_ocorrencia DESC,l.id_lancamento) FROM visible l),'[]'::jsonb),
 'balances',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id_usuario,'name',b.nome,'balanceCents',(b.total*100)::numeric(30,0)::text,'dueCents',(b.atual*100)::numeric(30,0)::text,'payMaxCents',(greatest(0,-b.total)*100)::numeric(30,0)::text,'receiveMaxCents',(greatest(0,b.total)*100)::numeric(30,0)::text,'suggestedPayCents',(least(greatest(0,-b.atual),greatest(0,-b.total))*100)::numeric(30,0)::text,'suggestedReceiveCents',(least(greatest(0,b.atual),greatest(0,b.total))*100)::numeric(30,0)::text) ORDER BY b.nome) FROM balances b),'[]'::jsonb),
 'settlements',COALESCE((SELECT jsonb_agg(mukirana_rateios.acerto_dto(a,p_usuario) ORDER BY a.created_at DESC,a.id_acerto_rateio) FROM public.acertos_rateios a WHERE p_usuario IN(a.id_usuario_devedor,a.id_usuario_credor)),'[]'::jsonb),
 'approvals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'anchor',s.ancora,'action',s.tipo,'status',s.status,'myDecision',d.decisao,'reason',d.justificativa,'author',s.autor,'count',jsonb_array_length(s.ids),'description',(SELECT descricao FROM public.lancamentos WHERE id_lancamento=(s.ids->>0)::uuid),'amountCents',(SELECT (COALESCE(sum(l.valor_total),0)*100)::numeric(30,0)::text FROM public.lancamentos l WHERE s.ids ? l.id_lancamento::text),'myCents',(SELECT (COALESCE(sum(r.valor_rateado),0)*100)::numeric(30,0)::text FROM public.rateios r WHERE r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado' AND s.ids ? r.id_lancamento::text),'category',(SELECT id_categoria_v4 FROM public.rateios r WHERE r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado' AND s.ids ? r.id_lancamento::text LIMIT 1),'firstDate',(SELECT min(data_ocorrencia) FROM public.lancamentos WHERE s.ids ? id_lancamento::text),'lastDate',(SELECT max(data_ocorrencia) FROM public.lancamentos WHERE s.ids ? id_lancamento::text),'people',(SELECT jsonb_agg(jsonb_build_object('name',u.nome,'decision',v.decisao,'reason',v.justificativa) ORDER BY u.nome) FROM mukirana_lancamentos.decisoes v JOIN public.usuarios u ON u.id_usuario=v.id_usuario WHERE v.id_solicitacao=s.id),'occurrences',(SELECT jsonb_agg(jsonb_build_object('id',l.id_lancamento,'date',l.data_ocorrencia,'amountCents',(l.valor_total*100)::numeric(20,0)::text) ORDER BY l.data_ocorrencia,l.id_lancamento) FROM public.lancamentos l WHERE s.ids ? l.id_lancamento::text)) ORDER BY s.created_at DESC) FROM mukirana_lancamentos.solicitacoes s LEFT JOIN mukirana_lancamentos.decisoes d ON d.id_solicitacao=s.id AND d.id_usuario=p_usuario WHERE d.id_usuario=p_usuario OR s.autor=p_usuario),'[]'::jsonb),
 'contacts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id_usuario,'name',u.nome) ORDER BY u.nome) FROM public.usuarios u WHERE u.ativo AND mukirana_lancamentos.pessoa(p_usuario,u.id_usuario)),'[]'::jsonb),
 'invitations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'version',c.versao,'direction',CASE WHEN c.remetente=p_usuario THEN 'sent' ELSE 'received' END,'state',c.estado,'name',CASE WHEN c.remetente=p_usuario THEN 'Convite particular' ELSE (SELECT nome FROM public.usuarios WHERE id_usuario=c.remetente) END) ORDER BY c.created_at DESC) FROM mukirana_rateios.convites c WHERE c.remetente=p_usuario OR c.destinatario=p_usuario OR c.destino_hash=(SELECT md5(lower(btrim(email))) FROM public.usuarios WHERE id_usuario=p_usuario)),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
-- O leitor atual ganha os metadados, mantendo compatibilidade do contrato existente.
ALTER FUNCTION public.rpc_lancamentos_listar_v3(uuid,date,date) RENAME TO rpc_lancamentos_listar_contas_v3;
CREATE FUNCTION public.rpc_lancamentos_listar_v3(p_usuario uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;rt jsonb;
BEGIN
 result:=public.rpc_lancamentos_listar_contas_v3(p_usuario,p_inicio,p_fim);rt:=public.rpc_rateios_contexto_v4(p_usuario,p_inicio,p_fim);
 RETURN result||jsonb_build_object('rateios',rt,'people',rt->'contacts');
END $$;

CREATE FUNCTION public.rpc_rateios_mutar_v4(p_usuario uuid,p_operacao uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE action text:=p_request->>'action';prev jsonb;result jsonb;a public.acertos_rateios;existe boolean;uid uuid;other uuid;side text;account uuid;entry_id uuid;entry public.lancamentos;amount numeric;date_value date;maximum numeric;category uuid;group_id uuid;inv mukirana_rateios.convites;target uuid;emailhash text;parent uuid;goal public.orcamentos;parentgoal public.orcamentos;total_children numeric;nature text;f public.pagamentos_faturas;goal_item jsonb;goal_items jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_operacao IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object' THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_lancamentos:'||p_usuario::text,0));
 prev:=mukirana_rateios.replay(p_usuario,p_operacao,p_request);IF prev IS NOT NULL THEN RETURN prev;END IF;
 IF action='invite' THEN
  IF length(btrim(p_request->>'email')) NOT BETWEEN 3 AND 254 OR p_request->>'email' NOT LIKE '%@%' THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
  emailhash:=md5(lower(btrim(p_request->>'email')));
  IF EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=p_usuario AND md5(lower(btrim(email)))=emailhash) THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
  SELECT id_usuario INTO target FROM public.usuarios WHERE ativo AND md5(lower(btrim(email)))=emailhash;
  INSERT INTO mukirana_rateios.convites(id,remetente,destinatario,destino_hash,estado) VALUES((p_request->>'id')::uuid,p_usuario,target,emailhash,'pending')
  ON CONFLICT(remetente,destino_hash) DO UPDATE SET estado=CASE WHEN mukirana_rateios.convites.estado='approved' THEN 'approved' ELSE 'pending' END,versao=mukirana_rateios.convites.versao+1;
  result:=jsonb_build_object('requested',true);
 ELSIF action='invite-decide' THEN
  SELECT * INTO inv FROM mukirana_rateios.convites WHERE id=(p_request->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR inv.versao<>(p_request->>'version')::integer OR inv.estado<>'pending' THEN RAISE EXCEPTION 'RT:conflict';END IF;
  IF inv.remetente=p_usuario OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id_usuario=p_usuario AND (inv.destinatario=p_usuario OR inv.destino_hash=md5(lower(btrim(u.email))))) THEN RAISE EXCEPTION 'RT:forbidden';END IF;
  IF jsonb_typeof(p_request->'approve') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
  UPDATE mukirana_rateios.convites SET destinatario=p_usuario,estado=CASE WHEN (p_request->>'approve')::boolean THEN 'approved' ELSE 'rejected' END,versao=versao+1 WHERE id=inv.id;
  result:=jsonb_build_object('ok',true);
 ELSIF action='category' THEN
  category:=(p_request->>'category')::uuid;uid:=(p_request->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.categorias WHERE id_categoria=category AND ativa AND (criado_por=p_usuario OR global)) THEN RAISE EXCEPTION 'RT:invalid_category';END IF;
  SELECT COALESCE(l.id_conjunto_v3,l.id_grupo_parcela,l.id_lancamento) INTO group_id FROM public.lancamentos l JOIN public.rateios r USING(id_lancamento) WHERE l.id_lancamento=uid AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado';
  IF NOT FOUND THEN RAISE EXCEPTION 'RT:forbidden';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.categorias c JOIN public.lancamentos l ON l.tipo=c.tipo WHERE c.id_categoria=category AND l.id_lancamento=uid) THEN RAISE EXCEPTION 'RT:invalid_category';END IF;
  UPDATE public.rateios r SET id_categoria_v4=category FROM public.lancamentos l WHERE l.id_lancamento=r.id_lancamento AND COALESCE(l.id_conjunto_v3,l.id_grupo_parcela,l.id_lancamento)=group_id AND r.id_usuario_responsavel=p_usuario AND r.status<>'Cancelado';
  result:=jsonb_build_object('ok',true);
 ELSIF action IN('goal','goals') THEN
  goal_items:=CASE WHEN action='goal' THEN jsonb_build_array(p_request) ELSE p_request->'goals' END;
  IF jsonb_typeof(goal_items) IS DISTINCT FROM 'array' OR jsonb_array_length(goal_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
  PERFORM 1 FROM public.usuarios WHERE id_usuario=p_usuario FOR UPDATE;
  FOR goal_item IN SELECT value FROM jsonb_array_elements(goal_items) LOOP
   category:=(goal_item->>'category')::uuid;
   IF goal_item->>'amountCents' IS NULL OR goal_item->>'amountCents' !~ '^(0|[1-9][0-9]{0,13})$' THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
   amount:=(goal_item->>'amountCents')::numeric/100;
   IF NOT EXISTS(SELECT 1 FROM public.categorias c WHERE c.id_categoria=category AND c.ativa AND (c.criado_por=p_usuario OR c.global)) THEN RAISE EXCEPTION 'RT:invalid_category';END IF;
   INSERT INTO public.orcamentos(id_usuario,id_categoria,valor_teto,ativo,automatica_v4) VALUES(p_usuario,category,amount,amount>0,false) ON CONFLICT(id_usuario,id_categoria) DO UPDATE SET valor_teto=EXCLUDED.valor_teto,ativo=EXCLUDED.ativo,automatica_v4=false,updated_at=now();
  END LOOP;
  FOR parent IN SELECT DISTINCT COALESCE(c.id_categoria_pai,c.id_categoria) FROM public.categorias c WHERE c.id_categoria IN(SELECT (v->>'category')::uuid FROM jsonb_array_elements(goal_items) v) LOOP
   SELECT c.tipo INTO nature FROM public.categorias c WHERE c.id_categoria=parent;
   SELECT COALESCE(sum(o.valor_teto),0) INTO total_children FROM public.orcamentos o JOIN public.categorias c USING(id_categoria) WHERE o.id_usuario=p_usuario AND o.ativo AND c.id_categoria_pai=parent;
   SELECT * INTO parentgoal FROM public.orcamentos WHERE id_usuario=p_usuario AND id_categoria=parent;
   IF NOT FOUND OR (NOT parentgoal.ativo AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(goal_items) v WHERE (v->>'category')::uuid=parent)) THEN
    IF total_children>0 THEN INSERT INTO public.orcamentos(id_usuario,id_categoria,valor_teto,ativo,automatica_v4) VALUES(p_usuario,parent,total_children,true,true) ON CONFLICT(id_usuario,id_categoria) DO UPDATE SET valor_teto=EXCLUDED.valor_teto,ativo=true,automatica_v4=true;END IF;
   ELSIF parentgoal.automatica_v4 THEN UPDATE public.orcamentos SET valor_teto=total_children,ativo=total_children>0,updated_at=now() WHERE id_orcamento=parentgoal.id_orcamento;
   ELSIF nature='Despesa' AND parentgoal.valor_teto<total_children THEN RAISE EXCEPTION 'RT:goal_parent';END IF;
  END LOOP;
  result:=jsonb_build_object('ok',true);
 ELSIF action IN('settle','settle-edit','settle-reject','settle-remove') THEN
  uid:=(p_request->>'id')::uuid;IF uid IS NULL THEN RAISE EXCEPTION 'RT:invalid_request';END IF;side:=p_request->>'side';
  SELECT * INTO a FROM public.acertos_rateios WHERE id_acerto_rateio=uid;existe:=FOUND;
  IF existe THEN
   IF p_usuario NOT IN(a.id_usuario_devedor,a.id_usuario_credor) THEN RAISE EXCEPTION 'RT:forbidden';END IF;
   other:=CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END;
  ELSE other:=(p_request->>'other')::uuid;END IF;
  IF other IS NULL OR other=p_usuario OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=other) THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
  PERFORM mukirana_rateios.lock_par(p_usuario,other);
  SELECT * INTO a FROM public.acertos_rateios WHERE id_acerto_rateio=uid FOR UPDATE;existe:=FOUND;
  IF existe THEN
   IF a.versao_v4 IS DISTINCT FROM (p_request->>'version')::integer OR a.modalidade<>'Liquidacao' THEN RAISE EXCEPTION 'RT:conflict';END IF;
   IF side IS NOT NULL AND side<>(CASE WHEN a.id_usuario_devedor=p_usuario THEN 'pay' ELSE 'receive' END) THEN RAISE EXCEPTION 'RT:forbidden';END IF;
   side:=CASE WHEN a.id_usuario_devedor=p_usuario THEN 'pay' ELSE 'receive' END;
  ELSIF action<>'settle' OR (p_request->>'version')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'RT:conflict';END IF;
  IF action='settle-reject' THEN
   IF a.id_usuario_credor<>p_usuario OR a.status<>'Aguardando_Credor' OR length(btrim(COALESCE(p_request->>'reason',''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
   UPDATE public.acertos_rateios SET status='Rejeitado',motivo_recusa_v4=btrim(p_request->>'reason'),alterado_por_id=p_usuario WHERE id_acerto_rateio=uid;
  ELSIF action='settle-remove' THEN
   IF a.id_usuario_devedor<>p_usuario OR a.status NOT IN('Aguardando_Credor','Rejeitado') OR a.id_lancamento_recebimento IS NOT NULL OR a.id_lancamento_pagamento IS NULL THEN RAISE EXCEPTION 'RT:registered_both';END IF;
   entry_id:=a.id_lancamento_pagamento;
   PERFORM set_config('mukirana_rateios.writing','yes',true);
   UPDATE public.acertos_rateios SET status='Cancelado',id_lancamento_pagamento=NULL,id_conta_devedor=NULL,forma_devedor=NULL,alterado_por_id=p_usuario WHERE id_acerto_rateio=uid;
   DELETE FROM public.lancamentos WHERE id_lancamento=entry_id AND criado_por_id=p_usuario;
  ELSE
   PERFORM set_config('mukirana_rateios.writing','yes',true);
   IF side NOT IN('pay','receive') OR side IS NULL OR p_request->>'amountCents' IS NULL OR p_request->>'amountCents' !~ '^[1-9][0-9]{0,13}$' THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
   amount:=(p_request->>'amountCents')::numeric/100;date_value:=(p_request->>'date')::date;
   IF date_value IS NULL OR date_value>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'RT:future_payment';END IF;
   IF existe AND action='settle' THEN
    IF a.status NOT IN('Aguardando_Credor','Efetivado') OR a.valor<>amount OR (side='pay' AND (a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL)) OR (side='receive' AND (a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento')) THEN RAISE EXCEPTION 'RT:conflict';END IF;
   ELSE
    IF action='settle-edit' AND (a.id_usuario_devedor<>p_usuario OR a.status NOT IN('Aguardando_Credor','Rejeitado') OR a.id_lancamento_recebimento IS NOT NULL OR a.id_lancamento_pagamento IS NULL) THEN RAISE EXCEPTION 'RT:registered_both';END IF;
    maximum:=greatest(0,CASE WHEN side='pay' THEN -mukirana_rateios.saldo(p_usuario,other,NULL) ELSE mukirana_rateios.saldo(p_usuario,other,NULL) END);
    IF action='settle-edit' AND a.status='Aguardando_Credor' THEN maximum:=maximum+a.valor;END IF;
    IF amount>maximum THEN RAISE EXCEPTION 'RT:debt_limit';END IF;
   END IF;
   -- A fatura já tem os dois efeitos financeiros; o titular só reconhece o vínculo.
   IF NOT existe AND side='pay' AND NULLIF(p_request->>'existingInvoice','') IS NOT NULL THEN
    SELECT p.* INTO f FROM public.pagamentos_faturas p JOIN public.grupos_cartoes g USING(id_grupo_cartao) JOIN public.contas c USING(id_conta) WHERE p.id_pagamento_fatura=(p_request->>'existingInvoice')::uuid AND p.criado_por_id=p_usuario AND c.id_usuario=p_usuario AND g.id_titular=other AND p.valor=amount AND p.status='Efetivado' AND p.data_pagamento=date_value FOR UPDATE OF p;
    IF NOT FOUND OR EXISTS(SELECT 1 FROM public.acertos_rateios WHERE id_pagamento_fatura=f.id_pagamento_fatura) THEN RAISE EXCEPTION 'RT:invalid_existing';END IF;
    INSERT INTO public.acertos_rateios(id_acerto_rateio,mes_referencia,id_usuario_devedor,id_usuario_credor,valor,data_pagamento,modalidade,status,forma_devedor,id_conta_devedor,id_pagamento_fatura,criado_por_id)
    VALUES(uid,date_trunc('month',date_value)::date,p_usuario,other,amount,date_value,'Liquidacao','Aguardando_Credor','Fatura',f.id_conta,f.id_pagamento_fatura,p_usuario);
   ELSIF existe AND side='receive' AND a.id_pagamento_fatura IS NOT NULL AND (p_request->>'invoiceExisting')::boolean IS TRUE THEN
    UPDATE public.acertos_rateios SET forma_credor='Sem_Movimento',status='Efetivado',data_recebimento=date_value,alterado_por_id=p_usuario WHERE id_acerto_rateio=uid;
   ELSE
    IF action='settle-edit' AND NULLIF(p_request->>'existingEntry','') IS NOT NULL THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
    IF NULLIF(p_request->>'existingInvoice','') IS NOT NULL THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
    account:=(p_request->>'account')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.contas c WHERE c.id_conta=account AND c.id_usuario=p_usuario AND c.ativa AND c.id_grupo_cartao_v3 IS NULL) THEN RAISE EXCEPTION 'RT:invalid_account';END IF;
    IF NULLIF(p_request->>'existingEntry','') IS NOT NULL THEN
     entry_id:=(p_request->>'existingEntry')::uuid;
     SELECT * INTO entry FROM public.lancamentos WHERE id_lancamento=entry_id FOR UPDATE;
     IF NOT FOUND OR entry.criado_por_id<>p_usuario OR entry.tipo_origem<>'Conta' OR entry.id_origem<>account OR entry.tipo<>(CASE WHEN side='pay' THEN 'Despesa' ELSE 'Receita' END) OR entry.valor_total<>amount OR entry.status<>'Efetivado' OR entry.id_conta_saldo_inicial IS NOT NULL OR entry.data_ocorrencia<>date_value OR EXISTS(SELECT 1 FROM public.rateios WHERE id_lancamento=entry_id AND status<>'Cancelado') OR EXISTS(SELECT 1 FROM public.acertos_rateios WHERE entry_id IN(id_lancamento_pagamento,id_lancamento_recebimento)) THEN RAISE EXCEPTION 'RT:invalid_existing';END IF;
    ELSIF action='settle-edit' THEN
     entry_id:=a.id_lancamento_pagamento;
     UPDATE public.lancamentos SET valor_total=amount,data_ocorrencia=date_value,mes_referencia=date_trunc('month',date_value)::date,id_origem=account,alterado_por_id=p_usuario,updated_at=now() WHERE id_lancamento=entry_id AND criado_por_id=p_usuario;
     IF NOT FOUND THEN RAISE EXCEPTION 'RT:forbidden';END IF;
    ELSE
     entry_id:=(p_request->>'entryId')::uuid;
     IF entry_id IS NULL OR EXISTS(SELECT 1 FROM public.lancamentos WHERE id_lancamento=entry_id) THEN RAISE EXCEPTION 'RT:conflict';END IF;
     INSERT INTO public.lancamentos(id_lancamento,tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id,classificacao_v3)
     VALUES(entry_id,CASE WHEN side='pay' THEN 'Despesa' ELSE 'Receita' END,'Acerto de rateio '||CASE WHEN side='pay' THEN 'para ' ELSE 'de ' END||(SELECT nome FROM public.usuarios WHERE id_usuario=other),amount,date_value,date_trunc('month',date_value)::date,'Conta',account,'Efetivado',p_usuario,'variable');
    END IF;
    IF NOT existe THEN
     INSERT INTO public.acertos_rateios(id_acerto_rateio,mes_referencia,id_usuario_devedor,id_usuario_credor,valor,data_pagamento,data_recebimento,modalidade,status,forma_devedor,forma_credor,id_conta_devedor,id_conta_credor,id_lancamento_pagamento,id_lancamento_recebimento,ids_rateios,criado_por_id)
     VALUES(uid,date_trunc('month',date_value)::date,CASE WHEN side='pay' THEN p_usuario ELSE other END,CASE WHEN side='pay' THEN other ELSE p_usuario END,amount,CASE WHEN side='pay' THEN date_value END,CASE WHEN side='receive' THEN date_value END,'Liquidacao',CASE WHEN side='pay' THEN 'Aguardando_Credor' ELSE 'Efetivado' END,CASE WHEN side='pay' THEN CASE WHEN NULLIF(p_request->>'existingEntry','') IS NULL THEN 'Novo' ELSE 'Existente' END END,CASE WHEN side='receive' THEN CASE WHEN NULLIF(p_request->>'existingEntry','') IS NULL THEN 'Novo' ELSE 'Existente' END END,CASE WHEN side='pay' THEN account END,CASE WHEN side='receive' THEN account END,CASE WHEN side='pay' THEN entry_id END,CASE WHEN side='receive' THEN entry_id END,'{}',p_usuario);
    ELSIF side='pay' THEN
     UPDATE public.acertos_rateios SET valor=amount,id_conta_devedor=account,id_lancamento_pagamento=entry_id,forma_devedor=CASE WHEN NULLIF(p_request->>'existingEntry','') IS NULL THEN 'Novo' ELSE 'Existente' END,data_pagamento=date_value,status=CASE WHEN id_lancamento_recebimento IS NULL THEN 'Aguardando_Credor' ELSE 'Efetivado' END,motivo_recusa_v4=NULL,alterado_por_id=p_usuario WHERE id_acerto_rateio=uid;
    ELSE
     UPDATE public.acertos_rateios SET id_conta_credor=account,id_lancamento_recebimento=entry_id,forma_credor=CASE WHEN NULLIF(p_request->>'existingEntry','') IS NULL THEN 'Novo' ELSE 'Existente' END,data_recebimento=date_value,status='Efetivado',alterado_por_id=p_usuario WHERE id_acerto_rateio=uid;
    END IF;
   END IF;
  END IF;
  SELECT * INTO a FROM public.acertos_rateios WHERE id_acerto_rateio=uid;result:=jsonb_build_object('settlement',mukirana_rateios.acerto_dto(a,p_usuario));
 ELSE RAISE EXCEPTION 'RT:invalid_request';END IF;
 PERFORM set_config('mukirana_rateios.writing','',true);
 INSERT INTO mukirana_rateios.operacoes VALUES(p_usuario,p_operacao,md5(p_request::text),result);RETURN result;
END $$;
CREATE FUNCTION public.rpc_painel_metas_v4(p_usuario uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN PERFORM mukirana_contas.validar_usuario(p_usuario);SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id_orcamento,'category',o.id_categoria,'amountCents',(o.valor_teto*100)::numeric(20,0)::text,'automatic',o.automatica_v4)),'[]') INTO result FROM public.orcamentos o WHERE o.id_usuario=p_usuario AND o.ativo;RETURN result;END $$;

-- Bloqueios também protegem os caminhos legados ainda usados por módulos auxiliares.
CREATE FUNCTION mukirana_rateios.proteger_movimento() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE OLD.id_lancamento IN(a.id_lancamento_pagamento,a.id_lancamento_recebimento)) AND COALESCE(current_setting('mukirana_rateios.writing',true),'')<>'yes' THEN RAISE EXCEPTION 'RT:linked_settlement';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER lancamentos_proteger_acertos_v4 BEFORE UPDATE OR DELETE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION mukirana_rateios.proteger_movimento();

ALTER TABLE mukirana_rateios.operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mukirana_rateios.convites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mukirana_rateios FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA mukirana_rateios TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_rateios FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_rateios TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_lancamentos FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_lancamentos TO service_role;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('rpc_rateios_contexto_v4','rpc_rateios_mutar_v4','rpc_painel_metas_v4','rpc_lancamentos_listar_v3','rpc_lancamentos_listar_contas_v3') LOOP EXECUTE 'REVOKE EXECUTE ON FUNCTION '||f.sig||' FROM PUBLIC,anon,authenticated';EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO service_role';END LOOP;
END $$;
DO $$ BEGIN
 IF (SELECT lancamentos FROM rateios_v4_snapshot) IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) OR
 EXISTS(SELECT 1 FROM public.rateios r WHERE ((SELECT rateios FROM rateios_v4_snapshot)->r.id_rateio::text) IS DISTINCT FROM (to_jsonb(r)-ARRAY['id_categoria_v4','versao_v4'])) OR
 EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE ((SELECT acertos FROM rateios_v4_snapshot)->a.id_acerto_rateio::text) IS DISTINCT FROM (to_jsonb(a)-ARRAY['versao_v4','motivo_recusa_v4'])) OR
 EXISTS(SELECT 1 FROM public.orcamentos o WHERE ((SELECT metas FROM rateios_v4_snapshot)->o.id_orcamento::text) IS DISTINCT FROM (to_jsonb(o)-'automatica_v4')) THEN RAISE EXCEPTION 'RT:preservation_failed';END IF;
END $$;
NOTIFY pgrst,'reload schema';
