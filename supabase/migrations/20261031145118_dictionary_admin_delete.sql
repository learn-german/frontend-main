GRANT DELETE ON public.dictionary_entries,public.dictionary_topics TO authenticated;
CREATE POLICY "dictionary entries: admin delete" ON public.dictionary_entries FOR DELETE TO authenticated
USING ((auth.jwt()->'app_metadata'->>'role')='admin');
CREATE POLICY "dictionary topics: admin delete" ON public.dictionary_topics FOR DELETE TO authenticated
USING ((auth.jwt()->'app_metadata'->>'role')='admin');

CREATE FUNCTION public.guard_dictionary_topic_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  -- Serialize reference checks with entry/draft writes so a new association cannot race deletion.
  LOCK TABLE public.dictionary_entries,public.dictionary_entry_drafts IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM public.dictionary_entries WHERE OLD.id=ANY(topics))
    OR EXISTS(SELECT 1 FROM public.dictionary_entry_drafts WHERE content->'topics' @> jsonb_build_array(OLD.id::text)) THEN
    RAISE EXCEPTION 'Chủ đề đang được mục từ hoặc bản nháp sử dụng. Bỏ liên kết trước khi xóa.' USING ERRCODE='23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_dictionary_topic_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dictionary_topic_delete_guard BEFORE DELETE ON public.dictionary_topics
FOR EACH ROW EXECUTE FUNCTION public.guard_dictionary_topic_delete();
