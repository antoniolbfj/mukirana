-- Verificações reais com dados isolados, revertidos antes de concluir.
DO $test$
DECLARE
 u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();
 token text:=encode(extensions.gen_random_bytes(32),'hex');token2 text:=encode(extensions.gen_random_bytes(32),'hex');
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();other_account uuid:=gen_random_uuid();zero_account uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();q uuid:=gen_random_uuid();other_category uuid:=gen_random_uuid();
 i uuid:=gen_random_uuid();j uuid:=gen_random_uuid();f uuid:=gen_random_uuid();g uuid:=gen_random_uuid();
 opening uuid;zero_opening uuid;sys uuid;before_created timestamptz;
 today date:=mukirana_private.finance_today();r jsonb;row jsonb;ids uuid[]:='{}';cursor_date date;cursor_id uuid;
 checks integer:=0;iterations integer:=0;
BEGIN
 BEGIN
  INSERT INTO mukirana_private.users(id,email) VALUES(u,'ledger-check-'||u||'@example.invalid'),(u2,'ledger-check-'||u2||'@example.invalid');
  INSERT INTO mukirana_private.sessions(token_hash,user_id,expires_at) VALUES
   (encode(extensions.digest(token,'sha256'),'hex'),u,clock_timestamp()+interval '1 hour'),
   (encode(extensions.digest(token2,'sha256'),'hex'),u2,clock_timestamp()+interval '1 hour');
  r:=public.mukirana_accounts_save_opening(token,a,0,'Banco','consumption',10000,false,today-10);
  ASSERT r->>'status'='saved' AND r->'account'->>'balanceCents'='10000','opening balance creation';checks:=checks+1;
  SELECT id,category_id INTO opening,sys FROM mukirana_private.transactions WHERE account_id=a AND kind='opening_balance';
  ASSERT opening IS NOT NULL AND (SELECT system_key='opening_balance' FROM mukirana_private.categories WHERE id=sys),'reserved category';checks:=checks+1;
  r:=public.mukirana_accounts_save(token,a,0,'Banco','consumption',10000,false);
  ASSERT r->>'status'='saved' AND (SELECT count(*) FROM mukirana_private.transactions WHERE account_id=a)=1,'legacy idempotent account';checks:=checks+1;
  r:=public.mukirana_accounts_save_opening(token,b,0,'Cartão','credit',-3000,false,today+2);
  ASSERT r->>'status'='saved' AND r->'account'->>'balanceCents'='0','future negative opening';checks:=checks+1;
  r:=public.mukirana_accounts_save(token2,other_account,0,'Outro','consumption',null,false);ASSERT r->>'status'='saved','second owner account';
  r:=public.mukirana_categories_save(token,c,0,'Trabalho',null);ASSERT r->>'status'='saved','root fixture';
  r:=public.mukirana_categories_save(token,d,0,'Detalhe',c);ASSERT r->>'status'='saved','child fixture';
  r:=public.mukirana_categories_save(token,q,0,'Outros',null);ASSERT r->>'status'='saved','other root fixture';
  r:=public.mukirana_categories_save(token2,other_category,0,'Pessoal',null);ASSERT r->>'status'='saved','second owner category';
  r:=public.mukirana_transactions_save(token,i,0,'income','  Salário  ',2000,today-1,a,c,'fixed');
  ASSERT r->>'status'='saved' AND r->'entry'->>'description'='Salário' AND r->'entry'->>'modality'='single','standard income';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,i,0,'income','Salário',2000,today-1,a,c,'fixed');
  ASSERT r->>'status'='saved' AND (r->'entry'->>'version')::integer=1,'idempotent create';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,j,0,'expense','Mercado',650,today-1,a,d,'variable');ASSERT r->>'status'='saved','expense fixture';
  r:=public.mukirana_transactions_save(token,f,0,'expense','Conta futura',4000,today+5,a,d,'fixed');ASSERT r->>'status'='saved','future expense fixture';
  r:=public.mukirana_transactions_save(token,g,0,'income','Reembolso 10%',5000,today+6,a,q,'variable');ASSERT r->>'status'='saved','future income fixture';
  r:=public.mukirana_accounts_list(token);
  ASSERT (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='11350','future excluded from current';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today-20,today+20,null,null,null,null,'',null,null,50);
  ASSERT (r->'summary'->>'count')::integer=6 AND r->'summary'->>'incomeCents'='17000'
   AND r->'summary'->>'expenseCents'='7650' AND r->'summary'->>'resultCents'='9350','exact period totals';checks:=checks+1;
  ASSERT (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='12350'
   AND (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=b::text)='-3000','account projections';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today,today+20,null,a,null,null,'',null,null,50);
  ASSERT r->'summary'->>'resultCents'='1000'
   AND (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='12350','period result differs from accumulated balance';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today-20,null,null,a,null,null,'',null,null,50);
  ASSERT r->'summary'->>'resultCents'='11350' AND (SELECT x->>'projectedCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='11350','start only ends today';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today-20,today+20,'expense',null,null,null,'',null,null,50);
  ASSERT r->'summary'->>'expenseCents'='7650' AND r->'summary'->>'incomeCents'='0','nature filter';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today-20,today+20,null,null,null,'fixed','',null,null,50);
  ASSERT r->'summary'->>'resultCents'='-2000','fixed filter';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today-20,today+20,null,null,c,null,'',null,null,50);
  ASSERT (r->'summary'->>'count')::integer=3 AND r->'summary'->>'resultCents'='-2650','parent includes direct and subordinate entries';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today-20,today+20,null,null,null,null,'%',null,null,50);
  ASSERT (r->'summary'->>'count')::integer=1 AND r->'summary'->>'incomeCents'='5000','literal search wildcard';checks:=checks+1;
  LOOP
   r:=public.mukirana_transactions_list(token,today-20,today+20,null,null,null,null,'',cursor_date,cursor_id,2);
   ASSERT r->'summary'->>'resultCents'='9350','summary independent of pagination';
   FOR row IN SELECT value FROM jsonb_array_elements(r->'entries') LOOP
    ASSERT NOT ((row->>'id')::uuid=ANY(ids)),'no duplicated page item';ids:=array_append(ids,(row->>'id')::uuid);
    cursor_date:=(row->>'date')::date;cursor_id:=(row->>'id')::uuid;
   END LOOP;
   iterations:=iterations+1;ASSERT iterations<10,'pagination terminates';
   EXIT WHEN NOT (r->>'hasMore')::boolean;
  END LOOP;
  ASSERT cardinality(ids)=6 AND iterations=3,'complete stable pagination';checks:=checks+1;
  r:=public.mukirana_transactions_list(token2,null,null,null,null,null,null,'',null,null,50);
  ASSERT (r->'summary'->>'count')::integer=0,'isolated list';checks:=checks+1;
  r:=public.mukirana_transactions_list(token2,null,null,null,a,null,null,'',null,null,50);
  ASSERT r->>'status'='invalid_request','foreign account filter';checks:=checks+1;
  r:=public.mukirana_transactions_list(token,today+1,today,null,null,null,null,'',null,null,50);
  ASSERT r->>'status'='invalid_request','inverted dates';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,gen_random_uuid(),0,'expense','Zero',0,today,a,c,'fixed');
  ASSERT r->>'status'='invalid_request','positive amount required';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,gen_random_uuid(),0,'expense','Muito',100000000000000,today,a,c,'fixed');
  ASSERT r->>'status'='invalid_request','bounded input';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,gen_random_uuid(),0,'expense','Outro',100,today,other_account,c,'fixed');
  ASSERT r->>'status'='invalid_account','cross-owner account';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,gen_random_uuid(),0,'expense','Outro',100,today,a,other_category,'fixed');
  ASSERT r->>'status'='invalid_category','cross-owner category';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,gen_random_uuid(),0,'expense','Reservada',100,today,a,sys,'fixed');
  ASSERT r->>'status'='invalid_category','reserved not selectable';checks:=checks+1;
  r:=public.mukirana_transactions_save(token2,i,1,'income','Inválido',300,today,other_account,other_category,'variable');
  ASSERT r->>'status'='not_found','cross-owner edit';checks:=checks+1;
  r:=public.mukirana_transactions_delete(token2,i,1);ASSERT r->>'status'='not_found','cross-owner delete';checks:=checks+1;
  r:=public.mukirana_accounts_delete(token,a,1);ASSERT r->>'status'='linked','account linked protected';checks:=checks+1;
  r:=public.mukirana_accounts_delete(token,b,1);ASSERT r->>'status'='linked','future movement blocks account delete';checks:=checks+1;
  r:=public.mukirana_categories_delete(token,d,1);ASSERT r->>'status'='linked','category linked protected';checks:=checks+1;
  r:=public.mukirana_categories_save(token,d,1,'Detalhe',q);ASSERT r->>'status'='saved','category moved';
  r:=public.mukirana_transactions_list(token,today-20,today+20,null,null,c,null,'',null,null,50);
  ASSERT (r->'summary'->>'count')::integer=1 AND (SELECT category_id=d FROM mukirana_private.transactions WHERE id=j),'hierarchy changes grouping, keeps links';checks:=checks+1;
  r:=public.mukirana_accounts_save_opening(token,a,1,'Banco','consumption',12000,false,today-10);
  ASSERT r->>'status'='saved' AND r->'account'->>'balanceCents'='13350'
   AND (SELECT id=opening AND version=2 AND amount_cents=12000 FROM mukirana_private.transactions WHERE account_id=a AND kind='opening_balance'),'opening change atomic stable ID';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,opening,2,'income','Hacked',100,today,a,c,'variable');
  ASSERT r->>'status'='opening_balance_only_in_account','opening edit only in account';checks:=checks+1;
  r:=public.mukirana_accounts_save_opening(token,zero_account,0,'Zero','consumption',0,false,today);ASSERT r->>'status'='saved','zero opening fixture';
  SELECT id INTO zero_opening FROM mukirana_private.transactions WHERE account_id=zero_account AND kind='opening_balance';
  ASSERT zero_opening IS NOT NULL AND (SELECT amount_cents=0 FROM mukirana_private.transactions WHERE id=zero_opening),'explicit zero opening represented';checks:=checks+1;
  r:=public.mukirana_transactions_delete(token,zero_opening,1);
  ASSERT r->>'status'='deleted' AND (SELECT initial_cents IS NULL AND opening_date IS NULL AND version=2 AND deleted_at IS NULL FROM mukirana_private.accounts WHERE id=zero_account),'opening deletion clears account only';checks:=checks+1;
  r:=public.mukirana_accounts_delete(token,zero_account,2);ASSERT r->>'status'='deleted','empty account may be removed';checks:=checks+1;
  SELECT created_at INTO before_created FROM mukirana_private.transactions WHERE id=i;
  r:=public.mukirana_transactions_save(token,i,1,'income','Salário ajustado',2500,today-1,b,q,'variable');
  ASSERT r->>'status'='saved' AND (r->'entry'->>'id')::uuid=i AND (SELECT created_at=before_created FROM mukirana_private.transactions WHERE id=i),'edit preserves identity';checks:=checks+1;
  r:=public.mukirana_accounts_list(token);
  ASSERT (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='11350'
   AND (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=b::text)='2500','move recalculates both account balances';checks:=checks+1;
  r:=public.mukirana_transactions_save(token,i,1,'income','Salário ajustado',2500,today-1,b,q,'variable');
  ASSERT r->>'status'='saved' AND (r->'entry'->>'version')::integer=2,'idempotent edit';checks:=checks+1;
  r:=public.mukirana_transactions_delete(token,i,1);ASSERT r->>'status'='conflict','stale deletion';checks:=checks+1;
  r:=public.mukirana_transactions_delete(token,i,2);ASSERT r->>'status'='deleted','standard deletion';checks:=checks+1;
  r:=public.mukirana_transactions_delete(token,i,2);ASSERT r->>'status'='not_found','repeat deletion';checks:=checks+1;
  r:=public.mukirana_transactions_delete(token,j,1);ASSERT r->>'status'='deleted','expense deletion';
  r:=public.mukirana_accounts_list(token);
  ASSERT (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=a::text)='12000','deletion recalculates balance';checks:=checks+1;
  INSERT INTO mukirana_private.transactions(user_id,nature,description,amount_cents,occurred_on,account_id,category_id,classification)
   SELECT u2,'income','Valor máximo',99999999999999,today,other_account,other_category,'variable' FROM generate_series(1,101);
  r:=public.mukirana_transactions_list(token2,null,null,null,null,null,null,'',null,null,1);
  ASSERT r->'summary'->>'incomeCents'='10099999999999899'
   AND (SELECT x->>'balanceCents' FROM jsonb_array_elements(r->'accounts') x WHERE x->>'id'=other_account::text)='10099999999999899','totals beyond JS safe integer remain exact strings';checks:=checks+1;
  r:=public.mukirana_transactions_delete('',g,1);ASSERT r->>'status'='invalid_session','unauthenticated delete';checks:=checks+1;
  UPDATE mukirana_private.sessions SET revoked_at=clock_timestamp() WHERE user_id=u;
  r:=public.mukirana_transactions_save(token,g,1,'income','Revogada',100,today,a,q,'fixed');ASSERT r->>'status'='invalid_session','revoked session';checks:=checks+1;
  UPDATE mukirana_private.sessions SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE user_id=u2;
  r:=public.mukirana_transactions_list(token2,null,null,null,null,null,null,'',null,null,50);ASSERT r->>'status'='invalid_session','expired session';checks:=checks+1;
  ASSERT NOT has_function_privilege('anon','public.mukirana_transactions_delete(text,uuid,integer)','EXECUTE')
   AND NOT has_function_privilege('authenticated','public.mukirana_transactions_save(text,uuid,integer,text,text,bigint,date,uuid,uuid,text)','EXECUTE')
   AND has_function_privilege('service_role','public.mukirana_transactions_delete(text,uuid,integer)','EXECUTE'),'RPC ACL';checks:=checks+1;
  RAISE SQLSTATE 'ZL001';
 EXCEPTION WHEN SQLSTATE 'ZL001' THEN NULL;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM mukirana_private.users WHERE id IN(u,u2))
  AND NOT EXISTS(SELECT 1 FROM mukirana_private.transactions WHERE user_id IN(u,u2)),'fixtures rolled back';checks:=checks+1;
 PERFORM set_config('mukirana.ledger_checks',checks::text,true);
END;
$test$;
SELECT current_setting('mukirana.ledger_checks')::integer AS passed,
 (SELECT count(*) FROM mukirana_private.users WHERE email LIKE 'ledger-check-%@example.invalid') AS remaining_test_users;
