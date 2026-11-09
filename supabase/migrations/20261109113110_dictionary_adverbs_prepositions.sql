ALTER TABLE public.dictionary_entries
  DROP CONSTRAINT dictionary_entries_type_check,
  ADD CONSTRAINT dictionary_entries_type_check
    CHECK (type IN ('', 'noun', 'verb', 'adjective', 'adverb', 'preposition', 'phrase'));
