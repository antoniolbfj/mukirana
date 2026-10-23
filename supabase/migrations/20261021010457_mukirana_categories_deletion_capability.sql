CREATE OR REPLACE FUNCTION public.mukirana_categories_list(p_session_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_rows jsonb;
BEGIN
 v_user := mukirana_private.category_user(p_session_token, false);
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status', 'invalid_session'); END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.category_dto(c) ORDER BY pg_catalog.lower(c.name), c.id), '[]'::jsonb)
 INTO v_rows FROM mukirana_private.categories c
 WHERE c.user_id = v_user AND (c.system_key IS NULL OR mukirana_private.category_link_count(v_user,c.id)>0);
 RETURN pg_catalog.jsonb_build_object('status','ok','categories',v_rows,
 'deletionAvailable', pg_catalog.to_regprocedure('public.mukirana_categories_delete(text,uuid,integer)') IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.mukirana_categories_list(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mukirana_categories_list(text) TO service_role;
