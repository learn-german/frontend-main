CREATE FUNCTION public.validate_dictionary_draft_topics() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(NEW.content->'topics','[]'::jsonb)) AS source(topic_id)
    WHERE NOT EXISTS(SELECT 1 FROM public.dictionary_topics WHERE id::text=source.topic_id)) THEN
    RAISE EXCEPTION 'dictionary topic not found' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_dictionary_draft_topics() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_dictionary_draft_topics BEFORE INSERT OR UPDATE ON public.dictionary_entry_drafts
FOR EACH ROW EXECUTE FUNCTION public.validate_dictionary_draft_topics();
