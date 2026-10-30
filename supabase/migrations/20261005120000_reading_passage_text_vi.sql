-- Bản dịch tiếng Việt của văn bản đọc, chỉ hiển thị sau khi nộp bài.
ALTER TABLE reading_passages ADD COLUMN IF NOT EXISTS text_vi text;
