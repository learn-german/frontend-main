# Listening set transcription

Ngày: 2026-09-04

## Mục tiêu

Admin nhập transcription (plain text) cho mỗi bộ bài nghe. Học viên thấy link
“Xem transcription” dưới khối đáp án khi `revealed`, click mở tab mới.

## Quyết định đã chốt

- Gắn theo `exercise_sets` (1 audio / set = 1 transcription).
- Admin: textarea plain giống `general_instruction` / explanation ngữ pháp.
- Hiện khi `revealed` (đúng 100% hoặc ≥5 lần) — **không** đổi rule Pass 80%.
- Click → `window.open` tab mới, plain text (`whitespace-pre-wrap`), escape HTML.
- Không bắt buộc lúc publish; không upload file; không Markdown.

## Data

```sql
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS transcription TEXT;
```

Soft-gate UI (giống explanation): cột vẫn SELECT được qua RLS published;
learner chỉ hiện khi `revealed`.

## Luồng

1. Admin lưu `transcription` trên set nghe.
2. `grammar-submit` select `transcription`; khi `revealed && category = 'nghe'`
   trả kèm trong JSON response.
3. Card kết quả (`QuizSetListPage`, tab nghe): nếu có text → nút “Xem transcription”.
4. Hydrate / F5: dùng `set.transcription` khi `attempt.revealed`.

## Ngoài scope

- Đổi reveal sang Pass 80%
- Ngữ pháp / đọc
- File upload, RLS ẩn cột
