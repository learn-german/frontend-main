# CRUD Module + Lesson trong trang Quản lý Nội dung (Admin)

## Bối cảnh

[AdminContentSection.tsx](../../../src/pages/admin/AdminContentSection.tsx) hiện chỉ hiển thị danh sách module ("mục lớn") và lesson bên trong ("mục nhỏ"), với duy nhất 1 hành động: bấm ✏️ trên 1 lesson để mở [AdminLessonEditor.tsx](../../../src/pages/admin/AdminLessonEditor.tsx) sửa toàn bộ nội dung bài học. Không có cách thêm module mới, sửa/xóa module, hay thêm/xóa lesson.

Yêu cầu: cho phép thêm, sửa, xóa cả module và lesson ngay trong trang này.

## Khảo sát schema (đã xác nhận qua Supabase MCP)

- `modules`: `id text PK`, `level text`, `title text`, `title_vi text`, `description text NULL`, `order_index integer DEFAULT 0`. RLS: `authenticated` đọc tất cả, `admin` (theo `app_metadata.role`) insert/update/delete — **đã đủ, không cần đổi RLS hay thêm Edge Function/Vercel Function**.
- `lessons.module_id → modules.id` **ON DELETE CASCADE** — xóa module tự xóa hết lesson con.
- `lessons.next_lesson_id → lessons.id` **ON DELETE NO ACTION** — xóa 1 lesson mà lesson khác đang trỏ `next_lesson_id` tới nó sẽ bị **DB từ chối** (foreign key violation) nếu không tự gỡ liên kết trước.
- `quiz_questions.lesson_id → lessons.id` **ON DELETE CASCADE** — xóa lesson tự xóa quiz câu hỏi của lesson đó.
- Quy luật `id` hiện có trong dữ liệu thật (xác nhận qua query):
  - Module: `m-{level}-{k}` (ví dụ `m-a1-1`, `m-a2-1`, `m-b1-1`) — `k` là số thứ tự module **trong level đó**, bắt đầu từ 1.
  - Lesson: `{level}-l{n}` (ví dụ `a1-l1`, `a1-l2`) — `n` là số thứ tự lesson **trong module đó**, bắt đầu từ 1.
  - `modules.order_index` đánh **toàn cục** qua mọi level (1, 2, 3, ... không reset theo level).
  - `lessons.order_index` đánh **trong phạm vi module** (bắt đầu lại từ 1 ở mỗi module), trùng giá trị với `n` trong id.

Ngoài phạm vi FK kể trên, `user_stats.completedLessons` (jsonb, không có FK) có thể còn giữ lessonId của lesson đã xóa — chấp nhận để lại dữ liệu "mồ côi" này, không dọn (không ảnh hưởng tính đúng của app, chỉ là vài id vô nghĩa nằm trong 1 mảng lịch sử).

## Thiết kế chi tiết

### 1. Thêm module

Nút "+ Thêm module" ở đầu trang (`<h1>Quản lý Nội dung</h1>` cùng dòng). Bấm mở modal với 3 field: Title (DE), Title (VI), Level (`<select>` A1/A2/B1). Bấm "Tạo":

```
levelLower = level.toLowerCase()  // "a1" | "a2" | "b1"
k = số module hiện có với level === level đã chọn, + 1
id = `m-${levelLower}-${k}`
order_index = max(order_index của mọi module hiện có) + 1  (0 nếu chưa có module nào)
INSERT vào modules { id, level, title, title_vi, order_index }
```

Sau khi tạo: đóng modal, `fetchModules()` lại, tự động `setExpanded` module mới thành `true`.

### 2. Sửa module

Title (DE) và Title (VI) sửa **inline** trên chính list — thay `<p>{mod.title_vi}</p>` bằng input dùng lại pattern `EditableText`-style hiện có trong `AdminLessonEditor.tsx` (đã có sẵn component `EditableText`, sẽ import dùng lại), auto-save `onBlur` bằng 1 `UPDATE modules SET title=... WHERE id=...` (không cần nút "Lưu" riêng, khác với `AdminLessonEditor` — vì đây chỉ 2 field text đơn giản, không cần buffer state phức tạp).

Level sửa qua `<select>` nhỏ cạnh title, đổi là `UPDATE` ngay (`onChange`).

Việc click vào text để sửa **phải không kích hoạt** hành vi expand/collapse của module (hiện `<button>` bọc toàn bộ header module để toggle expand) — cần tách text ra khỏi vùng `<button>` toggle, hoặc dùng `stopPropagation` khi click vào vùng edit.

### 3. Xóa module

Nút 🗑️ cạnh mỗi module (chỉ hiện khi hover, giống pattern nút xóa vocab trong `AdminLessonEditor`). Bấm mở modal cảnh báo:

> "Xóa module **{title_vi}** sẽ xóa vĩnh viễn **{N} bài học** và toàn bộ quiz bên trong. Hành động này không thể hoàn tác.
> Gõ lại **{title_vi}** để xác nhận:"
> `<input>` — nút "Xóa vĩnh viễn" (đỏ) chỉ **enable** khi giá trị nhập khớp chính xác `title_vi`.

Bấm "Xóa vĩnh viễn": `DELETE FROM modules WHERE id = ...` — cascade tự xóa lessons + quiz_questions. Đóng modal, `fetchModules()` lại.

### 4. Thêm lesson

Nút "+ Thêm bài học" trong mỗi module đã expand (cạnh nút xóa module hoặc dưới list lesson). Bấm ngay lập tức (không qua modal nhập liệu trước):

```
levelLower = module.level.toLowerCase()
n = số lesson hiện có trong module đó + 1
id = `${levelLower}-l${n}`
order_index = n
INSERT vào lessons {
  id, module_id: module.id, level: module.level,
  title: "Bài học mới", title_vi: "Bài học mới",
  duration: "10 phút", xp_reward: 10, order_index,
  objective: null, summary: null, vocabulary: [], grammar: { title: "", rule: "", examples: [] }
}
```

Sau INSERT thành công: mở ngay `AdminLessonEditor` cho lesson vừa tạo (dùng lại flow `setEditing` hiện có) để admin điền tiếp — giống hệt trải nghiệm bấm ✏️ sửa lesson.

### 5. Xóa lesson

Nút 🗑️ cạnh mỗi lesson trong list (hiện khi hover). Bấm mở modal xác nhận đơn giản: *"Xóa bài học **{title_vi}**? Hành động này không thể hoàn tác."* — 2 nút Hủy / Xóa (đỏ), không cần gõ lại tên.

Bấm "Xóa": trước khi xóa, gỡ liên kết `next_lesson_id` đang trỏ tới lesson này:

```sql
UPDATE lessons SET next_lesson_id = null WHERE next_lesson_id = '{lessonId}';
DELETE FROM lessons WHERE id = '{lessonId}';
```

(2 lệnh riêng qua PostgREST — `supabase.from("lessons").update({ next_lesson_id: null }).eq("next_lesson_id", lessonId)` rồi `supabase.from("lessons").delete().eq("id", lessonId)`.) Quiz câu hỏi của lesson tự xóa theo cascade. Đóng modal, `fetchModules()` lại.

## Phạm vi thay đổi

Chỉ 1 file: `src/pages/admin/AdminContentSection.tsx`. Không đổi DB schema, không đổi RLS, không cần Vercel Function/Edge Function mới.

## Testing / verification

- `npm run lint` pass.
- Thêm module mới với level đã có sẵn module → xác nhận id sinh đúng (`k` tăng dần, không trùng id cũ).
- Thêm module mới với level **chưa có module nào** → xác nhận `k = 1`.
- Thêm lesson mới trong module đã có lesson → xác nhận `n` tăng đúng theo số lesson hiện có của module đó (không phải toàn cục).
- Xóa module có lesson đang có quiz → xác nhận cascade xóa cả lesson và quiz (query lại DB sau khi xóa).
- Xóa lesson đang được 1 lesson khác trỏ `next_lesson_id` tới → xác nhận không bị lỗi FK, và lesson trỏ tới nó có `next_lesson_id = null` sau khi xóa.
- Modal xóa module: nút "Xóa vĩnh viễn" phải disabled khi chưa gõ đúng tên, enable khi gõ khớp.
- Sửa module inline: click vào text sửa không làm module tự expand/collapse ngoài ý muốn.
- Test qua browser (dev server): thêm/sửa/xóa module và lesson end-to-end, xác nhận UI refresh đúng sau mỗi hành động.

## Ngoài phạm vi (không làm)

- Không làm kéo-thả sắp xếp lại thứ tự module/lesson (order_index) — chỉ tự tính khi tạo mới, sắp xếp lại thủ công (nếu cần) vẫn phải sửa `order_index` trực tiếp qua DB như hiện tại.
- Không dọn dữ liệu "mồ côi" trong `user_stats.completedLessons` khi xóa lesson.
- Không thêm modal xác nhận rời trang khi đang sửa inline chưa lưu (auto-save on blur nên rủi ro mất dữ liệu thấp).
