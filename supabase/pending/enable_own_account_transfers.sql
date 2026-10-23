-- Instalação de transferências entre contas próprias.
-- Projeto: thpqielkntwcbdycucfn. Executar uma vez no SQL Editor do Supabase.
-- Inclui 60 verificações; qualquer falha reverte toda a instalação.
-- Fixtures são revertidas antes de COMMIT; nenhum e-mail é enviado.
BEGIN;

-- Uma operação contém ambas as pontas; a view deriva dois movimentos inseparáveis.
CREATE TABLE mukirana_private.transfers (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES mukirana_private.users(id) ON DELETE RESTRICT,
 description text NOT NULL CHECK(char_length(description) BETWEEN 1 AND 160 AND description !~ '[[:cntrl:]]'),
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 99999999999999),
 occurred_on date NOT NULL CHECK(occurred_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 source_account_id uuid NOT NULL,
 destination_account_id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CONSTRAINT transfers_distinct_accounts CHECK(source_account_id<>destination_account_id),
 CONSTRAINT transfers_source_owner_fkey FOREIGN KEY(user_id,source_account_id) REFERENCES mukirana_private.accounts(user_id,id) ON DELETE RESTRICT,
 CONSTRAINT transfers_destination_owner_fkey FOREIGN KEY(user_id,destination_account_id) REFERENCES mukirana_private.accounts(user_id,id) ON DELETE RESTRICT
);
CREATE INDEX transfers_owner_date_idx ON mukirana_private.transfers(user_id,occurred_on DESC,id DESC);
CREATE INDEX transfers_owner_source_date_idx ON mukirana_private.transfers(user_id,source_account_id,occurred_on);
CREATE INDEX transfers_owner_destination_date_idx ON mukirana_private.transfers(user_id,destination_account_id,occurred_on);
ALTER TABLE mukirana_private.transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mukirana_private.transfers FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION mukirana_private.transfer_prepare() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_user uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_user:=OLD.user_id; ELSE v_user:=NEW.user_id; END IF;
 UPDATE mukirana_private.users u SET id=u.id WHERE u.id=v_user;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
  OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidade da transferência é imutável.';
 END IF;
 IF NEW.description ~ '[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Descrição inválida.'; END IF;
 NEW.description:=pg_catalog.normalize(pg_catalog.btrim(pg_catalog.regexp_replace(NEW.description,'[[:space:]]+',' ','g')),'NFC');
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=NEW.source_account_id AND deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=NEW.destination_account_id AND deleted_at IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Conta indisponível.';
 END IF;
 IF TG_OP='INSERT' THEN NEW.version:=1; NEW.created_at:=pg_catalog.clock_timestamp();
 ELSE NEW.version:=OLD.version+1; END IF;
 NEW.updated_at:=pg_catalog.clock_timestamp();
 RETURN NEW;
END;
$$;
CREATE TRIGGER transfers_prepare BEFORE INSERT OR UPDATE OR DELETE ON mukirana_private.transfers
 FOR EACH ROW EXECUTE FUNCTION mukirana_private.transfer_prepare();

-- Não se mantêm saldos nem cópias editáveis das pontas. Nenhuma transferência entra
-- em transactions (receitas/despesas) ou em suas categorias/totais.
CREATE VIEW mukirana_private.account_movements WITH (security_invoker=true) AS
 SELECT user_id,account_id,occurred_on,id AS operation_id,kind AS operation_kind,
  CASE WHEN nature='income' THEN amount_cents::numeric ELSE -amount_cents::numeric END AS signed_cents,
  nature AS side FROM mukirana_private.transactions
 UNION ALL
 SELECT user_id,source_account_id,occurred_on,id,'transfer',-amount_cents::numeric,'source' FROM mukirana_private.transfers
 UNION ALL
 SELECT user_id,destination_account_id,occurred_on,id,'transfer',amount_cents::numeric,'destination' FROM mukirana_private.transfers;
REVOKE ALL ON TABLE mukirana_private.account_movements FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION mukirana_private.account_position(p_user uuid,p_account uuid,p_through date)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(signed_cents),0) FROM mukirana_private.account_movements
 WHERE user_id=p_user AND account_id=p_account AND (p_through IS NULL OR occurred_on<=p_through);
$$;
CREATE OR REPLACE FUNCTION mukirana_private.account_dto(p_account mukirana_private.accounts)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',p_account.id,'name',p_account.name,'type',p_account.type,
 'initialCents',p_account.initial_cents,'openingDate',p_account.opening_date,'version',p_account.version,
 'balanceCents',mukirana_private.account_position(p_account.user_id,p_account.id,mukirana_private.finance_today())::text);
$$;
CREATE FUNCTION mukirana_private.projected_accounts(p_user uuid,p_through date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.account_dto(a) || pg_catalog.jsonb_build_object(
 'projectedCents',mukirana_private.account_position(a.user_id,a.id,p_through)::text)
 ORDER BY pg_catalog.lower(a.name),a.id),'[]'::jsonb)
 FROM mukirana_private.accounts a WHERE a.user_id=p_user AND a.deleted_at IS NULL;
$$;
CREATE FUNCTION mukirana_private.transfer_dto(p_row mukirana_private.transfers)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',p_row.id,'version',p_row.version,'description',p_row.description,
 'amountCents',p_row.amount_cents,'date',p_row.occurred_on,
 'sourceAccountId',p_row.source_account_id,'destinationAccountId',p_row.destination_account_id);
$$;

CREATE FUNCTION public.mukirana_transfers_list(p_session_token text,p_start_date date,p_end_date date,
 p_account_id uuid,p_query text,p_cursor_date date,p_cursor_id uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_entries jsonb;v_summary jsonb;v_more boolean;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,false);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_start_date IS NOT NULL AND p_end_date IS NULL THEN p_end_date:=mukirana_private.finance_today(); END IF;
 IF (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date>p_end_date)
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_cursor_date IS NULL)<>(p_cursor_id IS NULL)
 OR p_query IS NULL OR char_length(p_query)>160
 OR (p_start_date IS NOT NULL AND p_start_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
 OR (p_end_date IS NOT NULL AND p_end_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
 OR (p_cursor_date IS NOT NULL AND p_cursor_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31') THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 IF p_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE user_id=v_user AND id=p_account_id AND deleted_at IS NULL) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 WITH filtered AS MATERIALIZED (
  SELECT t.* FROM mukirana_private.transfers t WHERE t.user_id=v_user
   AND (p_start_date IS NULL OR t.occurred_on>=p_start_date) AND (p_end_date IS NULL OR t.occurred_on<=p_end_date)
   AND (p_account_id IS NULL OR t.source_account_id=p_account_id OR t.destination_account_id=p_account_id)
   AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(t.description),pg_catalog.lower(p_query))>0)
 ), page AS (
  SELECT f.* FROM filtered f WHERE p_cursor_date IS NULL OR (f.occurred_on,f.id)<(p_cursor_date,p_cursor_id)
  ORDER BY f.occurred_on DESC,f.id DESC LIMIT p_limit+1
 ), numbered AS (SELECT p.*,row_number() OVER(ORDER BY occurred_on DESC,id DESC) AS rn FROM page p)
 SELECT coalesce((SELECT pg_catalog.jsonb_agg(mukirana_private.transfer_dto(t) ORDER BY n.occurred_on DESC,n.id DESC)
  FROM numbered n JOIN mukirana_private.transfers t ON t.id=n.id WHERE n.rn<=p_limit),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM page),
  (SELECT pg_catalog.jsonb_build_object('count',count(*),'amountCents',coalesce(sum(amount_cents::numeric),0)::text) FROM filtered)
 INTO v_entries,v_more,v_summary;
 RETURN pg_catalog.jsonb_build_object('status','ok','entries',v_entries,'hasMore',v_more,'summary',v_summary,
  'accounts',mukirana_private.projected_accounts(v_user,p_end_date),'today',mukirana_private.finance_today());
END;
$$;
CREATE FUNCTION public.mukirana_transfers_save(p_session_token text,p_transfer_id uuid,p_expected_version integer,
 p_description text,p_amount_cents bigint,p_occurred_on date,p_source_account_id uuid,p_destination_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_row mukirana_private.transfers%ROWTYPE;v_description text;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_transfer_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646
 OR p_description IS NULL OR p_description ~ '[[:cntrl:]]'
 OR p_amount_cents IS NULL OR p_amount_cents NOT BETWEEN 1 AND 99999999999999
 OR p_occurred_on IS NULL OR p_occurred_on NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
 OR p_source_account_id IS NULL OR p_destination_account_id IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 IF p_source_account_id=p_destination_account_id THEN RETURN pg_catalog.jsonb_build_object('status','same_account'); END IF;
 v_description:=pg_catalog.normalize(pg_catalog.btrim(pg_catalog.regexp_replace(p_description,'[[:space:]]+',' ','g')),'NFC');
 IF char_length(v_description) NOT BETWEEN 1 AND 160 THEN RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 SELECT * INTO v_row FROM mukirana_private.transfers WHERE id=p_transfer_id AND user_id=v_user FOR UPDATE;
 IF FOUND THEN
  IF p_expected_version=0 OR v_row.version<>p_expected_version THEN
   IF v_row.version::bigint=p_expected_version::bigint+1 AND v_row.description=v_description
   AND v_row.amount_cents=p_amount_cents AND v_row.occurred_on=p_occurred_on
   AND v_row.source_account_id=p_source_account_id AND v_row.destination_account_id=p_destination_account_id THEN
    RETURN pg_catalog.jsonb_build_object('status','saved','entry',mukirana_private.transfer_dto(v_row));
   END IF;
   RETURN pg_catalog.jsonb_build_object('status','conflict');
  END IF;
 ELSIF p_expected_version<>0 THEN RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
 IF NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE id=p_source_account_id AND user_id=v_user AND deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM mukirana_private.accounts WHERE id=p_destination_account_id AND user_id=v_user AND deleted_at IS NULL) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_account'); END IF;
 IF p_expected_version=0 THEN
  INSERT INTO mukirana_private.transfers(id,user_id,description,amount_cents,occurred_on,source_account_id,destination_account_id)
   VALUES(p_transfer_id,v_user,v_description,p_amount_cents,p_occurred_on,p_source_account_id,p_destination_account_id) RETURNING * INTO v_row;
 ELSE
  UPDATE mukirana_private.transfers SET description=v_description,amount_cents=p_amount_cents,occurred_on=p_occurred_on,
   source_account_id=p_source_account_id,destination_account_id=p_destination_account_id
   WHERE id=p_transfer_id AND user_id=v_user RETURNING * INTO v_row;
 END IF;
 RETURN pg_catalog.jsonb_build_object('status','saved','entry',mukirana_private.transfer_dto(v_row));
EXCEPTION WHEN unique_violation OR serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;
CREATE FUNCTION public.mukirana_transfers_delete(p_session_token text,p_transfer_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_row mukirana_private.transfers%ROWTYPE;
BEGIN
 v_user:=mukirana_private.category_user(p_session_token,true);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','invalid_session'); END IF;
 IF p_transfer_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483646 THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_request'); END IF;
 SELECT * INTO v_row FROM mukirana_private.transfers WHERE id=p_transfer_id AND user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','not_found'); END IF;
 IF v_row.version<>p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status','conflict'); END IF;
 DELETE FROM mukirana_private.transfers WHERE id=p_transfer_id AND user_id=v_user;
 RETURN pg_catalog.jsonb_build_object('status','deleted');
EXCEPTION WHEN serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;
CREATE FUNCTION public.mukirana_transfers_health_check() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('service','mukirana','module','transfers','revision',1,'amountUnit','cents','pairedMovements',true);
$$;
REVOKE ALL ON FUNCTION mukirana_private.transfer_prepare(),mukirana_private.account_position(uuid,uuid,date),
 mukirana_private.projected_accounts(uuid,date),mukirana_private.transfer_dto(mukirana_private.transfers) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mukirana_transfers_list(text,date,date,uuid,text,date,uuid,integer),
 public.mukirana_transfers_save(text,uuid,integer,text,bigint,date,uuid,uuid),public.mukirana_transfers_delete(text,uuid,integer),
 public.mukirana_transfers_health_check() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mukirana_transfers_list(text,date,date,uuid,text,date,uuid,integer),
 public.mukirana_transfers_save(text,uuid,integer,text,bigint,date,uuid,uuid),public.mukirana_transfers_delete(text,uuid,integer),
 public.mukirana_transfers_health_check() TO service_role;

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
 IF EXISTS(SELECT 1 FROM mukirana_private.account_movements WHERE user_id=v_user AND account_id=p_account_id) THEN
  RETURN pg_catalog.jsonb_build_object('status','linked'); END IF;
 UPDATE mukirana_private.accounts SET deleted_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp()
  WHERE user_id=v_user AND id=p_account_id;
 RETURN pg_catalog.jsonb_build_object('status','deleted');
EXCEPTION WHEN serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status','conflict');
END;
$$;


CREATE OR REPLACE FUNCTION public.mukirana_transactions_list(p_session_token text,p_start_date date,p_end_date date,
 p_nature text,p_account_id uuid,p_category_id uuid,p_classification text,p_query text,
 p_cursor_date date,p_cursor_id uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid; v_entries jsonb; v_summary jsonb; v_accounts jsonb; v_categories jsonb; v_more boolean;
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
 v_accounts:=mukirana_private.projected_accounts(v_user,p_end_date);
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.category_dto(c) ORDER BY pg_catalog.lower(c.name),c.id),'[]'::jsonb)
 INTO v_categories FROM mukirana_private.categories c WHERE c.user_id=v_user
 AND (c.system_key IS NULL OR mukirana_private.category_link_count(v_user,c.id)>0);
 RETURN pg_catalog.jsonb_build_object('status','ok','entries',v_entries,'hasMore',v_more,'summary',v_summary,
  'accounts',v_accounts,'categories',v_categories,'today',mukirana_private.finance_today());
END;
$$;

-- Banco real, fixtures exclusivamente em subtransação revertida; não envia e-mails.
DO $test$
DECLARE
 u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();
 token text:=encode(extensions.gen_random_bytes(32),'hex');token2 text:=encode(extensions.gen_random_bytes(32),'hex');
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();foreign_account uuid:=gen_random_uuid();deleted_account uuid:=gen_random_uuid();
 cat uuid:=gen_random_uuid();expense uuid:=gen_random_uuid();t uuid:=gen_random_uuid();f uuid:=gen_random_uuid();payment uuid:=gen_random_uuid();
 today date:=mukirana_private.finance_today();r jsonb;row jsonb;ids uuid[]:='{}';cursor_date date;cursor_id uuid;
 checks integer:=0;iterations integer:=0;before_created timestamptz;
BEGIN
 BEGIN
  INSERT INTO mukirana_private.users(id,email) VALUES(u,'transfer-check-'||u||'@example.invalid'),(u2,'transfer-check-'||u2||'@example.invalid');
  INSERT INTO mukirana_private.sessions(token_hash,user_id,expires_at) VALUES
   (encode(extensions.digest(token,'sha256'),'hex'),u,clock_timestamp()+interval '1 hour'),
   (encode(extensions.digest(token2,'sha256'),'hex'),u2,clock_timestamp()+interval '1 hour');
  r:=public.mukirana_accounts_save_opening(token,a,0,'Disponível','consumption',10000,false,today-1);ASSERT r->>'status'='saved';
  r:=public.mukirana_accounts_save(token,b,0,'Reserva','investment',null,false);ASSERT r->>'status'='saved';
  r:=public.mukirana_accounts_save_opening(token,c,0,'Cartão','credit',-3000,false,today-1);ASSERT r->>'status'='saved';
  r:=public.mukirana_accounts_save(token,d,0,'Outra','consumption',null,false);ASSERT r->>'status'='saved';
  r:=public.mukirana_accounts_save(token2,foreign_account,0,'Privada','consumption',null,false);ASSERT r->>'status'='saved';
  r:=public.mukirana_accounts_save(token,deleted_account,0,'Excluída','consumption',null,false);ASSERT r->>'status'='saved';
  r:=public.mukirana_accounts_delete(token,deleted_account,1);ASSERT r->>'status'='deleted';
  r:=public.mukirana_categories_save(token,cat,0,'Compras',null);ASSERT r->>'status'='saved';
  r:=public.mukirana_transactions_save(token,expense,0,'expense','Compra',1000,today,a,cat,'variable');ASSERT r->>'status'='saved';
  r:=public.mukirana_transfers_list(token,null,null,null,'',null,null,50);
  ASSERT r->>'status'='ok' AND r->'summary'->>'count'='0' AND r->'summary'->>'amountCents'='0','empty list';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,t,0,'  Aporte  na   reserva  ',1000,today,a,b);
  ASSERT r->>'status'='saved' AND r->'entry'->>'description'='Aporte na reserva' AND r->'entry'->>'version'='1','normalized create';checks:=checks+1;
  ASSERT NOT (r->'entry' ?| ARRAY['user_id','userId','created_at','categoryId','nature']),'DTO whitelist';checks:=checks+1;
  ASSERT (SELECT count(*)=2 AND sum(signed_cents)=0 AND min(signed_cents)=-1000 AND max(signed_cents)=1000
   FROM mukirana_private.account_movements WHERE user_id=u AND operation_id=t AND operation_kind='transfer'),'paired opposite movements';checks:=checks+1;
  ASSERT mukirana_private.account_position(u,a,today)=8000 AND mukirana_private.account_position(u,b,today)=1000
   AND mukirana_private.account_position(u,c,today)=-3000,'current balances';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,t,0,'Aporte na reserva',1000,today,a,b);
  ASSERT r->>'status'='saved' AND r->'entry'->>'version'='1' AND (SELECT count(*) FROM mukirana_private.transfers WHERE id=t)=1,'idempotent create';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,f,0,'Fatura futura 10%',2000,today+30,a,c);ASSERT r->>'status'='saved';
  ASSERT mukirana_private.account_position(u,a,today)=8000 AND mukirana_private.account_position(u,c,today)=-3000
   AND mukirana_private.account_position(u,a,today+30)=6000 AND mukirana_private.account_position(u,c,today+30)=-1000,'future only projection';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,null,null,null,null,null,null,'',null,null,50);
  ASSERT r->'summary'->>'count'='3' AND r->'summary'->>'incomeCents'='10000' AND r->'summary'->>'expenseCents'='4000'
   AND r->'summary'->>'resultCents'='6000','no income expense category duplication';checks:=checks+1;
  ASSERT (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='8000'
   AND (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='6000','existing transaction balances integrated';checks:=checks+1;
  ASSERT (SELECT sum(signed_cents) FROM mukirana_private.account_movements WHERE user_id=u)=6000,'zero consolidated transfer effect';checks:=checks+1;
  r:=public.mukirana_accounts_list(token);
  ASSERT (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=b::text)='1000','account list integrated';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,today,today+30,null,'',null,null,50);
  ASSERT r->'summary'->>'count'='2' AND r->'summary'->>'amountCents'='3000' AND jsonb_array_length(r->'entries')=2,'each transfer counted once';checks:=checks+1;
  ASSERT (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='6000','projection includes history before start';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,today,null,null,'',null,null,50);
  ASSERT r->'summary'->>'count'='1' AND (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='8000','start only through today';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,null,today,null,'',null,null,50);ASSERT r->'summary'->>'count'='1','end only from beginning';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,null,null,b,'',null,null,50);ASSERT r->'summary'->>'count'='1','destination filter';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,null,null,a,'',null,null,50);ASSERT r->'summary'->>'count'='2','source filter no duplicate';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,null,null,null,'%',null,null,50);ASSERT r->'summary'->>'count'='1','literal description search';checks:=checks+1;
  LOOP
   r:=public.mukirana_transfers_list(token,null,null,null,'',cursor_date,cursor_id,1);
   ASSERT r->'summary'->>'count'='2' AND r->'summary'->>'amountCents'='3000','summary independent pagination';
   FOR row IN SELECT value FROM jsonb_array_elements(r->'entries') LOOP
    ASSERT NOT ((row->>'id')::uuid=ANY(ids)),'no duplicated item';ids:=array_append(ids,(row->>'id')::uuid);
    cursor_date:=(row->>'date')::date;cursor_id:=(row->>'id')::uuid;
   END LOOP;
   iterations:=iterations+1;ASSERT iterations<5;
   EXIT WHEN NOT (r->>'hasMore')::boolean;
  END LOOP;
  ASSERT cardinality(ids)=2 AND iterations=2,'stable complete pagination';checks:=checks+1;
  r:=public.mukirana_transfers_list(token2,null,null,null,'',null,null,50);
  ASSERT r->'summary'->>'count'='0' AND jsonb_array_length(r->'accounts')=1,'owner isolated list';checks:=checks+1;
  r:=public.mukirana_transfers_list(token2,null,null,a,'',null,null,50);ASSERT r->>'status'='invalid_request','owner filter';checks:=checks+1;
  r:=public.mukirana_transfers_save(token2,t,1,'Inválida',100,today,foreign_account,a);ASSERT r->>'status'='not_found','foreign edit';checks:=checks+1;
  r:=public.mukirana_transfers_delete(token2,t,1);ASSERT r->>'status'='not_found','foreign delete';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Privada',100,today,foreign_account,a);ASSERT r->>'status'='invalid_account','foreign source';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Privada',100,today,a,foreign_account);ASSERT r->>'status'='invalid_account','foreign destination';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Excluída',100,today,a,deleted_account);ASSERT r->>'status'='invalid_account','deleted destination';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Mesma',100,today,a,a);ASSERT r->>'status'='same_account','distinct accounts';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Zero',0,today,a,b);ASSERT r->>'status'='invalid_request','positive cents';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Negativo',-1,today,a,b);ASSERT r->>'status'='invalid_request','negative rejected';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Limite',100000000000000,today,a,b);ASSERT r->>'status'='invalid_request','max unit';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'',100,today,a,b);ASSERT r->>'status'='invalid_request','blank description';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,E'A\nB',100,today,a,b);ASSERT r->>'status'='invalid_request','control characters';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,today+1,today,null,'',null,null,50);ASSERT r->>'status'='invalid_request','inverted period';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,null,null,null,'',today,null,50);ASSERT r->>'status'='invalid_request','paired cursor';checks:=checks+1;
  r:=public.mukirana_transfers_list(token,null,null,null,'',null,null,101);ASSERT r->>'status'='invalid_request','bounded page';checks:=checks+1;
  r:=public.mukirana_accounts_delete(token,b,1);ASSERT r->>'status'='linked','destination blocks deletion';checks:=checks+1;
  r:=public.mukirana_accounts_save(token,b,1,'Reserva renomeada','investment',null,false);ASSERT r->>'status'='saved' AND r->'account'->>'balanceCents'='1000','rename with transfers';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Transferência futura',500,today+40,d,b);ASSERT r->>'status'='saved';payment:=(r->'entry'->>'id')::uuid;
  r:=public.mukirana_accounts_delete(token,d,1);ASSERT r->>'status'='linked','future source alone blocks deletion';checks:=checks+1;
  r:=public.mukirana_transfers_delete(token,payment,1);ASSERT r->>'status'='deleted';
  SELECT created_at INTO before_created FROM mukirana_private.transfers WHERE id=t;
  r:=public.mukirana_transfers_save(token,t,1,'Resgate',1500,today-1,b,d);
  ASSERT r->>'status'='saved' AND r->'entry'->>'id'=t::text AND r->'entry'->>'version'='2'
   AND (SELECT created_at=before_created FROM mukirana_private.transfers WHERE id=t),'stable operation edit';checks:=checks+1;
  ASSERT mukirana_private.account_position(u,a,today)=9000 AND mukirana_private.account_position(u,b,today)=-1500
   AND mukirana_private.account_position(u,d,today)=1500,'edit replaces both account date amount effects';checks:=checks+1;
  ASSERT (SELECT count(*)=2 AND sum(signed_cents)=0 FROM mukirana_private.account_movements WHERE operation_kind='transfer' AND operation_id=t),'pair remains consistent after edit';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,t,1,'Resgate',1500,today-1,b,d);
  ASSERT r->>'status'='saved' AND r->'entry'->>'version'='2','idempotent edit';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,t,1,'Versão antiga',1400,today,b,d);
  ASSERT r->>'status'='conflict' AND mukirana_private.account_position(u,b,today)=-1500,'stale save no effect';checks:=checks+1;
  r:=public.mukirana_transfers_delete(token,t,1);ASSERT r->>'status'='conflict','stale delete';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,t,2,'Erro de destino',2000,today,b,foreign_account);
  ASSERT r->>'status'='invalid_account' AND (SELECT version=2 AND amount_cents=1500 AND destination_account_id=d FROM mukirana_private.transfers WHERE id=t),'rejected edit leaves full operation unchanged';checks:=checks+1;
  r:=public.mukirana_transfers_delete(token,t,2);
  ASSERT r->>'status'='deleted' AND NOT EXISTS(SELECT 1 FROM mukirana_private.account_movements WHERE operation_id=t AND operation_kind='transfer')
   AND mukirana_private.account_position(u,b,today)=0 AND mukirana_private.account_position(u,d,today)=0,'delete both effects';checks:=checks+1;
  r:=public.mukirana_accounts_delete(token,b,2);ASSERT r->>'status'='deleted','account unlinked after complete deletion';checks:=checks+1;
  r:=public.mukirana_transfers_save(token,payment,0,'Pagamento de fatura',1000,today,a,c);ASSERT r->>'status'='saved';
  ASSERT mukirana_private.account_position(u,a,today)=8000 AND mukirana_private.account_position(u,c,today)=-2000,'credit payment reduces negative balance';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,null,null,null,null,null,null,'',null,null,50);
  ASSERT r->'summary'->>'expenseCents'='4000' AND r->'summary'->>'resultCents'='6000','card payment not new expense';checks:=checks+1;
  FOR iterations IN 1..101 LOOP
   r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Precisão',99999999999999,today,d,a);ASSERT r->>'status'='saved';
  END LOOP;
  r:=public.mukirana_transfers_list(token,null,null,null,'Precisão',null,null,1);
  ASSERT r->'summary'->>'amountCents'='10099999999999899' AND r->'summary'->>'count'='101' AND (r->>'hasMore')::boolean,'exact totals beyond JS safe integer';checks:=checks+1;
  ASSERT mukirana_private.account_position(u,d,today)::text='-10099999999999899','exact derived negative position';checks:=checks+1;
  BEGIN
   INSERT INTO mukirana_private.transfers(user_id,description,amount_cents,occurred_on,source_account_id,destination_account_id) VALUES(u,'Bypass',1,today,a,a);
   RAISE EXCEPTION 'same account constraint missing';
  EXCEPTION WHEN check_violation THEN NULL;END;checks:=checks+1;
  BEGIN
   INSERT INTO mukirana_private.transfers(user_id,description,amount_cents,occurred_on,source_account_id,destination_account_id) VALUES(u,'Bypass',1,today,a,foreign_account);
   RAISE EXCEPTION 'owner constraint missing';
  EXCEPTION WHEN foreign_key_violation THEN NULL;END;checks:=checks+1;
  BEGIN
   UPDATE mukirana_private.account_movements SET signed_cents=1 WHERE operation_id=payment AND side='source';
   RAISE EXCEPTION 'a single leg was editable';
  EXCEPTION WHEN object_not_in_prerequisite_state OR feature_not_supported THEN NULL;END;checks:=checks+1;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='mukirana_private.transfers'::regclass)
   AND NOT has_table_privilege('service_role','mukirana_private.transfers','SELECT')
   AND NOT has_table_privilege('authenticated','mukirana_private.account_movements','SELECT'),'private table and invoker view';checks:=checks+1;
  ASSERT NOT has_function_privilege('anon','public.mukirana_transfers_save(text,uuid,integer,text,bigint,date,uuid,uuid)','EXECUTE')
   AND NOT has_function_privilege('authenticated','public.mukirana_transfers_delete(text,uuid,integer)','EXECUTE')
   AND has_function_privilege('service_role','public.mukirana_transfers_list(text,date,date,uuid,text,date,uuid,integer)','EXECUTE'),'restricted RPCs';checks:=checks+1;
  r:=public.mukirana_transfers_list('',null,null,null,'',null,null,50);ASSERT r->>'status'='invalid_session','missing session';checks:=checks+1;
  UPDATE mukirana_private.sessions SET revoked_at=clock_timestamp() WHERE user_id=u;
  r:=public.mukirana_transfers_save(token,gen_random_uuid(),0,'Revogada',100,today,a,c);ASSERT r->>'status'='invalid_session','revoked session save';checks:=checks+1;
  r:=public.mukirana_transfers_delete(token,payment,1);ASSERT r->>'status'='invalid_session','revoked session delete';checks:=checks+1;
  UPDATE mukirana_private.sessions SET expires_at=created_at+interval '1 millisecond' WHERE user_id=u2;
  r:=public.mukirana_transfers_list(token2,null,null,null,'',null,null,50);ASSERT r->>'status'='invalid_session','expired session';checks:=checks+1;
  RAISE NOTICE '% transfer checks passed',checks;
  RAISE EXCEPTION USING ERRCODE='ZT001',MESSAGE='rollback fixtures';
 EXCEPTION WHEN SQLSTATE 'ZT001' THEN NULL;END;
 ASSERT NOT EXISTS(SELECT 1 FROM mukirana_private.users WHERE id IN (u,u2)),'fixtures rolled back';
END;
$test$;
SELECT 'transfers checks passed; fixtures rolled back' AS status,
 (SELECT count(*) FROM mukirana_private.users WHERE email LIKE 'transfer-check-%@example.invalid') AS remaining_test_users;

COMMIT;
