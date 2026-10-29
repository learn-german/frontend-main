-- Permit published nouns without an article; all other validation is unchanged.
CREATE OR REPLACE FUNCTION public.validate_dictionary_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 NEW.word:=trim(NEW.word); NEW.meaning:=trim(NEW.meaning); NEW.updated_at:=now();
 IF EXISTS(SELECT 1 FROM unnest(NEW.topics) t LEFT JOIN public.dictionary_topics d ON d.id=t WHERE d.id IS NULL) THEN
  RAISE EXCEPTION 'dictionary topic not found' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.lessons) s LEFT JOIN public.lessons l ON l.id=s WHERE l.id IS NULL OR l.level<>NEW.course OR (NEW.status='published' AND l.status<>'published')) THEN
  RAISE EXCEPTION 'dictionary source lesson does not match course or publication status' USING ERRCODE='23514'; END IF;
 IF NEW.audio IS NOT NULL AND (NEW.audio !~ '^[a-f0-9-]+/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='dictionary-audio' AND name=NEW.audio)) THEN
  RAISE EXCEPTION 'dictionary audio not found' USING ERRCODE='23514'; END IF;
 IF NEW.status='published' AND (NEW.type='' OR NEW.meaning='' OR cardinality(NEW.topics)=0 OR cardinality(NEW.lessons)=0 OR ((trim(NEW.example)='')<>(trim(NEW.translation)=''))) THEN
  RAISE EXCEPTION 'dictionary publication requires complete content and source associations' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
