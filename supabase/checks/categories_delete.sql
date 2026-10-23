DO $test$
DECLARE
 u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
 t text := encode(extensions.gen_random_bytes(32),'hex');
 t2 text := encode(extensions.gen_random_bytes(32),'hex');
 a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
 sys uuid := gen_random_uuid(); e uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
 checks integer := 0; r jsonb; scope_ids uuid[];
BEGIN
 scope_ids:=ARRAY[a,b,c,sys,e,other_id];
 BEGIN
  INSERT INTO mukirana_private.users(id,email) VALUES
    (u,'categories-delete-check-'||u||'@example.invalid'),
    (u2,'categories-delete-check-'||u2||'@example.invalid');
  INSERT INTO mukirana_private.sessions(token_hash,user_id,expires_at) VALUES
    (encode(extensions.digest(t,'sha256'),'hex'),u,clock_timestamp()+interval '1 hour'),
    (encode(extensions.digest(t2,'sha256'),'hex'),u2,clock_timestamp()+interval '1 hour');
  ASSERT (public.mukirana_categories_list(t)->>'deletionAvailable')::boolean, 'operation must be available'; checks:=checks+1;
  r:=public.mukirana_categories_delete('',a,1);
  ASSERT r->>'status'='invalid_session','empty session'; checks:=checks+1;
  r:=public.mukirana_categories_delete(repeat('0',64),a,1);
  ASSERT r->>'status'='invalid_session','unknown session'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,a,0);
  ASSERT r->>'status'='invalid_request','invalid version'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,null,1);
  ASSERT r->>'status'='invalid_request','missing ID'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,a,1);
  ASSERT r->>'status'='not_found','missing category'; checks:=checks+1;
  ASSERT public.mukirana_categories_save(t,a,0,'Principal',null)->>'status'='saved','parent fixture';
  ASSERT public.mukirana_categories_save(t,b,0,'Detalhe',a)->>'status'='saved','child fixture';
  ASSERT public.mukirana_categories_save(t,c,0,'Vazia',null)->>'status'='saved','empty fixture';
  ASSERT public.mukirana_categories_save(t2,other_id,0,'De outro usuário',null)->>'status'='saved','other owner fixture';
  INSERT INTO mukirana_private.categories(id,user_id,name,system_key)
    VALUES(sys,u,'Aguardando Categorização','awaiting_categorization');
  r:=public.mukirana_categories_delete(t2,c,1);
  ASSERT r->>'status'='not_found'
    AND EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=c AND user_id=u),'cross-owner deletion blocked'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,c,2);
  ASSERT r->>'status'='conflict'
    AND EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=c),'stale deletion blocked'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,a,1);
  ASSERT r->>'status'='has_children'
    AND (SELECT count(*) FROM mukirana_private.categories WHERE id=ANY(ARRAY[a,b]))=2,'parent and child retained'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,sys,1);
  ASSERT r->>'status'='reserved'
    AND EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=sys),'reserved deletion blocked'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,c,1);
  ASSERT r->>'status'='deleted'
    AND NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=c),'empty category deleted'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,c,1);
  ASSERT r->>'status'='not_found','repeat deletion'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,b,1);
  ASSERT r->>'status'='deleted'
    AND EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=a AND name='Principal')
    AND NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=b),'child removed without parent'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,a,1);
  ASSERT r->>'status'='deleted','parent deleted after children reorganized'; checks:=checks+1;
  ASSERT public.mukirana_categories_save(t,e,0,'Antes',null)->>'status'='saved','version fixture';
  ASSERT public.mukirana_categories_save(t,e,1,'Depois',null)->>'status'='saved','version changed';
  r:=public.mukirana_categories_delete(t,e,1);
  ASSERT r->>'status'='conflict'
    AND EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=e AND name='Depois'),'editing protects newer version'; checks:=checks+1;
  r:=public.mukirana_categories_delete(t,e,2);
  ASSERT r->>'status'='deleted','current version deleted'; checks:=checks+1;
  UPDATE mukirana_private.sessions SET revoked_at=clock_timestamp() WHERE user_id=u;
  r:=public.mukirana_categories_delete(t,sys,1);
  ASSERT r->>'status'='invalid_session','revoked session'; checks:=checks+1;
  UPDATE mukirana_private.sessions SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE user_id=u2;
  r:=public.mukirana_categories_delete(t2,other_id,1);
  ASSERT r->>'status'='invalid_session'
    AND EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=other_id),'expired session retains category'; checks:=checks+1;
  ASSERT NOT has_function_privilege('anon','public.mukirana_categories_delete(text,uuid,integer)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.mukirana_categories_delete(text,uuid,integer)','EXECUTE')
    AND has_function_privilege('service_role','public.mukirana_categories_delete(text,uuid,integer)','EXECUTE'),'private RPC grants'; checks:=checks+1;
  RAISE SQLSTATE 'ZC001';
 EXCEPTION WHEN SQLSTATE 'ZC001' THEN NULL;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM mukirana_private.categories WHERE id=ANY(scope_ids))
   AND NOT EXISTS(SELECT 1 FROM mukirana_private.users WHERE id IN (u,u2))
   AND NOT EXISTS(SELECT 1 FROM mukirana_private.sessions WHERE user_id IN (u,u2)),'fixtures rolled back'; checks:=checks+1;
 PERFORM set_config('mukirana.category_delete_checks',checks::text,true);
END;
$test$;
SELECT current_setting('mukirana.category_delete_checks')::integer AS passed,
 (SELECT count(*) FROM mukirana_private.users WHERE email LIKE 'categories-delete-check-%@example.invalid') AS remaining_test_users;
