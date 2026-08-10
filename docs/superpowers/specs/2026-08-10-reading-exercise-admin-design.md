# Phase 6a — Admin tạo/sửa bài đọc

## Bối cảnh

Roadmap: [2026-07-30-exercise-platform-roadmap.md § Phase 6](2026-07-30-exercise-platform-roadmap.md).

Admin → Bài tập → tab "Đọc" hiện dùng chung `AdminGrammarExerciseSection.tsx` với
Ngữ pháp/Nghe — mỗi câu đọc là 1 row `grammar_exercises` phẳng (1 câu = 1 đáp án),
gắn 1 đoạn văn qua `reading_passage_id`. Model này không biểu diễn được 2 dạng câu
hỏi đọc cần thêm:

- **`richtig_falsch`** — 1 danh sách nhận định, mỗi nhận định tự có đáp án
  Richtig/Falsch riêng.
- **`multiple_choice` kiểu đọc** — nhiều câu hỏi con dùng chung 1 văn bản (hoặc mỗi
  câu tự có văn bản/ảnh riêng), mỗi câu 3 lựa chọn A/B/C.

Cả hai đều là "1 khối = nhiều mục con", không khớp shape phẳng của
`grammar_exercises`. Quyết định trong buổi brainstorm: **bảng riêng cho bài đọc**,
không mở rộng `grammar_exercises`.

## Phạm vi

**Trong phạm vi (Phase 6a):** Admin tạo/sửa/xoá văn bản và nhóm câu hỏi đọc, sắp
xếp, lưu nháp/publish (tái dùng `exercise_sets`), Preview mô phỏng tương tác học
viên.

**Ngoài phạm vi — để Phase 6b:** trang học viên làm bài thật, chấm điểm
(`grammar-submit` hiện gắn chặt bảng `grammar_exercises`, cần tách nhánh chấm điểm
riêng cho bảng mới), rollup điểm/XP/`exercise_set_attempts`.

**Dữ liệu Đọc cũ bị xoá, không migrate** — theo giả định nền của roadmap (chưa có
người dùng thật). Bao gồm: mọi `grammar_exercises` có `category = 'doc'` (qua
`exercise_sets`), và toàn bộ row hiện có trong `reading_passages`.

## Kiến trúc dữ liệu

3 tầng, đúng theo yêu cầu "1 bài học có nhiều văn bản, 1 văn bản có nhiều nhóm câu
hỏi, 1 nhóm câu hỏi có nhiều câu con":

```
lesson
 └─ reading_passages       (nhiều văn bản độc lập/lesson — bảng đã có, tái dùng)
     └─ reading_question_groups   (nhiều nhóm câu hỏi/văn bản — bảng mới)
          └─ statements[] | sub_questions[]   (nhiều câu con — JSONB)
```

### `reading_passages` — tái dùng bảng hiện có, nâng cấp nội dung

Không đổi schema (`id`, `lesson_id`, `text_de`, `order_index`). Không thêm cột
"loại văn bản" — quyết định rõ trong brainstorm: văn bản không có thuộc tính phân
loại (bỏ hẳn ý tưởng `plain_text`/`message_text`/`short_notice`/`multi_text`
trong ticket gốc), chỉ là 1 ô markdown tự do, **y hệt editor "Ngữ pháp then chốt"**
ở `AdminLessonEditor.tsx` — paste ảnh được (`handleGrammarImageUpload` /
`insertGrammarImage` / `uploadMedia(file, lessonId, "image", ...)`), render qua
`MarkdownBlock` (đã hỗ trợ sẵn `r2img:` scheme cho ảnh paste).

Admin muốn văn bản dạng "nhiều đoạn để đối chiếu" thì tự viết nhiều đoạn trong
cùng 1 ô markdown, hoặc tạo nhiều `reading_passages` riêng — không cần hệ thống hỗ
trợ đặc biệt.

### `reading_question_groups` — bảng mới

```sql
CREATE TABLE reading_question_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passage_id     UUID NOT NULL REFERENCES reading_passages(id) ON DELETE CASCADE,
  set_id         UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL DEFAULT 0,
  title          TEXT,
  question_intro TEXT,
  question_type  TEXT NOT NULL CHECK (question_type IN ('richtig_falsch','multiple_choice')),
  statements     JSONB,   -- richtig_falsch: [{id, text, correct_answer: 'richtig'|'falsch'}]
  sub_questions  JSONB,   -- multiple_choice: [{id, text_snippet?, image_key?, question, options:[{id,text}], correct_option_id}]
  explanation    TEXT
);

ALTER TABLE reading_question_groups
  ADD CONSTRAINT reading_question_groups_body_shape CHECK (
    (question_type = 'richtig_falsch' AND statements IS NOT NULL AND sub_questions IS NULL)
    OR
    (question_type = 'multiple_choice' AND sub_questions IS NOT NULL AND statements IS NULL)
  );
```

1 văn bản có thể được nhiều `reading_question_groups` khác nhau tham chiếu (vd 1
văn bản vừa có khối Richtig/Falsch vừa có khối Trắc nghiệm) — quan hệ N:1 tới
`reading_passages`, không phải 1:1.

`set_id` giữ nguyên vai trò như `grammar_exercises.set_id` hiện tại: đơn vị
draft/publish/reorder, tái dùng `exercise_sets` (`category = 'doc'`) và hook
`useExerciseSets` không đổi.

**Không có `group_id`.** Ở `grammar_exercises`, `group_id` cần thiết vì 1 row = 1
câu hỏi, phải gộp nhiều row cùng dạng vào 1 accordion. Ở đây 1 row
`reading_question_groups` đã là nguyên 1 khối (nhiều câu con qua JSONB) — né được
cả lớp vấn đề "giới hạn N câu/nhóm" từng phát sinh với `grammar_exercises`
(xem [2026-08-10-classification-single-per-group-design.md](2026-08-10-classification-single-per-group-design.md)).

### RLS

- `reading_passages`: giữ policy hiện có (authenticated read, admin write) — không
  chứa đáp án, vô hại khi lộ ra sớm trước khi có trang học viên (Phase 6b).
- `reading_question_groups`: **admin-only** cả đọc lẫn ghi (`(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'`
  cho mọi thao tác, không có policy `authenticated read`). `statements`/
  `sub_questions` chứa `correct_answer`/`correct_option_id` — không được lộ qua
  PostgREST, đúng nguyên tắc "correctAnswer không bao giờ gửi về client" (CLAUDE.md).
  Không tạo view `..._public` ở phase này vì chưa có consumer học viên; Phase 6b
  sẽ quyết định đường trả dữ liệu (nhiều khả năng chỉ qua Edge Function, không qua
  view PostgREST — theo đúng cách `grammar-submit` đang làm với `explanation`).

## Kiến trúc Admin UI

Component mới `AdminReadingExerciseSection.tsx`, thay
`<AdminGrammarExerciseSection category="doc" />` trong tab "Đọc"
(`AdminQuizSection.tsx:23`). Xoá phần code riêng cho `category === "doc"` trong
`AdminGrammarExerciseSection.tsx` (đoạn `fetchMedia` nhánh `"doc"`,
`handleAddPassage`/`handleSavePassage`/`handleDeletePassage`, JSX dòng ~1385-1490)
— dọn theo đúng "không để code cũ không dùng nằm lại", vì `category: "doc"` không
còn đi qua component này nữa.

Lesson accordion (giữ pattern hiện có) → mỗi lesson có 2 khu vực:

1. **Văn bản** — danh sách `reading_passages` của lesson, thêm/sửa/xoá, mỗi văn
   bản 1 editor markdown + paste-ảnh (nâng cấp từ ô `<textarea>` text thuần hiện
   tại lên cùng cơ chế `AdminLessonEditor.tsx` đang dùng cho "Ngữ pháp then chốt").
2. **Nhóm bài** (`exercise_sets`, category=`doc`) — như Ngữ pháp/Nghe hiện tại:
   set → list `reading_question_groups` trong set, kéo-thả sắp xếp (dnd-kit, theo
   đúng pattern `SortableExerciseGroupRow` đang có), nút "+ Thêm nhóm câu hỏi" mở
   modal.

### Modal tạo/sửa nhóm câu hỏi

1. **Văn bản** — dropdown chọn 1 trong các `reading_passages` đã tạo cho lesson.
   Bắt buộc chọn (không tạo văn bản mới ngay trong modal — quản lý văn bản tách
   riêng ở khu vực 1).
2. **Tiêu đề** (`title`, optional).
3. **Câu hỏi chung** (`question_intro`, optional) — hướng dẫn/câu hỏi chung hiển
   thị phía trên list câu hỏi con.
4. **Dạng câu hỏi** — 2 nút chọn, đổi phần bên dưới:
   - `richtig_falsch`: list nhận định — mỗi dòng: ô text + toggle Richtig/Falsch +
     nút xoá; "+ Thêm nhận định"; kéo-thả sắp xếp.
   - `multiple_choice`: list câu hỏi con — mỗi khối: văn bản ngắn optional (markdown
     + paste-ảnh, cùng cơ chế văn bản chính), câu hỏi (text), options A/B/C — **tái
     dùng nguyên `moveOption`/`setOption`/`removeOption`/`addOption`** đã có ở
     `grammarMultipleChoice.ts`; "+ Thêm câu hỏi"; kéo-thả sắp xếp.
5. **Giải thích** (`explanation`, optional) — giống pattern các dạng câu khác.
6. Lưu / Preview / Hủy. Draft/publish vẫn ở cấp **set**, không thêm trạng thái
   publish riêng từng nhóm câu hỏi — tái dùng `toggleSetStatus` hiện có nguyên
   vẹn.

## Validation

Chặn lưu khi:

- Chưa chọn văn bản.
- `richtig_falsch`: chưa có nhận định nào, hoặc có nhận định thiếu text, hoặc có
  nhận định chưa chọn Richtig/Falsch (không mặc định ngầm).
- `multiple_choice`: chưa có câu hỏi con nào, hoặc có câu thiếu nội dung câu hỏi,
  hoặc có câu <2 option không rỗng, hoặc có câu chưa chọn đáp án đúng.

## Preview

Modal read-only (tái dùng `previewTarget` pattern đang có ở
`AdminGrammarExerciseSection.tsx`), render văn bản qua `MarkdownBlock`, mô phỏng
tương tác học viên bằng local state không lưu (click chọn Richtig/Falsch cho từng
nhận định, chọn option cho từng câu hỏi con) — khớp AC "Preview hiển thị đúng văn
bản và cách tương tác của học viên".

## Testing

- Unit test (`node:test`, theo style `grammarExerciseForm.test.ts`) cho:
  validation function, payload builder (form state → JSONB `statements`/
  `sub_questions`), và các hàm thêm/xoá/sắp xếp câu con (nếu tách thành hàm thuần
  như `addPairToForm`/`removePairFromForm` hiện có cho `matching`).
- `npm run lint` sau khi code xong.
- Test thủ công trên browser (sandbox không có `.env.local`, cần user tự làm):
  tạo văn bản mới, tạo nhóm câu hỏi mỗi dạng, xoá/sắp xếp câu con, Preview, lưu
  nháp/publish, mở lại 1 nhóm câu hỏi đã tạo để xác nhận không mất thứ tự/đáp án,
  xoá 1 văn bản đang được nhóm câu hỏi tham chiếu (kỳ vọng: `ON DELETE CASCADE`
  xoá luôn nhóm câu hỏi liên quan — cần cảnh báo rõ trong UI trước khi xoá).

## Không đổi

- Không đổi `grammar_exercises`, `AdminGrammarExerciseSection.tsx` cho Ngữ
  pháp/Nghe.
- Không đổi `exercise_sets`, `useExerciseSets`, hook/luồng draft-publish-reorder
  hiện có.
- Không đụng `grammar-submit`, `exercise_set_attempts`, XP/rollup — thuộc Phase
  6b.
- Không tạo trang học viên làm bài đọc mới — thuộc Phase 6b.

## Rủi ro

- Xoá `reading_question_groups`/`reading_passages` cũ là thao tác một chiều, chỉ
  chấp nhận được vì giả định nền "chưa có người dùng thật" của roadmap — **hết
  hiệu lực ngay khi có user thật**, migration sau này không được lặp lại kiểu xoá
  thẳng này.
- `ON DELETE CASCADE` từ `reading_passages` → `reading_question_groups`: xoá 1 văn
  bản xoá luôn mọi nhóm câu hỏi đang tham chiếu, có thể mất nhiều câu hỏi hơn admin
  tưởng nếu không có cảnh báo rõ trong UI xoá.
