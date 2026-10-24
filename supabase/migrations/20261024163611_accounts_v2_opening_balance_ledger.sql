-- Executar como uma única transação (MCP apply_migration ou psql --single-transaction).
-- Hashes transitórios permitem abortar se algum registro financeiro preexistente mudar.
CREATE TEMP TABLE contas_v2_conferencia ON COMMIT DROP AS SELECT
 (SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY id_conta)) FROM public.contas c) contas_hash,
 (SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l) lancamentos_hash,
 (SELECT md5(string_agg(to_jsonb(s)::text,'' ORDER BY id_compartilhamento)) FROM public.contas_compartilhamentos s) shares_hash,
 (SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas f) faturas_hash;

-- Contas nova: saldo inicial no ledger e operações atômicas com compatibilidade.
CREATE SCHEMA IF NOT EXISTS mukirana_contas;
REVOKE ALL ON SCHEMA mukirana_contas FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA mukirana_contas TO service_role;

ALTER TABLE public.contas ADD COLUMN saldo_inicial_data date;
ALTER TABLE public.contas ADD COLUMN versao integer NOT NULL DEFAULT 1 CHECK (versao > 0);
ALTER TABLE public.contas ADD COLUMN ultima_operacao_id uuid;
ALTER TABLE public.contas ADD COLUMN ultima_operacao_hash text;
ALTER TABLE public.lancamentos ADD COLUMN id_conta_saldo_inicial uuid REFERENCES public.contas(id_conta) ON DELETE RESTRICT;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_saldo_inicial_unico UNIQUE (id_conta_saldo_inicial);
ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_tipo_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_tipo_check CHECK (tipo IN ('Despesa','Receita','Transferência','Saldo Inicial'));
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_saldo_inicial_formato CHECK (
 (tipo <> 'Saldo Inicial' AND id_conta_saldo_inicial IS NULL) OR
 (tipo = 'Saldo Inicial' AND id_conta_saldo_inicial IS NOT NULL AND tipo_origem='Conta'
  AND id_origem=id_conta_saldo_inicial AND id_destino IS NULL AND id_categoria IS NULL
  AND id_projeto IS NULL AND id_grupo_parcela IS NULL AND id_recorrencia_origem IS NULL
  AND status='Efetivado' AND valor_total<>0));

-- Data definida pelo usuário: primeiro lançamento da conta nas duas pontas.
UPDATE public.contas c SET saldo_inicial_data=COALESCE(
 (SELECT min(l.data_ocorrencia) FROM public.lancamentos l
  WHERE (l.tipo_origem='Conta' AND l.id_origem=c.id_conta) OR l.id_destino=c.id_conta),
 (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date);

CREATE FUNCTION mukirana_contas.preparar_conta() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id_conta<>OLD.id_conta OR NEW.id_usuario<>OLD.id_usuario THEN RAISE EXCEPTION 'CN:immutable'; END IF;
  NEW.versao:=OLD.versao+1;
 ELSE NEW.versao:=1;
 END IF;
 IF btrim(NEW.nome_conta)='' OR length(NEW.nome_conta)>160 THEN RAISE EXCEPTION 'CN:invalid_name'; END IF;
 NEW.nome_conta:=btrim(NEW.nome_conta);
 NEW.saldo_inicial_data:=COALESCE(NEW.saldo_inicial_data,(NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date);
 NEW.updated_at:=now();
 RETURN NEW;
END $$;

CREATE FUNCTION mukirana_contas.proteger_saldo_inicial() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (TG_OP<>'INSERT' AND OLD.tipo='Saldo Inicial') OR (TG_OP<>'DELETE' AND NEW.tipo='Saldo Inicial') THEN
  IF COALESCE(current_setting('mukirana_contas.sincronizando',true),'')<>'1' THEN RAISE EXCEPTION 'CN:protected_opening'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION mukirana_contas.sincronizar_saldo_inicial() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE anterior text;
BEGIN
 anterior:=COALESCE(current_setting('mukirana_contas.sincronizando',true),'');
 PERFORM set_config('mukirana_contas.sincronizando','1',true);
 IF NEW.saldo_inicial=0 THEN
  DELETE FROM public.lancamentos WHERE id_conta_saldo_inicial=NEW.id_conta;
 ELSE
  INSERT INTO public.lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,
   tipo_origem,id_origem,id_conta_saldo_inicial,status,criado_por_id,alterado_por_id,updated_at)
  VALUES('Saldo Inicial','Saldo Inicial da Conta '||NEW.nome_conta,NEW.saldo_inicial,NEW.saldo_inicial_data,
   date_trunc('month',NEW.saldo_inicial_data)::date,'Conta',NEW.id_conta,NEW.id_conta,'Efetivado',NEW.id_usuario,NEW.id_usuario,now())
  ON CONFLICT(id_conta_saldo_inicial) DO UPDATE SET descricao=EXCLUDED.descricao,
   valor_total=EXCLUDED.valor_total,data_ocorrencia=EXCLUDED.data_ocorrencia,
   mes_referencia=EXCLUDED.mes_referencia,alterado_por_id=NEW.id_usuario,updated_at=now()
  WHERE (public.lancamentos.descricao,public.lancamentos.valor_total,public.lancamentos.data_ocorrencia)
   IS DISTINCT FROM (EXCLUDED.descricao,EXCLUDED.valor_total,EXCLUDED.data_ocorrencia);
 END IF;
 PERFORM set_config('mukirana_contas.sincronizando',anterior,true);
 RETURN NEW;
END $$;

CREATE TRIGGER contas_preparar_v2 BEFORE INSERT OR UPDATE ON public.contas
 FOR EACH ROW EXECUTE FUNCTION mukirana_contas.preparar_conta();
CREATE TRIGGER contas_sincronizar_saldo_v2 AFTER INSERT OR UPDATE ON public.contas
 FOR EACH ROW EXECUTE FUNCTION mukirana_contas.sincronizar_saldo_inicial();
CREATE TRIGGER lancamentos_proteger_saldo_v2 BEFORE INSERT OR UPDATE OR DELETE ON public.lancamentos
 FOR EACH ROW EXECUTE FUNCTION mukirana_contas.proteger_saldo_inicial();

-- Gerar os registros existentes sem mudar saldo, status ou participantes da conta.
SELECT set_config('mukirana_contas.sincronizando','1',true);
INSERT INTO public.lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,
 tipo_origem,id_origem,id_conta_saldo_inicial,status,criado_por_id,updated_at)
SELECT 'Saldo Inicial','Saldo Inicial da Conta '||c.nome_conta,c.saldo_inicial,c.saldo_inicial_data,
 date_trunc('month',c.saldo_inicial_data)::date,'Conta',c.id_conta,c.id_conta,'Efetivado',c.id_usuario,now()
FROM public.contas c WHERE c.saldo_inicial<>0;
SELECT set_config('mukirana_contas.sincronizando','',true);

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_compartilhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contas,public.contas_compartilhamentos,public.lancamentos FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.contas,public.contas_compartilhamentos,public.lancamentos TO service_role;

CREATE FUNCTION mukirana_contas.validar_usuario(p_usuario uuid) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=p_usuario AND ativo) THEN RAISE EXCEPTION 'CN:invalid_session'; END IF;
END $$;

CREATE FUNCTION mukirana_contas.acessiveis(p_usuario uuid) RETURNS SETOF public.contas LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.* FROM public.contas c WHERE c.id_usuario=p_usuario OR
 (c.compartilhada AND EXISTS(SELECT 1 FROM public.contas_compartilhamentos s
   WHERE s.id_conta=c.id_conta AND s.id_usuario=p_usuario AND s.ativo));
$$;

CREATE FUNCTION mukirana_contas.dto(c public.contas,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id_conta,'version',c.versao,'name',c.nome_conta,
  'ownerId',c.id_usuario,'ownerName',(SELECT nome FROM public.usuarios WHERE id_usuario=c.id_usuario),
  'canEdit',c.id_usuario=p_usuario,'active',c.ativa,'shared',c.compartilhada,
  'openingAmountCents',(c.saldo_inicial*100)::numeric(20,0)::text,'openingDate',c.saldo_inicial_data,
  'openingId',(SELECT id_lancamento FROM public.lancamentos WHERE id_conta_saldo_inicial=c.id_conta),
  'participants',CASE WHEN c.id_usuario=p_usuario THEN COALESCE((SELECT jsonb_agg(s.id_usuario ORDER BY s.id_usuario)
   FROM public.contas_compartilhamentos s WHERE s.id_conta=c.id_conta AND s.ativo AND s.papel_na_conta='Participante'),'[]'::jsonb) ELSE '[]'::jsonb END);
$$;

CREATE FUNCTION mukirana_contas.movimentos(p_usuario uuid,p_contas uuid[])
RETURNS TABLE(chave text,id uuid,conta uuid,data date,descricao text,tipo text,delta numeric,especial boolean)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH acessiveis AS (SELECT * FROM mukirana_contas.acessiveis(p_usuario) WHERE id_conta=ANY(p_contas))
 SELECT 'l:'||l.id_lancamento,l.id_lancamento,c.id_conta,l.data_ocorrencia,l.descricao,l.tipo,
 CASE WHEN l.tipo='Saldo Inicial' THEN l.valor_total
  WHEN l.tipo='Receita' THEN l.valor_total
  WHEN l.tipo='Despesa' THEN -l.valor_total
  WHEN l.id_origem=c.id_conta THEN -l.valor_total ELSE l.valor_total END,
 l.tipo='Saldo Inicial'
 FROM public.lancamentos l JOIN acessiveis c ON
  ((l.tipo_origem='Conta' AND l.id_origem=c.id_conta) OR (l.tipo='Transferência' AND l.id_destino=c.id_conta))
 WHERE l.tipo='Saldo Inicial' OR l.criado_por_id=p_usuario
  OR EXISTS(SELECT 1 FROM public.contas dona WHERE dona.id_usuario=p_usuario AND
   ((l.tipo_origem='Conta' AND dona.id_conta=l.id_origem) OR dona.id_conta=l.id_destino))
  OR EXISTS(SELECT 1 FROM public.rateios r WHERE r.id_lancamento=l.id_lancamento
   AND (r.id_usuario_responsavel=p_usuario OR r.id_usuario_credor=p_usuario) AND r.status<>'Cancelado')
 UNION ALL
 SELECT 'f:'||f.id_pagamento_fatura,f.id_pagamento_fatura,c.id_conta,f.data_pagamento,
  'Pagamento de fatura','Pagamento de fatura',-f.valor,false
 FROM public.pagamentos_faturas f JOIN acessiveis c ON c.id_conta=f.id_conta;
$$;

CREATE FUNCTION public.rpc_contas_listar_v2(p_usuario uuid,p_data_corte date,p_data_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE resultado jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_data_corte IS NULL OR p_data_fim IS NULL OR p_data_fim<p_data_corte THEN RAISE EXCEPTION 'CN:invalid_request'; END IF;
 WITH contas AS MATERIALIZED(SELECT * FROM mukirana_contas.acessiveis(p_usuario)),
 movimentos AS(SELECT * FROM mukirana_contas.movimentos(p_usuario,ARRAY(SELECT id_conta FROM contas))),
 totais AS(SELECT conta,COALESCE(sum(delta) FILTER(WHERE data<=p_data_corte),0) AS atual,
  COALESCE(sum(delta) FILTER(WHERE data<=p_data_fim),0) AS futuro FROM movimentos GROUP BY conta)
 SELECT COALESCE(jsonb_agg(mukirana_contas.dto(c,p_usuario)||jsonb_build_object(
  'currentCents',(COALESCE(t.atual,0)*100)::numeric(30,0)::text,
  'registeredForecastCents',(COALESCE(t.futuro,0)*100)::numeric(30,0)::text) ORDER BY c.nome_conta),'[]'::jsonb)
 INTO resultado FROM contas c LEFT JOIN totais t ON t.conta=c.id_conta;
 RETURN jsonb_build_object('accounts',resultado,'asOf',p_data_corte,'forecastDate',p_data_fim);
END $$;

CREATE FUNCTION public.rpc_contas_salvar_v2(p_usuario uuid,p_conta uuid,p_versao integer,p_operacao uuid,
 p_nome text,p_saldo_cents bigint,p_data date,p_compartilhada boolean,p_participantes uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.contas; existe boolean; assinatura text; ids uuid[];
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 PERFORM 1 FROM public.usuarios WHERE id_usuario=p_usuario FOR UPDATE;
 IF p_conta IS NULL OR p_operacao IS NULL OR p_versao IS NULL OR p_versao<0 OR
  p_nome IS NULL OR btrim(p_nome)='' OR length(btrim(p_nome))>160 OR p_saldo_cents IS NULL OR
  abs(p_saldo_cents::numeric)>99999999999999 OR p_compartilhada IS NULL OR (p_saldo_cents<>0 AND p_data IS NULL)
 THEN RAISE EXCEPTION 'CN:invalid_request'; END IF;
 SELECT COALESCE(array_agg(DISTINCT x ORDER BY x),'{}'::uuid[]) INTO ids
 FROM unnest(CASE WHEN p_compartilhada THEN COALESCE(p_participantes,'{}'::uuid[]) ELSE '{}'::uuid[] END) x;
 IF p_usuario=ANY(ids) OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE x IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.usuarios u WHERE u.id_usuario=x AND u.ativo)) THEN RAISE EXCEPTION 'CN:invalid_participant'; END IF;
 IF p_compartilhada AND cardinality(ids)=0 THEN RAISE EXCEPTION 'CN:invalid_participant'; END IF;
 assinatura:=md5(jsonb_build_array('save',btrim(p_nome),p_saldo_cents,p_data,p_compartilhada,ids)::text);
 SELECT * INTO c FROM public.contas WHERE id_conta=p_conta FOR UPDATE; existe:=FOUND;
 IF existe THEN
  IF c.id_usuario<>p_usuario THEN RAISE EXCEPTION 'CN:forbidden'; END IF;
  IF c.ultima_operacao_id=p_operacao THEN
   IF c.ultima_operacao_hash<>assinatura THEN RAISE EXCEPTION 'CN:conflict'; END IF;
   RETURN jsonb_build_object('account',mukirana_contas.dto(c,p_usuario),'replayed',true);
  END IF;
  IF c.versao<>p_versao THEN RAISE EXCEPTION 'CN:conflict'; END IF;
 ELSIF p_versao<>0 THEN RAISE EXCEPTION 'CN:conflict';
 END IF;
 IF EXISTS(SELECT 1 FROM mukirana_contas.acessiveis(p_usuario) outra
  WHERE outra.id_conta<>p_conta AND lower(btrim(outra.nome_conta))=lower(btrim(p_nome))) THEN RAISE EXCEPTION 'CN:duplicate_name'; END IF;
 IF existe THEN
  UPDATE public.contas SET nome_conta=btrim(p_nome),saldo_inicial=p_saldo_cents::numeric/100,
   saldo_inicial_data=COALESCE(p_data,c.saldo_inicial_data),compartilhada=p_compartilhada,
   ultima_operacao_id=p_operacao,ultima_operacao_hash=assinatura WHERE id_conta=p_conta RETURNING * INTO c;
 ELSE
  INSERT INTO public.contas(id_conta,id_usuario,nome_conta,saldo_inicial,saldo_inicial_data,compartilhada,ultima_operacao_id,ultima_operacao_hash)
  VALUES(p_conta,p_usuario,btrim(p_nome),p_saldo_cents::numeric/100,p_data,p_compartilhada,p_operacao,assinatura) RETURNING * INTO c;
 END IF;
 UPDATE public.contas_compartilhamentos SET ativo=false,updated_at=now() WHERE id_conta=p_conta AND ativo;
 INSERT INTO public.contas_compartilhamentos(id_conta,id_usuario,papel_na_conta,ativo)
 SELECT p_conta,x,CASE WHEN x=p_usuario THEN 'Dono' ELSE 'Participante' END,true FROM unnest(array_append(ids,p_usuario)) x
 ON CONFLICT(id_conta,id_usuario) DO UPDATE SET ativo=true,papel_na_conta=EXCLUDED.papel_na_conta,updated_at=now();
 RETURN jsonb_build_object('account',mukirana_contas.dto(c,p_usuario),'replayed',false);
END $$;

CREATE FUNCTION public.rpc_contas_status_v2(p_usuario uuid,p_conta uuid,p_versao integer,p_operacao uuid,p_ativa boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.contas; assinatura text;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_operacao IS NULL OR p_ativa IS NULL OR p_versao IS NULL OR p_versao<1 THEN RAISE EXCEPTION 'CN:invalid_request'; END IF;
 SELECT * INTO c FROM public.contas WHERE id_conta=p_conta FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CN:not_found'; END IF;
 IF c.id_usuario<>p_usuario THEN RAISE EXCEPTION 'CN:forbidden'; END IF;
 assinatura:=md5(jsonb_build_array('status',p_ativa)::text);
 IF c.ultima_operacao_id=p_operacao THEN
  IF c.ultima_operacao_hash<>assinatura THEN RAISE EXCEPTION 'CN:conflict'; END IF;
  RETURN jsonb_build_object('account',mukirana_contas.dto(c,p_usuario),'replayed',true);
 END IF;
 IF c.versao<>p_versao THEN RAISE EXCEPTION 'CN:conflict'; END IF;
 UPDATE public.contas SET ativa=p_ativa,ultima_operacao_id=p_operacao,ultima_operacao_hash=assinatura
 WHERE id_conta=p_conta RETURNING * INTO c;
 RETURN jsonb_build_object('account',mukirana_contas.dto(c,p_usuario),'replayed',false);
END $$;

CREATE FUNCTION public.rpc_contas_usuarios_v2(p_usuario uuid,p_busca text,p_conta uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE resultado jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_conta IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.contas WHERE id_conta=p_conta AND id_usuario=p_usuario) THEN RAISE EXCEPTION 'CN:forbidden'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id_usuario,'name',u.nome,'email',u.email) ORDER BY u.nome),'[]'::jsonb)
 INTO resultado FROM (SELECT u.id_usuario,u.nome,u.email FROM public.usuarios u WHERE u.ativo AND u.id_usuario<>p_usuario AND
  ((length(btrim(COALESCE(p_busca,'')))>=2 AND (strpos(lower(u.nome),lower(btrim(p_busca)))>0 OR strpos(lower(u.email),lower(btrim(p_busca)))>0)) OR
   (p_conta IS NOT NULL AND EXISTS(SELECT 1 FROM public.contas_compartilhamentos s WHERE s.id_conta=p_conta AND s.id_usuario=u.id_usuario AND s.ativo AND s.papel_na_conta='Participante')))
  ORDER BY u.nome LIMIT 50) u;
 RETURN jsonb_build_object('users',resultado);
END $$;

CREATE FUNCTION public.rpc_contas_movimentos_v2(p_usuario uuid,p_conta uuid,p_antes_data date DEFAULT NULL,p_antes_chave text DEFAULT NULL,p_limite integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE linhas jsonb; proximo jsonb; total integer;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF NOT EXISTS(SELECT 1 FROM mukirana_contas.acessiveis(p_usuario) WHERE id_conta=p_conta) THEN RAISE EXCEPTION 'CN:forbidden'; END IF;
 IF p_limite IS NULL OR p_limite<1 OR p_limite>100 OR ((p_antes_data IS NULL)<>(p_antes_chave IS NULL)) THEN RAISE EXCEPTION 'CN:invalid_request'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('key',m.chave,'id',m.id,'date',m.data,'description',m.descricao,
  'type',m.tipo,'amountCents',(m.delta*100)::numeric(30,0)::text,'opening',m.especial) ORDER BY m.data DESC,m.chave DESC),'[]'::jsonb)
 INTO linhas FROM (SELECT * FROM mukirana_contas.movimentos(p_usuario,ARRAY[p_conta])
  WHERE p_antes_data IS NULL OR (data,chave)<(p_antes_data,p_antes_chave) ORDER BY data DESC,chave DESC LIMIT p_limite+1) m;
 total:=jsonb_array_length(linhas);
 IF total>p_limite THEN
  linhas:=linhas-(total-1);
  proximo:=jsonb_build_object('date',linhas->(p_limite-1)->>'date','key',linhas->(p_limite-1)->>'key');
 END IF;
 RETURN jsonb_build_object('items',linhas,'nextCursor',proximo);
END $$;

-- Funções de contexto legadas continuam no backend service_role.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS assinatura FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('rpc_contexto_financeiro_mukirana','rpc_cadastros_mukirana','rpc_fatura_cartao_mukirana','rpc_recorrencias_mukirana','gerar_ocorrencia_recorrencia')
 LOOP EXECUTE 'REVOKE EXECUTE ON FUNCTION '||f.assinatura||' FROM PUBLIC,anon,authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.assinatura||' TO service_role';
 END LOOP;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_contas FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mukirana_contas TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_contas_listar_v2(uuid,date,date),
 public.rpc_contas_salvar_v2(uuid,uuid,integer,uuid,text,bigint,date,boolean,uuid[]),
 public.rpc_contas_status_v2(uuid,uuid,integer,uuid,boolean),public.rpc_contas_usuarios_v2(uuid,text,uuid),
 public.rpc_contas_movimentos_v2(uuid,uuid,date,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_contas_listar_v2(uuid,date,date),
 public.rpc_contas_salvar_v2(uuid,uuid,integer,uuid,text,bigint,date,boolean,uuid[]),
 public.rpc_contas_status_v2(uuid,uuid,integer,uuid,boolean),public.rpc_contas_usuarios_v2(uuid,text,uuid),
 public.rpc_contas_movimentos_v2(uuid,uuid,date,text,integer) TO service_role;

-- Contextos legados ignoram o registro especial; usam somente o espelho compatível.
CREATE OR REPLACE FUNCTION public.rpc_contexto_financeiro_mukirana(p_id_usuario uuid, p_mes_referencia date DEFAULT NULL::date, p_incluir_historico boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.nome)
      from public.usuarios u
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome)
      from public.categorias c
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_cartao)
      from public.cartoes c
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'projetos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nome)
      from public.projetos p
    ), '[]'::jsonb),

    'projetos_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id_projeto, pc.papel_no_projeto, pc.id_usuario)
      from public.projetos_compartilhamentos pc
      where pc.ativo = true
    ), '[]'::jsonb),

    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.data_ocorrencia asc)
      from (select * from public.lancamentos where tipo<>'Saldo Inicial') l
      where p_mes_referencia is null
         or l.mes_referencia = p_mes_referencia
         or (
           p_incluir_historico = true
           and l.data_ocorrencia <= (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
         )
    ), '[]'::jsonb),

    'rateios', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at asc)
      from public.rateios r
      where p_mes_referencia is null
         or exists (
           select 1
           from (select * from public.lancamentos where tipo<>'Saldo Inicial') l
           where l.id_lancamento = r.id_lancamento
             and (
               l.mes_referencia = p_mes_referencia
               or (
                 p_incluir_historico = true
                 and l.data_ocorrencia <= (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
               )
             )
         )
    ), '[]'::jsonb),

    'pagamentos_faturas', coalesce((
      select jsonb_agg(to_jsonb(pf) order by pf.data_pagamento asc)
      from public.pagamentos_faturas pf
      where p_mes_referencia is null
         or pf.mes_referencia = p_mes_referencia
         or pf.data_pagamento between date_trunc('month', p_mes_referencia)::date
           and (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
         or (
           p_incluir_historico = true
           and pf.data_pagamento <= (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
         )
    ), '[]'::jsonb),

    'orcamentos', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at asc)
      from public.orcamentos o
      where o.id_usuario = p_id_usuario
    ), '[]'::jsonb),

    'recorrencias', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.data_inicio asc)
      from public.recorrencias r
      where r.id_usuario = p_id_usuario
         or r.criado_por_id = p_id_usuario
    ), '[]'::jsonb),

    'recorrencias_rateios', coalesce((
      select jsonb_agg(to_jsonb(rr) order by rr.created_at asc)
      from public.recorrencias_rateios rr
      where exists (
        select 1
        from public.recorrencias r
        where r.id_recorrencia = rr.id_recorrencia
          and (r.id_usuario = p_id_usuario or r.criado_por_id = p_id_usuario)
      )
    ), '[]'::jsonb),

    'recorrencias_ocorrencias', coalesce((
      select jsonb_agg(to_jsonb(ro) order by ro.data_ocorrencia asc)
      from public.recorrencias_ocorrencias ro
      where exists (
        select 1
        from public.recorrencias r
        where r.id_recorrencia = ro.id_recorrencia
          and (r.id_usuario = p_id_usuario or r.criado_por_id = p_id_usuario)
      )
    ), '[]'::jsonb)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_cadastros_mukirana(p_id_usuario uuid, p_incluir_vinculos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.nome)
      from public.usuarios u
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.tipo, c.nome)
      from public.categorias c
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_cartao)
      from public.cartoes c
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'projetos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nome)
      from public.projetos p
    ), '[]'::jsonb),

    'projetos_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id_projeto, pc.papel_no_projeto, pc.id_usuario)
      from public.projetos_compartilhamentos pc
      where pc.ativo = true
    ), '[]'::jsonb),

    'lancamentos_vinculos', case
      when p_incluir_vinculos = true then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id_lancamento', l.id_lancamento,
          'tipo', l.tipo,
          'tipo_origem', l.tipo_origem,
          'id_origem', l.id_origem,
          'id_destino', l.id_destino
        ) order by l.data_ocorrencia asc)
        from (select * from public.lancamentos where tipo<>'Saldo Inicial') l
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_fatura_cartao_mukirana(p_id_usuario uuid, p_mes_referencia date, p_id_grupo_cartao uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cartoes_grupo as (
    select c.*
    from public.cartoes c
    where c.id_grupo_cartao = p_id_grupo_cartao
  ),
  lancamentos_fatura as (
    select l.*
    from (select * from public.lancamentos where tipo<>'Saldo Inicial') l
    where l.mes_referencia = p_mes_referencia
      and l.id_origem in (select cg.id_cartao from cartoes_grupo cg)
  )
  select jsonb_build_object(
    'usuarios', '[]'::jsonb,

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.tipo, c.nome)
      from public.categorias c
      where c.id_categoria in (
        select distinct lf.id_categoria
        from lancamentos_fatura lf
        where lf.id_categoria is not null
      )
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
      where g.id_grupo_cartao = p_id_grupo_cartao
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(cg) order by cg.nome_cartao)
      from cartoes_grupo cg
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
        and cc.id_cartao in (select cg.id_cartao from cartoes_grupo cg)
    ), '[]'::jsonb),

    'projetos', '[]'::jsonb,
    'projetos_compartilhamentos', '[]'::jsonb,

    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(lf) order by lf.data_ocorrencia asc)
      from lancamentos_fatura lf
    ), '[]'::jsonb),

    'rateios', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at asc)
      from public.rateios r
      where r.id_lancamento in (select lf.id_lancamento from lancamentos_fatura lf)
    ), '[]'::jsonb),

    'pagamentos_faturas', coalesce((
      select jsonb_agg(to_jsonb(pf) order by pf.data_pagamento asc)
      from public.pagamentos_faturas pf
      where pf.id_grupo_cartao = p_id_grupo_cartao
        and (p_mes_referencia is null or pf.mes_referencia = p_mes_referencia)
    ), '[]'::jsonb),

    'orcamentos', '[]'::jsonb,
    'recorrencias', '[]'::jsonb,
    'recorrencias_rateios', '[]'::jsonb
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_recorrencias_mukirana(p_id_usuario uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recorrencias_usuario as (
    select r.id_recorrencia
    from public.recorrencias r
    where r.id_usuario = p_id_usuario
       or r.criado_por_id = p_id_usuario
  ),
  lancamentos_recorrencias as (
    select l.*
    from (select * from public.lancamentos where tipo<>'Saldo Inicial') l
    where l.id_recorrencia_origem in (
      select ru.id_recorrencia
      from recorrencias_usuario ru
    )
  )
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.nome)
      from public.usuarios u
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.tipo, c.nome)
      from public.categorias c
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_cartao)
      from public.cartoes c
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'projetos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nome)
      from public.projetos p
    ), '[]'::jsonb),

    'projetos_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id_projeto, pc.papel_no_projeto, pc.id_usuario)
      from public.projetos_compartilhamentos pc
      where pc.ativo = true
    ), '[]'::jsonb),

    'recorrencias', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.data_inicio asc)
      from public.recorrencias r
      where r.id_recorrencia in (
        select ru.id_recorrencia
        from recorrencias_usuario ru
      )
    ), '[]'::jsonb),

    'recorrencias_rateios', coalesce((
      select jsonb_agg(to_jsonb(rr) order by rr.created_at asc)
      from public.recorrencias_rateios rr
      where rr.id_recorrencia in (
        select ru.id_recorrencia
          from recorrencias_usuario ru
      )
    ), '[]'::jsonb),

    'recorrencias_ocorrencias', coalesce((
      select jsonb_agg(to_jsonb(ro) order by ro.data_ocorrencia asc)
      from public.recorrencias_ocorrencias ro
      where ro.id_recorrencia in (
        select ru.id_recorrencia
        from recorrencias_usuario ru
      )
    ), '[]'::jsonb),

    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.data_ocorrencia asc)
      from lancamentos_recorrencias lr
    ), '[]'::jsonb),

    'rateios', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at asc)
      from public.rateios r
      where r.id_lancamento in (
        select lr.id_lancamento
        from lancamentos_recorrencias lr
      )
    ), '[]'::jsonb),

    'orcamentos', '[]'::jsonb
  );
$function$
;

-- Conferência integral, sem copiar dados pessoais para arquivos ou logs.
DO $$ DECLARE antes record; BEGIN
 SELECT * INTO antes FROM contas_v2_conferencia;
 IF antes.contas_hash IS DISTINCT FROM (SELECT md5(string_agg((to_jsonb(c)-'saldo_inicial_data'-'versao'-'ultima_operacao_id'-'ultima_operacao_hash')::text,'' ORDER BY id_conta)) FROM public.contas c)
 OR antes.lancamentos_hash IS DISTINCT FROM (SELECT md5(string_agg((to_jsonb(l)-'id_conta_saldo_inicial')::text,'' ORDER BY id_lancamento)) FROM public.lancamentos l WHERE tipo<>'Saldo Inicial')
 OR antes.shares_hash IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(s)::text,'' ORDER BY id_compartilhamento)) FROM public.contas_compartilhamentos s)
 OR antes.faturas_hash IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas f)
 THEN RAISE EXCEPTION 'CN:migration_changed_existing_data'; END IF;
 IF EXISTS(SELECT 1 FROM public.contas c LEFT JOIN public.lancamentos l ON l.id_conta_saldo_inicial=c.id_conta
 WHERE (c.saldo_inicial=0 AND l.id_lancamento IS NOT NULL) OR
  (c.saldo_inicial<>0 AND (l.id_lancamento IS NULL OR l.valor_total<>c.saldo_inicial OR l.data_ocorrencia<>c.saldo_inicial_data OR l.descricao<>'Saldo Inicial da Conta '||c.nome_conta)) OR
  c.saldo_inicial_data IS DISTINCT FROM COALESCE((SELECT min(n.data_ocorrencia) FROM public.lancamentos n WHERE n.tipo<>'Saldo Inicial' AND ((n.tipo_origem='Conta' AND n.id_origem=c.id_conta) OR n.id_destino=c.id_conta)),(c.created_at AT TIME ZONE 'America/Sao_Paulo')::date))
 THEN RAISE EXCEPTION 'CN:migration_reconciliation_failed'; END IF;
END $$;
