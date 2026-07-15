# Đưa Từ vựng lên đầu tab + Nền tảng category cho bài tập (Nghe/Đọc/Ngữ pháp)

## Bối cảnh

Yêu cầu gốc của người dùng là một tập hợp lớn gồm nhiều tính năng độc lập:
1. Đưa tab "Từ vựng" lên đầu danh sách tab học của học viên.
2. Bài tập Nghe: 3 dạng câu hỏi (điền ô trống / chọn Richtig-Falsch / trắc nghiệm ABC), mỗi bài tập có nhiều câu hỏi.
3. Bài tập Đọc (Lesen): tương tự Nghe, tính năng optional (có thể không có ở 1 bài học).
4. Đổi tab "Quiz" thành tab "Bài tập ngữ pháp" (dùng lại đúng cơ chế Quiz hiện có), optional, gồm điền ô trống / viết lại câu tiếng Đức / trắc nghiệm.

Đây là 4 hệ thống con độc lập, quá lớn để thiết kế 1 lần — đã được chia thành các dự án con:
- **Dự án 1** (spec này, phần A): đổi thứ tự tab Từ vựng.
- **Dự án 2** (spec này, phần B): nền tảng category cho `quiz_questions`/`lesson_progress`, mở khóa cho Dự án 3 (Nghe), Dự án 4 (Đọc), và việc đổi tên tab Quiz → Ngữ pháp.
- Dự án 3, 4 (đổi tên tab Quiz, thêm Nghe, thêm Đọc) sẽ có spec riêng sau khi Dự án 2 hoàn thành.

## Khảo sát hiện trạng (quan trọng cho thiết kế)

- Cơ chế Quiz hiện tại đã tổng quát: `quiz_questions` (4 type: multiple-choice/fill-blank/matching/listening, JSONB `options`/`matching_pairs`, `correct_answer` không lộ ra client), view `quiz_questions_public` (ẩn `correct_answer`), `QuizPage.tsx` (render từng câu một, chấm 1 lần cuối), `supabase/functions/quiz-submit` (chấm điểm chung mọi type), `AdminQuizSection.tsx` (CRUD đầy đủ cho cả 4 type).
- Nghe/Đọc trong `LessonDetailPage.tsx` hiện **hoàn toàn không có** cơ chế câu hỏi — chỉ là audio player / hiển thị văn bản thuần.
- `lesson_progress` hiện có khóa chính `(user_id, lesson_id)` — **1 dòng duy nhất** lưu `quiz_score` cho mỗi (user, bài học), không phân biệt loại bài tập.
- `quiz-submit` upsert vào `lesson_progress` chỉ theo `(user_id, lesson_id)` — nếu dùng chung cơ chế cho cả Nghe/Đọc/Ngữ pháp mà không sửa, làm bài này sẽ **ghi đè điểm** của bài kia.
- `lesson-complete` Edge Function dùng `.maybeSingle()` khi kiểm tra đã tồn tại dòng `lesson_progress` chưa — sẽ lỗi ngay khi có ≥2 dòng cho cùng `(user_id, lesson_id)`.
- `useUserStats.ts` lấy `completedLessons`/`quizScores` từ `lesson_progress` không lọc theo category — nếu có nhiều dòng cùng lesson_id, `quizScores` sẽ bị ghi đè ngẫu nhiên (dòng nào duyệt sau thắng).
- `completedLessons` (dùng để mở khóa tiến trình ở Roadmap) hiện chỉ cần **tồn tại 1 dòng** `lesson_progress` cho `(user_id, lesson_id)`, không quan tâm giá trị `quiz_score`.

## Quyết định thiết kế đã chốt

- **Loại câu hỏi**: không thêm `type` mới. "Chọn Richtig/Falsch" = `multiple-choice` với `options: ["Richtig", "Falsch"]`. "Viết lại câu tiếng Đức" = `fill-blank` (so khớp với `correct_answer`), nhưng ô nhập liệu cần đổi thành textarea nhiều dòng thay vì input 1 dòng khi cần nhập cả câu (chi tiết UI cụ thể thuộc Dự án 4, không phải phần nền tảng này).
- **Category dùng chung 1 ngân hàng câu hỏi**: thêm cột `category` vào `quiz_questions`, giá trị `'nguphap' | 'nghe' | 'doc'`. Toàn bộ câu hỏi hiện có (đang phục vụ tab Quiz) backfill thành `'nguphap'`.
- **Điểm số tách biệt theo category**: `lesson_progress` thêm cột `category`, đổi khóa chính thành `(user_id, lesson_id, category)`. Nút "Đánh dấu đã học" / hoàn thành bài học (gắn với Roadmap) luôn dùng `category = 'nguphap'` — Nghe/Đọc là bài tập optional, có điểm riêng, **không** ảnh hưởng tới việc mở khóa bài học tiếp theo trên Roadmap.

## Phần A — Dự án 1: Đưa tab Từ vựng lên đầu

`src/pages/LessonDetailPage.tsx` — mảng `BOTTOM_TABS` đổi thứ tự từ `[quiz, nghe, doc, tuvung]` thành `[tuvung, quiz, nghe, doc]`. Tab mặc định khi mở trang (`useState<BottomTab>("quiz")`) **giữ nguyên** là `"quiz"` — chỉ đổi vị trí hiển thị trên thanh tab, không đổi tab nào được chọn sẵn khi vào trang.

## Phần B — Dự án 2: Nền tảng category

### B.1. Migration

```sql
-- 1. quiz_questions + view: thêm category, backfill 'nguphap' cho câu hỏi hiện có.
ALTER TABLE quiz_questions
  ADD COLUMN category TEXT NOT NULL DEFAULT 'nguphap'
  CHECK (category IN ('nguphap', 'nghe', 'doc'));

CREATE OR REPLACE VIEW quiz_questions_public AS
  SELECT
    id, lesson_id, type, category, question_text, audio_text,
    options, matching_pairs, explanation, order_index
  FROM quiz_questions;

-- 2. lesson_progress: thêm category, đổi khóa chính, backfill dòng cũ thành 'nguphap'.
ALTER TABLE lesson_progress
  ADD COLUMN category TEXT NOT NULL DEFAULT 'nguphap'
  CHECK (category IN ('nguphap', 'nghe', 'doc'));

ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_pkey;
ALTER TABLE lesson_progress ADD PRIMARY KEY (user_id, lesson_id, category);
```

(Tên constraint `lesson_progress_pkey` là tên mặc định Postgres đặt cho `PRIMARY KEY` không đặt tên tường minh trong migration gốc — cần xác nhận tên thật qua `\d lesson_progress` hoặc truy vấn `information_schema` trước khi áp dụng, vì nếu Supabase đặt tên khác thì câu lệnh `DROP CONSTRAINT` sẽ lỗi.)

### B.2. `supabase/functions/lesson-complete/index.ts`

- Sửa lệnh `.maybeSingle()` kiểm tra tồn tại: thêm `.eq("category", "nguphap")`.
- Sửa `insert`: thêm `category: "nguphap"` vào object insert.

### B.3. `supabase/functions/quiz-submit/index.ts`

- Nhận thêm `category` từ request body (client gửi lên, giá trị `'nguphap' | 'nghe' | 'doc'` tùy theo bài tập đang làm).
- Lọc câu hỏi để chấm: `supabase.from("quiz_questions").select(...).eq("lesson_id", lessonId).eq("category", category)`.
- Upsert: `{ user_id, lesson_id, category, quiz_score: score }`, `onConflict: "user_id,lesson_id,category"`.

### B.4. `src/lib/hooks/useUserStats.ts`

- Query `lesson_progress` thêm `.eq("category", "nguphap")` — giữ nguyên ý nghĩa "hoàn thành bài học" cũ, không bị Nghe/Đọc làm nhiễu.

### B.5. `src/lib/appTypes.ts`

- `QuizQuestion` thêm `category: "nguphap" | "nghe" | "doc"`.

### B.6. `src/lib/hooks/useQuizQuestions.ts`

- Thêm tham số `category` vào hàm, lọc `.eq("category", category)` trong query, thêm `category` vào `select(...)`.

### B.7. `src/pages/QuizPage.tsx`

- Nhận thêm 1 prop `category: "nguphap" | "nghe" | "doc"` (mặc định truyền `"nguphap"` từ nơi gọi hiện tại — không đổi hành vi tab Quiz hiện có), truyền xuống `useQuizQuestions` và gửi kèm trong request tới `quiz-submit`.

### B.8. `src/pages/admin/AdminQuizSection.tsx`

- Thêm chọn `category` (mặc định `'nguphap'`) vào form tạo/sửa câu hỏi, hiển thị badge category trong danh sách.

## Ngoài phạm vi (Dự án 2 không làm)

- Không đổi nhãn tab "Quiz" thành "Bài tập ngữ pháp" trên UI học viên (Dự án 3).
- Không thêm bài tập thật cho Nghe/Đọc trên `LessonDetailPage` (Dự án 3, 4) — chỉ chuẩn bị hạ tầng để các dự án đó cắm vào.
- Không đổi UI ô nhập liệu fill-blank thành textarea cho "viết lại câu" (thuộc Dự án 3 khi làm tab Ngữ pháp).
- Không nới lỏng cách so khớp câu trả lời fill-blank (case-insensitive exact match hiện tại giữ nguyên).

## Testing / verification

- `npm run lint` pass.
- Xác nhận tên constraint PK thật của `lesson_progress` trước khi migration (đọc `information_schema.table_constraints` qua Supabase MCP).
- Test trực tiếp trên Supabase (BEGIN/ROLLBACK): insert 2 dòng `lesson_progress` cùng `(user_id, lesson_id)` khác `category` — xác nhận không lỗi PK, xác nhận `useUserStats`'s query (lọc `category='nguphap'`) trả về đúng 1 dòng.
- Gọi thử `quiz-submit` với `category` khác nhau cho cùng lesson — xác nhận 2 dòng điểm riêng biệt được tạo, không ghi đè lẫn nhau.
- Gọi thử `lesson-complete` sau khi đã có dòng `category='nghe'` cho cùng lesson — xác nhận không lỗi (idempotency check giờ lọc đúng `category='nguphap'`, không bị dòng 'nghe' làm `.maybeSingle()` throw).
- Test browser thủ công: tab Từ vựng hiển thị đầu tiên trên thanh tab, các tab khác giữ nguyên vị trí tương đối.
