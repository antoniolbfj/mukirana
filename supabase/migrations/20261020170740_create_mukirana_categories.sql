-- Categorias e subcategorias compartilham a mesma tabela.
-- A autenticação existente é própria do Mukirana, não Supabase Auth.

CREATE TABLE mukirana_private.categories (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  system_key text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT categories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES mukirana_private.users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT categories_owner_id_key UNIQUE (user_id, id),
  CONSTRAINT categories_parent_owner_fkey
    FOREIGN KEY (user_id, parent_id)
    REFERENCES mukirana_private.categories(user_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT categories_not_own_parent CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT categories_name_check CHECK (
    pg_catalog.char_length(name) BETWEEN 1 AND 80
    AND name !~ '[[:cntrl:]]'
    AND name = pg_catalog.normalize(
      pg_catalog.btrim(pg_catalog.regexp_replace(name, '[[:space:]]+', ' ', 'g')), 'NFC'
    )
  ),
  CONSTRAINT categories_system_key_check CHECK (
    system_key IS NULL OR system_key ~ '^[a-z][a-z0-9_]{0,79}$'
  ),
  CONSTRAINT categories_version_check CHECK (version > 0)
);

CREATE INDEX categories_owner_parent_idx
  ON mukirana_private.categories(user_id, parent_id);
CREATE UNIQUE INDEX categories_root_name_key
  ON mukirana_private.categories(user_id, pg_catalog.lower(name))
  WHERE parent_id IS NULL;
CREATE UNIQUE INDEX categories_owner_system_key
  ON mukirana_private.categories(user_id, system_key)
  WHERE system_key IS NOT NULL;

ALTER TABLE mukirana_private.categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mukirana_private.categories
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE mukirana_private.categories IS
  'Classificações individuais em hierarquia. Acesso privado pelas futuras RPCs com sessão própria; sem acesso direto pela Data API.';
COMMENT ON COLUMN mukirana_private.categories.id IS
  'Identidade permanente preservada em renomeações e reorganizações; futuros lançamentos devem usar FK com ON DELETE RESTRICT.';
COMMENT ON COLUMN mukirana_private.categories.parent_id IS
  'Referência à mesma tabela e ao mesmo proprietário. NULL identifica raiz; a profundidade é calculada, sem limite fixado em dois níveis.';
COMMENT ON COLUMN mukirana_private.categories.system_key IS
  'NULL para categorias comuns. Reservada ao sistema quando preenchida; não selecionável/editável pelo usuário. A exibição depende de lançamentos vinculados, não de uma flag nesta tabela.';
COMMENT ON COLUMN mukirana_private.categories.version IS
  'Incrementada automaticamente a cada atualização; futuras RPCs devem conferir a versão esperada antes de alterar o registro.';

CREATE FUNCTION mukirana_private.categories_prepare_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid;
  v_now timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN v_user := OLD.user_id;
  ELSE v_user := NEW.user_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.system_key IS DISTINCT FROM OLD.system_key THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Identidade, proprietário, criação e chave de sistema são imutáveis.',
        CONSTRAINT = 'categories_identity_immutable';
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.system_key IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Classificações reservadas são gerenciadas exclusivamente pelo sistema.';
  END IF;

  -- Serializa gravações da hierarquia de cada proprietário sem outra tabela.
  -- A nova versão física da linha garante detecção de snapshots antigos também
  -- em REPEATABLE READ/SERIALIZABLE; nenhum valor cadastral do usuário é alterado.
  UPDATE mukirana_private.users AS u SET id = u.id WHERE u.id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'Proprietário de categoria inválido.',
      CONSTRAINT = 'categories_user_id_fkey';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NEW.name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'O nome da categoria contém caracteres inválidos.',
      CONSTRAINT = 'categories_name_check';
  END IF;
  NEW.name := pg_catalog.normalize(
    pg_catalog.btrim(pg_catalog.regexp_replace(NEW.name, '[[:space:]]+', ' ', 'g')), 'NFC'
  );

  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM mukirana_private.categories AS p
    WHERE p.user_id = v_user AND p.id = NEW.parent_id AND p.system_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Uma classificação reservada não pode ser escolhida como categoria superior.',
      CONSTRAINT = 'categories_parent_not_reserved';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.created_at := v_now;
  ELSE
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := v_now;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION mukirana_private.categories_validate_statement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid;
  v_reachable bigint;
  v_total bigint;
  v_duplicate boolean;
BEGIN
  -- A tabela de transição contém somente os registros da instrução atual.
  -- Valida uma vez por proprietário e considera toda a árvore após a operação,
  -- inclusive descendentes cujo nível mudou sem alteração de seus próprios IDs.
  FOR v_user IN SELECT DISTINCT c.user_id FROM changed_categories AS c LOOP
    WITH RECURSIVE hierarchy AS (
      SELECT c.id, c.name, 0 AS depth
      FROM mukirana_private.categories AS c
      WHERE c.user_id = v_user AND c.parent_id IS NULL
      UNION ALL
      SELECT c.id, c.name, h.depth + 1
      FROM mukirana_private.categories AS c
      JOIN hierarchy AS h ON h.id = c.parent_id
      WHERE c.user_id = v_user
    )
    SELECT (SELECT pg_catalog.count(*) FROM hierarchy),
           (SELECT pg_catalog.count(*) FROM mukirana_private.categories AS c WHERE c.user_id = v_user),
           EXISTS (
             SELECT 1 FROM hierarchy AS h
             GROUP BY h.depth, pg_catalog.lower(h.name)
             HAVING pg_catalog.count(*) > 1
           )
    INTO v_reachable, v_total, v_duplicate;

    IF v_reachable <> v_total THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'A reorganização criaria uma hierarquia circular.',
        CONSTRAINT = 'categories_acyclic';
    END IF;
    IF v_duplicate THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'Já existe uma categoria com este nome no mesmo nível do usuário.',
        CONSTRAINT = 'categories_name_per_level_key';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION mukirana_private.categories_prepare_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION mukirana_private.categories_validate_statement()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER categories_prepare_write
BEFORE INSERT OR UPDATE OR DELETE ON mukirana_private.categories
FOR EACH ROW EXECUTE FUNCTION mukirana_private.categories_prepare_write();

CREATE TRIGGER categories_validate_insert
AFTER INSERT ON mukirana_private.categories
REFERENCING NEW TABLE AS changed_categories
FOR EACH STATEMENT EXECUTE FUNCTION mukirana_private.categories_validate_statement();

CREATE TRIGGER categories_validate_update
AFTER UPDATE ON mukirana_private.categories
REFERENCING NEW TABLE AS changed_categories
FOR EACH STATEMENT EXECUTE FUNCTION mukirana_private.categories_validate_statement();
