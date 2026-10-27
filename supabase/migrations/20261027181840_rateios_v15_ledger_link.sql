-- Somente leitura: composição pessoal do rateio e vínculo de fatura já existente.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
LOCK TABLE public.lancamentos,public.rateios,public.pagamentos_faturas,public.contas,public.acertos_rateios IN SHARE MODE;
CREATE TEMP TABLE mk_rateios_v15_preservacao ON COMMIT DROP AS SELECT jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)) AS hashes;
CREATE OR REPLACE FUNCTION mukirana_rateios.acerto_dto(a public.acertos_rateios,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',a.id_acerto_rateio,'version',a.versao_v4,'other',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END,'otherName',(SELECT nome FROM public.usuarios WHERE id_usuario=CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END),'side',CASE WHEN a.id_usuario_devedor=p_usuario THEN 'pay' ELSE 'receive' END,'status',a.status,'amountCents',(a.valor*100)::numeric(20,0)::text,
 'date',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.data_pagamento ELSE a.data_recebimento END,'otherDate',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.data_recebimento ELSE a.data_pagamento END,
 'ownAccount',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_conta_devedor ELSE a.id_conta_credor END,'ownEntry',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento ELSE a.id_lancamento_recebimento END,
 'ownRegistered',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL ELSE a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento' END,
 'otherRegistered',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento' ELSE a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL END,
 'canAttach',a.modalidade='Liquidacao' AND a.status IN('Aguardando_Credor','Efetivado') AND CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento IS NULL AND a.id_pagamento_fatura IS NULL ELSE a.id_lancamento_recebimento IS NULL AND a.forma_credor IS DISTINCT FROM 'Sem_Movimento' END,
 'canReject',a.status='Aguardando_Credor' AND a.id_usuario_credor=p_usuario,'canCorrect',a.modalidade='Liquidacao' AND a.id_usuario_devedor=p_usuario AND a.id_lancamento_pagamento IS NOT NULL AND a.id_lancamento_recebimento IS NULL AND a.status IN('Aguardando_Credor','Rejeitado'),
 'mode',CASE WHEN a.modalidade='Perda' THEN 'adjustment' ELSE 'settlement' END,'adjustmentNote',CASE WHEN a.modalidade='Perda' THEN COALESCE(a.observacao_credor,a.observacao_devedor,'Ajuste de saldo sem movimentação bancária') ELSE NULL END,'reason',a.motivo_recusa_v4,'invoice',a.id_pagamento_fatura IS NOT NULL,'invoicePaymentId',a.id_pagamento_fatura);
$$;
REVOKE EXECUTE ON FUNCTION mukirana_rateios.acerto_dto(public.acertos_rateios,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mukirana_rateios.acerto_dto(public.acertos_rateios,uuid) TO service_role;
-- A mesma liquidação é um crédito para quitar a dívida do devedor e um débito
-- no direito do credor. Duas pontas financeiras continuam sendo um único acerto.
CREATE OR REPLACE FUNCTION public.rpc_painel_rateios_periodo_v10(p_usuario uuid,p_inicio date,p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM mukirana_contas.validar_usuario(p_usuario);
 IF p_fim IS NULL OR (p_inicio IS NOT NULL AND p_inicio>p_fim) THEN RAISE EXCEPTION 'RT:invalid_request';END IF;
 WITH postings AS(
  SELECT CASE WHEN r.id_usuario_credor=p_usuario THEN r.id_usuario_responsavel ELSE r.id_usuario_credor END other,
   l.data_ocorrencia date,
   CASE WHEN l.tipo='Receita' THEN -1 ELSE 1 END * CASE WHEN r.id_usuario_credor=p_usuario THEN 1 ELSE -1 END*r.valor_rateado amount,
   'part'::text kind
  FROM public.rateios r JOIN public.lancamentos l USING(id_lancamento)
  WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor AND p_usuario IN(r.id_usuario_responsavel,r.id_usuario_credor)
  UNION ALL
  SELECT CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END,
   COALESCE(a.data_pagamento,a.data_recebimento,a.created_at::date),
   CASE WHEN a.id_usuario_devedor=p_usuario THEN a.valor ELSE -a.valor END,
   CASE WHEN a.modalidade='Perda' THEN 'adjustment' ELSE 'settlement' END
  FROM public.acertos_rateios a WHERE p_usuario IN(a.id_usuario_devedor,a.id_usuario_credor) AND a.status IN('Aguardando_Credor','Efetivado')
 ), totals AS(
  SELECT other,
   COALESCE(sum(amount) FILTER(WHERE amount>0),0) income,
   COALESCE(sum(-amount) FILTER(WHERE amount<0),0) expense,
   COALESCE(sum(amount) FILTER(WHERE kind='settlement' AND amount>0),0) paid,
   COALESCE(sum(-amount) FILTER(WHERE kind='settlement' AND amount<0),0) received,
   COALESCE(sum(amount) FILTER(WHERE kind='adjustment'),0) adjustments
  FROM postings WHERE date<=p_fim AND (p_inicio IS NULL OR date>=p_inicio) GROUP BY other
 ), partners AS(
  SELECT DISTINCT CASE WHEN r.id_usuario_credor=p_usuario THEN r.id_usuario_responsavel ELSE r.id_usuario_credor END id
  FROM public.rateios r WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor AND p_usuario IN(r.id_usuario_responsavel,r.id_usuario_credor)
  UNION SELECT CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END
  FROM public.acertos_rateios a WHERE p_usuario IN(a.id_usuario_devedor,a.id_usuario_credor)
 ), positions AS(
  SELECT u.id_usuario,u.nome,COALESCE(t.income,0) income,COALESCE(t.expense,0) expense,COALESCE(t.paid,0) paid,COALESCE(t.received,0) received,COALESCE(t.adjustments,0) adjustments,mukirana_rateios.saldo(p_usuario,u.id_usuario,p_fim) closing,
   CASE WHEN p_inicio IS NULL THEN 0 ELSE mukirana_rateios.saldo(p_usuario,u.id_usuario,p_inicio-1) END opening,
   COALESCE((SELECT sum(CASE WHEN l.tipo='Receita' THEN -1 ELSE 1 END * CASE WHEN r.id_usuario_credor=p_usuario THEN 1 ELSE -1 END*r.valor_rateado)
    FROM public.rateios r JOIN public.lancamentos l USING(id_lancamento)
    WHERE r.status<>'Cancelado' AND r.id_usuario_responsavel<>r.id_usuario_credor
    AND ((r.id_usuario_credor=p_usuario AND r.id_usuario_responsavel=u.id_usuario) OR (r.id_usuario_responsavel=p_usuario AND r.id_usuario_credor=u.id_usuario))
    AND (p_inicio IS NULL OR l.data_ocorrencia>=p_inicio) AND l.data_ocorrencia<=p_fim),0) obligations
  FROM partners p JOIN public.usuarios u ON u.id_usuario=p.id LEFT JOIN totals t ON t.other=u.id_usuario
 ) SELECT jsonb_build_object('start',p_inicio,'end',p_fim,'balances',COALESCE(jsonb_agg(jsonb_build_object(
  'id',id_usuario,'name',nome,
  'incomeCents',(income*100)::numeric(30,0)::text,'expenseCents',(expense*100)::numeric(30,0)::text,
  'paidCents',(paid*100)::numeric(30,0)::text,'receivedCents',(received*100)::numeric(30,0)::text,'adjustmentsCents',(adjustments*100)::numeric(30,0)::text,'balanceCents',(closing*100)::numeric(30,0)::text,'movementCents',((closing-opening)*100)::numeric(30,0)::text,
  'openingCents',(opening*100)::numeric(30,0)::text,'closingCents',(closing*100)::numeric(30,0)::text,
  'obligationsCents',(obligations*100)::numeric(30,0)::text,
  'settlementsCents',((closing-opening-obligations)*100)::numeric(30,0)::text
 ) ORDER BY nome,id_usuario),'[]'::jsonb)) INTO result FROM positions;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.rpc_painel_rateios_periodo_v10(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_painel_rateios_periodo_v10(uuid,date,date) TO service_role;
NOTIFY pgrst,'reload schema';
DO $$ BEGIN ASSERT (SELECT hashes FROM mk_rateios_v15_preservacao) IS NOT DISTINCT FROM jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t)),'Histórico financeiro alterado';END $$;
