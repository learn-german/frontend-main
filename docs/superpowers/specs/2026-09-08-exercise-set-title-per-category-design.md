# Exercise Set Title Numbering Per Category — Design Spec

**Date**: 2026-09-08  
**Status**: Approved  
**Scope**: Admin exercise set titles (`Bài tập N`) for `nghe` / `nguphap` via `useExerciseSets.createSet`, plus one-time renumber of existing rows. Reading (`doc`) already correct.

## Problem

Trên admin tab **Nghe**, trong một bài học (ví dụ “Làm quen với tiếng Đức”) có 3 set nhưng hiển thị **Bài tập 22 / 23 / 24** thay vì **1 / 2 / 3**.

Nguyên nhân: `createSet` đếm **mọi** `exercise_sets` của lesson (mọi category) khi gán `title`:

```ts
sets.filter((s) => s.lessonId === forLessonId).length
```

Trong khi `createReadingSet` và `deleteSets` (renumber sau xóa) đã scope theo `category`.

## Decision

Số thứ tự mặc định **reset theo từng category trong mỗi lesson**:

- Nghe: Bài tập 1, 2, 3…
- Đọc: Bài tập 1, 2, 3… (đã đúng)
- Ngữ pháp: Bài tập 1, 2, 3… (cùng hook `createSet`)

## Approach (đã chốt)

1. **Sửa `createSet`**: đếm theo `lessonId + category` (khớp `createReadingSet`).
2. **Renumber dữ liệu hiện có**: với mỗi nhóm `(lesson_id, category)`, sort theo `order_index`, gán lại `order_index = 0..n-1` và `title = "Bài tập N"` (1-based) qua `planSetRenumber` / `defaultSetTitleAt`.

Không đổi cách hiển thị UI (admin/learner vẫn đọc `set.title` từ DB).

## Behavior

| Action | Before | After |
|---|---|---|
| Tạo set nghe thứ 1 khi lesson đã có 21 set ngữ pháp | `Bài tập 22` | `Bài tập 1` |
| Tạo set nghe tiếp theo trong cùng lesson | tiếp tục đếm chung lesson | `Bài tập 2` trong category `nghe` |
| Xóa set (đã có) | renumber theo category | không đổi |
| Set đã lưu sai title | giữ `Bài tập 22`… | one-time renumber → `1..n` |

Custom title (nếu admin đã đổi tay thành tên khác `Bài tập N`) cũng bị ghi đè bởi renumber một lần — chấp nhận được vì product đang dùng title mặc định làm số thứ tự.

## Implementation

### Code

- `src/lib/hooks/useExerciseSets.ts` — `createSet`:  
  `sets.filter((s) => s.lessonId === forLessonId && s.category === category).length`
- Tests: thêm/cập nhật test cho logic đếm theo category (unit test helper hoặc extract filter nếu cần; tối thiểu assert hành vi đếm nếu tách được hàm thuần).

### Data migration

Một trong hai (ưu tiên migration SQL trong `supabase/migrations/` nếu team thường dùng; hoặc script admin one-shot dùng `planSetRenumber`):

```text
FOR EACH (lesson_id, category) group of exercise_sets:
  sort by order_index ASC, id ASC (tie-break)
  UPDATE order_index = 0..n-1, title = 'Bài tập ' || (index+1)
```

Reuse `planSetRenumber` từ `src/lib/exerciseSetTitle.ts` nếu chạy từ app/script; nếu SQL thuần thì mirror cùng semantics.

### Out of scope

- Đổi label UI sang “Nghe 1” thay vì “Bài tập 1”
- Số câu hỏi bên trong set (đã có spec riêng `2026-09-04-listening-question-numbering-design.md`)
- Đổi schema `exercise_sets`
- Refactor lớn admin sections

## Verification

1. Unit: `planSetRenumber` / `nextDefaultSetTitle` vẫn đúng; nếu extract filter count thì test count theo category.
2. Manual admin: mở bài học có cả ngữ pháp + nghe → tab Nghe thấy **Bài tập 1..k**; thêm set mới → **Bài tập k+1**.
3. Tab Đọc / Ngữ pháp: mỗi loại vẫn bắt đầu từ 1 trong cùng lesson.
4. Sau migration: không còn title kiểu `Bài tập 22` khi group chỉ có 3 set.
