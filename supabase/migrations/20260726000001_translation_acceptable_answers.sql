-- Additional accepted German answers for translation exercises. NULL/[] means
-- "only correct_answer is accepted". Used exclusively by type = 'translation';
-- scoring accepts the user's answer if it matches correct_answer OR any entry
-- here (after normalization). Kept server-side — never selected by the client.
ALTER TABLE grammar_exercises ADD COLUMN acceptable_answers JSONB;
