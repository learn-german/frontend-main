# Phase 1 — Thực thể "bộ bài tập" (exercise_sets)

Ngày: 2026-07-30

Phase 1 trong [roadmap nền tảng bài tập](./2026-07-30-exercise-platform-roadmap.md).
Ba quyết định kiến trúc (Q1–Q3) đã chốt sẵn trong roadmap; tài liệu này cụ thể
hoá thành schema, backfill, admin UI và các điểm chạm còn lại — dựa trên đối
chiếu trực tiếp với dữ liệu thật trên production (project `Deutsch`,
`awdhqlgxnjwymwgxltlw`) và code admin hiện tại.

## Quyết định mới chốt trong phiên brainstorm này

Hai điểm này rộng hơn phạm vi roadmap gốc đã phác thảo, chốt qua brainstorm:

**Không xây UI ghép nhiều group vào 1 set trong Phase 1.** Sau backfill, mỗi
set ứng đúng 1 group (tự động). Ghép nhiều group khác dạng vào cùng 1 set
(để tạo bài tập trộn nhiều loại câu) là tính năng riêng, làm khi Phase 2 cần
thật. Phase 1 chỉ cần cột `set_id` tồn tại và đúng.

**Published/draft chuyển hẳn lên cấp set, xoá cột `status` khỏi
`grammar_exercises`.** Không còn bật/tắt từng câu — một nguồn sự thật duy
nhất. Đã kiểm tra dữ liệu thật: không có group nào đang trộn trạng thái (một
câu published, câu khác draft), nên việc chuyển đổi không làm thay đổi bất kỳ
nội dung nào học viên đang thấy.

## Dữ liệu thật tại thời điểm viết spec

```
total_exercises            = 26
orphan_exercises (group_id IS NULL) = 0
distinct_groups            = 5   → sẽ tạo đúng 5 exercise_sets
distinct_lessons involved  = 2
published_count            = 26  (100%)
draft_count                = 0
```

Đã xác nhận thêm: không group nào trải qua 2 lesson hoặc 2 loại câu khác
nhau (`group_id` luôn 1:1:1 với `lesson_id` và `type`). Backfill vì vậy là
ánh xạ đơn giản, không có ca đặc biệt cần xử lý tay.

## Data model

```sql
CREATE TABLE exercise_sets (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL DEFAULT 'nguphap' CHECK (category IN ('nguphap', 'nghe', 'doc')),
  title        TEXT    NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
);

ALTER TABLE grammar_exercises
  ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;
```

`category` gồm cả `nghe`/`doc` ngay từ Phase 1 dù chỉ `nguphap` được tạo ra —
đúng nguyên tắc category-agnostic trong roadmap, tránh phải `ALTER TYPE`/sửa
CHECK constraint lần hai ở Phase 4.

RLS trên `exercise_sets`: chỉ cần policy `admin write` (ALL, giống
`grammar_exercises: admin write`). Không cần policy đọc riêng cho
`authenticated` — dữ liệu học viên cần vẫn đi qua
`grammar_exercises_public` (view chạy bằng quyền người tạo view, không cần
base table có policy đọc công khai, đúng pattern `lessons` đang áp dụng).

### `(group_id ↔ set_id)` — không thêm ràng buộc DB

Đã đọc kỹ handler lưu trong `AdminGrammarExerciseSection.tsx`: nhánh
`create-group` luôn sinh `group_id` mới bằng `crypto.randomUUID()`, nhánh
`appendContext` luôn nối vào đúng `group_id` đã có — không có đường nào
trong UI khiến một `group_id` đổi sang set khác. Chi phí thêm trigger cưỡng
chế ở tầng DB ngay bây giờ không tương xứng với rủi ro (chỉ xảy ra nếu sửa DB
tay). Không làm ở Phase 1; cân nhắc lại nếu Phase 4 mở thêm đường ghi mới.

## Migration (3 file)

**1. Tạo bảng + cột (nullable), RLS:**

```sql
CREATE TABLE exercise_sets (...);   -- như trên
ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercise_sets: admin write" ON exercise_sets FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

ALTER TABLE grammar_exercises ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;
```

**2. Backfill + dọn dẹp + khoá ràng buộc:**

```sql
INSERT INTO exercise_sets (lesson_id, category, title, order_index, status)
SELECT
  lesson_id,
  'nguphap',
  'Bài tập ' || row_number() OVER (PARTITION BY lesson_id ORDER BY min(order_index)),
  min(order_index),
  CASE WHEN bool_and(status = 'published') THEN 'published' ELSE 'draft' END
FROM grammar_exercises
WHERE group_id IS NOT NULL
GROUP BY lesson_id, group_id;

-- Gán set_id cho từng câu theo group_id, qua bảng tạm map group_id -> set vừa tạo
-- (dùng CTE hoặc bảng ánh xạ trung gian; group_id không được lưu lại trên
-- exercise_sets nên cần join qua lesson_id + order_index tối thiểu của group
-- để khớp đúng set — cụ thể hoá khi viết migration thật).

DELETE FROM grammar_exercises WHERE group_id IS NULL;

ALTER TABLE grammar_exercises ALTER COLUMN set_id SET NOT NULL;
ALTER TABLE grammar_exercises DROP COLUMN status;
```

Lưu ý khi viết migration thật: vì `exercise_sets` không giữ `group_id`, bước
UPDATE gán `set_id` cần một CTE trung gian join theo `(lesson_id, group_id)`
thay vì so khớp qua title/order — tránh sai lệch nếu hai group cùng lesson
có cùng `min(order_index)` trùng nhau (không xảy ra với dữ liệu hiện tại
nhưng migration phải đúng về mặt logic, không dựa vào tình cờ của dữ liệu).

**3. Cập nhật view public:**

```sql
DROP VIEW IF EXISTS grammar_exercises_public;
CREATE VIEW grammar_exercises_public AS
  SELECT g.id, g.lesson_id, g.set_id, g.type, g.group_id, g.hint,
         g.prompt_text, g.transformation_hint, g.tokens,
         g.classification_groups,
         (SELECT jsonb_agg(elem ->> 'item') FROM jsonb_array_elements(g.classification_items) elem) AS classification_items,
         g.word_bank, g.options, g.explanation, g.order_index
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
GRANT SELECT ON grammar_exercises_public TO authenticated;
```

Thêm `set_id` vào SELECT list dù frontend chưa dùng ngay — tránh phải làm
thêm một migration chỉ để thêm 1 cột khi Phase 2 cần.

## Edge Function `grammar-submit`

`supabase/functions/grammar-submit/index.ts:57-64` hiện tại:

```ts
const { data: exercises } = await supabase
  .from("grammar_exercises")
  .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options")
  .eq("lesson_id", lesson_id)
  .eq("status", "published");
```

Đổi thành join qua `exercise_sets`, lọc theo `status` của set (Postgrest hỗ
trợ filter qua embedded resource):

```ts
.select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, exercise_sets!inner(status)")
.eq("lesson_id", lesson_id)
.eq("exercise_sets.status", "published");
```

Cụ thể hoá cú pháp PostgREST embedded filter khi viết plan — nguyên tắc là
lọc theo `status` của set, không phải của câu (cột đã xoá).

## Admin UI (`src/pages/admin/AdminGrammarExerciseSection.tsx`)

### Header nhóm (`SortableExerciseGroupRow`, dòng ~323-378)

Hiện tại chỉ hiển thị `Bài {groupIndex + 1}` tĩnh, không có tên lưu trong
DB. Đổi thành:

- Tên set hiển thị thay cho số thứ tự cứng, bấm vào để sửa inline (input
  thay chỗ span, Enter/blur để lưu) — theo đúng pattern tương tác đơn giản
  admin đã quen (không cần modal riêng).
- Badge trạng thái published/draft chuyển từ trong từng dòng câu con
  (dòng ~365) lên header, đại diện cho cả set. Bấm vào để toggle, gọi update
  trực tiếp trên `exercise_sets.id`.

### Dòng câu con (bên trong `isExpanded`, dòng ~360-370)

Xoá badge `ex.status === "published"` — không còn ý nghĩa ở cấp câu.

### Modal edit (dòng ~1219-1245)

Xoá `handlePublish`/`handleUnpublish` hiện đang update `.eq("id", editId)`
trên `grammar_exercises` — chức năng này chuyển hẳn ra header nhóm, thao
tác trên `exercise_sets`.

### Luồng lưu (`create-group` / `appendContext`, dòng ~1071-1120)

- Nhánh `create-group`: thêm bước insert 1 row `exercise_sets` mới (title
  mặc định `Bài tập {order kế tiếp}`, status mặc định `draft`) song song
  lúc sinh `group_id` mới, dùng `id` vừa tạo làm `set_id` cho mọi entry.
- Nhánh `appendContext`: kế thừa `set_id` sẵn có của group đang thêm câu
  vào — không tạo set mới.

### File structure

`AdminGrammarExerciseSection.tsx` đã 1500+ dòng. Đề xuất tách phần thao tác
với `exercise_sets` (rename, toggle status, tạo set mới) thành
`src/lib/hooks/useExerciseSets.ts` — theo đúng pattern hook hiện có
(`useModuleOrder.ts`), giữ thay đổi trong file JSX chính ở mức tối thiểu.
Cụ thể hoá interface hook khi viết plan.

## Học viên: không đổi gì

`GrammarExercisePage.tsx`, `useGrammarExercises.ts`, cách nhóm câu hỏi hiển
thị (`groupGrammarExercises` dựa trên `group_id`) — không sửa. Vì backfill
giữ nguyên `published` cho toàn bộ dữ liệu hiện tại, view public trả về
đúng những gì đang trả trước migration.

## Testing

- Regression: `src/lib/grammarExerciseGroups.test.ts` không đổi hành vi
  (vẫn nhóm theo `group_id`).
- Hook `useExerciseSets.ts` (mới): test đơn vị thuần logic (rename, toggle
  status) bằng `node:test`, không cần trình duyệt thật.
- Rename/toggle status UI trong `AdminGrammarExerciseSection.tsx` là thay
  đổi tương tác trực tiếp trên DOM — tái dùng đúng pattern harness Playwright
  đã dựng ở Phase 0 (`tests/e2e/classification-fields/`), vì đây là cùng
  một file, đã có sẵn hạ tầng mount component thật qua Vite dev server thật
  (né được vấn đề `src/lib/supabase.ts` crash khi import ngoài Vite).
- Migration: verify bằng query kiểm kê sau khi backfill —
  `count(exercise_sets) = 5`, `count(grammar_exercises WHERE set_id IS NULL) = 0`,
  không group nào bị tách đôi giữa 2 set.

## Acceptance Criteria

- [ ] `exercise_sets` tồn tại, mỗi set có `lesson_id`, `category`, `title`,
      `order_index`, `status`.
- [ ] Mọi `grammar_exercises` có `set_id NOT NULL`, không còn cột `status`.
- [ ] Backfill giữ đúng số lượng câu hỏi, không mất dữ liệu (`answers` cũ
      không bị ảnh hưởng — bảng `grammar_attempts` không tham chiếu
      `grammar_exercises`, không cần migrate).
- [ ] Admin đổi tên set, bật/tắt published cho cả set bằng 1 thao tác.
- [ ] Tạo bài tập mới (nhóm mới) tự động tạo `exercise_sets` kèm theo,
      không tạo được câu mồ côi.
- [ ] `grammar_exercises_public` chỉ trả câu thuộc set đã published — hành
      vi giống hệt trước migration với dữ liệu hiện tại.
- [ ] `grammar-submit` chỉ chấm câu thuộc set đã published.
- [ ] `npm run gen:types` chạy lại, `database.types.ts` cập nhật.
- [ ] Trang bài tập học viên (`GrammarExercisePage`) không đổi hành vi hiển
      thị so với trước Phase 1.

## Out of scope

- UI ghép nhiều group khác dạng vào cùng 1 set.
- Bất kỳ thay đổi nào ở `GrammarExercisePage`, cách chấm điểm, pass/fail.
- Category `nghe`/`doc` — chỉ chuẩn bị enum, chưa có set nào thuộc 2 category
  này (đó là việc của Phase 4).
- Trigger DB cưỡng chế `(group_id, set_id)` — xem lý do ở mục Data model.
