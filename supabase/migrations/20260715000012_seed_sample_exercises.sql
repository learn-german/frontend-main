-- =============================================================================
-- DeutschPath — sample quiz_questions data for Nghe/Đọc/Ngữ pháp (lesson a1-l1)
-- =============================================================================

-- 1. Replace the placeholder reading passage with a real short A1 text.
UPDATE lessons
SET reading_text = 'Hallo! Ich heiße Anna und ich komme aus Deutschland. Ich wohne jetzt in Hanoi und lerne Vietnamesisch. Meine Familie ist klein: ich habe einen Bruder und eine Schwester. Am Wochenende koche ich gern vietnamesisches Essen mit meinen Freunden.',
    reading_text_vi = 'Xin chào! Tôi tên là Anna và tôi đến từ Đức. Bây giờ tôi sống ở Hà Nội và học tiếng Việt. Gia đình tôi nhỏ: tôi có một anh trai và một chị gái. Vào cuối tuần, tôi thích nấu món ăn Việt Nam cùng bạn bè.'
WHERE id = 'a1-l1';

-- 2. Nghe (category='nghe') — 3 dạng: điền ô trống / Richtig-Falsch / trắc nghiệm ABC
INSERT INTO quiz_questions (lesson_id, category, type, question_text, options, correct_answer, explanation, order_index) VALUES
('a1-l1', 'nghe', 'fill-blank',
  'Nghe đoạn hội thoại và điền từ còn thiếu: "Guten Tag! Ich ______ Peter."',
  NULL, 'heiße',
  'Động từ "heißen" chia ở ngôi "ich" là "heiße".', 1),
('a1-l1', 'nghe', 'multiple-choice',
  'Người trong đoạn hội thoại chào buổi sáng ("Guten Morgen").',
  '["Richtig", "Falsch"]'::jsonb, 'Falsch',
  'Trong đoạn hội thoại, người nói dùng "Guten Tag" (chào buổi trưa/chiều), không phải "Guten Morgen".', 2),
('a1-l1', 'nghe', 'multiple-choice',
  'Tên của người trong đoạn hội thoại là gì?',
  '["Anna", "Peter", "Maria", "Klaus"]'::jsonb, 'Peter',
  'Người nói tự giới thiệu: "Ich heiße Peter."', 3);

-- 3. Đọc (category='doc') — dựa trên đoạn văn mới ở bước 1
INSERT INTO quiz_questions (lesson_id, category, type, question_text, options, correct_answer, explanation, order_index) VALUES
('a1-l1', 'doc', 'fill-blank',
  'Điền từ còn thiếu dựa vào đoạn văn: "Ich ______ aus Deutschland."',
  NULL, 'komme',
  'Trong đoạn văn: "...ich komme aus Deutschland."', 1),
('a1-l1', 'doc', 'multiple-choice',
  'Anna hiện đang sống ở Đức.',
  '["Richtig", "Falsch"]'::jsonb, 'Falsch',
  'Đoạn văn ghi rõ: "Ich wohne jetzt in Hanoi" — Anna hiện sống ở Hà Nội, không phải ở Đức.', 2),
('a1-l1', 'doc', 'multiple-choice',
  'Anna có những anh chị em nào?',
  '["Không có ai", "Một anh trai và một chị gái", "Hai anh trai", "Ba chị gái"]'::jsonb, 'Một anh trai và một chị gái',
  'Đoạn văn: "ich habe einen Bruder und eine Schwester" (tôi có một anh trai và một chị gái).', 3);

-- 4. Ngữ pháp (category='nguphap') — thêm 1 câu "viết lại câu" để đủ 3 dạng
--    (đã có sẵn multiple-choice/fill-blank/matching/listening, order_index 1-4)
INSERT INTO quiz_questions (lesson_id, category, type, question_text, options, correct_answer, explanation, order_index) VALUES
('a1-l1', 'nguphap', 'fill-blank',
  'Viết lại câu sau bằng tiếng Đức: "Tôi đến từ Việt Nam."',
  NULL, 'Ich komme aus Vietnam.',
  '"Đến từ" = "kommen aus", chia động từ ở ngôi "ich": "Ich komme aus Vietnam."', 5);
