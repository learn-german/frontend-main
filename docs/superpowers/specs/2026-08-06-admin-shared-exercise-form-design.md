# Phase 3a — Admin dùng chung form tạo/sửa câu hỏi cho nghe/đọc

## Bối cảnh

Roadmap "Áp dụng toàn bộ kiểu câu hỏi từ ngữ pháp sang nghe/đọc" chia 3 phase:
- Phase 1 (xong) — `ExerciseAnswerInput` dùng chung cho phần nhập bài làm, phủ đủ 10 loại.
- Phase 2 (xong) — `ExerciseResultReview` dùng chung cho phần hiển thị kết quả, phủ đủ 10 loại.
- Phase 3 — form Admin tạo/sửa câu hỏi cho nghe/đọc.

Phase 3 khi đào sâu hoá ra lớn hơn ban đầu tưởng, nên chia tiếp thành 2 sub-phase độc lập:
- **Phase 3a (spec này)** — Admin có thể tạo/sửa đủ 10 loại câu hỏi cho nghe/đọc, kèm group/hint/word-bank giống hệt ngữ pháp.
- **Phase 3b (spec riêng, làm sau)** — học viên nhìn thấy group/hint/word-bank khi làm bài nghe/đọc (sửa `QuizSetListPage.tsx`, `ExerciseAnswerInput.tsx`, `ExerciseResultReview.tsx`). Phase 3b cần dữ liệu thật từ Phase 3a để test nên phải làm sau.

## Hiện trạng (đã xác nhận bằng cách đọc code)

`AdminGrammarExerciseSection.tsx` (1728 dòng, tab "Ngữ pháp") đã có sẵn:
- `ExerciseEntryFields` — component độc lập, props chỉ `{entry, onChange}`, render field cho 8 loại (thiếu `text_fill_blank`, `matching`).
- `validateForm`/`buildPayload` — hàm thuần, validate + build payload theo từng loại.
- Toàn bộ hệ thống group (nhiều câu cùng loại chung 1 `group_id`), hint (`GRAMMAR_EXERCISE_HINT_MAX_LENGTH`...), word bank (`normalizeWordBank`...), kéo-thả sắp xếp (`@dnd-kit`), bulk delete, preview.
- **Bug đã xác nhận**: `fetchExercises()` (dòng 920-948) query `grammar_exercises.select("*")` không lọc theo category — nếu lesson có câu hỏi nghe/đọc, chúng sẽ hiện lẫn vào danh sách tab Ngữ pháp vì bảng `grammar_exercises` đã gộp chung cho cả 3 category.
- `createSet(editLessonId, "nguphap", createStartOrder)` (dòng 1091) — category hardcode `"nguphap"`.

`AdminQuizSection.tsx` (928 dòng, tab "Nghe"/"Đọc") hiện có:
- Form riêng, chỉ 3 loại (`multiple_choice`, `text_fill_blank`, `matching`), không group/hint/word-bank.
- Query đúng: lọc theo `set_id in quizSetIds` (sets có category nghe/doc) — không có bug như trên.
- UI quản lý media: upload/xoá file mp3 (`listening_clips`), thêm/sửa/xoá đoạn văn (`reading_passages`), lồng dưới mỗi lesson.
- Mỗi **set** (không phải từng câu hỏi) gắn với đúng 1 file mp3 hoặc 1 đoạn văn — suy ra qua `getSetMediaId()` (lấy `audio_clip_id`/`reading_passage_id` của câu hỏi đầu tiên trong set). Khi tạo set mới, modal bắt chọn file/đoạn văn trước (dòng 707-734); các câu hỏi thêm sau vào set đó tự kế thừa media đã chọn.
- Tab "Ngữ pháp" bên trong `AdminQuizSection.tsx` hiện chỉ mount `<AdminGrammarExerciseSection />` — đã tận dụng chung ở mức "cả trang", chỉ nghe/đọc là chưa.

## Kiến trúc

**Nguyên tắc chính: nghe/đọc dùng thẳng `AdminGrammarExerciseSection`, không viết UI riêng.** Giống hệt cách tab "Ngữ pháp" đã mount nó, tab "Nghe"/"Đọc" sẽ mount `<AdminGrammarExerciseSection category="nghe" />` / `category="doc"`. `AdminQuizSection.tsx` sau refactor chỉ còn: fetch danh sách module/lesson cho tab switcher, tab switcher UI, và mount component chung — không còn tự render bảng câu hỏi hay modal riêng.

### 1. Mở rộng type/field-rendering — 8 loại → 10 loại

- `GrammarExercise.type`/`EditForm.type` trong `AdminGrammarExerciseSection.tsx` thêm `"text_fill_blank" | "matching"`.
- `ExerciseEntryFields` thêm 2 nhánh JSX mới, port logic từ form cũ của `AdminQuizSection.tsx` (input `prompt_text` với marker `{{đáp_án}}` cho `text_fill_blank`; danh sách cặp de/vi cho `matching`).
- `validateForm` thêm 2 nhánh (dùng lại logic validate hiện có trong `AdminQuizSection.handleSave`: `text_fill_blank` cần `prompt_text` có ít nhất 1 `{{...}}`; `matching` cần ít nhất 1 cặp de+vi không rỗng).
- `buildPayload` thêm 2 nhánh (dùng lại `serializeMatching` từ `quizAnswerCodec.ts` cho `matching`; `text_fill_blank` lưu `prompt_text` thẳng, `correct_answer: null` — đáp án nằm trong marker, không lưu riêng).
- `TYPE_LABELS`/`TYPE_COLORS` thêm 2 entry.
- Dropdown chọn loại câu hỏi hiện đủ 10 loại cho cả 3 category (không lọc theo category) — đơn giản hoá, tránh thêm 1 lớp điều kiện; ngữ pháp trong thực tế sẽ không có ai chọn `text_fill_blank`/`matching` nhưng không cấm ở tầng UI.

### 2. `AdminGrammarExerciseSection` nhận prop `category`

```ts
export const AdminGrammarExerciseSection: React.FC<{
  category: "nguphap" | "nghe" | "doc";
}> = ({ category }) => { ... }
```

- `fetchExercises()`: query lại theo 2 bước — lấy `exercise_sets` lọc `category` trước, rồi `grammar_exercises` lọc `set_id in (...)` — **đây là chỗ sửa luôn bug lọc category đã tìm thấy** (cách làm giống hệt `AdminQuizSection.tsx` đang làm đúng, chỉ chuyển vào chung).
- `createSet(editLessonId, category, createStartOrder)` — dùng prop `category` thay vì hardcode `"nguphap"`.
- 3 nơi gọi: `AdminQuizSection.tsx` mount `<AdminGrammarExerciseSection category="nguphap" />` / `"nghe"` / `"doc"` theo tab đang chọn.

### 3. Quản lý media (clip/passage) chuyển vào `AdminGrammarExerciseSection`

Chuyển nguyên khối UI + logic từ `AdminQuizSection.tsx` vào `AdminGrammarExerciseSection.tsx`, chỉ hiện khi `category !== "nguphap"`:
- Upload/xoá file mp3 (`ClipRow`, `handleUploadClip`, `handleDeleteClip`, dùng `uploadMedia`/`useMediaPlaybackUrl`).
- Thêm/sửa/xoá đoạn văn (`PassageEditRow`, `handleAddPassage`, `handleSavePassage`, `handleDeletePassage`).
- Nhãn "Gắn với: File mp3 #N" / "Gắn với: {đoạn văn...}" trên mỗi set (dùng `getSetMediaId`, chuyển nguyên logic).
- Khối này render ngay trong phần lesson-expanded, phía trên danh sách set — vị trí tương đương chỗ `AdminQuizSection.tsx` đang render hôm nay (dòng 585-631).

### 4. Media picker khi tạo set mới

Khi `category !== "nguphap"` và đang tạo group/set mới (`modalMode === "create-group"` với set chưa tồn tại), modal cần thêm bước chọn file mp3/đoạn văn trước khi cho nhập câu hỏi — copy nguyên UX hiện có ở `AdminQuizSection.tsx` dòng 707-734 (select box, validate bắt buộc chọn trước khi lưu). Chọn xong, `audio_clip_id`/`reading_passage_id` được merge vào payload tại điểm gọi `buildPayload(...)` trong `handleSave` (không sửa signature `buildPayload` — merge ở call site, giữ `buildPayload` thuần theo từng loại câu hỏi như hiện tại).

### 5. Tổ chức file

`AdminGrammarExerciseSection.tsx` sẽ phình thêm ~150-200 dòng logic media. Để giữ file không phình quá mức, phần UI clip/passage (upload mp3, sửa đoạn văn — vốn đã là 2 component độc lập `ClipRow`/`PassageEditRow` không phụ thuộc gì phần còn lại) tách thành file riêng `src/pages/admin/AdminExerciseSetMedia.tsx`, import vào dùng.

## Không đổi

- Ngữ pháp (`category="nguphap"`): không đổi hành vi — vẫn không hiện UI media, `createSet` vẫn tạo category `"nguphap"`, `ExerciseEntryFields` thêm 2 loại mới nhưng ngữ pháp không dùng tới nên không ảnh hưởng.
- Không đổi schema DB — `audio_clip_id`/`reading_passage_id` đã có sẵn trên `grammar_exercises`, `category` đã có sẵn trên `exercise_sets`.
- Không đổi Phase 1/2 (`ExerciseAnswerInput.tsx`, `ExerciseResultReview.tsx`, `QuizSetListPage.tsx`, `GrammarExercisePage.tsx`) — đó là phạm vi Phase 3b.
- Không đổi cách chấm điểm (`grammar-submit` edge function).

## Testing

- `validateForm`/`buildPayload` cho 2 loại mới: unit test bằng `node:test` (`npx tsx --test`), theo đúng pattern các file `*.test.ts` đã có trong repo.
- `npm run lint` sau mỗi task đụng TypeScript.
- Xác minh thủ công trên trình duyệt (giống Phase 1/2, sandbox hiện không có `.env.local` nên chỉ ghi checklist, không tự chạy được): tạo 1 câu mỗi loại trong 7 loại mới cho 1 set nghe và 1 set đọc, group nhiều câu chung hint/word-bank, xác nhận lưu đúng bảng `grammar_exercises` và tab Ngữ pháp không còn hiện lẫn câu nghe/đọc.

## Rủi ro

- `AdminQuizSection.tsx` mất gần hết UI riêng (~700 dòng bị xoá) — diff lớn nhưng cơ học (di chuyển code, không viết mới nhiều). Cần `detect_changes` kỹ trước khi commit để đảm bảo không có logic nào bị bỏ sót khi di chuyển.
- Set nghe/đọc cũ (nếu đã có dữ liệu thật) không có `group_id` — `groupGrammarExercises` coi mỗi câu không có `group_id` là 1 group riêng (đã có sẵn logic này, xem `getGroupKey` trong `grammarExerciseGroups.ts`), nên không cần migrate dữ liệu cũ.
