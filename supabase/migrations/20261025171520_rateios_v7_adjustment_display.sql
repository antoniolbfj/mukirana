-- Diferencia quitação histórica sem movimento das pontas financeiras do acerto.
-- Não altera dados financeiros, autorizações ou cálculo de saldos.
CREATE OR REPLACE FUNCTION mukirana_rateios.acerto_dto(a public.acertos_rateios,p_usuario uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',a.id_acerto_rateio,'version',a.versao_v4,'other',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END,'otherName',(SELECT nome FROM public.usuarios WHERE id_usuario=CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_usuario_credor ELSE a.id_usuario_devedor END),'side',CASE WHEN a.id_usuario_devedor=p_usuario THEN 'pay' ELSE 'receive' END,'status',a.status,'amountCents',(a.valor*100)::numeric(20,0)::text,
 'date',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.data_pagamento ELSE a.data_recebimento END,'otherDate',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.data_recebimento ELSE a.data_pagamento END,
 'ownAccount',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_conta_devedor ELSE a.id_conta_credor END,'ownEntry',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento ELSE a.id_lancamento_recebimento END,
 'ownRegistered',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL ELSE a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento' END,
 'otherRegistered',CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_recebimento IS NOT NULL OR a.forma_credor='Sem_Movimento' ELSE a.id_lancamento_pagamento IS NOT NULL OR a.id_pagamento_fatura IS NOT NULL END,
 'canAttach',a.modalidade='Liquidacao' AND a.status IN('Aguardando_Credor','Efetivado') AND CASE WHEN a.id_usuario_devedor=p_usuario THEN a.id_lancamento_pagamento IS NULL AND a.id_pagamento_fatura IS NULL ELSE a.id_lancamento_recebimento IS NULL AND a.forma_credor IS DISTINCT FROM 'Sem_Movimento' END,
 'canReject',a.status='Aguardando_Credor' AND a.id_usuario_credor=p_usuario,'canCorrect',a.modalidade='Liquidacao' AND a.id_usuario_devedor=p_usuario AND a.id_lancamento_pagamento IS NOT NULL AND a.id_lancamento_recebimento IS NULL AND a.status IN('Aguardando_Credor','Rejeitado'),
 'mode',CASE WHEN a.modalidade='Perda' THEN 'adjustment' ELSE 'settlement' END,'adjustmentNote',CASE WHEN a.modalidade='Perda' THEN COALESCE(a.observacao_credor,a.observacao_devedor,'Ajuste de saldo sem movimentação bancária') ELSE NULL END,'reason',a.motivo_recusa_v4,'invoice',a.id_pagamento_fatura IS NOT NULL);
$$;
REVOKE EXECUTE ON FUNCTION mukirana_rateios.acerto_dto(public.acertos_rateios,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mukirana_rateios.acerto_dto(public.acertos_rateios,uuid) TO service_role;
