-- RPCs estreitas para a autenticação própria do Mukirana.
-- Nenhuma credencial, identidade ou SQL livre é aceito da interface.
CREATE FUNCTION mukirana_private.category_user(p_token text, p_write boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_session jsonb; v_user uuid;
BEGIN
  v_session := public.mukirana_auth_resolve_session(p_token);
  IF v_session->>'status' <> 'authenticated' THEN RETURN NULL; END IF;
  v_user := (v_session->'user'->>'id')::uuid;
  IF p_write THEN
    -- Adquire a trava do proprietário antes das categorias. Não promove uma
    -- trava KEY SHARE, evitando deadlocks entre duas gravações do mesmo usuário.
    UPDATE mukirana_private.users u SET id = u.id WHERE u.id = v_user;
  ELSE
    PERFORM 1 FROM mukirana_private.users WHERE id = v_user FOR KEY SHARE;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_session := public.mukirana_auth_resolve_session(p_token);
  IF v_session->>'status' <> 'authenticated' THEN RETURN NULL; END IF;
  RETURN v_user;
END;
$$;

CREATE FUNCTION mukirana_private.category_link_count(p_user uuid, p_category uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT 0::bigint;
$$;
COMMENT ON FUNCTION mukirana_private.category_link_count(uuid, uuid) IS
  'Contrato de integração: ainda não existe módulo/tabela de lançamentos. Ao introduzi-lo, contar vínculos diretos do proprietário aqui e criar FK ON DELETE RESTRICT. Não há vínculos simulados.';

CREATE FUNCTION mukirana_private.category_dto(p_row mukirana_private.categories)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', p_row.id, 'parentId', p_row.parent_id, 'name', p_row.name,
    'systemKey', p_row.system_key, 'version', p_row.version,
    'linkedCount', mukirana_private.category_link_count(p_row.user_id, p_row.id));
$$;

CREATE FUNCTION public.mukirana_categories_list(p_session_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_rows jsonb;
BEGIN
  v_user := mukirana_private.category_user(p_session_token, false);
  IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status', 'invalid_session'); END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.category_dto(c) ORDER BY pg_catalog.lower(c.name), c.id), '[]'::jsonb)
    INTO v_rows FROM mukirana_private.categories c
    WHERE c.user_id = v_user AND (c.system_key IS NULL
      OR mukirana_private.category_link_count(v_user, c.id) > 0);
  RETURN pg_catalog.jsonb_build_object('status', 'ok', 'categories', v_rows);
END;
$$;

CREATE FUNCTION public.mukirana_categories_save(
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
  IF pg_catalog.lower(v_name) = pg_catalog.lower('Aguardando Categorização') THEN
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

CREATE FUNCTION public.mukirana_categories_health_check()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object('service', 'mukirana', 'module', 'categories',
    'revision', 1, 'tables', 1, 'levels', 2)
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'mukirana_private' AND c.relname = 'categories' AND c.relrowsecurity;
$$;

REVOKE ALL ON FUNCTION mukirana_private.category_user(text, boolean),
  mukirana_private.category_link_count(uuid, uuid),
  mukirana_private.category_dto(mukirana_private.categories)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mukirana_categories_list(text),
  public.mukirana_categories_save(text, uuid, integer, text, uuid),
  public.mukirana_categories_health_check()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mukirana_categories_list(text),
  public.mukirana_categories_save(text, uuid, integer, text, uuid),
  public.mukirana_categories_health_check()
  TO service_role;
