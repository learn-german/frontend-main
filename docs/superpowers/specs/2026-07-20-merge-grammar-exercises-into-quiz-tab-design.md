# Gộp "Bài tập ngữ pháp" vào tab "Ngữ pháp" của Quản lý bài tập

## Bối cảnh

Trang admin "Bài tập ngữ pháp" (`AdminGrammarExerciseSection.tsx`, bảng `grammar_exercises`, 6 dạng bài mới) hiện là mục nav **riêng biệt**, tách khỏi trang "Quản lý bài tập" (`AdminQuizSection.tsx`) — nơi có 3 tab Ngữ pháp/Nghe/Đọc, tab Ngữ pháp đang quản lý `quiz_questions` category `nguphap` (4 dạng câu hỏi cũ: trắc nghiệm, điền chỗ trống, ghép đôi, nghe hiểu).

Yêu cầu: gộp lại thành 1 trang — tab "Ngữ pháp" trong "Quản lý bài tập" sẽ hiển thị nội dung của `AdminGrammarExerciseSection` thay vì `quiz_questions` category nguphap như trước. Xóa hẳn dữ liệu `nguphap` cũ (kể cả dữ liệu điểm/hoàn thành liên quan) vì đang ở giai đoạn dev.

## Quyết định thiết kế đã chốt

- **Gộp UI**: khi tab "Ngữ pháp" active trong `AdminQuizSection`, render nguyên `<AdminGrammarExerciseSection />` (component giữ nguyên, không sửa nội bộ) thay cho khối tiêu đề+search+danh sách bài học hiện tại của tab đó. Tab Nghe/Đọc không đổi.
- **Bỏ nav riêng**: xóa mục "Bài tập ngữ pháp" khỏi sidebar Admin (`AdminPage.tsx`) — không còn là trang độc lập.
- **Xóa dữ liệu cũ triệt để**: xóa toàn bộ `quiz_questions` (14 dòng) và `lesson_progress` (3 dòng) có `category = 'nguphap'`. Chấp nhận việc này reset "đã hoàn thành bài học" trên leaderboard cho các dòng đó — môi trường dev, không cần bảo toàn điểm/tiến độ học viên.
  - **Lưu ý quan trọng đã phát hiện**: `lesson_progress.category = 'nguphap'` không chỉ dùng cho điểm ngữ pháp — 2 Edge Function `lesson-complete` và `leaderboard` dùng chính category này làm dấu hiệu chung "đã hoàn thành bài học". Không sửa 2 Edge Function này (đây là hành vi hiện có, không thuộc phạm vi task) — chỉ dọn dữ liệu cũ; các lượt hoàn thành bài học **mới** trong tương lai vẫn tiếp tục ghi `category: 'nguphap'` như cũ, không bị ảnh hưởng.
- **Seed dữ liệu mẫu mới**: thêm 6 dòng `grammar_exercises` mẫu (1 dòng/loại) vào lesson `a1-l1` (lesson đã dùng làm mẫu Nghe/Đọc trước đây), dùng đúng nội dung ví dụ trong yêu cầu gốc — đã được validate logic (Task 3) xác nhận hợp lệ.
- **Không đổi phía học viên**: `LessonDetailPage`/`QuizPage` giữ nguyên, tiếp tục đọc `quiz_questions` category nguphap để luyện tập/chấm điểm (giờ sẽ trống dữ liệu cho đến khi có task xây trang luyện tập 6 dạng bài mới — ngoài phạm vi task này).

## Thiết kế chi tiết

### 1. Migration `supabase/migrations/<timestamp>_cleanup_nguphap_quiz_data.sql`

```sql
DELETE FROM quiz_questions WHERE category = 'nguphap';
DELETE FROM lesson_progress WHERE category = 'nguphap';
```

Không cần `npm run gen:types` sau bước này (không đổi schema, chỉ xóa dữ liệu).

### 2. Migration seed `supabase/migrations/<timestamp>_seed_grammar_exercises_samples.sql`

```sql
INSERT INTO grammar_exercises (lesson_id, type, status, prompt_text, transformation_hint, correct_answer, tokens, classification_groups, classification_items, explanation, order_index) VALUES
('a1-l1', 'word_reorder', 'published', NULL, NULL, 'Ich höre am Abend Musik.',
  '["am Abend", "ich", "Musik", "höre"]'::jsonb, NULL, NULL,
  'Động từ chia ở vị trí thứ 2, trạng ngữ thời gian "am Abend" có thể đứng đầu hoặc sau động từ.', 1),
('a1-l1', 'error_correction', 'published', 'Ich stehe auf um 7 Uhr.', NULL, 'Ich stehe um 7 Uhr auf.',
  NULL, NULL, NULL,
  'Động từ tách "aufstehen" — phần "auf" phải đứng cuối câu, không đứng ngay sau "stehe".', 1),
('a1-l1', 'translation', 'published', 'Tôi học tiếng Đức.', NULL, 'Ich lerne Deutsch.',
  NULL, NULL, NULL,
  'Chủ ngữ "ich" + động từ chia ngôi 1 số ít "lerne" + tân ngữ.', 1),
('a1-l1', 'sentence_transformation', 'published', 'Du kommst heute.', 'Ja/Nein-Frage', 'Kommst du heute?',
  NULL, NULL, NULL,
  'Câu hỏi Ja/Nein đảo động từ lên đầu câu.', 1),
('a1-l1', 'guided_sentence_writing', 'published', 'Ich bin müde. Ich arbeite. + aber', NULL, 'Ich bin müde, aber ich arbeite.',
  NULL, NULL, NULL,
  'Liên từ "aber" nối 2 mệnh đề độc lập, có dấu phẩy trước "aber".', 1),
('a1-l1', 'classification', 'published', NULL, NULL, NULL,
  NULL, '["der", "die", "das"]'::jsonb,
  '[{"item":"Tisch","group":"der"},{"item":"Lampe","group":"die"},{"item":"Buch","group":"das"}]'::jsonb,
  'Giống đực (der), giống cái (die), giống trung (das) trong tiếng Đức phải học thuộc theo từng danh từ.', 1);
```

Áp dụng cả 2 migration qua Supabase MCP (`apply_migration`) vào project "Deutsch" (`awdhqlgxnjwymwgxltlw`), như cách đã làm ở nhánh trước — không có Docker local trong sandbox.

### 3. `src/pages/admin/AdminQuizSection.tsx`

- Import `AdminGrammarExerciseSection` (từ file đã có `./AdminGrammarExerciseSection`).
- Bọc khối hiện tại "tiêu đề Quản lý bài tập + search + `filteredGroups.map(...)` danh sách bài học" trong điều kiện `activeTab !== "nguphap" && (...)`.
- Thêm `{activeTab === "nguphap" && <AdminGrammarExerciseSection />}` render khi tab Ngữ pháp active.
- Tab bar (Ngữ pháp/Nghe/Đọc, dùng `CATEGORY_LABELS`) giữ nguyên, luôn hiển thị phía trên.
- Không sửa `EMPTY_FORM`, `TYPE_LABELS`, modal tạo/sửa câu hỏi quiz, hay bất kỳ logic nào khác của tab Nghe/Đọc.

### 4. `src/pages/admin/AdminPage.tsx`

- Xóa import `AdminGrammarExerciseSection`.
- Xóa `"grammar-exercises"` khỏi union `AdminSection`.
- Xóa nav item `{ id: "grammar-exercises", label: "Bài tập ngữ pháp", Icon: ListChecks }`.
- Xóa render nhánh `{section === "grammar-exercises" && <AdminGrammarExerciseSection />}`.
- Xóa import icon `ListChecks` nếu không còn dùng chỗ nào khác trong file (kiểm tra trước khi xóa).

## Ngoài phạm vi

- Không sửa `supabase/functions/lesson-complete/index.ts`, `leaderboard/index.ts`, `quiz-submit/index.ts` — hành vi hiện có với category `nguphap` giữ nguyên cho các lượt hoàn thành bài học mới.
- Không đổi `LessonDetailPage.tsx`/`QuizPage.tsx` phía học viên.
- Không thêm CHECK constraint mới hay đổi schema `quiz_questions`/`lesson_progress` — category `nguphap` vẫn là giá trị hợp lệ trong DB, chỉ không còn dữ liệu.
- Không sửa nội bộ `AdminGrammarExerciseSection.tsx` (component giữ nguyên như đã build/review ở nhánh trước).

## Testing / verification

- `npm run lint` pass.
- Test thủ công (browser hoặc review code, tùy khả năng môi trường):
  - Sidebar Admin không còn mục "Bài tập ngữ pháp" riêng.
  - Vào "Quản lý bài tập" → tab "Ngữ pháp": hiển thị đúng UI của `AdminGrammarExerciseSection` (tiêu đề "Bài tập ngữ pháp", search riêng, danh sách bài học với 6 dòng mẫu mới ở lesson `a1-l1`).
  - Chuyển tab "Nghe"/"Đọc": vẫn hoạt động y hệt trước, không bị ảnh hưởng.
  - Query DB xác nhận `quiz_questions`/`lesson_progress` category nguphap = 0 dòng, `grammar_exercises` có 6 dòng mẫu mới.
