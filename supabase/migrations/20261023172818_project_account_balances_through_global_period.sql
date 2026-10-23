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
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.account_dto(a) || pg_catalog.jsonb_build_object('projectedCents',coalesce((SELECT sum(CASE WHEN t.nature='income' THEN t.amount_cents::numeric ELSE -t.amount_cents::numeric END) FROM mukirana_private.transactions t WHERE t.user_id=a.user_id AND t.account_id=a.id AND (p_end_date IS NULL OR t.occurred_on<=p_end_date)),0)::text) ORDER BY pg_catalog.lower(a.name),a.id),'[]'::jsonb)
 INTO v_accounts FROM mukirana_private.accounts a WHERE a.user_id=v_user AND a.deleted_at IS NULL;
 SELECT coalesce(pg_catalog.jsonb_agg(mukirana_private.category_dto(c) ORDER BY pg_catalog.lower(c.name),c.id),'[]'::jsonb)
 INTO v_categories FROM mukirana_private.categories c WHERE c.user_id=v_user
 AND (c.system_key IS NULL OR mukirana_private.category_link_count(v_user,c.id)>0);
 RETURN pg_catalog.jsonb_build_object('status','ok','entries',v_entries,'hasMore',v_more,'summary',v_summary,
  'accounts',v_accounts,'categories',v_categories,'today',mukirana_private.finance_today());
END;
$$;
