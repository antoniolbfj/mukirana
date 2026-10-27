-- Confirma pagamentos no mesmo acerto e impede receitas independentes repetidas.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
LOCK TABLE public.lancamentos,public.rateios,public.pagamentos_faturas,public.contas,public.acertos_rateios IN SHARE MODE;
CREATE TEMP TABLE mk_rateios_v13_preservacao ON COMMIT DROP AS SELECT jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)) AS hashes;
CREATE OR REPLACE FUNCTION public.rpc_rateios_mutar_v4(p_usuario uuid,p_operacao uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
   -- Uma ponta já enviada deve ser confirmada no mesmo acerto. O lock do par
   -- serializa inclusive sessões antigas e operações simultâneas com IDs novos.
   IF NOT existe AND NULLIF(p_request->>'existingInvoice','') IS NULL AND EXISTS(
    SELECT 1 FROM public.acertos_rateios pending
    WHERE pending.modalidade='Liquidacao' AND pending.valor=amount AND pending.status IN('Aguardando_Credor','Efetivado')
     AND ((side='receive' AND pending.id_usuario_credor=p_usuario AND pending.id_usuario_devedor=other
       AND (pending.id_lancamento_pagamento IS NOT NULL OR pending.id_pagamento_fatura IS NOT NULL)
       AND pending.id_lancamento_recebimento IS NULL AND pending.forma_credor IS DISTINCT FROM 'Sem_Movimento')
      OR (side='pay' AND pending.id_usuario_devedor=p_usuario AND pending.id_usuario_credor=other
       AND pending.id_lancamento_pagamento IS NULL AND pending.id_pagamento_fatura IS NULL
       AND (pending.id_lancamento_recebimento IS NOT NULL OR pending.forma_credor='Sem_Movimento')))
   ) THEN RAISE EXCEPTION 'RT:pending_settlement';END IF;
   -- Depois do aceite, um novo Receber com o mesmo valor/data/conta também não
   -- pode criar outra receita. Pagamentos distintos podem ser confirmados pelo
   -- seu ID; um lançamento financeiro existente distinto continua vinculável.
   IF NOT existe AND side='receive' AND NULLIF(p_request->>'existingEntry','') IS NULL AND EXISTS(
    SELECT 1 FROM public.acertos_rateios received
    WHERE received.id_usuario_credor=p_usuario AND received.id_usuario_devedor=other
     AND received.modalidade='Liquidacao' AND received.status='Efetivado'
     AND received.id_lancamento_recebimento IS NOT NULL AND received.valor=amount
     AND received.data_recebimento=date_value AND received.id_conta_credor=(p_request->>'account')::uuid
   ) THEN RAISE EXCEPTION 'RT:duplicate_receipt';END IF;
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
   ELSIF existe AND side='receive' AND a.id_pagamento_fatura IS NOT NULL THEN
    IF (p_request->>'invoiceExisting')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
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
REVOKE EXECUTE ON FUNCTION public.rpc_rateios_mutar_v4(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rateios_mutar_v4(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
DO $$ BEGIN ASSERT (SELECT hashes FROM mk_rateios_v13_preservacao) IS NOT DISTINCT FROM jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)),'Histórico financeiro alterado';END $$;
