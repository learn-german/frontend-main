# Phase 4 (UI) — Trang Nghe/Đọc dùng chung accordion + grammar_exercises — Spec

## Bối cảnh

Data model + submit logic đã gộp xong (`grammar_exercises`/`grammar-submit`
xử lý được cả `text_fill_blank`/`matching` cho Nghe/Đọc). Spec này làm nốt
phần UI — cả học viên lẫn admin — thay thế `QuizPage.tsx`/
`AdminQuizSection.tsx` cũ (đang gọi bảng/view đã xoá, lỗi runtime).

UI **tách riêng** khỏi Ngữ pháp (không dùng chung component
`GrammarExercisePage`/`GrammarSetListPage`/`AdminGrammarExerciseSection`)
vì loại câu hỏi khác hẳn (audio player, đoạn văn đọc, ghép cặp click),
nhưng **kiến trúc UI giống hệt** (accordion set, 1 nút Nộp bài chung — đã
chốt qua trao đổi trước) và **Nghe + Đọc dùng chung 1 component**, tham số
hóa qua `category: "nghe" | "doc"` (chỉ khác loại media gắn kèm).

Quy ước: **1 `exercise_set` ứng với đúng 1 audio clip (Nghe) hoặc 1 đoạn
văn (Đọc)** — đúng cách admin cũ đã nhóm câu hỏi theo clip/passage (xem
`AdminQuizSection.tsx` cũ, dòng ~646/674). Component lấy media để hiển thị
từ `audio_clip_id`/`reading_passage_id` của **câu hỏi đầu tiên** trong set
— không ràng buộc bằng DB constraint (mọi câu trong set nên cùng 1 clip/
passage, admin UI tự đảm bảo khi tạo).

## Trang học viên — `QuizSetListPage`

File mới `src/pages/QuizSetListPage.tsx`, thay thế hoàn toàn
`src/pages/QuizPage.tsx` (xoá file cũ). Cấu trúc **y hệt**
`GrammarSetListPage`/`GrammarExerciseSetBody` (2 file đó **không đổi gì**,
chỉ tham khảo làm mẫu):

```tsx
interface QuizSetListPageProps {
  lessonId: string;
  category: "nghe" | "doc";
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}
```

- Accordion set, đánh số "Bài N" liên tục, badge Đã đạt/Chưa làm — copy
  đúng logic `GrammarSetListPage` (`useExerciseSets`, `useExerciseSetAttempts`,
  filter theo `category` param thay vì hard-code `"nguphap"`).
- Khi mở 1 set → render `QuizExerciseSetBody` (tương đương
  `GrammarExerciseSetBody`) — dùng `useGrammarExercises(set.id)` (hook cũ,
  **không đổi**, đã đọc từ `grammar_exercises_public`, có sẵn
  `audio_clip_id`/`reading_passage_id`/`matching_pairs`/`prompt_text`/
  `type`/`options`).
- **Media header** (đầu set, trước danh sách câu hỏi):
  - `category === "nghe"`: audio player, lấy `r2_key` bằng cách tìm trong
    `lesson.listeningClips` (mảng đã có sẵn trên object `Lesson`, đúng
    cách `QuizPage.tsx` cũ dùng — không tạo hook mới) theo
    `exercises[0]?.audioClipId`, phát qua `useMediaPlaybackUrl` (hook có
    sẵn, không đổi).
  - `category === "doc"`: hiện `text_de` của đoạn văn, tìm trong
    `lesson.readingPassages` theo `exercises[0]?.readingPassageId`.
  - Không tìm thấy clip/passage (dữ liệu thiếu) → ẩn media header, không
    chặn làm bài (suy giảm nhẹ nhàng, giống hành vi cũ).
- **Danh sách câu hỏi** (grid, hiện hết — không wizard từng câu):
  - `multiple_choice`: tái dùng nguyên `MultipleChoiceOptions` (component
    có sẵn, không đổi).
  - `text_fill_blank`: `prompt_text` từ view đã có literal `"{{blank}}"`
    thay cho biến thể thật — split theo chuỗi này thành các đoạn, chèn
    `<input>` xen giữa (giống cách `fill_in_the_blank` của Grammar split
    theo `"___"`, nhưng token khác). Đáp án ghép lại bằng `"|"` theo đúng
    thứ tự — khớp format `grammar-submit`'s `text_fill_blank` đang chấm.
  - `matching`: port nguyên UI click-để-ghép từ `QuizPage.tsx` cũ (danh
    sách `matchingPairs` xáo trộn 2 cột, click 1 bên Đức + 1 bên Việt →
    verify → tô màu đã ghép) — copy state (`matchedPairs`, `shuffledDe/Vi`,
    `selectedDe/Vi`) và handler (`handleDeClick`/`handleViClick`/
    `verifyPair`) gần như nguyên văn, chỉ đổi nguồn dữ liệu từ
    `activeQuestion.matchingPairs` (1 câu) sang lặp qua từng exercise loại
    `matching` trong set.
- **Nộp bài**: gọi `grammar-submit` với `set_id` — **y hệt** cơ chế Grammar,
  không cần đổi gì ở Edge Function (đã tổng quát hóa category ở sub-phase
  trước).
- **Draft**: `useExerciseSetDraft` tái dùng nguyên — không đổi.

## `App.tsx`

Đổi nhánh `else` (dòng ~403-410) từ `<QuizPage .../>` sang
`<QuizSetListPage lessonId={activeLessonObject.id} category={activeExerciseCategory} onBackToLesson={...} onSetFinished={handleQuizFinished} />`
— cùng pattern đã áp dụng cho nhánh `nguphap`.

## Admin UI — viết lại `AdminQuizSection.tsx`

Giữ tên file, viết lại theo pattern `AdminGrammarExerciseSection.tsx`
(tham khảo, không import chéo):

- Giữ nguyên CRUD `listening_clips`/`reading_passages` đã có trong file cũ
  (tạo/sửa/xoá clip, sửa/xoá đoạn văn — logic thuần, không phụ thuộc
  `quiz_questions`).
- Thêm quản lý **set** (dùng `useExerciseSets`, filter theo tab
  nghe/đọc đang chọn) — tạo/đổi tên/publish-draft, **y hệt**
  `AdminGrammarExerciseSection`.
- Form thêm câu hỏi vào 1 set — 3 loại: `multiple_choice` (options +
  correct_answer index — tái dùng UI đã có ở `AdminGrammarExerciseSection`
  cho type này), `text_fill_blank` (textarea nhập `prompt_text` với cú
  pháp `{{đáp_án|biến_thể}}`, có hướng dẫn cú pháp ngay trong form),
  `matching` (list cặp de/vi + ô `correct_answer` tự sinh từ các cặp thay
  vì admin gõ tay — cải tiến nhỏ so với bản cũ, giảm sai sót).
- Khi tạo set mới cho Nghe: bắt chọn 1 `listening_clip` đã có (hoặc tạo
  mới ngay trong form) — set lưu implicit qua việc mọi câu hỏi thêm vào
  set đó đều gán cùng `audio_clip_id`. Tương tự Đọc với `reading_passage_id`.

## Không đổi

`grammar_exercises`/`grammar_exercises_public`/`grammar-submit`/
`GrammarSetListPage`/`GrammarExerciseSetBody`/`useGrammarExercises`/
`useExerciseSets`/`useExerciseSetAttempt(s)`/`useExerciseSetDraft`/
`MultipleChoiceOptions`/`useMediaPlaybackUrl` — tất cả tái dùng nguyên,
không sửa.

## Xoá

`src/pages/QuizPage.tsx`. `src/lib/hooks/useQuizQuestions.ts` (đọc từ view
đã xoá `quiz_questions_public`, không còn nơi nào dùng sau khi
`QuizSetListPage` thay thế `QuizPage`).

## Testing

- Logic thuần mới (nếu tách ra được, ví dụ hàm ghép state matching, hàm
  split `text_fill_blank` theo `"{{blank}}"`) nên viết thành hàm độc lập
  trong `src/lib/` kèm `node:test`, theo đúng convention repo — quyết định
  cụ thể tách hàm nào ở bước viết plan, không cố tách nếu logic quá gắn
  với JSX/state.
- Checklist tay: mở set Nghe → nghe được audio, trả lời multiple_choice +
  text_fill_blank + matching trong cùng 1 set, nộp bài, kết quả đúng; y
  hệt cho Đọc với đoạn văn thay audio.
- `npm run lint` + toàn bộ `node:test` suite + `npm run build` sau khi
  xong — không phá test hiện có.
