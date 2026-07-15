ALTER TABLE lessons ADD COLUMN speaking_md TEXT;

UPDATE lessons
SET speaking_md = '## Luyện nói: Giới thiệu bản thân

Hãy tập nói to các câu sau, dựa theo mẫu hội thoại đã học:

- **Chào hỏi**: "Guten Tag! Ich heiße [tên bạn]."
- **Giới thiệu quê quán**: "Ich komme aus Vietnam."
- **Hỏi lại người khác**: "Und du? Wie heißt du?"

### Gợi ý luyện tập
1. Nói to từng câu, chú ý phát âm chữ "ch" trong "ich".
2. Ghép các câu trên thành 1 đoạn giới thiệu bản thân hoàn chỉnh (3-4 câu).
3. Thử đổi tên/quê quán của bạn vào mẫu câu và nói lại.'
WHERE id = 'a1-l1';
