# Phase 6a follow-up — Nhiều văn bản trong 1 bài đọc

## Bối cảnh

Tiếp nối [2026-08-10-reading-exercise-admin-design.md](2026-08-10-reading-exercise-admin-design.md)
(Phase 6a). Yêu cầu 2026-08-11: 1 bài học có thể cần **nhiều hơn 1 văn bản đọc**,
mỗi văn bản có bộ "loại câu hỏi" (Trắc nghiệm / Đúng-Sai) và câu hỏi riêng — đúng
kiến trúc 3 tầng đã chốt ở spec gốc (`lesson → reading_passages → reading_question_groups`).

Buổi làm việc trước (chưa commit, commit gần nhất `05ea4f1`) đã đi lệch khỏi kiến
trúc này: thêm cột `exercise_sets.passage_id` (migration
`20260811000000_exercise_sets_passage_id.sql`, **đã apply lên Supabase**, chưa
commit vào git) — ép quan hệ 1 set ↔ 1 passage. Việc này chặn đúng yêu cầu "nhiều
văn bản/bài học". Spec này **revert phần đó** và bổ sung UI "Thêm văn bản".

Điểm may mắn: tầng `reading_question_groups` (mỗi group tự có `passage_id` riêng)
và toàn bộ phía học viên (`useReadingQuestionGroups`, `ReadingSetListPage`,
`useNonEmptyReadingSetIds`) **không hề giả định 1 passage/set** — đã viết đúng từ
đầu theo spec gốc. Phạm vi thay đổi thực tế chỉ nằm ở tầng `reading_passages` ↔
`exercise_sets` và ở `AdminReadingExerciseSection.tsx`.

## Phạm vi

**Trong phạm vi:**
- Revert `exercise_sets.passage_id` (1:1), thêm `reading_passages.set_id` (N:1) —
  1 set (`exercise_sets`, category=`doc`) chứa nhiều văn bản.
- `AdminReadingExerciseSection.tsx`: render nhiều `PassageEditRow` trong 1 thẻ, nút
  "Thêm văn bản", khối "loại câu hỏi" lồng theo từng văn bản, xoá 1 văn bản riêng lẻ
  (khác xoá cả set).
- `useExerciseSets.createReadingSet`: tạo set kèm 1 văn bản đầu (giữ UX hiện tại,
  không để set rỗng ngay sau khi tạo).

**Ngoài phạm vi:**
- Phía học viên (`ReadingSetListPage` và các hook liên quan) — không đổi, đã tương
  thích sẵn.
- `reading_question_groups` — không đổi schema.
- Mọi phần Phase 6b (chấm điểm, `grammar-submit`).

## Kiến trúc dữ liệu

```
exercise_sets (category=doc, 1 "bài đọc" = 1 thẻ admin)
 └─ reading_passages   (N văn bản/set — ĐỔI: set_id thay vì lesson-only)
     └─ reading_question_groups   (N nhóm câu hỏi/văn bản — không đổi)
          └─ statements[] | sub_questions[]   (không đổi)
```

### Migration mới — revert + bổ sung

Thứ tự an toàn (thêm cột mới → backfill → xoá cột cũ, không xoá trước backfill),
vì set nào đang có `passage_id` trên Supabase (dữ liệu WIP của session trước)
phải giữ đúng liên kết văn bản, không được mất:

```sql
ALTER TABLE reading_passages
  ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;

UPDATE reading_passages rp
SET set_id = es.id
FROM exercise_sets es
WHERE es.passage_id = rp.id;

ALTER TABLE exercise_sets
  DROP COLUMN passage_id;
```

`reading_passages.lesson_id` giữ nguyên (không xoá) — vẫn dùng để truyền
`lessonId` cho `uploadMedia`/`useMediaPlaybackUrl` khi paste ảnh, tránh phải suy
ra lesson qua `set_id → exercise_sets.lesson_id` ở mọi nơi đang đọc trực tiếp
`passage.lesson_id`.

`set_id` nullable — văn bản "Đọc" kiểu cũ (category `doc` khác, nếu còn sót) không
bị ép phải có set; nhưng luồng tạo mới (`createReadingSet` và "Thêm văn bản")
luôn set giá trị này.

`reading_question_groups` — **không đổi**. Vẫn giữ cả `passage_id` lẫn `set_id`
(dù nay có thể suy `set_id` qua `passage.set_id`) vì phía học viên
(`useReadingQuestionGroups`, `useNonEmptyReadingSetIds`) đang query trực tiếp theo
`set_id` — đổi sẽ động vào code đã chạy đúng, không nằm trong phạm vi.

Sau migration, chạy `npm run gen:types` để cập nhật `database.types.ts` (không
sửa tay, theo CLAUDE.md).

## Kiến trúc Admin UI (`AdminReadingExerciseSection.tsx`)

Trong 1 thẻ "bài đọc" (`set`):

```
┌ Thẻ bài đọc (exercise_sets, category=doc) ──────────────┐
│ tiêu đề set · badge draft/published · N bài văn/M loại/K câu │
│                                                            │
│ ┌ Văn bản 1 (PassageEditRow) ─────────────┐  [+ Thêm văn bản] │
│ │  CÁC LOẠI CÂU HỎI (lọc theo passage_id) │              │
│ │   - Trắc nghiệm ...                     │              │
│ │   - Đúng/Sai ...                        │              │
│ └──────────────────────────────────────────┘              │
│ ┌ Văn bản 2 (PassageEditRow) ─────────────┐              │
│ │  CÁC LOẠI CÂU HỎI (lọc theo passage_id) │              │
│ └──────────────────────────────────────────┘              │
└────────────────────────────────────────────────────────────┘
```

- **Fetch**: `passages` không lọc theo `lesson_id` cho hiển thị nữa mà lọc theo
  `set.id` qua `passage.set_id` (`passages.filter(p => p.set_id === set.id)`,
  sort theo `order_index`).
- **"Thêm văn bản"** — nút đặt cạnh header "Văn bản" (ngang hàng style với "Thêm
  loại câu hỏi" hiện có), insert `reading_passages` mới với
  `set_id = set.id, lesson_id = lesson.lesson_id, text_de: "", order_index: passages trong set hiện có`.
- **Khối "CÁC LOẠI CÂU HỎI"** — lặp lại y hệt code hiện có (`missingTypes`,
  "Thêm loại câu hỏi", `openAddType`/`openAddItem`/`openEditItem`) nhưng **thu hẹp
  filter từ `set_id` xuống `passage_id`**: `groups.filter(g => g.passage_id === passage.id)`.
  `openAddType`/`openAddItem` truyền thêm `passage.id` thay vì lấy từ `set.passageId`.
- **Xoá văn bản** (nút thùng rác trên `PassageEditRow`, đang có sẵn) — đổi hành vi:
  chỉ xoá đúng passage đó (`DELETE FROM reading_passages WHERE id = ...`, cascade
  xoá `reading_question_groups` của riêng passage này qua FK có sẵn) — **không**
  còn gọi `setDeleteSetTarget` (đó là xoá nguyên thẻ).
- **Xoá cả thẻ "bài đọc"** — giữ nút riêng ở header set (icon thùng rác cạnh
  `LessonStatusBadge`, hiện đang nằm lẫn trong khối văn bản cũ) — xoá
  `exercise_sets`, cascade xoá mọi `reading_passages` của set qua
  `ON DELETE CASCADE` mới.
- **Header stat** — `{passages.length} bài văn · {setGroups.length} loại câu hỏi · {totalItems} câu hỏi`,
  `setGroups`/`totalItems` vẫn tính trên toàn bộ `groups` của set (gộp mọi
  passage), không đổi công thức `itemCount`.
- **Empty state** — 0 văn bản trong set (vừa xoá hết): hiển thị "Chưa có văn bản
  nào." (đồng bộ các empty-state khác trong file), nút "Thêm văn bản" vẫn hiện để
  thêm lại.
- **Preview** — không đổi cách chọn (`setGroups[0]`), chỉ cần đổi nguồn `passageText`
  đã đúng sẵn (`passages.find(p => p.id === previewTarget.passage_id)`).

`AdminExerciseSetMedia.tsx` — `ReadingPassage` interface thêm field `set_id: string | null`.

### `useExerciseSets.createReadingSet`

Đổi bước tạo passage: thay vì gắn `passage_id` lên `exercise_sets`, insert
`reading_passages` với `set_id` = id của set vừa tạo (tạo set trước, passage sau —
đảo thứ tự so với code hiện tại, vì giờ passage phụ thuộc set chứ không phải
ngược lại). Lỗi ở bước tạo passage → rollback set vừa tạo (xoá set), giữ nguyên
tinh thần "rollback khi 1 trong 2 bước insert lỗi" đang có.

## Không đổi

- `reading_question_groups` schema, RLS, `reading_question_groups_public` view.
- Toàn bộ `readingExerciseForm.ts` (đã nhận `passageId` trực tiếp từ trước, không
  cần sửa).
- Phía học viên: `ReadingSetListPage.tsx`, `useReadingQuestionGroups.ts`,
  `useNonEmptyReadingSetIds.ts` — cả 3 đều query theo `set_id` ở tầng
  `reading_question_groups`, không đụng tầng `reading_passages`.
- `toggleSetStatus`, draft/publish, sắp xếp set — nguyên trạng.

## Testing

- `npm run lint` sau khi code xong.
- Test thủ công trên browser: tạo bài đọc mới (kỳ vọng tự có 1 văn bản), bấm
  "Thêm văn bản" thêm văn bản thứ 2, thêm câu hỏi riêng cho từng văn bản, xoá 1
  văn bản (kỳ vọng: chỉ mất câu hỏi của văn bản đó, thẻ + văn bản còn lại vẫn
  nguyên), xoá văn bản cuối cùng (kỳ vọng: thẻ về trạng thái "chưa có văn bản",
  không tự xoá thẻ), xoá cả thẻ (kỳ vọng: mọi văn bản + câu hỏi trong thẻ mất
  theo), Preview đúng văn bản đang xem, publish/draft không đổi hành vi.
- Kiểm tra migration idempotent trên dữ liệu hiện có: set nào đang có
  `passage_id` (dữ liệu WIP hiện tại trên Supabase) phải giữ đúng liên kết
  passage sau backfill, không mất văn bản đã nhập.

## Rủi ro

- Migration chạy trên **remote Supabase đã có dữ liệu thật của session trước**
  (`exercise_sets.passage_id` đã apply, có thể đã có văn bản test) — bắt buộc
  backfill trước khi drop cột, không được xoá thẳng như spec gốc đã làm (lúc đó
  chấp nhận được vì "chưa có ai dùng thật"; giờ đã có dữ liệu WIP cần giữ).
  Kiểm tra thực tế qua `list_tables`/`execute_sql` trước khi migrate.
- `ON DELETE CASCADE` từ `reading_passages` → `reading_question_groups` (đã có
  từ spec gốc) nay áp dụng cho xoá-từng-văn-bản thường xuyên hơn (trước chỉ xoá
  khi xoá cả set) — cần confirm dialog rõ ràng "Xoá văn bản này sẽ xoá luôn mọi
  câu hỏi thuộc văn bản, không khôi phục được" trước khi xoá, không chỉ áp dụng
  cho xoá cả thẻ như hiện tại.
