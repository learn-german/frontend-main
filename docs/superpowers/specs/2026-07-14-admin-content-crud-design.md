# CRUD Module + Lesson trong trang Quản lý Nội dung (Admin)

## Bối cảnh

[AdminContentSection.tsx](../../../src/pages/admin/AdminContentSection.tsx) hiện chỉ hiển thị danh sách module ("mục lớn") và lesson bên trong ("mục nhỏ"), với duy nhất 1 hành động: bấm ✏️ trên 1 lesson để mở [AdminLessonEditor.tsx](../../../src/pages/admin/AdminLessonEditor.tsx) sửa toàn bộ nội dung bài học. Không có cách thêm module mới, sửa/xóa module, hay thêm/xóa lesson.

Yêu cầu: cho phép sửa module và thêm/sửa/xóa lesson ngay trong trang này.

**Làm rõ khái niệm module (quan trọng, thay đổi so với thiết kế ban đầu):** mỗi module trong hệ thống này **tương ứng 1-1 với 1 level** (A1/A2/B1/B2) — không phải "chủ đề" tùy ý. Dữ liệu thật xác nhận: `m-a1-1` (A1), `m-a2-1` (A2), `m-b1-1` (B1) — đúng 1 module mỗi level đã có. Phía người học ([RoadmapPage.tsx](../../../src/pages/RoadmapPage.tsx)) cũng hiển thị đúng theo cấu trúc này: "mục lớn" = swimlane theo level (A1/A2/B1 — thiếu B2), "mục nhỏ" = toàn bộ lesson của level đó được `flatMap` thành 1 danh sách ngang hàng, không chia theo module/chủ đề — khớp với mô tả "người học chỉ thấy chủ đề theo thứ tự, không thấy đó là bài học của A1 hay A2" (ở cấp lesson không lặp lại nhãn level, vì nhãn đã hiện ở header level rồi).

Vì vậy: **không cần (và không nên) cho admin tự tạo/xóa module** — chỉ cần đúng 4 module cố định A1/A2/B1/B2 (hiện thiếu B2, sẽ seed qua migration), và admin chỉ sửa được title/title_vi của module đã có.

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

### 1. Seed module B2 (migration, không phải hành động admin trong UI)

Hiện chỉ có `m-a1-1`/`m-a2-1`/`m-b1-1`, thiếu module cho B2. Thêm 1 migration insert module B2 nếu chưa tồn tại (idempotent), theo đúng phong cách nội dung 3 module đã có:

```sql
INSERT INTO modules (id, level, title, title_vi, description, order_index)
VALUES ('m-b2-1', 'B2', 'Vertiefung & Diskussion', 'Nâng cao & Tranh biện', 'Tranh biện học thuật, viết luận, giao tiếp chuyên sâu', 4)
ON CONFLICT (id) DO NOTHING;
```

Sau migration này, hệ thống có đúng 4 module cố định (A1/A2/B1/B2) — **không có UI "Thêm module" hay "Xóa module"**, vì module không phải đơn vị admin tự do tạo/xóa.

### 2. Sửa module

Title (DE) và Title (VI) sửa **inline** trên chính list — thay `<p>{mod.title_vi}</p>` bằng input dùng lại pattern `EditableText`-style hiện có trong `AdminLessonEditor.tsx` (đã có sẵn component `EditableText`, sẽ import dùng lại), auto-save `onBlur` bằng 1 `UPDATE modules SET title=... WHERE id=...` (không cần nút "Lưu" riêng, khác với `AdminLessonEditor` — vì đây chỉ 2 field text đơn giản, không cần buffer state phức tạp).

**Không sửa được `level`** — level đã cố định 1-1 với module, đổi level sẽ phá vỡ đúng bản chất "4 module cố định = 4 level" vừa xác lập ở trên.

Việc click vào text để sửa **phải không kích hoạt** hành vi expand/collapse của module (hiện `<button>` bọc toàn bộ header module để toggle expand) — cần tách text ra khỏi vùng `<button>` toggle, hoặc dùng `stopPropagation` khi click vào vùng edit.

### 3. Cập nhật Level type + RoadmapPage cho B2

- `src/lib/appTypes.ts`: `Level` đổi từ `"A1" | "A2" | "B1"` thành `"A1" | "A2" | "B1" | "B2"`.
- `src/pages/RoadmapPage.tsx`: thêm 1 entry vào mảng `levels` cho B2, theo đúng phong cách 3 entry hiện có (`id`, `title`, `desc`, `color`, `ringColor`) — ví dụ màu `bg-purple-700`/`ring-purple-100` để phân biệt với 3 màu đã dùng (orange, amber, slate). Không đổi logic `flatMap`/tính tiến trình gì khác — logic đó đã tổng quát theo `levels` array, tự động chạy đúng khi thêm entry B2 vào đó.

### 4. Thêm lesson

Nút "+ Thêm bài học" trong mỗi module đã expand (dưới list lesson của module đó). Bấm ngay lập tức (không qua modal nhập liệu trước):

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

- 1 migration mới: seed module B2.
- `src/lib/appTypes.ts`: mở rộng `Level` thêm `"B2"`.
- `src/pages/RoadmapPage.tsx`: thêm entry B2 vào mảng `levels`.
- `src/pages/admin/AdminContentSection.tsx`: sửa module inline (title/title_vi), thêm/xóa lesson.

Không đổi RLS, không cần Vercel Function/Edge Function mới — mọi thao tác admin đi thẳng qua PostgREST như code hiện tại.

## Testing / verification

- `npm run lint` pass.
- Sau migration: query `modules` xác nhận có đúng 4 module (A1/A2/B1/B2), không tạo trùng nếu chạy migration 2 lần (`ON CONFLICT DO NOTHING`).
- Thêm lesson mới trong module đã có lesson → xác nhận `n`/`order_index` tăng đúng theo số lesson hiện có **của module đó** (không phải toàn cục).
- Xóa lesson đang được 1 lesson khác trỏ `next_lesson_id` tới → xác nhận không bị lỗi FK, và lesson trỏ tới nó có `next_lesson_id = null` sau khi xóa.
- Xóa lesson có quiz_questions liên kết → xác nhận quiz cascade xóa theo (query lại DB).
- Sửa module inline: click vào text sửa không làm module tự expand/collapse ngoài ý muốn.
- RoadmapPage: sau khi thêm module B2 + có ít nhất 1 lesson B2, xác nhận swimlane B2 hiện đúng, tiến trình tính đúng, không vỡ layout với 4 level thay vì 3.
- Test qua browser (dev server): thêm/xóa lesson, sửa module end-to-end ở trang admin; xem lại Roadmap phía người học có B2.

## Ngoài phạm vi (không làm)

- Không cho admin thêm/xóa module (module cố định 1-1 theo level, seed sẵn qua migration).
- Không cho sửa `level` của module đã có.
- Không làm kéo-thả sắp xếp lại thứ tự lesson (order_index) — chỉ tự tính khi tạo mới, sắp xếp lại thủ công (nếu cần) vẫn phải sửa `order_index` trực tiếp qua DB như hiện tại.
- Không dọn dữ liệu "mồ côi" trong `user_stats.completedLessons` khi xóa lesson.
- Không thêm modal xác nhận rời trang khi đang sửa inline chưa lưu (auto-save on blur nên rủi ro mất dữ liệu thấp).
