CREATE TABLE public.dictionary_topics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vi text NOT NULL CHECK(length(trim(vi)) BETWEEN 1 AND 160),
 de text NOT NULL DEFAULT '' CHECK(length(de)<=160), "order" integer NOT NULL DEFAULT 1 CHECK("order" BETWEEN 1 AND 9999)
);
CREATE UNIQUE INDEX dictionary_topic_name ON public.dictionary_topics(lower(trim(vi)));
CREATE TABLE public.dictionary_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), word text NOT NULL CHECK(length(trim(word)) BETWEEN 1 AND 240),
 type text NOT NULL DEFAULT '' CHECK(type IN ('','noun','verb','adjective','phrase')),
 article text NOT NULL DEFAULT '' CHECK(article IN ('','der','die','das')), plural text NOT NULL DEFAULT '', inflection text NOT NULL DEFAULT '',
 meaning text NOT NULL DEFAULT '' CHECK(length(meaning)<=2000), ipa text NOT NULL DEFAULT '',
 example text NOT NULL DEFAULT '' CHECK(length(example)<=2000), translation text NOT NULL DEFAULT '' CHECK(length(translation)<=2000),
 course text NOT NULL CHECK(course IN ('A1','A2','B1','B2')), topics uuid[] NOT NULL DEFAULT '{}', lessons text[] NOT NULL DEFAULT '{}',
 audio text, source_keys text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(type='noun' OR (article='' AND plural=''))
);
CREATE UNIQUE INDEX dictionary_entry_identity ON public.dictionary_entries(course,type,article,lower(trim(word)),lower(trim(meaning)));
CREATE INDEX dictionary_entry_topics ON public.dictionary_entries USING gin(topics);
CREATE TABLE public.dictionary_entry_drafts (
 entry_id uuid PRIMARY KEY REFERENCES public.dictionary_entries(id) ON DELETE CASCADE,
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND jsonb_typeof(content->'word')='string' AND length(trim(content->>'word')) BETWEEN 1 AND 240),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dictionary_bookmarks (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL REFERENCES public.dictionary_entries(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,entry_id)
);
ALTER TABLE public.dictionary_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dictionary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dictionary_entry_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dictionary_bookmarks ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.dictionary_topics,public.dictionary_entries TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dictionary_entry_drafts,public.dictionary_bookmarks TO authenticated;
REVOKE ALL ON public.dictionary_topics,public.dictionary_entries,public.dictionary_entry_drafts,public.dictionary_bookmarks FROM anon;

CREATE FUNCTION public.dictionary_can_read(entry_course text, source_lessons text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT public.is_jwt_admin_or_tutor() OR EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
   (p.subscription_end_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND entry_course=ANY(p.unlocked_levels))
   OR (p.subscription_end_date IS NULL AND entry_course='A1' AND source_lessons && ARRAY(
    SELECT l.id FROM public.lessons l LEFT JOIN public.modules m ON m.id=l.module_id
    WHERE l.level='A1' AND l.status='published' ORDER BY m.order_index NULLS LAST,l.order_index,l.id LIMIT 3
   ))
  )
 )
$$;
REVOKE ALL ON FUNCTION public.dictionary_can_read(text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dictionary_can_read(text,text[]) TO authenticated;
CREATE POLICY "dictionary entries: visible" ON public.dictionary_entries FOR SELECT TO authenticated
 USING((auth.jwt()->'app_metadata'->>'role')='admin' OR (status='published' AND public.dictionary_can_read(course,lessons)));
CREATE POLICY "dictionary entries: admin insert" ON public.dictionary_entries FOR INSERT TO authenticated
 WITH CHECK((auth.jwt()->'app_metadata'->>'role')='admin');
CREATE POLICY "dictionary entries: admin update" ON public.dictionary_entries FOR UPDATE TO authenticated
 USING((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK((auth.jwt()->'app_metadata'->>'role')='admin');
-- Tutors may read the learner catalog, but editorial drafts stay Admin-only.
CREATE POLICY "dictionary drafts: admin" ON public.dictionary_entry_drafts FOR ALL TO authenticated
 USING((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK((auth.jwt()->'app_metadata'->>'role')='admin');
CREATE POLICY "dictionary topics: visible" ON public.dictionary_topics FOR SELECT TO authenticated
 USING((auth.jwt()->'app_metadata'->>'role')='admin' OR EXISTS(SELECT 1 FROM public.dictionary_entries e WHERE e.status='published' AND dictionary_topics.id=ANY(e.topics) AND public.dictionary_can_read(e.course,e.lessons)));
CREATE POLICY "dictionary topics: admin insert" ON public.dictionary_topics FOR INSERT TO authenticated
 WITH CHECK((auth.jwt()->'app_metadata'->>'role')='admin');
CREATE POLICY "dictionary topics: admin update" ON public.dictionary_topics FOR UPDATE TO authenticated
 USING((auth.jwt()->'app_metadata'->>'role')='admin') WITH CHECK((auth.jwt()->'app_metadata'->>'role')='admin');
CREATE POLICY "dictionary bookmarks: own read" ON public.dictionary_bookmarks FOR SELECT TO authenticated
 USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.dictionary_entries e WHERE e.id=entry_id AND e.status='published'));
CREATE POLICY "dictionary bookmarks: own insert" ON public.dictionary_bookmarks FOR INSERT TO authenticated
 WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.dictionary_entries e WHERE e.id=entry_id AND e.status='published'));
CREATE POLICY "dictionary bookmarks: own delete" ON public.dictionary_bookmarks FOR DELETE TO authenticated USING(user_id=auth.uid());

CREATE FUNCTION public.validate_dictionary_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 NEW.word:=trim(NEW.word); NEW.meaning:=trim(NEW.meaning); NEW.updated_at:=now();
 IF EXISTS(SELECT 1 FROM unnest(NEW.topics) t LEFT JOIN public.dictionary_topics d ON d.id=t WHERE d.id IS NULL) THEN
  RAISE EXCEPTION 'dictionary topic not found' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.lessons) s LEFT JOIN public.lessons l ON l.id=s WHERE l.id IS NULL OR l.level<>NEW.course OR (NEW.status='published' AND l.status<>'published')) THEN
  RAISE EXCEPTION 'dictionary source lesson does not match course or publication status' USING ERRCODE='23514'; END IF;
 IF NEW.audio IS NOT NULL AND (NEW.audio !~ '^[a-f0-9-]+/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='dictionary-audio' AND name=NEW.audio)) THEN
  RAISE EXCEPTION 'dictionary audio not found' USING ERRCODE='23514'; END IF;
 IF NEW.status='published' AND (NEW.type='' OR NEW.meaning='' OR cardinality(NEW.topics)=0 OR cardinality(NEW.lessons)=0 OR (NEW.type='noun' AND NEW.article='') OR ((trim(NEW.example)='')<>(trim(NEW.translation)=''))) THEN
  RAISE EXCEPTION 'dictionary publication requires complete content and source associations' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_dictionary_entry() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_dictionary_entry BEFORE INSERT OR UPDATE ON public.dictionary_entries FOR EACH ROW EXECUTE FUNCTION public.validate_dictionary_entry();

CREATE FUNCTION public.save_dictionary_entry(p_content jsonb,p_status text,p_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE value public.dictionary_entries; current_status text; result_id uuid;
BEGIN
 IF (auth.jwt()->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('draft','published') OR p_status IS NULL OR jsonb_typeof(p_content)<>'object' THEN RAISE EXCEPTION 'Invalid dictionary payload' USING ERRCODE='23514'; END IF;
 value:=jsonb_populate_record(NULL::public.dictionary_entries,p_content);
 IF value.word IS NULL OR length(trim(value.word)) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Dictionary word required' USING ERRCODE='23514'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT status INTO current_status FROM public.dictionary_entries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dictionary entry not found' USING ERRCODE='23514'; END IF;
  IF p_status='draft' AND current_status='published' THEN
   INSERT INTO public.dictionary_entry_drafts(entry_id,content) VALUES(p_id,p_content)
    ON CONFLICT(entry_id) DO UPDATE SET content=excluded.content,updated_at=now();
   RETURN p_id;
  END IF;
 END IF;
 INSERT INTO public.dictionary_entries(id,word,type,article,plural,inflection,meaning,ipa,example,translation,course,topics,lessons,audio,status)
 VALUES(coalesce(p_id,gen_random_uuid()),value.word,coalesce(value.type,''),coalesce(value.article,''),coalesce(value.plural,''),coalesce(value.inflection,''),coalesce(value.meaning,''),coalesce(value.ipa,''),coalesce(value.example,''),coalesce(value.translation,''),value.course,coalesce(value.topics,'{}'),coalesce(value.lessons,'{}'),value.audio,p_status)
 ON CONFLICT(id) DO UPDATE SET word=excluded.word,type=excluded.type,article=excluded.article,plural=excluded.plural,inflection=excluded.inflection,meaning=excluded.meaning,ipa=excluded.ipa,example=excluded.example,translation=excluded.translation,course=excluded.course,topics=excluded.topics,lessons=excluded.lessons,audio=excluded.audio,status=excluded.status
 RETURNING id INTO result_id;
 DELETE FROM public.dictionary_entry_drafts WHERE entry_id=result_id;
 RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_dictionary_entry(jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_dictionary_entry(jsonb,text,uuid) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('dictionary-audio','dictionary-audio',false,26214400,ARRAY['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg']);
CREATE POLICY "dictionary audio: admin upload" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='dictionary-audio' AND (auth.jwt()->'app_metadata'->>'role')='admin' AND (storage.foldername(name))[1]=auth.uid()::text AND name ~ '^[a-f0-9-]+/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$');
CREATE POLICY "dictionary audio: visible" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='dictionary-audio' AND ((auth.jwt()->'app_metadata'->>'role')='admin' OR EXISTS(SELECT 1 FROM public.dictionary_entries e WHERE e.status='published' AND e.audio=name)));
CREATE POLICY "dictionary audio: admin unused delete" ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='dictionary-audio' AND (auth.jwt()->'app_metadata'->>'role')='admin'
 AND NOT EXISTS(SELECT 1 FROM public.dictionary_entries WHERE audio=name)
 AND NOT EXISTS(SELECT 1 FROM public.dictionary_entry_drafts WHERE content->>'audio'=name));
