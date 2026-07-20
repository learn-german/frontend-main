-- =============================================================================
-- DeutschPath — reseed grammar_exercises cho bài a1-l1 với dữ liệu mẫu mới,
-- minh hoạ tính năng group_id: 1 loại bài tập có thể có nhiều "câu" (nhiều
-- group_id khác nhau), mỗi câu có nhiều câu con cùng group_id.
-- =============================================================================

DELETE FROM grammar_exercises WHERE lesson_id = 'a1-l1';

INSERT INTO grammar_exercises
  (lesson_id, type, status, group_id, order_index, tokens, correct_answer, prompt_text, transformation_hint, classification_groups, classification_items, explanation)
VALUES
  -- Sắp xếp từ — đợt 1 (3 câu con, group A)
  ('a1-l1', 'word_reorder', 'published', '11111111-1111-4111-8111-111111111101', 1,
    '["ich","heiße","Anna"]'::jsonb, 'Ich heiße Anna.', NULL, NULL, NULL, NULL,
    'Câu khẳng định tiếng Đức: động từ chia luôn đứng ở vị trí thứ 2.'),
  ('a1-l1', 'word_reorder', 'published', '11111111-1111-4111-8111-111111111101', 2,
    '["ich","komme","aus","Vietnam"]'::jsonb, 'Ich komme aus Vietnam.', NULL, NULL, NULL, NULL,
    '"kommen aus" + tên quốc gia để nói quê quán.'),
  ('a1-l1', 'word_reorder', 'published', '11111111-1111-4111-8111-111111111101', 3,
    '["ich","bin","zwanzig","Jahre","alt"]'::jsonb, 'Ich bin zwanzig Jahre alt.', NULL, NULL, NULL, NULL,
    'Cấu trúc nói tuổi: "Ich bin [số] Jahre alt."'),
  -- Sắp xếp từ — đợt 2 (2 câu con, group B — cùng loại nhưng KHÁC đợt tạo)
  ('a1-l1', 'word_reorder', 'published', '11111111-1111-4111-8111-111111111102', 4,
    '["wo","wohnst","du"]'::jsonb, 'Wo wohnst du?', NULL, NULL, NULL, NULL,
    'Câu hỏi W-Frage với "wo" (ở đâu), động từ đứng ngay sau từ hỏi.'),
  ('a1-l1', 'word_reorder', 'published', '11111111-1111-4111-8111-111111111102', 5,
    '["ich","wohne","in","Berlin"]'::jsonb, 'Ich wohne in Berlin.', NULL, NULL, NULL, NULL,
    '"wohnen in" + tên thành phố để nói nơi ở.'),
  -- Sửa câu sai (3 câu con, 1 đợt)
  ('a1-l1', 'error_correction', 'published', '22222222-2222-4222-8222-222222222201', 6,
    NULL, 'Ich heiße Anna.', 'Ich heißt Anna.', NULL, NULL, NULL,
    'Chia động từ "heißen" ở ngôi "ich" là "heiße", không phải "heißt".'),
  ('a1-l1', 'error_correction', 'published', '22222222-2222-4222-8222-222222222201', 7,
    NULL, 'Wie alt bist du?', 'Du bist wie alt?', NULL, NULL, NULL,
    'Từ để hỏi "wie alt" phải đứng đầu câu hỏi.'),
  ('a1-l1', 'error_correction', 'published', '22222222-2222-4222-8222-222222222201', 8,
    NULL, 'Er kommt aus Deutschland.', 'Er kommt aus von Deutschland.', NULL, NULL, NULL,
    '"kommen aus" chỉ cần 1 giới từ "aus", không thêm "von".'),
  -- Dịch (2 câu con, 1 đợt)
  ('a1-l1', 'translation', 'published', '33333333-3333-4333-8333-333333333301', 9,
    NULL, 'Hallo, ich heiße Lan.', 'Xin chào, tôi tên là Lan.', NULL, NULL, NULL,
    'Chào hỏi + giới thiệu tên bằng "ich heiße...".'),
  ('a1-l1', 'translation', 'published', '33333333-3333-4333-8333-333333333301', 10,
    NULL, 'Freut mich, dich kennenzulernen.', 'Rất vui được gặp bạn.', NULL, NULL, NULL,
    'Cụm cố định dùng khi mới gặp ai đó lần đầu.'),
  -- Biến đổi câu (2 câu con, 1 đợt)
  ('a1-l1', 'sentence_transformation', 'published', '44444444-4444-4444-8444-444444444401', 11,
    NULL, 'Heißt du Peter?', 'Du heißt Peter.', 'Chuyển thành câu hỏi Ja/Nein', NULL, NULL,
    'Câu hỏi Ja/Nein: đảo động từ chia lên đầu câu.'),
  ('a1-l1', 'sentence_transformation', 'published', '44444444-4444-4444-8444-444444444401', 12,
    NULL, 'Woher kommt sie?', 'Sie kommt aus Japan.', 'Chuyển thành câu hỏi W-Frage với "woher"', NULL, NULL,
    '"woher" (từ đâu) đứng đầu câu, theo sau là động từ chia.'),
  -- Viết câu gợi ý (2 câu con, 1 đợt)
  ('a1-l1', 'guided_sentence_writing', 'published', '55555555-5555-4555-8555-555555555501', 13,
    NULL, 'Ich heiße Nam und komme aus Vietnam.', 'ich / heißen / Nam / und / kommen / aus / Vietnam', NULL, NULL, NULL,
    'Nối 2 mệnh đề bằng "und", mỗi mệnh đề đều cần động từ chia đúng ngôi.'),
  ('a1-l1', 'guided_sentence_writing', 'published', '55555555-5555-4555-8555-555555555501', 14,
    NULL, 'Wir wohnen seit zwei Jahren in München.', 'wir / wohnen / in / München / seit / zwei Jahren', NULL, NULL, NULL,
    '"seit" + khoảng thời gian để nói đã làm gì bao lâu rồi.'),
  -- Phân loại (1 câu)
  ('a1-l1', 'classification', 'published', NULL, 15,
    NULL, NULL, NULL, NULL,
    '["Số ít", "Số nhiều"]'::jsonb,
    '[{"item":"ich","group":"Số ít"},{"item":"du","group":"Số ít"},{"item":"wir","group":"Số nhiều"},{"item":"ihr","group":"Số nhiều"}]'::jsonb,
    'Đại từ nhân xưng số ít: ich, du, er/sie/es. Số nhiều: wir, ihr, sie.');
