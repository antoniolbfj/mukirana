-- Uma conta por grupo de cartões, sem copiar compras ou pagamentos.
CREATE TEMP TABLE contas_v3_preservacao ON COMMIT DROP AS SELECT
 (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) ledger_hash,
 (SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas p) payments_hash,
 (SELECT jsonb_object_agg(id_conta,to_jsonb(c)) FROM public.contas c) accounts;
ALTER TABLE public.contas DROP CONSTRAINT contas_tipo_conta_v3_check;
ALTER TABLE public.contas ADD COLUMN id_grupo_cartao_v3 uuid UNIQUE REFERENCES public.grupos_cartoes(id_grupo_cartao) ON DELETE RESTRICT;
ALTER TABLE public.contas ADD CONSTRAINT contas_tipo_conta_v3_check CHECK(tipo_conta_v3 IN('Consumo','Investimento','Cartão de Crédito'));
ALTER TABLE public.contas ADD CONSTRAINT contas_credito_vinculado_v3 CHECK(tipo_conta_v3<>'Cartão de Crédito' OR id_grupo_cartao_v3 IS NOT NULL);
CREATE TABLE mukirana_contas.operacoes_v3(id_usuario uuid NOT NULL REFERENCES public.usuarios,id uuid NOT NULL,assinatura text NOT NULL,resposta jsonb NOT NULL,PRIMARY KEY(id_usuario,id));
ALTER TABLE mukirana_contas.operacoes_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mukirana_contas.operacoes_v3 FROM PUBLIC,anon,authenticated;
GRANT ALL ON mukirana_contas.operacoes_v3 TO service_role;

CREATE FUNCTION mukirana_contas.vincular_credito_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE conta uuid;rotulo text;
BEGIN
 IF COALESCE(current_setting('mukirana_contas.deleting_credit',true),'')='1' THEN RETURN NEW;END IF;
 SELECT id_conta INTO conta FROM public.contas WHERE id_grupo_cartao_v3=NEW.id_grupo_cartao;
 IF conta IS NULL THEN
  rotulo:=NEW.nome_grupo;
  IF EXISTS(SELECT 1 FROM public.contas WHERE id_usuario=NEW.id_titular AND lower(nome_conta)=lower(rotulo)) THEN
   rotulo:=left(NEW.nome_grupo,110)||' · Cartão '||left(NEW.id_grupo_cartao::text,8);
  END IF;
  INSERT INTO public.contas(id_usuario,nome_conta,tipo_conta_v3,id_grupo_cartao_v3,ativa,saldo_inicial,saldo_inicial_data)
  VALUES(NEW.id_titular,rotulo,'Cartão de Crédito',NEW.id_grupo_cartao,NEW.ativo,0,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
 ELSIF TG_OP='UPDATE' THEN
  UPDATE public.contas SET ativa=NEW.ativo,
   nome_conta=CASE WHEN nome_conta=OLD.nome_grupo THEN NEW.nome_grupo ELSE nome_conta END
  WHERE id_conta=conta AND (ativa IS DISTINCT FROM NEW.ativo OR (nome_conta=OLD.nome_grupo AND NEW.nome_grupo<>OLD.nome_grupo));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grupos_vincular_credito_v3 AFTER INSERT OR UPDATE ON public.grupos_cartoes FOR EACH ROW EXECUTE FUNCTION mukirana_contas.vincular_credito_v3();
-- IDs de contas gerados pelo banco; nenhum ID financeiro é duplicado ou substituído.
INSERT INTO public.contas(id_usuario,nome_conta,tipo_conta_v3,id_grupo_cartao_v3,ativa,saldo_inicial,saldo_inicial_data)
 SELECT g.id_titular,CASE WHEN EXISTS(SELECT 1 FROM public.contas c WHERE c.id_usuario=g.id_titular AND lower(c.nome_conta)=lower(g.nome_grupo)) THEN left(g.nome_grupo,110)||' · Cartão '||left(g.id_grupo_cartao::text,8) ELSE g.nome_grupo END,
 'Cartão de Crédito',g.id_grupo_cartao,g.ativo,0,(now() AT TIME ZONE 'America/Sao_Paulo')::date FROM public.grupos_cartoes g;

CREATE FUNCTION mukirana_contas.sincronizar_status_credito_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id_grupo_cartao_v3 IS NOT NULL AND NEW.ativa IS DISTINCT FROM OLD.ativa THEN UPDATE public.grupos_cartoes SET ativo=NEW.ativa WHERE id_grupo_cartao=NEW.id_grupo_cartao_v3 AND ativo IS DISTINCT FROM NEW.ativa;END IF;RETURN NEW;
END $$;
CREATE TRIGGER contas_status_credito_v3 AFTER UPDATE ON public.contas FOR EACH ROW EXECUTE FUNCTION mukirana_contas.sincronizar_status_credito_v3();
CREATE FUNCTION mukirana_contas.tem_movimentos_v3(c public.contas) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.lancamentos l WHERE (l.tipo_origem='Conta' AND l.id_origem=c.id_conta) OR l.id_destino=c.id_conta OR (l.tipo_origem='Cartão' AND EXISTS(SELECT 1 FROM public.cartoes k WHERE k.id_cartao=l.id_origem AND k.id_grupo_cartao=c.id_grupo_cartao_v3))) OR EXISTS(SELECT 1 FROM public.pagamentos_faturas f WHERE f.id_conta=c.id_conta OR f.id_grupo_cartao=c.id_grupo_cartao_v3);
$$;
CREATE FUNCTION mukirana_contas.tem_vinculos_v3(c public.contas) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.recorrencias r WHERE (r.tipo_origem='Conta' AND r.id_origem=c.id_conta) OR r.id_destino=c.id_conta OR (r.tipo_origem='Cartão' AND EXISTS(SELECT 1 FROM public.cartoes k WHERE k.id_cartao=r.id_origem AND k.id_grupo_cartao=c.id_grupo_cartao_v3))) OR EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE a.id_conta_devedor=c.id_conta OR a.id_conta_credor=c.id_conta);
$$;
CREATE FUNCTION mukirana_contas.proteger_exclusao_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF mukirana_contas.tem_movimentos_v3(OLD) THEN RAISE EXCEPTION 'CN:has_movements';END IF;
 IF mukirana_contas.tem_vinculos_v3(OLD) THEN RAISE EXCEPTION 'CN:in_use';END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER contas_proteger_exclusao_v3 BEFORE DELETE ON public.contas FOR EACH ROW EXECUTE FUNCTION mukirana_contas.proteger_exclusao_v3();
CREATE FUNCTION mukirana_contas.validar_vinculo_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.id_grupo_cartao_v3 IS DISTINCT FROM OLD.id_grupo_cartao_v3 THEN RAISE EXCEPTION 'CN:immutable_link';END IF;
 IF NEW.id_grupo_cartao_v3 IS NOT NULL AND (NEW.compartilhada OR NOT EXISTS(SELECT 1 FROM public.grupos_cartoes g WHERE g.id_grupo_cartao=NEW.id_grupo_cartao_v3 AND g.id_titular=NEW.id_usuario)) THEN RAISE EXCEPTION 'CN:invalid_credit_link';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contas_validar_vinculo_v3 BEFORE INSERT OR UPDATE ON public.contas FOR EACH ROW EXECUTE FUNCTION mukirana_contas.validar_vinculo_v3();

-- Conta bancária compartilhada conserva a visibilidade homologada. Crédito só
-- aparece integralmente para o titular; adicionais continuam em Cartões.
CREATE FUNCTION mukirana_contas.movimentos_v3(p_usuario uuid,p_contas uuid[])
RETURNS TABLE(chave text,id uuid,conta uuid,data date,descricao text,tipo text,delta numeric,especial boolean,status text)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH acessiveis AS(SELECT * FROM mukirana_contas.acessiveis(p_usuario) WHERE id_conta=ANY(p_contas) AND (id_grupo_cartao_v3 IS NULL OR id_usuario=p_usuario))
 SELECT 'l:'||l.id_lancamento,l.id_lancamento,c.id_conta,l.data_ocorrencia,l.descricao,l.tipo,
 CASE WHEN l.tipo IN('Saldo Inicial','Receita') THEN l.valor_total WHEN l.tipo='Despesa' THEN -l.valor_total WHEN l.id_origem=c.id_conta THEN -l.valor_total ELSE l.valor_total END,l.tipo='Saldo Inicial',l.status
 FROM public.lancamentos l JOIN acessiveis c ON ((l.tipo_origem='Conta' AND l.id_origem=c.id_conta) OR (l.tipo='Transferência' AND l.id_destino=c.id_conta) OR (l.tipo_origem='Cartão' AND EXISTS(SELECT 1 FROM public.cartoes k WHERE k.id_cartao=l.id_origem AND k.id_grupo_cartao=c.id_grupo_cartao_v3)))
 WHERE l.tipo='Saldo Inicial' OR l.criado_por_id=p_usuario OR c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento AND (r.id_usuario_responsavel=p_usuario OR r.id_usuario_credor=p_usuario) AND r.status<>'Cancelado')
 UNION ALL SELECT 'f:'||f.id_pagamento_fatura,f.id_pagamento_fatura,c.id_conta,f.data_pagamento,COALESCE(f.observacao,'Pagamento de fatura'),'Transferência',CASE WHEN f.id_conta=c.id_conta THEN -f.valor ELSE f.valor END,false,f.status
 FROM public.pagamentos_faturas f JOIN acessiveis c ON f.id_conta=c.id_conta OR f.id_grupo_cartao=c.id_grupo_cartao_v3;
$$;
-- Compatibilidade da tela homologada: os novos vínculos também têm saldo derivado.
CREATE OR REPLACE FUNCTION mukirana_contas.movimentos(p_usuario uuid,p_contas uuid[])
RETURNS TABLE(chave text,id uuid,conta uuid,data date,descricao text,tipo text,delta numeric,especial boolean)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT chave,id,conta,data,descricao,CASE WHEN chave LIKE 'f:%' THEN 'Pagamento de fatura' ELSE tipo END,delta,especial FROM mukirana_contas.movimentos_v3(p_usuario,p_contas);
$$;
CREATE FUNCTION public.rpc_contas_listar_v3(p_usuario uuid,p_inicio date,p_fim date,p_hoje date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_hoje IS NULL OR p_hoje<>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR p_fim IS NULL OR (p_inicio IS NOT NULL AND p_inicio>p_fim) THEN RAISE EXCEPTION 'CN:invalid_request';END IF;
 WITH contas AS MATERIALIZED(SELECT * FROM mukirana_contas.acessiveis(p_usuario) WHERE id_grupo_cartao_v3 IS NULL OR id_usuario=p_usuario),
 mov AS(SELECT * FROM mukirana_contas.movimentos_v3(p_usuario,ARRAY(SELECT id_conta FROM contas))),
 totais AS(SELECT conta,sum(delta) FILTER(WHERE data<=p_hoje AND status='Efetivado') atual,sum(delta) FILTER(WHERE data<=p_fim) futuro,sum(delta) FILTER(WHERE (p_inicio IS NULL OR data>=p_inicio) AND data<=p_fim) movimento FROM mov GROUP BY conta)
 SELECT COALESCE(jsonb_agg(mukirana_contas.dto(c,p_usuario)||jsonb_build_object('type',c.tipo_conta_v3,'linkedGroup',c.id_grupo_cartao_v3,'canDelete',c.id_usuario=p_usuario AND NOT mukirana_contas.tem_movimentos_v3(c) AND NOT mukirana_contas.tem_vinculos_v3(c),'hasMovements',mukirana_contas.tem_movimentos_v3(c),'currentCents',(COALESCE(t.atual,0)*100)::numeric(30,0)::text,'registeredForecastCents',(COALESCE(t.futuro,0)*100)::numeric(30,0)::text,'periodCents',(COALESCE(t.movimento,0)*100)::numeric(30,0)::text) ORDER BY c.nome_conta),'[]') INTO result FROM contas c LEFT JOIN totais t ON t.conta=c.id_conta;
 RETURN jsonb_build_object('accounts',result,'today',p_hoje,'forecastDate',p_fim,'periodStart',p_inicio);
END $$;
CREATE FUNCTION public.rpc_contas_mutar_v3(p_usuario uuid,p_operacao uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.contas;o mukirana_contas.operacoes_v3;result jsonb;action text:=p_request->>'action';t text:=p_request->>'type';gid uuid;flag text;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);PERFORM 1 FROM public.usuarios WHERE id_usuario=p_usuario FOR UPDATE;
 IF p_operacao IS NULL THEN RAISE EXCEPTION 'CN:invalid_request';END IF;
 SELECT * INTO o FROM mukirana_contas.operacoes_v3 WHERE id_usuario=p_usuario AND id=p_operacao;
 IF FOUND THEN IF o.assinatura<>md5(p_request::text) THEN RAISE EXCEPTION 'CN:conflict';END IF;RETURN o.resposta;END IF;
 SELECT * INTO c FROM public.contas WHERE id_conta=(p_request->>'id')::uuid FOR UPDATE;
 IF FOUND AND c.id_usuario<>p_usuario THEN RAISE EXCEPTION 'CN:forbidden';END IF;
 IF action='save' THEN
  IF t NOT IN('Consumo','Investimento','Cartão de Crédito') THEN RAISE EXCEPTION 'CN:invalid_request';END IF;
  IF t='Cartão de Crédito' AND c.id_grupo_cartao_v3 IS NULL THEN RAISE EXCEPTION 'CN:select_existing_card';END IF;
  IF c.id_conta IS NOT NULL AND c.tipo_conta_v3<>t AND p_request->'acknowledgeTypeChange' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CN:type_confirmation';END IF;
  result:=public.rpc_contas_salvar_v2(p_usuario,(p_request->>'id')::uuid,(p_request->>'version')::integer,p_operacao,p_request->>'name',(p_request->>'openingAmountCents')::bigint,(p_request->>'openingDate')::date,(p_request->>'shared')::boolean,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_request->'participants')));
  UPDATE public.contas SET tipo_conta_v3=t WHERE id_conta=(p_request->>'id')::uuid AND tipo_conta_v3<>t;
  SELECT * INTO c FROM public.contas WHERE id_conta=(p_request->>'id')::uuid;
  result:=jsonb_build_object('account',mukirana_contas.dto(c,p_usuario)||jsonb_build_object('type',c.tipo_conta_v3,'linkedGroup',c.id_grupo_cartao_v3));
 ELSIF action='status' THEN
  IF c.id_grupo_cartao_v3 IS NOT NULL THEN
   IF c.versao<>(p_request->>'version')::integer THEN RAISE EXCEPTION 'CN:conflict';END IF;
   UPDATE public.grupos_cartoes SET ativo=(p_request->>'active')::boolean WHERE id_grupo_cartao=c.id_grupo_cartao_v3;
   SELECT * INTO c FROM public.contas WHERE id_conta=c.id_conta;
   result:=jsonb_build_object('account',mukirana_contas.dto(c,p_usuario)||jsonb_build_object('type',c.tipo_conta_v3,'linkedGroup',c.id_grupo_cartao_v3));
  ELSE result:=public.rpc_contas_status_v2(p_usuario,c.id_conta,(p_request->>'version')::integer,p_operacao,(p_request->>'active')::boolean);END IF;
 ELSIF action='delete' THEN
  IF c.id_conta IS NULL OR c.versao<>(p_request->>'version')::integer THEN RAISE EXCEPTION 'CN:conflict';END IF;
  gid:=c.id_grupo_cartao_v3;flag:=COALESCE(current_setting('mukirana_contas.deleting_credit',true),'');PERFORM set_config('mukirana_contas.deleting_credit','1',true);
  DELETE FROM public.contas WHERE id_conta=c.id_conta;
  IF gid IS NOT NULL THEN DELETE FROM public.cartoes WHERE id_grupo_cartao=gid;DELETE FROM public.grupos_cartoes WHERE id_grupo_cartao=gid;END IF;
  PERFORM set_config('mukirana_contas.deleting_credit',flag,true);result:=jsonb_build_object('deleted',true);
 ELSE RAISE EXCEPTION 'CN:invalid_request';END IF;
 INSERT INTO mukirana_contas.operacoes_v3 VALUES(p_usuario,p_operacao,md5(p_request::text),result);RETURN result;
END $$;
CREATE FUNCTION public.rpc_contas_remover_saldo_v3(p_usuario uuid,p_operacao uuid,p_lancamento uuid,p_versao integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.lancamentos;o mukirana_contas.operacoes_v3;sig text:=md5(jsonb_build_array('opening-delete',p_lancamento,p_versao)::text);result jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);PERFORM 1 FROM public.usuarios WHERE id_usuario=p_usuario FOR UPDATE;
 SELECT * INTO o FROM mukirana_contas.operacoes_v3 WHERE id_usuario=p_usuario AND id=p_operacao;
 IF FOUND THEN IF o.assinatura<>sig THEN RAISE EXCEPTION 'CN:conflict';END IF;RETURN o.resposta;END IF;
 SELECT * INTO l FROM public.lancamentos WHERE id_lancamento=p_lancamento FOR UPDATE;
 IF l.id_conta_saldo_inicial IS NULL OR l.versao_v3<>p_versao THEN RAISE EXCEPTION 'CN:conflict';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contas WHERE id_conta=l.id_conta_saldo_inicial AND id_usuario=p_usuario) THEN RAISE EXCEPTION 'CN:forbidden';END IF;
 UPDATE public.contas SET saldo_inicial=0 WHERE id_conta=l.id_conta_saldo_inicial;
 result:=jsonb_build_object('count',1,'clearedOpening',true);INSERT INTO mukirana_contas.operacoes_v3 VALUES(p_usuario,p_operacao,sig,result);RETURN result;
END $$;
CREATE FUNCTION public.rpc_contas_movimentos_v3(p_usuario uuid,p_conta uuid,p_antes_data date DEFAULT NULL,p_antes_chave text DEFAULT NULL,p_limite integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE linhas jsonb; proximo jsonb; total integer;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF NOT EXISTS(SELECT 1 FROM mukirana_contas.acessiveis(p_usuario) WHERE id_conta=p_conta) THEN RAISE EXCEPTION 'CN:forbidden'; END IF;
 IF p_limite IS NULL OR p_limite<1 OR p_limite>100 OR ((p_antes_data IS NULL)<>(p_antes_chave IS NULL)) THEN RAISE EXCEPTION 'CN:invalid_request'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('key',m.chave,'id',m.id,'date',m.data,'description',m.descricao,
  'type',m.tipo,'amountCents',(m.delta*100)::numeric(30,0)::text,'opening',m.especial,'status',m.status) ORDER BY m.data DESC,m.chave DESC),'[]'::jsonb)
 INTO linhas FROM (SELECT * FROM mukirana_contas.movimentos_v3(p_usuario,ARRAY[p_conta])
  WHERE p_antes_data IS NULL OR (data,chave)<(p_antes_data,p_antes_chave) ORDER BY data DESC,chave DESC LIMIT p_limite+1) m;
 total:=jsonb_array_length(linhas);
 IF total>p_limite THEN
  linhas:=linhas-(total-1);
  proximo:=jsonb_build_object('date',linhas->(p_limite-1)->>'date','key',linhas->(p_limite-1)->>'key');
 END IF;
 RETURN jsonb_build_object('items',linhas,'nextCursor',proximo);
END $$;


CREATE OR REPLACE FUNCTION mukirana_cartoes.totais(p_usuario uuid,p_grupo uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH dono AS(SELECT id_titular=p_usuario AS sim FROM public.grupos_cartoes WHERE id_grupo_cartao=p_grupo),
 compras AS(SELECT mes,sum(importe) registrado FROM(
  SELECT l.mes_referencia mes,CASE l.tipo WHEN 'Despesa' THEN l.valor_total WHEN 'Receita' THEN -l.valor_total ELSE 0 END importe FROM mukirana_cartoes.lancamentos(p_usuario,p_grupo) l WHERE (p_inicio IS NULL OR l.mes_referencia>=p_inicio) AND (p_fim IS NULL OR l.mes_referencia<=p_fim)
  UNION ALL SELECT date_trunc('month',c.saldo_inicial_data)::date,-c.saldo_inicial FROM public.contas c WHERE c.id_grupo_cartao_v3=p_grupo AND c.id_usuario=p_usuario AND c.saldo_inicial<>0 AND (p_inicio IS NULL OR date_trunc('month',c.saldo_inicial_data)::date>=p_inicio) AND (p_fim IS NULL OR date_trunc('month',c.saldo_inicial_data)::date<=p_fim)) x GROUP BY mes),
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
CREATE OR REPLACE FUNCTION mukirana_cartoes.dto(g public.grupos_cartoes,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',g.id_grupo_cartao,'version',g.versao,'name',g.nome_grupo,'ownerId',g.id_titular,
  'ownerName',(SELECT nome FROM public.usuarios WHERE id_usuario=g.id_titular),'canEdit',g.id_titular=p_usuario,'active',g.ativo,
  'role',CASE WHEN g.id_titular=p_usuario THEN 'owner' WHEN EXISTS(SELECT 1 FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND c.id_usuario=p_usuario AND c.ativo) THEN 'additional' ELSE 'history' END,
  'limitCents',CASE WHEN g.id_titular=p_usuario THEN (g.limite*100)::numeric(20,0)::text ELSE NULL END,
  'closingDay',g.dia_fechamento,'dueDay',g.dia_vencimento,
  'cardsCount',(SELECT count(*) FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND (g.id_titular=p_usuario OR c.id_usuario=p_usuario OR EXISTS(SELECT 1 FROM public.lancamentos l WHERE l.tipo_origem='Cartão' AND l.id_origem=c.id_cartao AND l.criado_por_id=p_usuario))),
  'participants',CASE WHEN g.id_titular=p_usuario THEN COALESCE((SELECT jsonb_agg(c.id_usuario ORDER BY c.id_usuario) FROM public.cartoes c WHERE c.id_grupo_cartao=g.id_grupo_cartao AND c.tipo_cartao='Adicional' AND c.ativo),'[]'::jsonb) ELSE '[]'::jsonb END)||jsonb_build_object('openingCents',CASE WHEN g.id_titular=p_usuario THEN COALESCE((SELECT (c.saldo_inicial*100)::numeric(20,0)::text FROM public.contas c WHERE c.id_grupo_cartao_v3=g.id_grupo_cartao),'0') ELSE NULL END,'openingDate',CASE WHEN g.id_titular=p_usuario THEN (SELECT c.saldo_inicial_data FROM public.contas c WHERE c.id_grupo_cartao_v3=g.id_grupo_cartao) ELSE NULL END);
$$;
CREATE OR REPLACE FUNCTION public.rpc_cartoes_pagamento_base_v2(p_usuario uuid,p_grupo uuid,p_mes date,p_excluir uuid DEFAULT NULL)
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
 registrado:=registrado-COALESCE((SELECT saldo_inicial FROM public.contas WHERE id_grupo_cartao_v3=p_grupo AND date_trunc('month',saldo_inicial_data)::date=p_mes),0);
 SELECT COALESCE(sum(valor),0) INTO pago FROM public.pagamentos_faturas WHERE id_grupo_cartao=p_grupo AND mes_referencia=p_mes AND status='Efetivado' AND (p_excluir IS NULL OR id_pagamento_fatura<>p_excluir);
 RETURN jsonb_build_object('maxCents',(greatest(0,registrado-pago)*100)::numeric(30,0)::text);
END $$;
-- O mesmo teto vale na tela antiga e no cadastro como transferência. O lock de
-- fatura serializa pagamentos simultâneos sem bloquear cadastros de cartões.
CREATE FUNCTION mukirana_contas.limitar_pagamento_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE gid uuid;reg numeric;paid numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id_grupo_cartao,NEW.valor,NEW.mes_referencia,NEW.status) IS NOT DISTINCT FROM (OLD.id_grupo_cartao,OLD.valor,OLD.mes_referencia,OLD.status) THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contas b WHERE b.id_conta=NEW.id_conta AND b.id_grupo_cartao_v3 IS NULL AND b.tipo_conta_v3='Consumo') THEN RAISE EXCEPTION 'LN:invoice_account';END IF;
 FOR gid IN SELECT DISTINCT x FROM unnest(ARRAY[NEW.id_grupo_cartao,CASE WHEN TG_OP='UPDATE' THEN OLD.id_grupo_cartao ELSE NULL END]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_fatura_pagamento:'||gid::text,0));
 END LOOP;
 SELECT COALESCE(sum(CASE l.tipo WHEN 'Despesa' THEN l.valor_total WHEN 'Receita' THEN -l.valor_total ELSE 0 END),0) INTO reg FROM public.lancamentos l JOIN public.cartoes k ON k.id_cartao=l.id_origem WHERE l.tipo_origem='Cartão' AND k.id_grupo_cartao=NEW.id_grupo_cartao AND l.mes_referencia=NEW.mes_referencia;
 reg:=reg-COALESCE((SELECT saldo_inicial FROM public.contas WHERE id_grupo_cartao_v3=NEW.id_grupo_cartao AND date_trunc('month',saldo_inicial_data)::date=NEW.mes_referencia),0);
 SELECT COALESCE(sum(valor),0) INTO paid FROM public.pagamentos_faturas WHERE id_grupo_cartao=NEW.id_grupo_cartao AND mes_referencia=NEW.mes_referencia AND status='Efetivado' AND id_pagamento_fatura<>NEW.id_pagamento_fatura;
 IF NEW.valor>greatest(0,reg-paid) THEN RAISE EXCEPTION 'LN:invoice_limit';END IF;RETURN NEW;
END $$;
CREATE TRIGGER pagamentos_limitar_v3 BEFORE INSERT OR UPDATE ON public.pagamentos_faturas FOR EACH ROW EXECUTE FUNCTION mukirana_contas.limitar_pagamento_v3();

-- Evita contas órfãs e serializa exclusão contra inserções em origens polimórficas.
CREATE FUNCTION mukirana_contas.integridade_ledger_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.contas;instrument uuid;
BEGIN
 IF NEW.tipo_origem='Conta' THEN
  SELECT * INTO c FROM public.contas WHERE id_conta=NEW.id_origem FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CN:not_found';END IF;
  IF c.id_grupo_cartao_v3 IS NOT NULL AND NEW.tipo IN('Receita','Despesa') THEN
   SELECT id_cartao INTO instrument FROM public.cartoes WHERE id_grupo_cartao=c.id_grupo_cartao_v3 AND tipo_cartao='Titular' ORDER BY ativo DESC,id_cartao LIMIT 1 FOR KEY SHARE;
   IF instrument IS NULL THEN RAISE EXCEPTION 'CN:invalid_credit_link';END IF;
   NEW.tipo_origem:='Cartão';NEW.id_origem:=instrument;
  END IF;
 ELSE
  SELECT * INTO c FROM public.contas WHERE id_grupo_cartao_v3=(SELECT id_grupo_cartao FROM public.cartoes WHERE id_cartao=NEW.id_origem) FOR KEY SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'CN:not_found';END IF;
  PERFORM 1 FROM public.cartoes WHERE id_cartao=NEW.id_origem FOR KEY SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'CN:not_found';END IF;
 END IF;
 IF NEW.tipo='Transferência' AND (c.id_grupo_cartao_v3 IS NOT NULL OR EXISTS(SELECT 1 FROM public.contas WHERE id_conta=NEW.id_destino AND id_grupo_cartao_v3 IS NOT NULL)) THEN RAISE EXCEPTION 'CN:invoice_transfer_required';END IF;
 RETURN NEW;
END $$;
-- Ordena antes da atribuição da competência, quando converte a conta vinculada.
CREATE TRIGGER lancamentos_a_integridade_conta_v3 BEFORE INSERT OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION mukirana_contas.integridade_ledger_v3();
ALTER TABLE public.pagamentos_faturas ADD COLUMN versao_v3 integer NOT NULL DEFAULT 1 CHECK(versao_v3>0);
CREATE FUNCTION mukirana_contas.versionar_pagamento_v3() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id_pagamento_fatura<>OLD.id_pagamento_fatura OR NEW.criado_por_id<>OLD.criado_por_id THEN RAISE EXCEPTION 'CN:immutable';END IF;
 NEW.versao_v3:=OLD.versao_v3+1;RETURN NEW;
END $$;
CREATE TRIGGER pagamentos_versionar_v3 BEFORE UPDATE ON public.pagamentos_faturas FOR EACH ROW EXECUTE FUNCTION mukirana_contas.versionar_pagamento_v3();
CREATE FUNCTION mukirana_contas.pagamento_dto_v3(f public.pagamentos_faturas,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id_pagamento_fatura,'version',f.versao_v3,'description',COALESCE(NULLIF(f.observacao,''),'Pagamento da fatura '||g.nome_grupo),'type','transfer','amountCents',(f.valor*100)::numeric(20,0)::text,'date',f.data_pagamento,'competence',to_char(f.mes_referencia,'YYYY-MM'),'invoiceMonth',to_char(f.mes_referencia,'YYYY-MM'),'sourceKind','Conta','origin',f.id_conta,'destination',c.id_conta,'category',NULL,'project',NULL,'author',f.criado_por_id,'status',CASE WHEN f.status='Efetivado' THEN 'done' ELSE 'pending' END,'classification','variable','group',NULL,'index',0,'mode','single','canEdit',(f.criado_por_id=p_usuario OR g.id_titular=p_usuario) AND mukirana_lancamentos.conta(p_usuario,f.id_conta) AND NOT EXISTS(SELECT 1 FROM public.acertos_rateios a WHERE a.id_pagamento_fatura=f.id_pagamento_fatura AND a.status<>'Cancelado'),'opening',false,'shares','[]'::jsonb,'special','invoice-payment')
 FROM public.grupos_cartoes g JOIN public.contas c ON c.id_grupo_cartao_v3=g.id_grupo_cartao WHERE g.id_grupo_cartao=f.id_grupo_cartao;
$$;
ALTER FUNCTION public.rpc_lancamentos_listar_v3(uuid,date,date) RENAME TO rpc_lancamentos_listar_base_v3;
CREATE FUNCTION public.rpc_lancamentos_listar_v3(p_usuario uuid,p_inicio date,p_fim date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;ac jsonb;payments jsonb;
BEGIN
 IF p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_inicio>p_fim THEN RAISE EXCEPTION 'LN:invalid_period';END IF;
 result:=public.rpc_lancamentos_listar_base_v3(p_usuario,NULL,NULL);
 -- Resultado datado pela ocorrência. A competência persistida permanece exclusiva da fatura.
 result:=result||jsonb_build_object('entries',COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(result->'entries') e WHERE (p_inicio IS NULL OR (e->>'date')::date>=p_inicio) AND (p_fim IS NULL OR (e->>'date')::date<=p_fim)),'[]'::jsonb));
 SELECT COALESCE(jsonb_agg(a||CASE WHEN a->>'kind'='Conta' THEN jsonb_build_object('linkedGroup',c.id_grupo_cartao_v3,'canPay',c.id_grupo_cartao_v3 IS NOT NULL AND c.id_usuario=p_usuario,'canPayFrom',c.id_grupo_cartao_v3 IS NULL AND c.tipo_conta_v3='Consumo' AND EXISTS(SELECT 1 FROM mukirana_contas.acessiveis(p_usuario) x WHERE x.id_conta=c.id_conta),'canUse',CASE WHEN c.id_grupo_cartao_v3 IS NOT NULL THEN false ELSE (a->>'canUse')::boolean END) ELSE jsonb_build_object('ledgerAccount',(SELECT id_conta FROM public.contas WHERE id_grupo_cartao_v3=(a->>'group')::uuid)) END),'[]') INTO ac FROM jsonb_array_elements(result->'accounts') a LEFT JOIN public.contas c ON c.id_conta=(a->>'id')::uuid;
 -- Apenas metadados de destino para adicionais; nenhum saldo/limite ou compra alheia.
 SELECT ac||COALESCE(jsonb_agg(jsonb_build_object('id',c.id_conta,'name',c.nome_conta,'kind','Conta','type',c.tipo_conta_v3,'active',c.ativa,'canUse',false,'canPay',g.ativo AND EXISTS(SELECT 1 FROM public.cartoes active_card WHERE active_card.id_grupo_cartao=g.id_grupo_cartao AND active_card.id_usuario=p_usuario AND active_card.ativo),'owner',c.id_usuario,'linkedGroup',g.id_grupo_cartao)),'[]') INTO ac FROM public.contas c JOIN public.grupos_cartoes g ON g.id_grupo_cartao=c.id_grupo_cartao_v3 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ac) a WHERE a->>'id'=c.id_conta::text) AND EXISTS(SELECT 1 FROM public.cartoes k WHERE k.id_grupo_cartao=g.id_grupo_cartao AND k.id_usuario=p_usuario);
 SELECT COALESCE(jsonb_agg(mukirana_contas.pagamento_dto_v3(f,p_usuario)),'[]') INTO payments FROM public.pagamentos_faturas f JOIN public.grupos_cartoes g USING(id_grupo_cartao) WHERE (mukirana_lancamentos.conta(p_usuario,f.id_conta) OR g.id_titular=p_usuario) AND (p_inicio IS NULL OR f.data_pagamento>=p_inicio) AND (p_fim IS NULL OR f.data_pagamento<=p_fim);
 RETURN result||jsonb_build_object('accounts',ac,'entries',(result->'entries')||payments,'payments','[]'::jsonb);
END $$;
CREATE FUNCTION mukirana_contas.mutar_pagamento_v3(p_usuario uuid,r jsonb,action text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f public.pagamentos_faturas;c public.contas;g public.grupos_cartoes;amount numeric;origin uuid;
BEGIN
 SELECT * INTO f FROM public.pagamentos_faturas WHERE id_pagamento_fatura=(r->>'id')::uuid FOR UPDATE;
 IF FOUND THEN
  IF f.versao_v3<>(r->>'version')::integer THEN RAISE EXCEPTION 'LN:conflict';END IF;
  SELECT * INTO g FROM public.grupos_cartoes WHERE id_grupo_cartao=f.id_grupo_cartao;
  IF (f.criado_por_id<>p_usuario AND g.id_titular<>p_usuario) OR NOT mukirana_lancamentos.conta(p_usuario,f.id_conta) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
  IF EXISTS(SELECT 1 FROM public.acertos_rateios WHERE id_pagamento_fatura=f.id_pagamento_fatura AND status<>'Cancelado') THEN RAISE EXCEPTION 'LN:settled';END IF;
 ELSIF action<>'save' OR (r->>'version')::integer<>0 THEN RAISE EXCEPTION 'LN:conflict';END IF;
 IF action='delete' THEN DELETE FROM public.pagamentos_faturas WHERE id_pagamento_fatura=f.id_pagamento_fatura;
 ELSIF action='status' THEN
  IF r->>'status' NOT IN('done','pending') THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
  UPDATE public.pagamentos_faturas SET status=CASE WHEN r->>'status'='done' THEN 'Efetivado' ELSE 'Pendente' END,alterado_por_id=p_usuario WHERE id_pagamento_fatura=f.id_pagamento_fatura;
 ELSIF action='save' THEN
  SELECT * INTO c FROM public.contas WHERE id_conta=(r->>'destination')::uuid AND id_grupo_cartao_v3 IS NOT NULL AND ativa FOR KEY SHARE;
  SELECT * INTO g FROM public.grupos_cartoes WHERE id_grupo_cartao=c.id_grupo_cartao_v3 AND ativo;
  origin:=(r->>'origin')::uuid;
  IF g.id_grupo_cartao IS NULL OR NOT(g.id_titular=p_usuario OR EXISTS(SELECT 1 FROM public.cartoes k WHERE k.id_grupo_cartao=g.id_grupo_cartao AND k.id_usuario=p_usuario AND k.ativo)) OR NOT EXISTS(SELECT 1 FROM mukirana_contas.acessiveis(p_usuario) b WHERE b.id_conta=origin AND b.id_grupo_cartao_v3 IS NULL AND b.tipo_conta_v3='Consumo' AND b.ativa) THEN RAISE EXCEPTION 'LN:forbidden';END IF;
  IF r->>'type'<>'transfer' OR r->>'mode'<>'single' OR r->>'status' NOT IN('done','pending') OR r->>'amountCents'!~'^[1-9][0-9]{0,13}$' OR r->>'invoiceMonth'!~'^[0-9]{4}-(0[1-9]|1[0-2])$' OR length(btrim(r->>'description')) NOT BETWEEN 1 AND 160 OR jsonb_array_length(COALESCE(r->'shares','[]'))>0 THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
  amount:=(r->>'amountCents')::numeric/100;
  IF f.id_pagamento_fatura IS NULL THEN
   INSERT INTO public.pagamentos_faturas(id_pagamento_fatura,id_grupo_cartao,id_conta,valor,data_pagamento,mes_referencia,status,observacao,criado_por_id) VALUES((r->>'id')::uuid,g.id_grupo_cartao,origin,amount,(r->>'date')::date,(r->>'invoiceMonth'||'-01')::date,CASE WHEN r->>'status'='done' THEN 'Efetivado' ELSE 'Pendente' END,btrim(r->>'description'),p_usuario);
  ELSE UPDATE public.pagamentos_faturas SET id_grupo_cartao=g.id_grupo_cartao,id_conta=origin,valor=amount,data_pagamento=(r->>'date')::date,mes_referencia=(r->>'invoiceMonth'||'-01')::date,status=CASE WHEN r->>'status'='done' THEN 'Efetivado' ELSE 'Pendente' END,observacao=btrim(r->>'description'),alterado_por_id=p_usuario WHERE id_pagamento_fatura=f.id_pagamento_fatura;END IF;
 ELSE RAISE EXCEPTION 'LN:invalid_request';END IF;
END $$;
CREATE FUNCTION public.rpc_lancamentos_pagamento_v3(p_usuario uuid,p_operacao uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous jsonb;result jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_lancamentos:'||p_usuario::text,0));
 previous:=public.rpc_lancamentos_replay_v3(p_usuario,p_operacao,p_request);IF previous IS NOT NULL THEN RETURN previous;END IF;
 PERFORM mukirana_contas.mutar_pagamento_v3(p_usuario,p_request,'save');result:=jsonb_build_object('count',1,'invoicePayment',true);
 INSERT INTO mukirana_lancamentos.operacoes(id_usuario,id,assinatura,resposta) VALUES(p_usuario,p_operacao,md5(p_request::text),result);RETURN result;
END $$;
CREATE FUNCTION public.rpc_lancamentos_acao_contas_v3(p_usuario uuid,p_operacao uuid,p_request jsonb,p_changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous jsonb;result jsonb;payment jsonb;regular jsonb;item jsonb;action text:=p_changes->>'action';
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_lancamentos:'||p_usuario::text,0));
 previous:=public.rpc_lancamentos_replay_v3(p_usuario,p_operacao,p_request);IF previous IS NOT NULL THEN RETURN previous;END IF;
 IF action NOT IN('status','delete') OR jsonb_array_length(p_changes->'rows') NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'LN:invalid_request';END IF;
 SELECT COALESCE(jsonb_agg(v) FILTER(WHERE f.id_pagamento_fatura IS NULL),'[]'),COALESCE(jsonb_agg(v) FILTER(WHERE f.id_pagamento_fatura IS NOT NULL),'[]') INTO regular,payment FROM jsonb_array_elements(p_changes->'rows') v LEFT JOIN public.pagamentos_faturas f ON f.id_pagamento_fatura=(v->>'id')::uuid;
 IF jsonb_array_length(regular)>0 THEN result:=public.rpc_lancamentos_gravar_v3(p_usuario,p_operacao,p_request,p_changes||jsonb_build_object('rows',regular));ELSE result:='{}';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(payment) ORDER BY value->>'id' LOOP PERFORM mukirana_contas.mutar_pagamento_v3(p_usuario,item||jsonb_build_object('status',p_changes->>'status'),action);END LOOP;
 result:=result||jsonb_build_object('count',jsonb_array_length(p_changes->'rows'));
 INSERT INTO mukirana_lancamentos.operacoes(id_usuario,id,assinatura,resposta) VALUES(p_usuario,p_operacao,md5(p_request::text),result) ON CONFLICT(id_usuario,id) DO UPDATE SET resposta=EXCLUDED.resposta;RETURN result;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_contas FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_contas TO service_role;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('rpc_contas_listar_v3','rpc_contas_mutar_v3','rpc_contas_remover_saldo_v3','rpc_contas_movimentos_v3','rpc_lancamentos_listar_v3','rpc_lancamentos_listar_base_v3','rpc_lancamentos_pagamento_v3','rpc_lancamentos_acao_contas_v3') LOOP EXECUTE 'REVOKE EXECUTE ON FUNCTION '||f.sig||' FROM PUBLIC,anon,authenticated';EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.sig||' TO service_role';END LOOP;
END $$;
DO $$ BEGIN
 IF (SELECT ledger_hash FROM contas_v3_preservacao) IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) OR (SELECT payments_hash FROM contas_v3_preservacao) IS DISTINCT FROM (SELECT md5(string_agg((to_jsonb(p)-'versao_v3')::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas p) OR EXISTS(SELECT 1 FROM public.contas c WHERE (SELECT accounts FROM contas_v3_preservacao) ? c.id_conta::text AND ((SELECT accounts FROM contas_v3_preservacao)->c.id_conta::text) IS DISTINCT FROM (to_jsonb(c)-'id_grupo_cartao_v3')) THEN RAISE EXCEPTION 'CN:preservation_failed';END IF;
END $$;
NOTIFY pgrst,'reload schema';
