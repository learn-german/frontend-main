-- =============================================================================
-- DeutschPath — grammar_exercises: siết chặt ràng buộc cho `multiple_choice`
-- 1. Buộc `options` phải tồn tại (>= 2 phần tử) khi type = 'multiple_choice'.
-- 2. Buộc mọi phần tử trong `options` phải là chuỗi JSON (không cho object/number).
-- =============================================================================

ALTER TABLE grammar_exercises
  ADD CONSTRAINT grammar_exercises_multiple_choice_options_required
    CHECK (
      type <> 'multiple_choice'
      OR (options IS NOT NULL AND jsonb_array_length(options) >= 2)
    ),
  ADD CONSTRAINT grammar_exercises_options_elements_are_strings
    CHECK (
      options IS NULL
      OR NOT (options @? '$[*] ? (@.type() != "string")')
    );
