ALTER TABLE mukirana_private.accounts ADD CONSTRAINT accounts_owner_id_key UNIQUE(user_id,id);
ALTER TABLE mukirana_private.accounts ADD COLUMN opening_date date;
UPDATE mukirana_private.accounts SET opening_date=(created_at AT TIME ZONE 'America/Sao_Paulo')::date WHERE initial_cents IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE mukirana_private.transactions (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES mukirana_private.users(id) ON DELETE RESTRICT,
 kind text NOT NULL DEFAULT 'standard' CHECK(kind IN ('standard','opening_balance')),
 nature text NOT NULL CHECK(nature IN ('income','expense')),
 description text NOT NULL CHECK(char_length(description) BETWEEN 1 AND 160 AND description !~ '[[:cntrl:]]'),
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 0 AND 99999999999999 AND (kind='opening_balance' OR amount_cents>0)),
 occurred_on date NOT NULL CHECK(occurred_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 account_id uuid NOT NULL,
 category_id uuid NOT NULL,
 classification text NOT NULL DEFAULT 'variable' CHECK(classification IN ('fixed','variable')),
 modality text NOT NULL DEFAULT 'single' CHECK(modality='single'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CONSTRAINT transactions_account_owner_fkey FOREIGN KEY(user_id,account_id) REFERENCES mukirana_private.accounts(user_id,id) ON DELETE RESTRICT,
 CONSTRAINT transactions_category_owner_fkey FOREIGN KEY(user_id,category_id) REFERENCES mukirana_private.categories(user_id,id) ON DELETE RESTRICT
);
CREATE INDEX transactions_owner_date_idx ON mukirana_private.transactions(user_id,occurred_on DESC,id DESC);
CREATE INDEX transactions_owner_account_date_idx ON mukirana_private.transactions(user_id,account_id,occurred_on);
CREATE INDEX transactions_owner_category_idx ON mukirana_private.transactions(user_id,category_id);
CREATE UNIQUE INDEX transactions_one_opening_idx ON mukirana_private.transactions(user_id,account_id) WHERE kind='opening_balance';
ALTER TABLE mukirana_private.transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mukirana_private.transactions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION mukirana_private.finance_today() RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
$$;
CREATE FUNCTION mukirana_private.transaction_prepare() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_user uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_user:=OLD.user_id; ELSE v_user:=NEW.user_id; END IF;
 UPDATE mukirana_private.users u SET id=u.id WHERE u.id=v_user;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidade do lançamento é imutável.';
 END IF;
 IF NEW.description ~ '[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Descrição inválida.'; END IF;
 NEW.description:=pg_catalog.normalize(pg_catalog.btrim(pg_catalog.regexp_replace(NEW.description,'[[:space:]]+',' ','g')),'NFC');
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=NEW.account_id AND deleted_at IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Conta indisponível.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE user_id=v_user AND id=NEW.category_id
   AND ((NEW.kind='standard' AND system_key IS NULL) OR (NEW.kind='opening_balance' AND system_key='opening_balance'))) THEN
  RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Categoria indisponível.';
 END IF;
 IF NEW.kind='opening_balance' AND (NEW.description<>'Saldo inicial' OR NEW.classification<>'variable') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Saldo inicial incompatível.';
 END IF;
 IF TG_OP='INSERT' THEN NEW.version:=1; NEW.created_at:=pg_catalog.clock_timestamp();
 ELSE NEW.version:=OLD.version+1; END IF;
 NEW.updated_at:=pg_catalog.clock_timestamp();
 RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_prepare BEFORE INSERT OR UPDATE OR DELETE ON mukirana_private.transactions FOR EACH ROW EXECUTE FUNCTION mukirana_private.transaction_prepare();

CREATE OR REPLACE FUNCTION mukirana_private.category_link_count(p_user uuid,p_category uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT count(*) FROM mukirana_private.transactions WHERE user_id=p_user AND category_id=p_category;
$$;
COMMENT ON FUNCTION mukirana_private.category_link_count(uuid,uuid) IS 'Vínculos diretos reais. A FK de lançamentos impede remover categorias utilizadas.';

CREATE OR REPLACE FUNCTION mukirana_private.account_dto(p_account mukirana_private.accounts)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',p_account.id,'name',p_account.name,'type',p_account.type,
 'initialCents',p_account.initial_cents,'openingDate',p_account.opening_date,'version',p_account.version,
 'balanceCents',coalesce((SELECT sum(CASE WHEN nature='income' THEN amount_cents::numeric ELSE -amount_cents::numeric END)
 FROM mukirana_private.transactions WHERE user_id=p_account.user_id AND account_id=p_account.id
 AND occurred_on<=mukirana_private.finance_today()),0)::text);
$$;
CREATE FUNCTION mukirana_private.transaction_dto(p_row mukirana_private.transactions)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',p_row.id,'version',p_row.version,'kind',p_row.kind,'nature',p_row.nature,
 'description',p_row.description,'amountCents',p_row.amount_cents,'date',p_row.occurred_on,'accountId',p_row.account_id,
 'categoryId',p_row.category_id,'classification',p_row.classification,'modality',p_row.modality);
$$;

CREATE FUNCTION public.mukirana_transactions_list(p_session_token text,p_start_date date,p_end_date date,
 p_nature text,p_account_id uuid,p_category_id uuid,p_classification text,p_query text,
 p_cursor_date date,p_cursor_id uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_entries jsonb; v_summary jsonb; v_accounts jsonb; v_categories jsonb; v_more boolean;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,false);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date>p_end_date)
 OR (p_nature IS NOT NULL AND p_nature NOT IN ('income','expense'))
 OR (p_classification IS NOT NULL AND p_classification NOT IN ('fixed','variable'))
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_cursor_date IS NULL)<>(p_cursor_id IS NULL)
 OR p_query IS NULL OR char_length(p_query)>160 THEN RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 IF (p_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=p_account_id AND deleted_at IS NULL))
 OR (p_category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE user_id=v_user AND id=p_category_id)) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_request');
 END IF;
 WITH RECURSIVE tree AS (
  SELECT id FROM mukirana_private.categories WHERE user_id=v_user AND id=p_category_id
  UNION ALL SELECT c.id FROM mukirana_private.categories c JOIN tree t ON c.parent_id=t.id WHERE c.user_id=v_user
 ), filtered AS MATERIALIZED (
  SELECT t.* FROM mukirana_private.transactions t WHERE t.user_id=v_user
   AND (p_start_date IS NULL OR t.occurred_on>=p_start_date) AND (p_end_date IS NULL OR t.occurred_on<=p_end_date)
   AND (p_nature IS NULL OR t.nature=p_nature) AND (p_account_id IS NULL OR t.account_id=p_account_id)
   AND (p_category_id IS NULL OR t.category_id IN (SELECT id FROM tree))
   AND (p_classification IS NULL OR t.classification=p_classification)
   AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(t.description),pg_catalog.lower(p_query))>0)
 ), page AS (
  SELECT f.* FROM filtered f WHERE p_cursor_date IS NULL OR (f.occurred_on,f.id)<(p_cursor_date,p_cursor_id)
  ORDER BY f.occurred_on DESC,f.id DESC LIMIT p_limit+1
 ), numbered AS (SELECT p.*,row_number() OVER(ORDER BY occurred_on DESC,id DESC) AS rn FROM page p)
 SELECT coalesce((SELECT pg_catalog.jsonb_agg(mukirana_private.transaction_dto(t) ORDER BY n.occurred_on DESC,n.id DESC)
  FROM numbered n JOIN mukirana_private.transactions t ON t.id=n.id WHERE n.rn<=p_limit),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM page),
  (SELECT pg_catalog.jsonb_build_object('count',count(*),
   'incomeCents',coalesce(sum(amount_cents::numeric) FILTER(WHERE nature='income'),0)::text,
   'expenseCents',coalesce(sum(amount_cents::numeric) FILTER(WHERE nature='expense'),0)::text,
   'resultCents',coalesce(sum(CASE WHEN nature='income' THEN amount_cents::numeric ELSE -amount_cents::numeric END),0)::text)
  FROM filtered)
 INTO v_entries,v_more,v_summary;
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.account_dto(a) ORDER BY pg_catalog.lower(a.name),a.id),'[]'::jsonb)
 INTO v_accounts FROM mukirana_private.accounts a WHERE a.user_id=v_user AND a.deleted_at IS NULL;
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.category_dto(c) ORDER BY pg_catalog.lower(c.name),c.id),'[]'::jsonb)
 INTO v_categories FROM mukirana_private.categories c WHERE c.user_id=v_user
 AND (c.system_key IS NULL OR mukirana_private.category_link_count(v_user,c.id)>0);
 RETURN pg_catalog.jsonb_build_object('status','ok','entries',v_entries,'hasMore',v_more,'summary',v_summary,
  'accounts',v_accounts,'categories',v_categories,'today',mukirana_private.finance_today());
END;
$$;

CREATE FUNCTION public.mukirana_transactions_save(p_session_token text,p_transaction_id uuid,p_expected_version integer,
 p_nature text,p_description text,p_amount_cents bigint,p_occurred_on date,p_account_id uuid,p_category_id uuid,p_classification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_row mukirana_private.transactions%ROWTYPE; v_description text;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_transaction_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646
 OR p_nature IS NULL OR p_nature NOT IN ('income','expense') OR p_description IS NULL OR p_description ~ '[[:cntrl:]]'
 OR p_amount_cents IS NULL OR p_amount_cents NOT BETWEEN 1 AND 99999999999999
 OR p_occurred_on IS NULL OR p_occurred_on NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
 OR p_classification IS NULL OR p_classification NOT IN ('fixed','variable') THEN RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 v_description:=pg_catalog.normalize(pg_catalog.btrim(pg_catalog.regexp_replace(p_description,'[[:space:]]+',' ','g')),'NFC');
 IF char_length(v_description) NOT BETWEEN 1 AND 160 THEN RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 SELECT * INTO v_row FROM mukirana_private.transactions WHERE id=p_transaction_id AND user_id=v_user FOR UPDATE;
 IF FOUND THEN
  IF v_row.kind<>'standard' THEN RETURN pg_catalog.jsonb_build_object('status','opening_balance_only_in_account'); END IF;
  IF p_expected_version=0 OR v_row.version<>p_expected_version THEN
   IF v_row.version::bigint=p_expected_version::bigint+1 AND v_row.nature=p_nature AND v_row.description=v_description
   AND v_row.amount_cents=p_amount_cents AND v_row.occurred_on=p_occurred_on AND v_row.account_id=p_account_id
   AND v_row.category_id=p_category_id AND v_row.classification=p_classification THEN
    RETURN pg_catalog.jsonb_build_object('status','saved','entry',mukirana_private.transaction_dto(v_row));
   END IF;
   RETURN pg_catalog.jsonb_build_object('status','conflict');
  END IF;
 ELSIF p_expected_version<>0 THEN RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE id=p_account_id AND user_id=v_user AND deleted_at IS NULL) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_account'); END IF;
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=p_category_id AND user_id=v_user AND system_key IS NULL) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_category'); END IF;
 IF p_expected_version=0 THEN
  INSERT INTO mukirana_private.transactions(id,user_id,nature,description,amount_cents,occurred_on,account_id,category_id,classification)
  VALUES(p_transaction_id,v_user,p_nature,v_description,p_amount_cents,p_occurred_on,p_account_id,p_category_id,p_classification) RETURNING * INTO v_row;
 ELSE
  UPDATE mukirana_private.transactions SET nature=p_nature,description=v_description,amount_cents=p_amount_cents,
   occurred_on=p_occurred_on,account_id=p_account_id,category_id=p_category_id,classification=p_classification
   WHERE id=p_transaction_id AND user_id=v_user RETURNING * INTO v_row;
 END IF;
 RETURN pg_catalog.jsonb_build_object('status','saved','entry',mukirana_private.transaction_dto(v_row));
EXCEPTION WHEN unique_violation OR serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;

CREATE FUNCTION public.mukirana_transactions_health_check() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('service','mukirana','module','transactions','revision',1,'amountUnit','cents','modality','single');
$$;
REVOKE ALL ON FUNCTION mukirana_private.finance_today(),mukirana_private.transaction_prepare(),
 mukirana_private.transaction_dto(mukirana_private.transactions) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mukirana_transactions_list(text,date,date,text,uuid,uuid,text,text,date,uuid,integer),
 public.mukirana_transactions_save(text,uuid,integer,text,text,bigint,date,uuid,uuid,text),public.mukirana_transactions_health_check()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mukirana_transactions_list(text,date,date,text,uuid,uuid,text,text,date,uuid,integer),
 public.mukirana_transactions_save(text,uuid,integer,text,text,bigint,date,uuid,uuid,text),public.mukirana_transactions_health_check() TO service_role;
