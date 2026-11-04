CREATE FUNCTION public.save_dictionary_topic(p_vi text,p_de text,p_order integer,p_id uuid DEFAULT NULL)
RETURNS public.dictionary_topics LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE topic_id uuid; topic_count integer; position integer; saved public.dictionary_topics;
BEGIN
 IF (auth.jwt()->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_vi IS NULL OR length(trim(p_vi)) NOT BETWEEN 1 AND 160 OR p_de IS NULL OR length(p_de)>160 OR p_order IS NULL OR p_order NOT BETWEEN 1 AND 9999 THEN RAISE EXCEPTION 'Invalid topic' USING ERRCODE='23514'; END IF;
 LOCK TABLE public.dictionary_topics IN SHARE ROW EXCLUSIVE MODE;
 IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dictionary_topics WHERE id=p_id) THEN RAISE EXCEPTION 'Topic not found' USING ERRCODE='P0002'; END IF;
 SELECT count(*) INTO topic_count FROM public.dictionary_topics WHERE id IS DISTINCT FROM p_id;
 position:=least(p_order,topic_count+1); topic_id:=coalesce(p_id,gen_random_uuid());
 INSERT INTO public.dictionary_topics(id,vi,de,"order") VALUES(topic_id,trim(p_vi),trim(p_de),position)
 ON CONFLICT(id) DO UPDATE SET vi=excluded.vi,de=excluded.de,"order"=excluded."order";
 WITH ranked AS (SELECT id,row_number() OVER(ORDER BY "order",vi,id)::integer AS rank FROM public.dictionary_topics WHERE id<>topic_id)
 UPDATE public.dictionary_topics t SET "order"=CASE WHEN r.rank>=position THEN r.rank+1 ELSE r.rank END FROM ranked r WHERE t.id=r.id;
 SELECT * INTO saved FROM public.dictionary_topics WHERE id=topic_id;
 RETURN saved;
END;
$$;
CREATE FUNCTION public.delete_dictionary_topic(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF (auth.jwt()->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 LOCK TABLE public.dictionary_topics IN SHARE ROW EXCLUSIVE MODE;
 DELETE FROM public.dictionary_topics WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found' USING ERRCODE='P0002'; END IF;
 WITH ranked AS (SELECT id,row_number() OVER(ORDER BY "order",vi,id)::integer AS rank FROM public.dictionary_topics)
 UPDATE public.dictionary_topics t SET "order"=r.rank FROM ranked r WHERE t.id=r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_dictionary_topic(text,text,integer,uuid),public.delete_dictionary_topic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_dictionary_topic(text,text,integer,uuid),public.delete_dictionary_topic(uuid) TO authenticated;
WITH ranked AS (SELECT id,row_number() OVER(ORDER BY "order",vi,id)::integer AS rank FROM public.dictionary_topics)
UPDATE public.dictionary_topics t SET "order"=r.rank FROM ranked r WHERE t.id=r.id;
