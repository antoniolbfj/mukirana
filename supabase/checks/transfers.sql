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
