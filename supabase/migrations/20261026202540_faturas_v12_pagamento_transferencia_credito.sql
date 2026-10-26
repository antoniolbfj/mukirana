-- Pagamento de fatura é uma transferência; excedentes formam crédito.
-- Mantém a validação da origem e os locks existentes, sem reescrever movimentos.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
LOCK TABLE public.lancamentos,public.pagamentos_faturas,public.rateios,
 public.acertos_rateios,public.contas IN SHARE MODE;
CREATE TEMP TABLE mk_faturas_v12_preservacao ON COMMIT DROP AS
SELECT jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t)) AS hashes;

CREATE OR REPLACE FUNCTION mukirana_contas.limitar_pagamento_v3()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE gid uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id_grupo_cartao,NEW.valor,NEW.mes_referencia,NEW.status) IS NOT DISTINCT FROM (OLD.id_grupo_cartao,OLD.valor,OLD.mes_referencia,OLD.status) THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contas b WHERE b.id_conta=NEW.id_conta AND b.id_grupo_cartao_v3 IS NULL AND b.tipo_conta_v3='Consumo') THEN RAISE EXCEPTION 'LN:invoice_account';END IF;
 FOR gid IN SELECT DISTINCT x FROM unnest(ARRAY[NEW.id_grupo_cartao,CASE WHEN TG_OP='UPDATE' THEN OLD.id_grupo_cartao ELSE NULL END]) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('mukirana_fatura_pagamento:'||gid::text,0));
 END LOOP;
 RETURN NEW;
END $$;

DO $$ BEGIN
 ASSERT (SELECT hashes FROM mk_faturas_v12_preservacao) IS NOT DISTINCT FROM jsonb_build_object(
 'l',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_lancamento)) FROM public.lancamentos t),
 'p',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_pagamento_fatura)) FROM public.pagamentos_faturas t),
 'r',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_rateio)) FROM public.rateios t),
 'a',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_acerto_rateio)) FROM public.acertos_rateios t),
 'c',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id_conta)) FROM public.contas t)),
 'Histórico financeiro alterado';
END $$;
NOTIFY pgrst,'reload schema';
