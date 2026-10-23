-- APLICAÇÃO MANUAL CONFIRMADA em 2026-10-23 no projeto Mukirana.
-- Script original mantido neste caminho; instalação e permissões verificadas.
-- Instala a operação de exclusão protegida; a instalação não exclui dados.
BEGIN;
CREATE OR REPLACE FUNCTION public.mukirana_categories_delete(p_session_token text, p_category_id uuid, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_row mukirana_private.categories%ROWTYPE;
BEGIN
  v_user := mukirana_private.category_user(p_session_token, true);
  IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status', 'invalid_session'); END IF;
  IF p_category_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid_request');
  END IF;
  SELECT * INTO v_row FROM mukirana_private.categories
    WHERE id = p_category_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_row.system_key IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('status', 'reserved'); END IF;
  IF v_row.version <> p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status', 'conflict'); END IF;
  IF mukirana_private.category_link_count(v_user, p_category_id) > 0 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'linked');
  END IF;
  IF EXISTS (SELECT 1 FROM mukirana_private.categories WHERE user_id = v_user AND parent_id = p_category_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'has_children');
  END IF;
  DELETE FROM mukirana_private.categories WHERE id = p_category_id AND user_id = v_user;
  RETURN pg_catalog.jsonb_build_object('status', 'deleted');
EXCEPTION
  -- A FK também protege futuros vínculos adicionados por outro módulo.
  WHEN foreign_key_violation THEN RETURN pg_catalog.jsonb_build_object('status', 'linked');
  WHEN serialization_failure OR deadlock_detected THEN RETURN pg_catalog.jsonb_build_object('status', 'conflict');
END;
$$;


REVOKE ALL ON FUNCTION public.mukirana_categories_delete(text, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mukirana_categories_delete(text, uuid, integer) TO service_role;

COMMIT;
