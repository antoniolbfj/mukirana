CREATE FUNCTION mukirana_private.sync_account_opening(p_account mukirana_private.accounts)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_category uuid;
BEGIN
 IF p_account.initial_cents IS NULL THEN
  DELETE FROM mukirana_private.transactions WHERE user_id=p_account.user_id AND account_id=p_account.id AND kind='opening_balance';
  RETURN;
 END IF;
 INSERT INTO mukirana_private.categories(user_id,name,system_key)
 VALUES(p_account.user_id,'Saldo inicial','opening_balance')
 ON CONFLICT(user_id,system_key) WHERE system_key IS NOT NULL DO NOTHING;
 SELECT id INTO v_category FROM mukirana_private.categories WHERE user_id=p_account.user_id AND system_key='opening_balance';
 INSERT INTO mukirana_private.transactions AS current_row(user_id,kind,nature,description,amount_cents,occurred_on,account_id,category_id,classification)
 VALUES(p_account.user_id,'opening_balance',CASE WHEN p_account.initial_cents<0 THEN 'expense' ELSE 'income' END,
 'Saldo inicial',abs(p_account.initial_cents),p_account.opening_date,p_account.id,v_category,'variable')
 ON CONFLICT(user_id,account_id) WHERE kind='opening_balance' DO UPDATE
 SET nature=EXCLUDED.nature,amount_cents=EXCLUDED.amount_cents,occurred_on=EXCLUDED.occurred_on
 WHERE current_row.nature IS DISTINCT FROM EXCLUDED.nature OR current_row.amount_cents IS DISTINCT FROM EXCLUDED.amount_cents
 OR current_row.occurred_on IS DISTINCT FROM EXCLUDED.occurred_on;
END;
$$;

CREATE FUNCTION mukirana_private.accounts_save_core(p_session_token text,p_account_id uuid,p_expected_version integer,
 p_name text,p_type text,p_initial_cents bigint,p_confirm_type_change boolean,p_opening_date date)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_user uuid; v_row mukirana_private.accounts%ROWTYPE; v_date date;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_account_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646
 OR p_name IS NULL OR char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 80 OR p_name ~ '[[:cntrl:]]'
 OR p_type IS NULL OR p_type NOT IN ('consumption','investment','credit') OR p_confirm_type_change IS NULL
 OR (p_initial_cents IS NOT NULL AND p_initial_cents NOT BETWEEN -99999999999999 AND 99999999999999)
 OR (p_opening_date IS NOT NULL AND p_opening_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31') THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 SELECT * INTO v_row FROM mukirana_private.accounts WHERE id=p_account_id AND user_id=v_user FOR UPDATE;
 v_date:=CASE WHEN p_initial_cents IS NULL THEN NULL ELSE coalesce(p_opening_date,v_row.opening_date,mukirana_private.finance_today()) END;
 IF FOUND THEN
  IF v_row.deleted_at IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
  IF p_expected_version=0 OR v_row.version<>p_expected_version THEN
   IF v_row.version::bigint=p_expected_version::bigint+1 AND v_row.name=pg_catalog.btrim(p_name) AND v_row.type=p_type
    AND v_row.initial_cents IS NOT DISTINCT FROM p_initial_cents AND v_row.opening_date IS NOT DISTINCT FROM v_date THEN
    RETURN pg_catalog.jsonb_build_object('status','saved','account',mukirana_private.account_dto(v_row)); END IF;
   RETURN pg_catalog.jsonb_build_object('status','conflict');
  END IF;
  IF v_row.type<>p_type AND NOT p_confirm_type_change THEN RETURN pg_catalog.jsonb_build_object('status','type_confirmation_required'); END IF;
  UPDATE mukirana_private.accounts SET name=pg_catalog.btrim(p_name),type=p_type,initial_cents=p_initial_cents,
   opening_date=v_date,version=version+1,updated_at=pg_catalog.clock_timestamp()
   WHERE id=p_account_id AND user_id=v_user RETURNING * INTO v_row;
 ELSIF p_expected_version=0 THEN
  INSERT INTO mukirana_private.accounts(id,user_id,name,type,initial_cents,opening_date)
   VALUES(p_account_id,v_user,pg_catalog.btrim(p_name),p_type,p_initial_cents,v_date) RETURNING * INTO v_row;
 ELSE RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
 PERFORM mukirana_private.sync_account_opening(v_row);
 RETURN pg_catalog.jsonb_build_object('status','saved','account',mukirana_private.account_dto(v_row));
EXCEPTION WHEN unique_violation OR serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.mukirana_accounts_save(p_session_token text,p_account_id uuid,p_expected_version integer,
 p_name text,p_type text,p_initial_cents bigint,p_confirm_type_change boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT mukirana_private.accounts_save_core(p_session_token,p_account_id,p_expected_version,p_name,p_type,p_initial_cents,p_confirm_type_change,NULL);
$$;
CREATE FUNCTION public.mukirana_accounts_save_opening(p_session_token text,p_account_id uuid,p_expected_version integer,
 p_name text,p_type text,p_initial_cents bigint,p_confirm_type_change boolean,p_opening_date date)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT mukirana_private.accounts_save_core(p_session_token,p_account_id,p_expected_version,p_name,p_type,p_initial_cents,p_confirm_type_change,p_opening_date);
$$;
CREATE OR REPLACE FUNCTION public.mukirana_accounts_delete(p_session_token text,p_account_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_row mukirana_private.accounts%ROWTYPE;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_account_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 SELECT * INTO v_row FROM mukirana_private.accounts WHERE user_id=v_user AND id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
 IF v_row.deleted_at IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('status','deleted'); END IF;
 IF v_row.version<>p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status','conflict'); END IF;
 IF EXISTS(SELECT 1 FROM mukirana_private.transactions WHERE user_id=v_user AND account_id=p_account_id) THEN
  RETURN pg_catalog.jsonb_build_object('status','linked'); END IF;
 UPDATE mukirana_private.accounts SET deleted_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp()
  WHERE user_id=v_user AND id=p_account_id;
 RETURN pg_catalog.jsonb_build_object('status','deleted');
EXCEPTION WHEN serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;

CREATE FUNCTION public.mukirana_transactions_delete(p_session_token text,p_transaction_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_row mukirana_private.transactions%ROWTYPE; v_account mukirana_private.accounts%ROWTYPE;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_transaction_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 SELECT * INTO v_row FROM mukirana_private.transactions WHERE user_id=v_user AND id=p_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
 IF v_row.version<>p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status','conflict'); END IF;
 IF v_row.kind='opening_balance' THEN
  UPDATE mukirana_private.accounts SET initial_cents=NULL,opening_date=NULL,version=version+1,updated_at=pg_catalog.clock_timestamp()
   WHERE user_id=v_user AND id=v_row.account_id RETURNING * INTO v_account;
  PERFORM mukirana_private.sync_account_opening(v_account);
 ELSE
  DELETE FROM mukirana_private.transactions WHERE user_id=v_user AND id=p_transaction_id;
 END IF;
 RETURN pg_catalog.jsonb_build_object('status','deleted');
EXCEPTION WHEN serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.mukirana_accounts_health_check()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('service','mukirana','module','accounts','revision',2,'tables',1,'initialBalanceMode','ledger');
$$;

DO $$
DECLARE v_user uuid; v_row mukirana_private.accounts%ROWTYPE;
BEGIN
 FOR v_user IN SELECT id FROM mukirana_private.users ORDER BY id LOOP
  UPDATE mukirana_private.users u SET id=u.id WHERE u.id=v_user;
  FOR v_row IN SELECT * FROM mukirana_private.accounts WHERE user_id=v_user AND deleted_at IS NULL AND initial_cents IS NOT NULL LOOP
   PERFORM mukirana_private.sync_account_opening(v_row);
  END LOOP;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION mukirana_private.sync_account_opening(mukirana_private.accounts),
 mukirana_private.accounts_save_core(text,uuid,integer,text,text,bigint,boolean,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mukirana_accounts_save(text,uuid,integer,text,text,bigint,boolean),
 public.mukirana_accounts_save_opening(text,uuid,integer,text,text,bigint,boolean,date),
 public.mukirana_accounts_delete(text,uuid,integer),public.mukirana_transactions_delete(text,uuid,integer),public.mukirana_accounts_health_check()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mukirana_accounts_save(text,uuid,integer,text,text,bigint,boolean),
 public.mukirana_accounts_save_opening(text,uuid,integer,text,text,bigint,boolean,date),
 public.mukirana_accounts_delete(text,uuid,integer),public.mukirana_transactions_delete(text,uuid,integer),public.mukirana_accounts_health_check() TO service_role;

CREATE OR REPLACE FUNCTION public.mukirana_categories_save(
  p_session_token text, p_category_id uuid, p_expected_version integer,
  p_name text, p_parent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid; v_row mukirana_private.categories%ROWTYPE;
  v_parent mukirana_private.categories%ROWTYPE; v_name text; v_constraint text;
BEGIN
  v_user := mukirana_private.category_user(p_session_token, true);
  IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status', 'invalid_session'); END IF;
  IF p_category_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
     OR p_name IS NULL OR p_name ~ '[[:cntrl:]]' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_request');
  END IF;
  v_name := pg_catalog.normalize(pg_catalog.btrim(pg_catalog.regexp_replace(p_name, '[[:space:]]+', ' ', 'g')), 'NFC');
  IF pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_name');
  END IF;
  IF pg_catalog.lower(v_name) IN (pg_catalog.lower('Aguardando Categorização'),pg_catalog.lower('Saldo inicial')) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'reserved_name');
  END IF;
  SELECT * INTO v_row FROM mukirana_private.categories
    WHERE id = p_category_id AND user_id = v_user FOR UPDATE;
  IF FOUND THEN
    IF v_row.system_key IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('status', 'reserved'); END IF;
    IF p_expected_version = 0 OR v_row.version <> p_expected_version THEN
      -- Repetir exatamente uma gravação cuja resposta se perdeu não a duplica.
      IF v_row.version::bigint = p_expected_version::bigint + 1 AND v_row.name = v_name
         AND v_row.parent_id IS NOT DISTINCT FROM p_parent_id THEN
        RETURN pg_catalog.jsonb_build_object('status', 'saved', 'category', mukirana_private.category_dto(v_row));
      END IF;
      RETURN pg_catalog.jsonb_build_object('status', 'conflict');
    END IF;
  ELSIF p_expected_version <> 0 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM mukirana_private.categories
      WHERE id = p_parent_id AND user_id = v_user;
    IF NOT FOUND OR v_parent.system_key IS NOT NULL OR v_parent.parent_id IS NOT NULL
       OR p_parent_id = p_category_id THEN
      RETURN pg_catalog.jsonb_build_object('status', 'invalid_parent');
    END IF;
    IF EXISTS (SELECT 1 FROM mukirana_private.categories WHERE user_id = v_user AND parent_id = p_category_id) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'has_children');
    END IF;
  END IF;
  IF p_expected_version = 0 THEN
    INSERT INTO mukirana_private.categories(id, user_id, parent_id, name)
      VALUES (p_category_id, v_user, p_parent_id, v_name) RETURNING * INTO v_row;
  ELSE
    IF v_row.version = 2147483647 THEN RETURN pg_catalog.jsonb_build_object('status', 'conflict'); END IF;
    UPDATE mukirana_private.categories SET name = v_name, parent_id = p_parent_id
      WHERE id = p_category_id AND user_id = v_user RETURNING * INTO v_row;
  END IF;
  RETURN pg_catalog.jsonb_build_object('status', 'saved', 'category', mukirana_private.category_dto(v_row));
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RETURN pg_catalog.jsonb_build_object('status', CASE WHEN v_constraint IN
      ('categories_name_per_level_key', 'categories_root_name_key') THEN 'duplicate' ELSE 'conflict' END);
  WHEN serialization_failure OR deadlock_detected THEN
    RETURN pg_catalog.jsonb_build_object('status', 'conflict');
END;
$$;
