-- general_instruction for set-level "Yêu cầu chung"
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS general_instruction TEXT;

-- Add richtig_falsch question type
ALTER TABLE grammar_exercises
  DROP CONSTRAINT IF EXISTS grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder', 'error_correction', 'translation', 'sentence_transformation',
    'guided_sentence_writing', 'classification', 'fill_in_the_blank', 'multiple_choice',
    'matching', 'richtig_falsch'
  ));
