# Listening Quiz UX Fixes — Design Spec

**Date**: 2026-09-04  
**Status**: Approved  
**Scope**: Tab Nghe (admin + learner). Không đụng Ngữ pháp / Đọc trừ component dùng chung.

## Overview

Sửa 4 UX issues trên bài tập nghe + thêm bulk delete set trong danh sách lesson:

1. Ô điền đáp án quá hẹp → tự giãn theo nội dung  
2. Set không còn câu hỏi → xóa ngay khi xóa câu cuối; đánh số lại `Bài tập 1…N`  
3. Trắc nghiệm admin cố định 4 phương án → default 2, thêm/xóa (min 2, max 6)  
4. Đáp án MC dài bị cắt `...` → wrap đủ chữ  
5. Bulk delete nhiều set trong một lesson  

## Approach

Frontend-only, tái dùng pattern có sẵn (`grammarMultipleChoice` add/remove, bulk delete câu trong set, `nextDefaultSetTitle`). Không Edge Function / RPC cleanup.

---

## 1. Learner — fill-in-the-blank input width

**File**: `src/components/ExerciseAnswerInput.tsx`

- Bỏ class cố định `w-28` trên input `fill_in_the_blank`.
- Input tự giãn theo độ dài giá trị đang gõ (ví dụ `size`/`ch` dựa trên `value.length`), với:
  - **min** ~4–6 ký tự (ô trống vẫn nhìn được khi chưa gõ)
  - **max** không vượt quá full chiều ngang hàng (clamp / `max-w-full`)
- Vẫn render **inline** trong câu có marker `___` — không đổi sang mỗi ô một dòng.

Áp dụng cho mọi chỗ dùng `ExerciseAnswerInput` (nghe dùng chung component; ngữ pháp/đọc hưởng lợi cùng fix — chấp nhận được vì cùng bug).

---

## 2. Learner — multiple choice long options

**File**: `src/components/MultipleChoiceOptions.tsx`

Khi `layout="horizontal"` (Quiz nghe):

- Bỏ `truncate` và `max-w-[10rem] sm:max-w-[12rem]`.
- Dùng `whitespace-pre-wrap` (hoặc tương đương) để hiện đủ chữ.
- Giữ `flex flex-wrap gap-2` và nút `inline-flex max-w-full`.

`layout="vertical"` (ngữ pháp): không đổi.

Cập nhật test `MultipleChoiceOptions.test.tsx` cho class mới (bỏ assert truncate nếu có).

---

## 3. Admin — multiple choice options (variable count)

**Files**:

- `src/pages/admin/AdminListeningExerciseSection.tsx` (`ListeningQuestionFields`, `emptyForm`, `formFromRow`)
- Tái dùng `addOption` / `removeOption` / `MIN_MULTIPLE_CHOICE_OPTIONS` từ `src/lib/grammarMultipleChoice.ts`

| Rule | Value |
|------|-------|
| Default khi tạo mới | 2 ô `["", ""]` |
| Min | 2 |
| Max | 6 (A–F) |
| Load từ DB | Giữ nguyên số options đã lưu (không ép về 2) |

UI:

- Label: “Phương án (tối thiểu 2)” (thay “4 phương án * …”).
- Nút **Thêm phương án** (ẩn/disable khi `options.length >= 6`).
- Nút **Xóa** từng dòng (ẩn/disable khi `options.length <= 2`).
- Radio chọn đáp án đúng giữ nguyên.

Validate: `validateChoiceForm` / `normalizeOptions` giữ nguyên — toast “Cần ít nhất 2 phương án.” chỉ khi sau trim còn < 2 hoặc có ô rỗng làm normalize fail. Với UI đúng (min 2, không cho lưu ô trống), toast này ít xuất hiện hơn.

Cập nhật `listeningExerciseForm.test.ts` nếu có giả định cứng 4 options.

---

## 4. Admin — xóa câu cuối → xóa set + renumber

### Trigger

Trong editor set nghe, sau khi **xóa đơn** hoặc **bulk xóa câu** khiến `setExercises` còn lại = 0:

1. Xóa `exercise_sets` row (`ON DELETE CASCADE` → `grammar_exercises` / drafts / attempts theo schema hiện có).
2. Cleanup audio: đọc `audio_clip_id` của set trước khi xóa; sau khi xóa set, nếu clip id đó không còn bị `exercise_sets.audio_clip_id` nào reference thì `delete` row `listening_clips` (và object storage nếu flow upload hiện tại đã có bước tương ứng khi xóa clip đơn).
3. Renumber các set `category = 'nghe'` còn lại **trong cùng `lesson_id`** (xem §5).
4. Toast: “Đã xóa câu cuối — bài tập cũng được xóa.”
5. Navigate về danh sách lesson (clear `selectedSetId`).

Nếu sau xóa vẫn còn ≥ 1 câu: hành vi hiện tại (toast xóa câu, refresh list câu).

### Không làm

- Không auto-cleanup khi load danh sách admin (không quét xóa set `0 câu hỏi` sẵn có).
- Set cũ đang `0 câu hỏi`: admin dọn bằng bulk delete sets (§6).

---

## 5. Renumber sets trong lesson

Sau mọi thao tác làm mất ≥ 1 set nghe trong lesson (xóa set vì rỗng, xóa set đơn nếu có, bulk delete sets):

1. Lấy set `nghe` còn lại của `lesson_id`, sort theo `order_index` hiện tại.
2. Gán lại:
   - `order_index` = `0 .. n-1`
   - `title` = `Bài tập ${i + 1}` (cùng format `nextDefaultSetTitle`)
3. Persist qua Supabase `update` từng row (hoặc batch); refresh local `sets` state.

Học viên: accordion “Bài N” đã đánh theo index list sau sort `order_index` → tự đúng sau renumber.

Helper đề xuất: mở rộng `src/lib/exerciseSetTitle.ts` (vd. `defaultSetTitleAt(index: number)` → `"Bài tập ${index + 1}"`) để tránh magic string rải rác; `nextDefaultSetTitle` gọi lại helper này.

---

## 6. Bulk delete sets trong danh sách lesson

**UI** (trong lesson accordion đang expand, list set):

- Checkbox từng set.
- “Chọn tất cả” trong phạm vi lesson đó.
- Khi `selectedSetIds.size > 0`: nút “Xóa N bài” (destructive).
- Confirm modal (pattern giống bulk xóa câu): “Xóa N bài tập đã chọn?”
- Sau confirm: `delete().in("id", ids)` trên `exercise_sets` → cleanup clips orphan nếu cần → renumber (§5) → clear selection → toast.

Tái dùng UX/state pattern bulk delete câu (`selectedIds`, `bulkDeleteOpen`) — state riêng cho set-level (`selectedSetIds`) để không đụng editor câu.

---

## Data / migrations

Không cần migration. Schema hiện có đủ:

- `grammar_exercises.set_id` → `ON DELETE CASCADE` từ `exercise_sets`
- `exercise_sets.audio_clip_id` → `ON DELETE SET NULL` tới `listening_clips` (clip không tự xóa khi xóa set → cần xóa clip chủ động nếu muốn hết orphan)

## Testing

- Unit: `MultipleChoiceOptions` horizontal không còn truncate class; blank input size/class; `defaultSetTitleAt` / renumber helper; listening form default 2 options + add/remove bounds.
- Manual: learner fill-blank gõ dài thấy ô giãn; MC đáp án dài hiện đủ; admin tạo MC 2 options, thêm tới 6, xóa xuống 2; xóa câu cuối → set biến mất + title còn lại thành Bài tập 1…N; bulk chọn nhiều set `0 câu hỏi` → xóa một lần.

## Out of scope

- Auto-delete empty sets on page load  
- Bulk delete listening clips độc lập  
- Thay đổi Ngữ pháp / Đọc admin forms (trừ shared components)  
- Đổi scoring / Edge Functions  
