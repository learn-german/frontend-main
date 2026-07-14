# Lesson Draft/Publish workflow + admin reordering

## Bối cảnh

Hiện tại mọi bài học được tạo/sửa trong `AdminLessonEditor.tsx`/`AdminContentSection.tsx` đều **live ngay lập tức** — không có khái niệm nháp/published nào ở bất kỳ đâu (không có cột `status` trên bảng `lessons`, không migration nào từng thêm). Khi admin bấm "Thêm bài học", một row rỗng ("Bài học mới" placeholder) được insert thẳng và học viên có quyền truy cập level đó sẽ thấy ngay. Không có cách nào để admin biết bài nào "còn dang dở, chưa xong" khi nhìn danh sách.

Yêu cầu: thêm cơ chế Nháp/Public cho bài học, để (1) admin sửa bài mà không sợ học viên thấy nội dung chưa hoàn thiện, (2) nhìn danh sách admin biết ngay bài nào cần chỉnh sửa tiếp, (3) học viên không bị nhảy cóc qua bài đang nháp trong lộ trình học, và (4) admin sắp xếp lại thứ tự bài học bằng kéo-thả.

## Mục tiêu

- Mỗi bài học có 1 trạng thái duy nhất: `draft` (Nháp) hoặc `published` (Public).
- Bài mới tạo mặc định `draft`. Bài đã tồn tại trước migration này giữ nguyên hiển thị (`published`).
- Học viên hoàn toàn không thấy nội dung bài Nháp (chặn bằng RLS ở tầng Supabase, không chỉ ẩn UI).
- Trên Roadmap, một bài Nháp nằm giữa 2 bài Public vẫn **chặn đúng vị trí** tiến trình học — học viên hoàn thành bài trước đó sẽ thấy placeholder "đang chỉnh sửa" tại đúng vị trí, không tự động nhảy sang bài kế tiếp.
- Danh sách bài học trong admin hiển thị badge trạng thái để admin xác định nhanh bài nào cần làm tiếp.
- Admin kéo-thả sắp xếp lại thứ tự bài học trong 1 module.

## Ngoài phạm vi

- Không áp dụng trạng thái Nháp/Public cho `modules` (chỉ áp dụng cho `lessons`).
- Không lưu song song 2 phiên bản nội dung (draft content + published content) — chỉ 1 bộ nội dung, gắn với 1 cờ trạng thái duy nhất (đã chốt ở bước brainstorm).
- Không kéo-thả bài học giữa 2 module khác nhau — chỉ sắp xếp trong phạm vi 1 module.
- Không thêm quy tắc "phải hoàn thành mọi bài trước mới được public" hay validation nội dung tối thiểu trước khi public — admin tự quyết định khi nào bấm Public.

## 1. Data model & migration

Migration mới (`supabase/migrations/`):

```sql
-- 1. Thêm cột status, backfill toàn bộ bài học hiện có thành 'published'
--    để không có bài nào đang hiển thị cho học viên bị ẩn đột ngột.
ALTER TABLE public.lessons
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

UPDATE public.lessons SET status = 'published';

-- Từ đây trở đi, DEFAULT 'draft' chỉ áp dụng cho các bài học MỚI insert
-- (AdminContentSection sẽ set status: "draft" tường minh khi insert, không
-- dựa vào DEFAULT, nhưng giữ DEFAULT 'draft' làm an toàn lớp thứ 2).

-- 2. RLS: non-admin chỉ SELECT được bài đã published; admin SELECT tất cả.
--    (Giả định RLS hiện tại trên `lessons` đã có policy SELECT chung —
--    migration cụ thể sẽ cần đọc policy hiện tại trong
--    supabase/migrations/20260624000002_security_fixes.sql và sửa/thêm
--    điều kiện `status = 'published' OR is_admin()` vào policy SELECT đó,
--    không tạo policy SELECT thứ hai chồng chéo.)

-- 3. View lộ tối thiểu id/module_id/order_index/status cho MỌI bài học
--    (kể cả Nháp) — KHÔNG lộ title/video/ngữ pháp/từ vựng. View được tạo
--    bởi role migration (postgres), owner có BYPASSRLS, nên view này trả
--    về mọi row bất kể policy SELECT ở trên — đây là chủ đích (xem lý do
--    trong phần "RLS & bảo mật" bên dưới).
CREATE VIEW public.lesson_positions AS
SELECT id, module_id, order_index, status FROM public.lessons;

GRANT SELECT ON public.lesson_positions TO authenticated;
```

`src/lib/appTypes.ts`: thêm `status: "draft" | "published"` vào interface `Lesson`.

Thêm 1 type mới cho vị trí tối giản (dùng ở Roadmap, xem phần 4):

```ts
export interface LessonPosition {
  id: string;
  moduleId: string;
  orderIndex: number;
  status: "draft" | "published";
}
```

## 2. RLS & bảo mật

- Policy SELECT hiện có trên `lessons` được sửa để thêm điều kiện `status = 'published'` cho non-admin (admin vẫn SELECT toàn bộ qua điều kiện `is_admin()` đã có).
- View `lesson_positions` **cố ý** bypass RLS của bảng gốc để lộ 4 cột không nhạy cảm (id, module_id, order_index, status) cho toàn bộ user đã đăng nhập — đây là cơ chế bắt buộc để Roadmap biết "có 1 bài ở vị trí này, đang Nháp" mà không cần thấy nội dung (đã được xác nhận rõ ràng ở bước brainstorm, vì phương án "chặn RLS hoàn toàn không lộ gì" khiến không thể chặn nhảy cóc đúng vị trí).
- Verification bắt buộc cho phần RLS/view này (an ninh, không thể chỉ tin code review): dùng `BEGIN`/`ROLLBACK` test trực tiếp trên Supabase với JWT non-admin, xác nhận:
  - Query `lessons` trực tiếp: non-admin không thấy row `status='draft'` (0 rows trả về nếu chỉ có draft).
  - Query `lesson_positions`: non-admin THẤY row đó nhưng chỉ với 4 cột id/module_id/order_index/status (không có title/content).
  - Admin JWT: query `lessons` trực tiếp thấy đầy đủ mọi status.

## 3. Admin UI — `AdminLessonEditor.tsx`

- `LessonEditable` (state cục bộ của editor) thêm field `status: "draft" | "published"`.
- Khu vực nút hành động:
  - **"Lưu bài học"** — hành vi y hệt hiện tại, chỉ lưu nội dung, không đổi `status`.
  - **"Public"** — nút mới, chỉ hiện khi `status === "draft"`. Lưu nội dung hiện tại + set `status = "published"` trong cùng 1 lệnh `update`.
  - **"Chuyển về Nháp"** — nút phụ (secondary), chỉ hiện khi `status === "published"`, set `status = "draft"` (giữ nguyên nội dung).
- Badge trạng thái cạnh tiêu đề bài học trong editor: "Nháp" (nền vàng/xám nhạt) hoặc "Đã public" (nền xanh), dùng style tương tự `LevelBadge` đã có trong `DesignSystem.tsx`.

## 4. Admin UI — `AdminContentSection.tsx`

- `LESSON_SELECT` query string thêm `status`.
- `handleAddLesson`: insert với `status: "draft"` tường minh.
- Mỗi dòng bài học trong danh sách (trong module đã mở rộng) hiển thị cùng badge trạng thái như trên — đây là nơi admin "xác định phần cần chỉnh sửa" khi lướt qua danh sách.
- **Kéo-thả sắp xếp thứ tự** (dùng `@dnd-kit/core` + `@dnd-kit/sortable`, 2 package mới cần thêm vào `package.json`):
  - Danh sách bài học trong 1 module được bọc bằng `DndContext` + `SortableContext` (chỉ sắp xếp trong phạm vi module đó — không kéo chéo module).
  - Mỗi dòng bài học dùng `useSortable` để trở thành item kéo-thả được.
  - `onDragEnd`: tính lại mảng thứ tự mới (dùng `arrayMove` từ `@dnd-kit/sortable`), cập nhật state ngay (optimistic), rồi gửi `update({ order_index: i + 1 })` cho từng bài học trong module đó (theo vị trí mới) lên Supabase — không cần đổi các bảng/hook khác vì toàn bộ hệ thống sequencing (Roadmap, view `lesson_positions`) đều dựa vào `order_index`.

## 5. Học viên — Roadmap chặn đúng vị trí (`RoadmapPage.tsx`, `useModules.ts`)

- Thêm 1 hook fetch view `lesson_positions` (toàn bộ, không lọc — bảng nhỏ), trả về `LessonPosition[]`.
- Trong `RoadmapPage.tsx`, sau khi có `unlockedModules` (đã lọc theo `stats.unlockedLevels` như hiện tại), với mỗi module: ghép (merge) danh sách lesson đầy đủ đã có (`module.lessons`, chỉ chứa bài `published` vì đến từ `useModules` vốn đã bị RLS lọc) với các entry từ `lesson_positions` có cùng `module_id` và `status === "draft"` — sắp xếp toàn bộ theo `order_index`. Kết quả: 1 mảng liền mạch đúng thứ tự thật, trong đó vị trí bài Nháp là 1 "placeholder" (chỉ có `id`, không có `title`/nội dung).
- `getLessonStatus` **giữ nguyên logic hiện tại** (dựa vào vị trí mảng + `completedLessons`) — không cần sửa thuật toán, vì placeholder nằm đúng vị trí khiến bài sau nó tự động không thể "current" cho đến khi placeholder được published (id của placeholder không bao giờ nằm trong `completedLessons`).
- Card render: thêm 1 nhánh hiển thị riêng cho placeholder (không có tiêu đề, icon khoá/đang sửa khác biệt, ví dụ dùng icon giống trạng thái "locked" nhưng label "Đang chỉnh sửa"). Bấm vào card này gọi `showToast("Bài học đang được chỉnh sửa. Hãy quay lại sau.", "warning")` — dùng đúng tiện ích `showToast` sẵn có trong `src/lib/toast.ts`, không `alert()`. Không điều hướng sang `LessonDetailPage`.

## 6. Lớp phòng vệ phụ — `App.tsx:164-165`

Sửa lỗi hiện có (không liên quan trực tiếp tới nháp/publish nhưng bị lộ ra bởi tính năng này): dòng `flatLessons.find(...) ?? flatLessons[0]` hiện âm thầm hiển thị NHẦM sang bài học đầu tiên khi không tìm thấy `selectedLessonId`. Sửa thành: nếu không tìm thấy, hiển thị 1 màn hình thông báo "Bài học không khả dụng, có thể đang được chỉnh sửa. Hãy quay lại sau." kèm nút quay về Lộ trình học — phòng trường hợp học viên có link cũ/trực tiếp trỏ tới 1 bài vừa bị admin chuyển về Nháp.

## Testing / verification

- `npm run lint` pass sau mỗi thay đổi.
- Test RLS/view bằng `BEGIN`/`ROLLBACK` trực tiếp trên Supabase (như mô tả ở mục 2) — bắt buộc, đây là phần an ninh nhạy cảm nhất của thiết kế.
- Test browser thủ công (mock props, không cần đăng nhập thật):
  - Admin: tạo bài mới → mặc định Nháp; bấm Public → badge đổi, nút đổi thành "Chuyển về Nháp"; kéo-thả đổi thứ tự 2 bài trong 1 module → thứ tự lưu đúng sau reload.
  - Học viên: với 3 bài liền kề (published, draft, published) và đã hoàn thành bài 1 — xác nhận Roadmap hiển thị bài 2 là placeholder "Đang chỉnh sửa" (không phải bài 3 nhảy lên vị trí current), bấm vào placeholder ra toast đúng nội dung, bài 3 vẫn khoá.
  - Học viên: set `selectedLessonId` trỏ tới 1 bài vừa chuyển về Nháp rồi reload trang lesson-detail trực tiếp → thấy thông báo "không khả dụng", không bị hiển thị nhầm bài khác.

## Global constraints (nhắc lại từ CLAUDE.md, áp dụng cho toàn bộ plan)

- Không dùng `window.alert()`/`window.confirm()` — dùng `showToast()`.
- Thêm đúng 2 package mới (`@dnd-kit/core`, `@dnd-kit/sortable`) — đã được người dùng đồng ý ở bước brainstorm, không thêm package nào khác ngoài 2 cái này.
- Không sửa `src/lib/database.types.ts` bằng tay — chạy `npm run gen:types` sau khi migration được áp dụng.
- RLS bắt buộc bật trên mọi bảng — view `lesson_positions` là ngoại lệ có chủ đích (bypass RLS để lộ 4 cột không nhạy cảm), phải nêu rõ lý do trong migration comment.
- Node: `source ~/.nvm/nvm.sh && nvm use 20` trước khi chạy `npm run dev`/`npm run lint`.
