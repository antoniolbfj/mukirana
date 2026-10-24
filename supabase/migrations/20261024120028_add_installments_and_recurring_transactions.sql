-- Parcelamentos e recorrências: grupos lógicos e lançamentos completos.
CREATE TABLE mukirana_private.transaction_groups (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES mukirana_private.users(id) ON DELETE RESTRICT,
 nature text NOT NULL CHECK(nature IN ('income','expense')),
 modality text NOT NULL CHECK(modality IN ('installment','recurring')),
 frequency text NOT NULL CHECK(frequency IN ('weekly','fortnightly','monthly','bimonthly','quarterly','semiannual','yearly')),
 start_on date NOT NULL CHECK(start_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 anchor_day smallint NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
 duration_months integer,
 planned_count integer NOT NULL CHECK(planned_count BETWEEN 1 AND 1000),
 renewed_from_id uuid,
 creation_hash text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 renewal_dismissed boolean NOT NULL DEFAULT false,
 last_mutation_id uuid,
 last_mutation_hash text,
 last_mutation_count integer,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 UNIQUE(user_id,id),
 FOREIGN KEY(user_id,renewed_from_id) REFERENCES mukirana_private.transaction_groups(user_id,id) ON DELETE RESTRICT,
 CHECK((modality='installment' AND duration_months IS NULL AND renewed_from_id IS NULL)
 OR (modality='recurring' AND duration_months IS NOT NULL AND duration_months BETWEEN 1 AND 1200))
);
CREATE UNIQUE INDEX transaction_groups_one_renewal_idx ON mukirana_private.transaction_groups(user_id,renewed_from_id);
ALTER TABLE mukirana_private.transaction_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mukirana_private.transaction_groups FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE mukirana_private.transactions ADD COLUMN group_id uuid,ADD COLUMN occurrence_index integer;
ALTER TABLE mukirana_private.transactions DROP CONSTRAINT transactions_modality_check;
ALTER TABLE mukirana_private.transactions ADD CONSTRAINT transactions_group_shape CHECK(
 (modality='single' AND group_id IS NULL AND occurrence_index IS NULL)
 OR (kind='standard' AND modality IN ('installment','recurring') AND group_id IS NOT NULL AND occurrence_index IS NOT NULL AND occurrence_index>0));
ALTER TABLE mukirana_private.transactions ADD CONSTRAINT transactions_group_owner_fkey FOREIGN KEY(user_id,group_id)
 REFERENCES mukirana_private.transaction_groups(user_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX transactions_group_sequence_idx ON mukirana_private.transactions(user_id,group_id,occurrence_index) WHERE group_id IS NOT NULL;

CREATE FUNCTION mukirana_private.occurrence_date(p_start date,p_frequency text,p_index integer,p_anchor integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_date date;v_month date;v_step integer;
BEGIN
 IF p_frequency IN ('weekly','fortnightly') THEN
  v_date:=p_start+p_index*CASE WHEN p_frequency='weekly' THEN 7 ELSE 15 END;
 ELSE
  v_step:=CASE p_frequency WHEN 'monthly' THEN 1 WHEN 'bimonthly' THEN 2 WHEN 'quarterly' THEN 3 WHEN 'semiannual' THEN 6 WHEN 'yearly' THEN 12 END;
  IF v_step IS NULL THEN RAISE invalid_parameter_value; END IF;
  v_month:=(pg_catalog.date_trunc('month',p_start::timestamp)+pg_catalog.make_interval(months=>p_index*v_step))::date;
  v_date:=v_month+(least(p_anchor,extract(day FROM (v_month+interval '1 month - 1 day'))::integer)-1);
 END IF;
 IF v_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE datetime_field_overflow; END IF;
 RETURN v_date;
END;
$$;
CREATE FUNCTION mukirana_private.occurrence_next_date(p_start date,p_frequency text,p_anchor integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN RETURN mukirana_private.occurrence_date(p_start,p_frequency,1,p_anchor);
EXCEPTION WHEN datetime_field_overflow THEN RETURN NULL;END;
$$;
CREATE FUNCTION mukirana_private.occurrence_schedule(p_modality text,p_amount bigint,p_start date,p_frequency text,p_quantity integer,p_months integer,p_anchor integer)
RETURNS TABLE(sequence_index integer,occurred_on date,amount_cents bigint) LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_end date;v_date date;v_n integer:=0;v_count integer;v_unit bigint;v_extra bigint;
BEGIN
 IF p_modality IS NULL OR p_modality NOT IN ('installment','recurring') OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 99999999999999
 OR p_start IS NULL OR p_start NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' OR p_frequency IS NULL
 OR p_frequency NOT IN ('weekly','fortnightly','monthly','bimonthly','quarterly','semiannual','yearly') OR p_anchor IS NULL OR p_anchor NOT BETWEEN 1 AND 31 THEN RAISE invalid_parameter_value;END IF;
 IF p_modality='installment' THEN
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000 OR p_months IS NOT NULL OR p_amount<p_quantity THEN RAISE invalid_parameter_value;END IF;
  v_count:=p_quantity;v_unit:=p_amount/v_count;v_extra:=p_amount%v_count;
 ELSE
  IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 1200 OR p_quantity IS NOT NULL THEN RAISE invalid_parameter_value;END IF;
  -- Duração exclusiva usa a data inicial real; o dia âncora pode vir da renovação.
  v_end:=mukirana_private.occurrence_date(p_start,'monthly',p_months,extract(day FROM p_start)::integer);
 END IF;
 LOOP
  EXIT WHEN p_modality='installment' AND v_n>=v_count;
  v_date:=mukirana_private.occurrence_date(p_start,p_frequency,v_n,p_anchor);
  EXIT WHEN p_modality='recurring' AND v_date>=v_end;
  IF v_n>=1000 THEN RAISE program_limit_exceeded;END IF;
  sequence_index:=v_n+1;occurred_on:=v_date;
  amount_cents:=CASE WHEN p_modality='recurring' THEN p_amount ELSE v_unit+CASE WHEN v_n=0 THEN v_extra ELSE 0 END END;
  RETURN NEXT;v_n:=v_n+1;
 END LOOP;
END;
$$;
CREATE FUNCTION mukirana_private.transaction_group_dto(p_group mukirana_private.transaction_groups)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',p_group.id,'version',p_group.version,'nature',p_group.nature,'modality',p_group.modality,
 'frequency',p_group.frequency,'startDate',p_group.start_on,'anchorDay',p_group.anchor_day,'durationMonths',p_group.duration_months,
 'plannedCount',p_group.planned_count,'count',x.n,'totalCents',coalesce(x.total,0)::text,'firstDate',x.first_date,'lastDate',x.last_date,
 'nextDate',mukirana_private.occurrence_next_date(x.last_date,p_group.frequency,p_group.anchor_day),
 'canRenew',p_group.modality='recurring' AND x.n>0 AND x.last_date<=mukirana_private.finance_today() AND (p_group.created_at AT TIME ZONE 'America/Sao_Paulo')::date<mukirana_private.finance_today() AND NOT EXISTS(SELECT 1 FROM mukirana_private.transaction_groups g WHERE g.user_id=p_group.user_id AND g.renewed_from_id=p_group.id),
 'renewed',EXISTS(SELECT 1 FROM mukirana_private.transaction_groups g WHERE g.user_id=p_group.user_id AND g.renewed_from_id=p_group.id))
 FROM (SELECT count(*) AS n,sum(amount_cents::numeric) AS total,min(occurred_on) AS first_date,max(occurred_on) AS last_date
 FROM mukirana_private.transactions WHERE user_id=p_group.user_id AND group_id=p_group.id) x;
$$;
CREATE FUNCTION mukirana_private.transaction_group_touch() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE mukirana_private.transaction_groups SET version=version+1,updated_at=pg_catalog.clock_timestamp() WHERE user_id=OLD.user_id AND id=OLD.group_id;
 ELSE
  UPDATE mukirana_private.transaction_groups SET version=version+1,updated_at=pg_catalog.clock_timestamp() WHERE user_id=NEW.user_id AND id=NEW.group_id;
 END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER transactions_group_touch AFTER INSERT OR UPDATE OR DELETE ON mukirana_private.transactions FOR EACH ROW EXECUTE FUNCTION mukirana_private.transaction_group_touch();

CREATE OR REPLACE FUNCTION mukirana_private.transaction_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_user uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_user:=OLD.user_id; ELSE v_user:=NEW.user_id; END IF;
 UPDATE mukirana_private.users u SET id=u.id WHERE u.id=v_user;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidade do lançamento é imutável.';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.occurrence_index IS DISTINCT FROM OLD.occurrence_index OR NEW.modality IS DISTINCT FROM OLD.modality) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Vínculo da ocorrência é imutável.';END IF;
 IF NEW.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=NEW.group_id AND modality=NEW.modality) THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Conjunto indisponível.';END IF;
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
$function$

;

CREATE OR REPLACE FUNCTION mukirana_private.transaction_dto(p_row mukirana_private.transactions)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT pg_catalog.jsonb_build_object('id',p_row.id,'version',p_row.version,'kind',p_row.kind,'nature',p_row.nature,
 'description',p_row.description,'amountCents',p_row.amount_cents,'date',p_row.occurred_on,'accountId',p_row.account_id,
 'categoryId',p_row.category_id,'classification',p_row.classification,'modality',p_row.modality) || CASE WHEN p_row.group_id IS NULL THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('groupId',p_row.group_id,'occurrenceIndex',p_row.occurrence_index) END;
$function$

;
CREATE FUNCTION public.mukirana_occurrences_preview(p_session_token text,p_modality text,p_amount_cents bigint,p_start_on date,p_frequency text,p_quantity integer,p_duration_months integer,p_renew_from_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_anchor integer;v_group mukirana_private.transaction_groups%ROWTYPE;v_data jsonb;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,false);
 IF v_user IS NULL THEN RETURN jsonb_build_object('status','invalid_session');END IF;
 v_anchor:=extract(day FROM p_start_on)::integer;
 IF p_renew_from_id IS NOT NULL THEN
  SELECT * INTO v_group FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=p_renew_from_id AND modality='recurring';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
  IF p_start_on=(mukirana_private.transaction_group_dto(v_group)->>'nextDate')::date THEN v_anchor:=v_group.anchor_day;END IF;
 END IF;
 SELECT jsonb_build_object('count',count(*),'totalCents',sum(amount_cents::numeric)::text,'firstDate',min(occurred_on),'lastDate',max(occurred_on),
 'firstAmountCents',min(amount_cents) FILTER(WHERE sequence_index=1),'regularAmountCents',min(amount_cents),
 'samples',(SELECT jsonb_agg(jsonb_build_object('index',q.sequence_index,'date',q.occurred_on,'amountCents',q.amount_cents) ORDER BY q.sequence_index)
 FROM mukirana_private.occurrence_schedule(p_modality,p_amount_cents,p_start_on,p_frequency,p_quantity,p_duration_months,v_anchor) q WHERE q.sequence_index<=5))
 INTO v_data FROM mukirana_private.occurrence_schedule(p_modality,p_amount_cents,p_start_on,p_frequency,p_quantity,p_duration_months,v_anchor);
 RETURN jsonb_build_object('status','ok','preview',v_data);
EXCEPTION WHEN invalid_parameter_value OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN jsonb_build_object('status','invalid_request');
 WHEN program_limit_exceeded THEN RETURN jsonb_build_object('status','too_many_occurrences');
END;
$$;
CREATE FUNCTION public.mukirana_occurrences_create(p_session_token text,p_group_id uuid,p_nature text,p_description text,p_amount_cents bigint,
 p_start_on date,p_frequency text,p_modality text,p_quantity integer,p_duration_months integer,p_account_id uuid,p_category_id uuid,p_classification text,p_renew_from_id uuid,p_renew_from_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_group mukirana_private.transaction_groups%ROWTYPE;v_old mukirana_private.transaction_groups%ROWTYPE;
 v_description text;v_hash text;v_anchor integer;v_count integer;v_first uuid;v_last date;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN jsonb_build_object('status','invalid_session');END IF;
 IF p_group_id IS NULL OR p_nature IS NULL OR p_nature NOT IN ('income','expense') OR p_description IS NULL OR p_description ~ '[[:cntrl:]]'
 OR p_classification IS NULL OR p_classification NOT IN ('fixed','variable') THEN RETURN jsonb_build_object('status','invalid_request');END IF;
 v_description:=pg_catalog.normalize(btrim(regexp_replace(p_description,'[[:space:]]+',' ','g')),'NFC');
 IF char_length(v_description) NOT BETWEEN 1 AND 160 THEN RETURN jsonb_build_object('status','invalid_request');END IF;
 v_hash:=encode(extensions.digest(jsonb_build_array(p_nature,v_description,p_amount_cents,p_start_on,p_frequency,p_modality,p_quantity,p_duration_months,p_account_id,p_category_id,p_classification,p_renew_from_id,p_renew_from_version)::text,'sha256'),'hex');
 SELECT * INTO v_group FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=p_group_id FOR UPDATE;
 IF FOUND THEN
  IF v_group.creation_hash<>v_hash THEN RETURN jsonb_build_object('status','conflict');END IF;
  SELECT id INTO v_first FROM mukirana_private.transactions WHERE user_id=v_user AND group_id=p_group_id ORDER BY occurrence_index LIMIT 1;
  IF v_first IS NULL THEN RETURN jsonb_build_object('status','conflict');END IF;
  RETURN jsonb_build_object('status','saved','entry',(SELECT mukirana_private.transaction_dto(t) FROM mukirana_private.transactions t WHERE id=v_first), 'group',mukirana_private.transaction_group_dto(v_group));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=p_account_id AND deleted_at IS NULL) THEN RETURN jsonb_build_object('status','invalid_account');END IF;
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE user_id=v_user AND id=p_category_id AND system_key IS NULL) THEN RETURN jsonb_build_object('status','invalid_category');END IF;
 v_anchor:=extract(day FROM p_start_on)::integer;
 IF p_renew_from_id IS NOT NULL THEN
  IF p_modality IS DISTINCT FROM 'recurring' THEN RETURN jsonb_build_object('status','invalid_request');END IF;
  SELECT * INTO v_old FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=p_renew_from_id AND modality='recurring' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
  IF EXISTS(SELECT 1 FROM mukirana_private.transaction_groups WHERE user_id=v_user AND renewed_from_id=v_old.id) THEN RETURN jsonb_build_object('status','already_renewed');END IF;
  IF p_renew_from_version IS NULL OR v_old.version<>p_renew_from_version THEN RETURN jsonb_build_object('status','conflict');END IF;
  SELECT max(occurred_on) INTO v_last FROM mukirana_private.transactions WHERE user_id=v_user AND group_id=v_old.id;
  IF v_last IS NULL OR v_last>mukirana_private.finance_today() OR (v_old.created_at AT TIME ZONE 'America/Sao_Paulo')::date>=mukirana_private.finance_today() THEN RETURN jsonb_build_object('status','not_due');END IF;
  IF p_start_on=mukirana_private.occurrence_next_date(v_last,v_old.frequency,v_old.anchor_day) THEN v_anchor:=v_old.anchor_day;END IF;
 ELSIF p_renew_from_version IS NOT NULL THEN RETURN jsonb_build_object('status','invalid_request');END IF;
 SELECT count(*) INTO v_count FROM mukirana_private.occurrence_schedule(p_modality,p_amount_cents,p_start_on,p_frequency,p_quantity,p_duration_months,v_anchor);
 INSERT INTO mukirana_private.transaction_groups(id,user_id,nature,modality,frequency,start_on,anchor_day,duration_months,planned_count,renewed_from_id,creation_hash)
 VALUES(p_group_id,v_user,p_nature,p_modality,p_frequency,p_start_on,v_anchor,p_duration_months,v_count,p_renew_from_id,v_hash);
 INSERT INTO mukirana_private.transactions(user_id,nature,description,amount_cents,occurred_on,account_id,category_id,classification,modality,group_id,occurrence_index)
 SELECT v_user,p_nature,v_description,s.amount_cents,s.occurred_on,p_account_id,p_category_id,p_classification,p_modality,p_group_id,s.sequence_index
 FROM mukirana_private.occurrence_schedule(p_modality,p_amount_cents,p_start_on,p_frequency,p_quantity,p_duration_months,v_anchor) s;
 IF p_renew_from_id IS NOT NULL THEN UPDATE mukirana_private.transaction_groups SET version=version+1,updated_at=clock_timestamp() WHERE id=p_renew_from_id AND user_id=v_user;END IF;
 SELECT * INTO v_group FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=p_group_id;
 SELECT id INTO v_first FROM mukirana_private.transactions WHERE user_id=v_user AND group_id=p_group_id ORDER BY occurrence_index LIMIT 1;
 RETURN jsonb_build_object('status','saved','entry',(SELECT mukirana_private.transaction_dto(t) FROM mukirana_private.transactions t WHERE id=v_first),'group',mukirana_private.transaction_group_dto(v_group));
EXCEPTION WHEN invalid_parameter_value OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN jsonb_build_object('status','invalid_request');
 WHEN program_limit_exceeded THEN RETURN jsonb_build_object('status','too_many_occurrences');
 WHEN unique_violation OR serialization_failure OR deadlock_detected THEN RETURN jsonb_build_object('status','conflict');
END;
$$;
CREATE FUNCTION public.mukirana_occurrences_get(p_session_token text,p_transaction_id uuid,p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_row mukirana_private.transactions%ROWTYPE;v_group mukirana_private.transaction_groups%ROWTYPE;v_counts jsonb;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,false);
 IF v_user IS NULL THEN RETURN jsonb_build_object('status','invalid_session');END IF;
 IF (p_transaction_id IS NULL)=(p_group_id IS NULL) THEN RETURN jsonb_build_object('status','invalid_request');END IF;
 IF p_transaction_id IS NOT NULL THEN
  SELECT * INTO v_row FROM mukirana_private.transactions WHERE user_id=v_user AND id=p_transaction_id AND group_id IS NOT NULL;
 ELSE
  SELECT * INTO v_row FROM mukirana_private.transactions WHERE user_id=v_user AND group_id=p_group_id ORDER BY occurrence_index DESC LIMIT 1;
 END IF;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
 SELECT * INTO v_group FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=v_row.group_id;
 SELECT jsonb_build_object('one',1,'following',count(*) FILTER(WHERE occurrence_index>=v_row.occurrence_index),
 'preceding',count(*) FILTER(WHERE occurrence_index<=v_row.occurrence_index),'all',count(*)) INTO v_counts
 FROM mukirana_private.transactions WHERE user_id=v_user AND group_id=v_row.group_id;
 RETURN jsonb_build_object('status','ok','entry',mukirana_private.transaction_dto(v_row),'group',mukirana_private.transaction_group_dto(v_group),'scopeCounts',v_counts);
END;
$$;
CREATE FUNCTION public.mukirana_occurrences_change(p_session_token text,p_group_id uuid,p_expected_group_version integer,p_transaction_id uuid,p_expected_version integer,
 p_operation_id uuid,p_action text,p_scope text,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_group mukirana_private.transaction_groups%ROWTYPE;v_row mukirana_private.transactions%ROWTYPE;v_hash text;v_ids uuid[];v_count integer;
 v_description text;v_amount bigint;v_date date;v_account uuid;v_category uuid;v_class text;v_nature text;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN jsonb_build_object('status','invalid_session');END IF;
 IF p_group_id IS NULL OR p_transaction_id IS NULL OR p_operation_id IS NULL OR p_expected_group_version IS NULL OR p_expected_group_version<1
 OR p_expected_version IS NULL OR p_expected_version<1 OR p_action IS NULL OR p_action NOT IN ('save','delete') OR p_scope IS NULL
 OR p_scope NOT IN ('one','following','preceding','all') OR (p_action='save' AND p_scope='preceding') OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object'
 OR (p_patch-ARRAY['description','amountCents','date','accountId','categoryId','classification','nature'])<>'{}'::jsonb THEN RETURN jsonb_build_object('status','invalid_request');END IF;
 v_hash:=encode(extensions.digest(jsonb_build_array(p_group_id,p_expected_group_version,p_transaction_id,p_expected_version,p_action,p_scope,p_patch)::text,'sha256'),'hex');
 SELECT * INTO v_group FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
 IF v_group.last_mutation_id=p_operation_id THEN
  IF v_group.last_mutation_hash<>v_hash THEN RETURN jsonb_build_object('status','conflict');END IF;
  SELECT * INTO v_row FROM mukirana_private.transactions WHERE user_id=v_user AND id=p_transaction_id AND group_id=p_group_id;
  IF p_action='save' AND NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
  RETURN jsonb_build_object('status',CASE WHEN p_action='save' THEN 'saved' ELSE 'deleted' END,'entry',CASE WHEN p_action='save' THEN mukirana_private.transaction_dto(v_row) ELSE NULL END,
  'group',mukirana_private.transaction_group_dto(v_group),'affectedCount',v_group.last_mutation_count);
 END IF;
 IF v_group.version<>p_expected_group_version THEN RETURN jsonb_build_object('status','conflict');END IF;
 SELECT * INTO v_row FROM mukirana_private.transactions WHERE user_id=v_user AND id=p_transaction_id AND group_id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
 IF v_row.version<>p_expected_version THEN RETURN jsonb_build_object('status','conflict');END IF;
 SELECT array_agg(id ORDER BY occurrence_index) INTO v_ids FROM mukirana_private.transactions WHERE user_id=v_user AND group_id=p_group_id
 AND (p_scope='all' OR (p_scope='one' AND id=p_transaction_id) OR (p_scope='following' AND occurrence_index>=v_row.occurrence_index) OR (p_scope='preceding' AND occurrence_index<=v_row.occurrence_index));
 v_count:=cardinality(v_ids);
 IF p_action='delete' THEN
  DELETE FROM mukirana_private.transactions WHERE user_id=v_user AND id=ANY(v_ids);
 ELSE
  IF p_patch ? 'description' THEN
   IF jsonb_typeof(p_patch->'description')<>'string' OR p_patch->>'description' ~ '[[:cntrl:]]' THEN RETURN jsonb_build_object('status','invalid_request');END IF;
   v_description:=pg_catalog.normalize(btrim(regexp_replace(p_patch->>'description','[[:space:]]+',' ','g')),'NFC');
   IF char_length(v_description) NOT BETWEEN 1 AND 160 THEN RETURN jsonb_build_object('status','invalid_request');END IF;
  END IF;
  IF p_patch ? 'amountCents' THEN
   IF jsonb_typeof(p_patch->'amountCents')<>'number' OR (p_patch->>'amountCents') !~ '^[1-9][0-9]{0,13}$' THEN RETURN jsonb_build_object('status','invalid_request');END IF;
   v_amount:=(p_patch->>'amountCents')::bigint;
  END IF;
  IF p_patch ? 'date' THEN
   IF jsonb_typeof(p_patch->'date')<>'string' OR (p_patch->>'date') !~ '^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN jsonb_build_object('status','invalid_request');END IF;
   v_date:=(p_patch->>'date')::date;
  END IF;
  IF p_patch ? 'accountId' THEN
   v_account:=(p_patch->>'accountId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=v_account AND deleted_at IS NULL) THEN RETURN jsonb_build_object('status','invalid_account');END IF;
  END IF;
  IF p_patch ? 'categoryId' THEN
   v_category:=(p_patch->>'categoryId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE user_id=v_user AND id=v_category AND system_key IS NULL) THEN RETURN jsonb_build_object('status','invalid_category');END IF;
  END IF;
  IF p_patch ? 'classification' THEN
   v_class:=p_patch->>'classification';IF v_class IS NULL OR v_class NOT IN ('fixed','variable') THEN RETURN jsonb_build_object('status','invalid_request');END IF;
  END IF;
  IF p_patch ? 'nature' THEN
   v_nature:=p_patch->>'nature';IF v_nature IS NULL OR v_nature NOT IN ('income','expense') THEN RETURN jsonb_build_object('status','invalid_request');END IF;
  END IF;
  IF p_patch<>'{}'::jsonb THEN
   UPDATE mukirana_private.transactions t SET description=coalesce(v_description,t.description),amount_cents=coalesce(v_amount,t.amount_cents),
    occurred_on=CASE WHEN v_date IS NULL THEN t.occurred_on WHEN p_scope='one' THEN v_date ELSE mukirana_private.occurrence_date(v_date,v_group.frequency,t.occurrence_index-v_row.occurrence_index,extract(day FROM v_date)::integer) END,
    account_id=coalesce(v_account,t.account_id),category_id=coalesce(v_category,t.category_id),classification=coalesce(v_class,t.classification),nature=coalesce(v_nature,t.nature)
    WHERE t.user_id=v_user AND t.id=ANY(v_ids);
   IF v_date IS NOT NULL AND p_scope<>'one' THEN UPDATE mukirana_private.transaction_groups SET anchor_day=extract(day FROM v_date)::integer WHERE user_id=v_user AND id=p_group_id;END IF;
  ELSE v_count:=0;END IF;
 END IF;
 UPDATE mukirana_private.transaction_groups SET last_mutation_id=p_operation_id,last_mutation_hash=v_hash,last_mutation_count=v_count,
 version=version+1,updated_at=clock_timestamp() WHERE user_id=v_user AND id=p_group_id RETURNING * INTO v_group;
 IF p_action='save' THEN SELECT * INTO v_row FROM mukirana_private.transactions WHERE user_id=v_user AND id=p_transaction_id;END IF;
 RETURN jsonb_build_object('status',CASE WHEN p_action='save' THEN 'saved' ELSE 'deleted' END,'entry',CASE WHEN p_action='save' THEN mukirana_private.transaction_dto(v_row) ELSE NULL END,
 'group',mukirana_private.transaction_group_dto(v_group),'affectedCount',v_count);
EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN jsonb_build_object('status','invalid_request');
 WHEN unique_violation OR serialization_failure OR deadlock_detected THEN RETURN jsonb_build_object('status','conflict');
END;
$$;
CREATE FUNCTION public.mukirana_occurrences_dismiss(p_session_token text,p_group_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_group mukirana_private.transaction_groups%ROWTYPE;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN jsonb_build_object('status','invalid_session');END IF;
 SELECT * INTO v_group FROM mukirana_private.transaction_groups WHERE user_id=v_user AND id=p_group_id AND modality='recurring' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
 IF p_expected_version IS NULL OR v_group.version<>p_expected_version THEN RETURN jsonb_build_object('status','conflict');END IF;
 UPDATE mukirana_private.transaction_groups SET renewal_dismissed=true,version=version+1,updated_at=clock_timestamp() WHERE user_id=v_user AND id=p_group_id;
 RETURN jsonb_build_object('status','dismissed');
END;
$$;
CREATE FUNCTION public.mukirana_occurrences_health_check() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('service','mukirana','module','occurrences','revision',1,'modalities',jsonb_build_array('single','installment','recurring'),'exclusiveEnd',true,'individualDeletion',true);
$$;

CREATE FUNCTION mukirana_private.transactions_list_core(p_session_token text, p_start_date date, p_end_date date, p_nature text, p_account_id uuid, p_category_id uuid, p_classification text, p_query text, p_cursor_date date, p_cursor_id uuid, p_limit integer, p_single_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_user uuid; v_entries jsonb; v_summary jsonb; v_accounts jsonb; v_categories jsonb; v_more boolean;v_groups jsonb;v_renewals jsonb;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,false);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_start_date IS NOT NULL AND p_end_date IS NULL THEN p_end_date:=mukirana_private.finance_today(); END IF;
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
  SELECT t.* FROM mukirana_private.transactions t WHERE t.user_id=v_user AND (NOT p_single_only OR t.group_id IS NULL)
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
 v_accounts:=mukirana_private.projected_accounts(v_user,p_end_date);
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.category_dto(c) ORDER BY pg_catalog.lower(c.name),c.id),'[]'::jsonb)
 INTO v_categories FROM mukirana_private.categories c WHERE c.user_id=v_user
 AND (c.system_key IS NULL OR mukirana_private.category_link_count(v_user,c.id)>0);
 SELECT coalesce(jsonb_agg(mukirana_private.transaction_group_dto(g)),'[]'::jsonb) INTO v_groups
 FROM mukirana_private.transaction_groups g WHERE g.user_id=v_user AND g.id IN (SELECT (e->>'groupId')::uuid FROM jsonb_array_elements(v_entries) e WHERE e ? 'groupId');
 v_renewals:='[]'::jsonb;
 IF NOT p_single_only THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('group',mukirana_private.transaction_group_dto(g),'description',last_row.description,'date',last_row.occurred_on) ORDER BY last_row.occurred_on,g.id),'[]'::jsonb)
  INTO v_renewals FROM mukirana_private.transaction_groups g CROSS JOIN LATERAL
   (SELECT t.description,t.occurred_on FROM mukirana_private.transactions t WHERE t.user_id=g.user_id AND t.group_id=g.id ORDER BY t.occurred_on DESC,t.occurrence_index DESC LIMIT 1) last_row
  WHERE g.user_id=v_user AND g.modality='recurring' AND NOT g.renewal_dismissed
   AND (g.created_at AT TIME ZONE 'America/Sao_Paulo')::date<mukirana_private.finance_today()
   AND last_row.occurred_on<=mukirana_private.finance_today()
   AND NOT EXISTS(SELECT 1 FROM mukirana_private.transaction_groups renewed WHERE renewed.user_id=v_user AND renewed.renewed_from_id=g.id);
 END IF;
 RETURN pg_catalog.jsonb_build_object('status','ok','entries',v_entries,'hasMore',v_more,'summary',v_summary,
  'accounts',v_accounts,'categories',v_categories,'groups',v_groups,'renewals',v_renewals,'today',mukirana_private.finance_today());
END;
$function$

;

CREATE OR REPLACE FUNCTION public.mukirana_transactions_list(p_session_token text,p_start_date date,p_end_date date,p_nature text,p_account_id uuid,p_category_id uuid,p_classification text,p_query text,p_cursor_date date,p_cursor_id uuid,p_limit integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT mukirana_private.transactions_list_core(p_session_token,p_start_date,p_end_date,p_nature,p_account_id,p_category_id,p_classification,p_query,p_cursor_date,p_cursor_id,p_limit,true);
$$;

CREATE FUNCTION public.mukirana_transactions_list_series(p_session_token text,p_start_date date,p_end_date date,p_nature text,p_account_id uuid,p_category_id uuid,p_classification text,p_query text,p_cursor_date date,p_cursor_id uuid,p_limit integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT mukirana_private.transactions_list_core(p_session_token,p_start_date,p_end_date,p_nature,p_account_id,p_category_id,p_classification,p_query,p_cursor_date,p_cursor_id,p_limit,false);
$$;
CREATE FUNCTION mukirana_private.transaction_group_prepare() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE mukirana_private.users u SET id=u.id WHERE u.id=NEW.user_id;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
  OR NEW.nature IS DISTINCT FROM OLD.nature OR NEW.modality IS DISTINCT FROM OLD.modality OR NEW.frequency IS DISTINCT FROM OLD.frequency
  OR NEW.start_on IS DISTINCT FROM OLD.start_on OR NEW.duration_months IS DISTINCT FROM OLD.duration_months OR NEW.planned_count IS DISTINCT FROM OLD.planned_count
  OR NEW.renewed_from_id IS DISTINCT FROM OLD.renewed_from_id OR NEW.creation_hash IS DISTINCT FROM OLD.creation_hash THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidade e configuração original do conjunto são imutáveis.';
  END IF;
  NEW.version:=OLD.version+1;
 ELSE NEW.version:=1;END IF;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END;
$$;
CREATE TRIGGER transaction_groups_prepare BEFORE INSERT OR UPDATE ON mukirana_private.transaction_groups FOR EACH ROW EXECUTE FUNCTION mukirana_private.transaction_group_prepare();
REVOKE ALL ON FUNCTION mukirana_private.occurrence_date(date,text,integer,integer),mukirana_private.occurrence_next_date(date,text,integer),
 mukirana_private.occurrence_schedule(text,bigint,date,text,integer,integer,integer),mukirana_private.transaction_group_dto(mukirana_private.transaction_groups),
 mukirana_private.transaction_group_touch(),mukirana_private.transaction_group_prepare(),
 mukirana_private.transactions_list_core(text,date,date,text,uuid,uuid,text,text,date,uuid,integer,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mukirana_occurrences_preview(text,text,bigint,date,text,integer,integer,uuid),
 public.mukirana_occurrences_create(text,uuid,text,text,bigint,date,text,text,integer,integer,uuid,uuid,text,uuid,integer),
 public.mukirana_occurrences_get(text,uuid,uuid),public.mukirana_occurrences_change(text,uuid,integer,uuid,integer,uuid,text,text,jsonb),
 public.mukirana_occurrences_dismiss(text,uuid,integer),public.mukirana_occurrences_health_check(),
 public.mukirana_transactions_list_series(text,date,date,text,uuid,uuid,text,text,date,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mukirana_occurrences_preview(text,text,bigint,date,text,integer,integer,uuid),
 public.mukirana_occurrences_create(text,uuid,text,text,bigint,date,text,text,integer,integer,uuid,uuid,text,uuid,integer),
 public.mukirana_occurrences_get(text,uuid,uuid),public.mukirana_occurrences_change(text,uuid,integer,uuid,integer,uuid,text,text,jsonb),
 public.mukirana_occurrences_dismiss(text,uuid,integer),public.mukirana_occurrences_health_check(),
 public.mukirana_transactions_list_series(text,date,date,text,uuid,uuid,text,text,date,uuid,integer) TO service_role;
