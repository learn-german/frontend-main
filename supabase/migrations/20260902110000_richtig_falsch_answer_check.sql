-- Restrict richtig_falsch correct_answer to the two allowed wire values.
ALTER TABLE grammar_exercises
  ADD CONSTRAINT grammar_exercises_richtig_falsch_answer_check
  CHECK (
    type <> 'richtig_falsch'
    OR correct_answer IN ('richtig', 'falsch')
  );
