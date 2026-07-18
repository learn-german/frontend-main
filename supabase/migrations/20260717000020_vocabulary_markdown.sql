-- Thay thế cấu trúc vocabulary JSONB bằng markdown tự do, giống pattern
-- grammar_md/speaking_md/writing_prompt_md. Cột `vocabulary` JSONB cũ được
-- giữ nguyên (không DROP) làm nguồn dữ liệu gốc để đối chiếu nếu cần.
ALTER TABLE lessons ADD COLUMN vocabulary_md TEXT;

DO $$
DECLARE
  lesson_row RECORD;
  vocab_item JSONB;
  block TEXT;
  blocks TEXT[];
  de TEXT;
  vi TEXT;
  pronunciation TEXT;
  example_de TEXT;
  example_vi TEXT;
BEGIN
  FOR lesson_row IN SELECT id, vocabulary FROM lessons WHERE jsonb_array_length(vocabulary) > 0 LOOP
    blocks := ARRAY[]::TEXT[];

    FOR vocab_item IN SELECT * FROM jsonb_array_elements(lesson_row.vocabulary) LOOP
      de := NULLIF(vocab_item->>'de', '');
      vi := NULLIF(vocab_item->>'vi', '');
      pronunciation := NULLIF(vocab_item->>'pronunciation', '');
      example_de := NULLIF(vocab_item->>'exampleDe', '');
      example_vi := NULLIF(vocab_item->>'exampleVi', '');

      -- Skip empty placeholder entries (found in production data for
      -- a1-l1: trailing {"de":"","vi":"",...} objects) — an item with no
      -- `de` has nothing to put inside {{...}}, so emitting it would
      -- produce a bare "### {{}}" heading with no content.
      CONTINUE WHEN de IS NULL;

      block := '### {{' || de || '}}';
      IF vi IS NOT NULL THEN
        block := block || ' — ' || vi;
      END IF;

      IF pronunciation IS NOT NULL THEN
        block := block || E'\n' || '*' || pronunciation || '*';
      END IF;

      IF example_de IS NOT NULL THEN
        block := block || E'\n\n' || '🇩🇪 ' || example_de;
      END IF;

      IF example_vi IS NOT NULL THEN
        -- Blank line (not a single \n) before the VI example: CommonMark
        -- collapses a single newline within a paragraph into a space, so
        -- the DE/VI example lines would otherwise render on one line
        -- instead of two.
        block := block || E'\n\n' || '🇻🇳 ' || example_vi;
      END IF;

      blocks := array_append(blocks, block);
    END LOOP;

    UPDATE lessons SET vocabulary_md = array_to_string(blocks, E'\n\n') WHERE id = lesson_row.id;
  END LOOP;
END $$;
