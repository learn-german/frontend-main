# Phase 4 (UI admin) — Viết lại AdminQuizSection cho Nghe/Đọc theo set — Spec

## Bối cảnh

`QuizSetListPage` (UI học viên) đã xong, đọc từ `grammar_exercises_public`
theo `set_id`. Admin hiện chưa có cách tạo set/câu hỏi Nghe/Đọc mới —
`AdminQuizSection.tsx` cũ vẫn thao tác trên `quiz_questions` (bảng đã xoá),
crash ngay khi mở tab Nghe/Đọc trong admin. Spec này viết lại
`AdminQuizSection.tsx` để quản lý câu hỏi qua `grammar_exercises`
(`set_id`), theo đúng mô hình "set" đã dùng cho Ngữ pháp.

**Không đổi bảng/logic backend** — chỉ UI admin. `useExerciseSets` đã
category-agnostic sẵn (`createSet(lessonId, category, orderIndex)` nhận
category bất kỳ), không cần sửa hook này.

## Vấn đề cần giải quyết: set ↔ clip/đoạn văn

Không có cột DB nối trực tiếp `exercise_sets` với `listening_clips`/
`reading_passages` — chỉ từng exercise (`grammar_exercises`) mới có
`audio_clip_id`/`reading_passage_id`. Quy ước 1 set = 1 clip/1 đoạn văn chỉ
là UI convention (đã ghi trong spec UI học viên).

Giải pháp: khi 1 set **chưa có câu hỏi nào**, admin phải **chọn clip/đoạn
văn** (từ danh sách clip/đoạn văn có sẵn của lesson, hoặc bấm tải/tạo mới
ngay tại chỗ) trước khi thêm câu hỏi đầu tiên. Từ câu hỏi thứ 2 trở đi
trong cùng set, `audio_clip_id`/`reading_passage_id` **tự kế thừa** từ câu
đầu tiên của set đó (đọc `grammar_exercises` hiện có trong set, lấy
`audio_clip_id`/`reading_passage_id` của phần tử đầu) — không cho chọn
lại, giữ đúng quy ước.

## Giữ nguyên từ `AdminQuizSection.tsx` cũ

Các phần này **không phụ thuộc `quiz_questions`**, copy gần như nguyên
văn:
- Toàn bộ CRUD `listening_clips` (`handleUploadClip` dùng `uploadMedia`,
  `handleDeleteClip`) và `reading_passages` (`handleAddPassage`,
  `handleSavePassage`, `handleDeletePassage`) — dòng ~411-480 file cũ.
- Cấu trúc tab Ngữ pháp/Nghe/Đọc + nhúng `<AdminGrammarExerciseSection />`
  cho tab Ngữ pháp — dòng ~573-574.
- `AdminModuleGroup`/`useModuleOrder` cho accordion module → lesson.

## Thay mới: quản lý theo set thay vì câu hỏi phẳng

Trong mỗi lesson (tab Nghe hoặc Đọc):

1. **Danh sách set** — `useExerciseSets()` filter theo
   `lessonId`+`category` (tab đang chọn). Mỗi set: tiêu đề (input inline,
   `renameSet`), badge draft/published (`toggleSetStatus`), nút "+ Thêm bộ
   bài tập" ở đầu lesson (`createSet(lessonId, category, nextOrder)` —
   y hệt cách `AdminGrammarExerciseSection` đã làm, dòng ~1111 file đó).
2. **Trong 1 set, chưa có câu hỏi**: hiện selector "Chọn clip/đoạn văn cho
   bộ này" — dropdown các clip/đoạn văn hiện có của lesson + nút "Tải mp3
   mới"/"Thêm đoạn văn mới" ngay trong dropdown đó (dùng lại
   `handleUploadClip`/`handleAddPassage`).
3. **Trong 1 set, đã có câu hỏi**: hiện player mp3 (`useMediaPlaybackUrl`,
   theo `audio_clip_id` câu đầu) hoặc nội dung đoạn văn (textarea sửa được
   tại chỗ, dùng `handleSavePassage`) + bảng câu hỏi (mirror
   `QuestionTable` cũ) + nút "Thêm câu hỏi" (audio_clip_id/reading_passage_id
   tự điền theo set, không hỏi lại).

## Form thêm/sửa câu hỏi (3 loại)

Modal tương tự cũ (dòng ~704-900), rút gọn theo đúng 3 type mới:

- **`multiple_choice`**: danh sách options (A/B/C/D, thêm/bớt — tái dùng
  `addOption`/`removeOption`/`setOption` pattern), chọn đáp án đúng qua
  `<select>` hiện text option nhưng lưu **index** (khác bản cũ lưu value
  string — phải khớp cách `grammar-submit`/`isChoiceCorrect` đọc
  `correct_answer` là index dạng chuỗi số, xem `scoring.ts`).
- **`text_fill_blank`**: 1 textarea `prompt_text`, cú pháp
  `{{đáp_án|biến_thể}}` — copy nguyên hướng dẫn cú pháp đã có ở field
  `answer_text` cũ (dòng ~774-777), không có field "đáp án đúng" riêng
  (đáp án nằm trong `prompt_text`, giống cách cũ xử lý `isMultiBlank`).
- **`matching`**: danh sách cặp de/vi (tái dùng `addPair`/`removePair`/
  `setPair` pattern, dòng ~825-855), **không** có field "đáp án đúng" cho
  admin gõ tay — `correct_answer` tự sinh bằng `serializeMatching(pairs)`
  (từ `src/lib/quizAnswerCodec.ts`, đã có sẵn) ngay trước khi insert/update,
  giảm sai sót so với bản cũ (admin phải tự gõ JSON).

Field chung mọi loại: `explanation` (giải thích, hiện sau khi revealed),
`order_index`. Không còn field `question_text`/`answer_text`/`audio_text`
riêng của bảng cũ (đổi hẳn sang cấu trúc `grammar_exercises`:
`prompt_text`, `correct_answer`, `explanation`, `options`,
`matching_pairs`, `set_id`, `audio_clip_id`, `reading_passage_id`).

## Xoá khi thêm câu hỏi qua set

Không còn khái niệm "lesson-level flat list" của bản cũ (`LessonGroup.
questions` phẳng theo lesson+category) — thay bằng "set-level" list
(mỗi lesson có N set, mỗi set N câu hỏi). `QuestionTable` giữ layout
tương tự nhưng scope theo 1 set thay vì 1 clip/passage.

## Testing

- Không có logic thuần mới đáng kể ngoài việc gọi `serializeMatching` đã
  có test. Không thêm test mới ở sub-phase này.
- Checklist tay (sau khi implement): tạo set Nghe mới → tải mp3 → thêm câu
  multiple_choice + text_fill_blank → publish set → mở `QuizSetListPage`
  phía học viên xác nhận hiện đúng audio + câu hỏi + chấm điểm đúng. Lặp
  lại cho Đọc với đoạn văn + matching.
