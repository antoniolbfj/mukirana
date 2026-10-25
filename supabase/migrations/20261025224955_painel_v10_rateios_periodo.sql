-- Somente leitura: o resumo acompanha mês/histórico e conta cada acerto uma vez.
LOCK TABLE public.lancamentos,public.rateios,public.pagamentos_faturas,public.contas,public.acertos_rateios IN SHARE MODE;
CREATE TEMP TABLE mk_painel_v10_preservacao ON COMMIT DROP AS SELECT jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)) AS hashes;
CREATE FUNCTION public.rpc_painel_rateios_periodo_v10(p_usuario uuid,p_inicio date,p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_fim IS NULL OR (p_inicio IS NOT NULL AND p_inicio>p_fim) THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
 WITH partners AS(
  SELECT DISTINCT CASE WHEN r.id_usuario_credor=p_usuario THEN r.id_usuario_responsavel ELSE r.id_usuario_credor END id
  FROM public.rateios r WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor AND p_usuario IN(r.id_usuario_responsavel,r.id_usuario_credor)
  UNION SELECT CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END
  FROM public.acertos_rateios a WHERE p_usuario IN(a.id_usuario_devedor,a.id_usuario_credor)
 ), positions AS(
  SELECT u.id_usuario,u.nome,mukirana_rateios.saldo(p_usuario,u.id_usuario,p_fim) closing,
   CASE WHEN p_inicio IS NULL THEN 0 ELSE mukirana_rateios.saldo(p_usuario,u.id_usuario,p_inicio-1) END opening,
   COALESCE((SELECT sum(CASE WHEN l.tipo='Receita' THEN -1 ELSE 1 END * CASE WHEN r.id_usuario_credor=p_usuario THEN 1 ELSE -1 END*r.valor_rateado)
    FROM public.rateios r JOIN public.lancamentos l USING(id_lancamento)
    WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor
    AND ((r.id_usuario_credor=p_usuario AND r.id_usuario_responsavel=u.id_usuario) OR (r.id_usuario_responsavel=p_usuario AND r.id_usuario_credor=u.id_usuario))
    AND (p_inicio IS NULL OR l.data_ocorrencia>=p_inicio) AND l.data_ocorrencia<=p_fim),0) obligations
  FROM partners p JOIN public.usuarios u ON u.id_usuario=p.id
 ) SELECT jsonb_build_object('start',p_inicio,'end',p_fim,'balances',COALESCE(jsonb_agg(jsonb_build_object(
  'id',id_usuario,'name',nome,'balanceCents',((closing-opening)*100)::numeric(30,0)::text,
  'openingCents',(opening*100)::numeric(30,0)::text,'closingCents',(closing*100)::numeric(30,0)::text,
  'obligationsCents',(obligations*100)::numeric(30,0)::text,
  'settlementsCents',((closing-opening-obligations)*100)::numeric(30,0)::text
 ) ORDER BY nome,id_usuario),'[]'::jsonb)) INTO result FROM positions;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.rpc_painel_rateios_periodo_v10(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_painel_rateios_periodo_v10(uuid,date,date) TO service_role;
NOTIFY pgrst,'reload schema';
DO $$ BEGIN ASSERT (SELECT hashes FROM mk_painel_v10_preservacao) IS NOT DISTINCT FROM jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)),'Histórico financeiro alterado';END $$;
