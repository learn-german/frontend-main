# Support Ticket — Design

Ngày: 2026-08-20
Trạng thái: đã duyệt, chờ lên kế hoạch triển khai

## Bối cảnh

Route `/help` đã tồn tại trong `src/lib/router.ts` và đang render
`<ComingSoonPage title="Trợ giúp học tập" />` (`src/App.tsx`). Sidebar học viên
đã có mục "Trợ giúp học tập" trỏ tới đó. Bên admin chưa có mục hỗ trợ nào.

Hai mockup đã duyệt:

- `docs/mockups/support-user-mockup.html` — màn học viên, theo shell học viên
  (Inter, nền `#f8f9fa`, primary đỏ, sidebar + flag stripe).
- `docs/mockups/support-admin-mockup.html` — màn admin, theo shell admin
  (topbar tối `slate-950`, accent cam, sidebar "Admin Panel", bảng dữ liệu).

## Phạm vi

Học viên gửi yêu cầu hỗ trợ và trao đổi với đội ngũ; admin tiếp nhận, trả lời
và đổi trạng thái. Hội thoại **nhiều lượt**. Chưa làm đính kèm file.

Ngoài phạm vi: đính kèm ảnh (thêm `attachment_path` vào bảng messages sau là
đủ, không phải làm lại schema), phân công ticket cho từng admin, SLA, đánh giá
mức độ hài lòng.

## Hướng kỹ thuật

PostgREST + RLS + trigger `SECURITY DEFINER`, **không thêm Edge Function**.

Ticket không chứa dữ liệu cần giấu client (khác `correct_answer` của quiz), nên
RLS là đủ để phân quyền. Đây cũng đúng khuôn `writing_submissions` +
`notifications` (`supabase/migrations/20260717000017_writing_and_notifications.sql`)
đang chạy: học viên nộp, admin xử lý, trigger bắn thông báo.

Đã cân nhắc và loại:

- **Edge Function cho mọi thao tác ghi** — phải viết tay lại phần phân quyền mà
  RLS vốn làm sẵn, thêm một function phải deploy, lệch pattern repo.
- **Lai (học viên qua RLS, admin qua Edge Function)** — hai đường ghi cho cùng
  một bảng, khó đoán hành vi.

## Mô hình dữ liệu

### `support_tickets`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `code` | TEXT UNIQUE NOT NULL | `SD-1024`, do trigger `BEFORE INSERT` sinh (xem mục Trigger) |
| `user_id` | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| `title` | TEXT NOT NULL | |
| `topic` | TEXT NOT NULL | CHECK in 5 chủ đề cố định (xem dưới) |
| `status` | TEXT NOT NULL DEFAULT `'pending'` | CHECK in (`pending`, `processing`, `resolved`) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT `now()` | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT `now()` | |

`user_id` trỏ `profiles(id)` chứ không phải `auth.users(id)` để màn admin
nested-select `profiles(email, full_name)` trong đúng một query — cùng lý do đã
ghi trong migration `writing_submissions`.

`code` dùng sequence riêng (`CREATE SEQUENCE support_ticket_code_seq START 1000`)
thay vì hiển thị UUID cho người dùng.

`topic` có `CHECK` giới hạn đúng 5 giá trị: `website_issue`, `lesson_content`,
`exercise_feedback`, `account_access`, `other`. Lưu khoá tiếng Anh trong DB,
nhãn tiếng Việt để ở `appTypes.ts` — đổi chữ hiển thị không phải viết migration,
nhưng thêm chủ đề mới thì phải. Đánh đổi này chấp nhận để bộ lọc chủ đề bên
admin không bao giờ có giá trị rác.

**Không dùng `DEFAULT` cho `code`.** `DEFAULT` chỉ áp dụng khi client bỏ trống
cột, mà PostgREST cho client gửi thẳng `code` tuỳ ý — `UNIQUE` chặn được trùng
nhưng không chặn được bịa số. Sinh `code` trong trigger `BEFORE INSERT` để
server luôn ghi đè.

### `support_ticket_messages`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `ticket_id` | UUID NOT NULL → `support_tickets(id)` ON DELETE CASCADE | |
| `author_id` | UUID NOT NULL → `profiles(id)` ON DELETE CASCADE | |
| `is_staff` | BOOLEAN NOT NULL DEFAULT false | do trigger set, không tin client |
| `body` | TEXT NOT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT `now()` | |

Index: `(ticket_id, created_at)` để dựng thread; `(user_id, created_at DESC)`
trên `support_tickets` cho danh sách của học viên.

## RLS

Bật RLS trên cả hai bảng.

**`support_tickets`**

- `own read` — SELECT `USING (user_id = auth.uid())`
- `own insert` — INSERT `WITH CHECK (user_id = auth.uid() AND status = 'pending')`
- `admin all` — ALL cho `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'`

Học viên **không có UPDATE policy**: không tự đổi trạng thái hay sửa tiêu đề
được. Trạng thái chỉ đổi bởi admin hoặc trigger.

**`support_ticket_messages`**

- `own read` — SELECT nếu là chủ ticket (EXISTS trên `support_tickets`)
- `own insert` — INSERT nếu `author_id = auth.uid()` và là chủ ticket
- `admin all` — ALL cho admin

Không có UPDATE/DELETE cho học viên: tin nhắn đã gửi không sửa/xóa được.

`notifications` giữ nguyên schema và giữ nguyên nguyên tắc **không có INSERT
policy** — mọi thông báo do trigger `SECURITY DEFINER` tạo.

## Tạo ticket: hàm RPC `create_support_ticket`

Modal tạo ticket có ba trường (tiêu đề, chủ đề, mô tả chi tiết), trong đó phần
mô tả chính là **tin nhắn đầu tiên** của thread. PostgREST không cho client chạy
nhiều lệnh trong một transaction, nên nếu client insert ticket rồi insert tin
nhắn thành hai lượt, mạng rớt giữa chừng sẽ sinh ra ticket không có nội dung —
admin thấy tiêu đề mà không biết học viên gặp chuyện gì.

```
create_support_ticket(p_title TEXT, p_topic TEXT, p_body TEXT) RETURNS support_tickets
```

Insert cả ticket lẫn tin nhắn đầu trong cùng một transaction, client gọi một
lượt qua `supabase.rpc()`.

Hàm **không nhận user id làm tham số** — lấy `auth.uid()` bên trong cho cả
`support_tickets.user_id` lẫn `support_ticket_messages.author_id`, để không có
đường nào truyền vào id người khác.

Hàm để **`SECURITY INVOKER`** (mặc định), không phải `SECURITY DEFINER`: nó chạy
dưới quyền người gọi nên vẫn chịu đúng các policy RLS đã mô tả ở trên, không
phát sinh đường phân quyền mới cần soát riêng. Đây vẫn là PostgREST, không phải
Edge Function, nên không lệch hướng đã chốt.

Trigger set `is_staff` vẫn chạy bình thường bên trong RPC: học viên gọi thì tin
nhắn đầu là `is_staff = false`. Trường hợp một admin tự mở ticket cho chính mình
sẽ ra `is_staff = true` ngay ở tin nhắn đầu — không có luồng UI nào làm việc đó,
chấp nhận.

Các lượt trao đổi tiếp theo (học viên nhắn thêm, admin trả lời) vẫn insert thẳng
vào `support_ticket_messages` qua PostgREST bình thường, không cần RPC.

## Trigger

Tất cả đều `SECURITY DEFINER SET search_path = public`, theo khuôn
`notify_writing_*`.

Khi đọc role trong trigger, dùng đúng dạng repo đang dùng ở
`restrict_unlocked_levels_to_admin`:
`((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'`.

**Trên `support_tickets`**

1. **`BEFORE INSERT`** — luôn ghi đè `NEW.code := 'SD-' || nextval('support_ticket_code_seq')`,
   không tin giá trị client gửi. Cùng khuôn "ghi đè im lặng" của
   `restrict_unlocked_levels_to_admin`.

2. **`BEFORE INSERT`** — chặn nếu người dùng đã có `>= 5` ticket ở trạng thái
   `pending` hoặc `processing`, bằng `RAISE EXCEPTION ... USING ERRCODE =
   'check_violation'`. Cùng khuôn `enforce_writing_attempt_limit` (cap 6 lần nộp
   bài viết) đã có trong repo. Ticket đã `resolved` không tính, nên người dùng
   thật không bao giờ chạm trần. Màn học viên bắt lỗi này và hiện thông báo qua
   `showToast()` thay vì để văng lỗi thô.

3. **`BEFORE UPDATE`** — `NEW.updated_at := now()`. Không có trigger này thì
   admin bấm "Bắt đầu xử lý" (UPDATE `status`) sẽ không đổi `updated_at`, trong
   khi cả hai màn đều hiển thị hàng "Cập nhật".

4. **`AFTER INSERT`** — notification broadcast `support_ticket_created` cho admin.

**Trên `support_ticket_messages`**

5. **`BEFORE INSERT`** — set `NEW.is_staff` từ role trong JWT. Bắt buộc phải ở
   server: nếu để client khai, học viên gửi được tin nhắn giả danh support.

6. **`AFTER INSERT`** —
   - `is_staff = true`: đặt ticket `status = 'resolved'`, tạo notification
     `support_replied` cho `ticket.user_id`.
   - `is_staff = false`: nếu ticket đang `resolved` thì chuyển về `'processing'`
     (mở lại), tạo notification broadcast `support_message` cho admin — **trừ
     tin nhắn đầu tiên của ticket**, vì tin đó đã có `support_ticket_created`.
     Không loại trừ thì tạo một ticket sinh hai thông báo cho cùng một việc.
   - Cả hai nhánh: `UPDATE support_tickets SET updated_at = now()`, việc này
     kích hoạt luôn trigger 3.

Admin bấm "Bắt đầu xử lý" hoặc đổi ô select là UPDATE trực tiếp, `admin all`
policy cho phép.

**Đã chốt:** admin nhắn là ticket thành `resolved` (đúng nút "Gửi phản hồi &
hoàn tất" trong mockup). Hệ quả đã biết và chấp nhận: admin nhắn để hỏi thêm
thông tin cũng đánh dấu xong, phải đổi tay lại bằng ô select bên phải.

**Đã kiểm chứng:** mọi tài khoản (kể cả admin tạo qua `admin-create-user`) đều
có sẵn row `profiles` nhờ trigger `on_auth_user_created` trong
`20260624000001_initial_schema.sql`, nên khoá ngoại `author_id → profiles(id)`
không vỡ khi admin trả lời.

**Đã cân nhắc và chấp nhận:** học viên nhắn n lần thì admin nhận n thông báo
broadcast — đúng như hành vi `writing_submitted` hiện tại, không gom nhóm.

## Thông báo

Thêm ba giá trị `type`: `support_ticket_created`, `support_message`,
`support_replied`. Không thêm cột vào `notifications`.

Phải nối **cả hai phía**, không chỉ admin:

- `handleNotificationNavigate` trong `src/pages/admin/AdminApp.tsx` — hiện chỉ
  xử lý `writing_submitted`; thêm nhánh `support_*` → `setSection("support")`.
- `handleNotificationNavigate` trong `src/App.tsx` — hiện chỉ xử lý
  `writing_graded`; thêm nhánh `support_replied` → `setCurrentPage("help")`.
  Chuông phía học viên có thật (`NotificationBell` nằm trong `Navbar`), nếu bỏ
  qua thì học viên bấm vào thông báo "đã có phản hồi" sẽ không có gì xảy ra.

Hệ quả: bấm vào thông báo mở **màn Hỗ trợ**, chưa nhảy thẳng vào đúng ticket —
giống `writing_submitted` hiện chỉ mở section Chấm bài viết. Thêm `ticket_id`
vào `notifications` sẽ làm được, nhưng đó là sửa bảng đang chạy cho một tiện
ích nhỏ, để sau.

## Giao diện

### Học viên — `src/pages/SupportPage.tsx` (mới)

Thay `<ComingSoonPage title="Trợ giúp học tập" />` trong `src/App.tsx`. Route
`/help` và sidebar đã trỏ sẵn, không sửa `router.ts`.

Theo `docs/mockups/support-user-mockup.html`: banner navy + nút "Tạo ticket
mới", danh sách ticket của mình, card "Bạn cần hỗ trợ gì?", chú giải trạng
thái; modal tạo ticket ba trường (tiêu đề, chủ đề, mô tả) có validate; màn chi
tiết hiển thị thread.

**Lệch mockup có chủ ý:** thêm **ô nhắn tiếp** ở cuối thread, vì đã chốt hội
thoại nhiều lượt còn mockup mới chỉ vẽ thread đọc. Dùng lại style ô reply bên
admin nhưng tông đỏ.

### Admin — `src/pages/admin/AdminSupportSection.tsx` (mới)

Theo `docs/mockups/support-admin-mockup.html`: tiêu đề "Hỗ trợ (n)" + ô tìm
kiếm, ba thẻ số liệu, thanh lọc, bảng ticket (mã `font-mono`, pill trạng thái),
phân trang. Màn chi tiết: thread + ô phản hồi + panel thông tin học viên/ticket
+ select cập nhật trạng thái.

Thêm `"support"` vào type `AdminSection` và `NAV_ITEMS` trong
`src/pages/admin/AdminPage.tsx`; thêm nhánh `support_*` vào
`handleNotificationNavigate` trong `src/pages/admin/AdminApp.tsx`.

### Sửa kèm: bỏ `as any` trên đường điều hướng tới `help`

`src/components/Navigation.tsx` gọi `onNavigate(link.id as any)` vì union type
của `Sidebar.onNavigate` (và `Navbar.onNavigate`) không có `"help"`/`"packages"`
trong khi mảng `links` lại có. CLAUDE.md cấm dùng `any`.

Trước đây `help` chỉ dẫn tới `ComingSoonPage` nên không ai để ý. Feature này
biến nó thành đích thật, và `handleNotificationNavigate` cũng phải điều hướng
được tới đó — nên nới union về `AppPage` (đã export sẵn từ `src/lib/router.ts`)
rồi bỏ ép kiểu. Đây là sửa đúng đường mà feature đi qua, không phải refactor
lạc đề.

### Hình dạng dữ liệu mỗi màn query

**Danh sách admin** — một query, nhúng profiles theo FK:

```
.from("support_tickets")
.select("id, code, title, topic, status, created_at, updated_at, profiles(email, full_name)")
.order("created_at", { ascending: false })
```

Nhúng thường, **không dùng `!inner`**, và khai kiểu `profiles` là **nullable**
phía client — đúng như `AdminWritingSection` đang làm với
`profiles(email, full_name)`. Đã kiểm chứng admin đọc được mọi row `profiles`
nhờ policy `profiles: own read` được nới cho admin ở
`20260629000004_admin_role.sql`, nên tên/email không bị rỗng.

**Danh sách học viên** — không nhúng `profiles` (chỉ ticket của chính mình):
`select("id, code, title, topic, status, created_at")`.

**Thread** — `support_ticket_messages` lọc theo `ticket_id`, `order("created_at")`
tăng dần.

### Sau mỗi thao tác ghi phải tải lại, không vá tại chỗ

Trạng thái ticket do **trigger phía server** quyết định, client không suy ra
được: admin gửi phản hồi thì ticket thành `resolved`, học viên nhắn vào ticket
`resolved` thì nó bật lại `processing`. Nếu chỉ nối thêm tin nhắn vào mảng
trong bộ nhớ, badge trạng thái trên màn hình sẽ nói sai.

Vì vậy mọi thao tác ghi (tạo ticket, gửi tin nhắn, đổi trạng thái) đều tải lại
ticket + thread sau khi ghi xong, theo đúng khuôn `fetchRows()` mà
`AdminWritingSection` dùng sau khi chấm điểm.

Không dùng Supabase Realtime. Người dùng tự tải lại hoặc mở lại ticket là đủ cho
luồng hỗ trợ này.

### Ba thẻ số liệu bên admin

Suy ra từ chính danh sách đã tải, **không query đếm riêng**: đang chờ =
`status === 'pending'`, đang xử lý = `status === 'processing'`, đã xử lý trong
tuần = `status === 'resolved'` và `updated_at` trong 7 ngày gần nhất.

### Danh sách, lọc và phân trang bên admin

Làm client-side y như `AdminUsersSection`: tải danh sách rồi lọc/phân trang
trong bộ nhớ, `PAGE_SIZE = 15`.

`ponytail:` cách này — và cả ba thẻ số liệu ở trên — chỉ ổn khi số ticket còn
nhỏ, vì đều dựa trên việc tải hết danh sách về máy. Khi inbox phình lên thì
chuyển sang `.range()` cộng ba query `count` riêng. Chấp nhận trần này để bám
đúng pattern `AdminUsersSection`/`AdminWritingSection` đang có thay vì dựng sẵn
thứ chưa ai cần.

### Dùng lại component sẵn có

Cả hai màn dùng `Button` từ `src/components/DesignSystem.tsx` và `showToast()`
từ `src/lib/toast.ts` — không dựng lại nút/toast như trong file HTML mockup.
Không dùng `window.alert()`/`window.confirm()`.

## Files đụng tới

| File | Việc |
|---|---|
| `supabase/migrations/2026…_support_tickets.sql` | mới — 2 bảng, sequence, RLS, 6 trigger, hàm `create_support_ticket` |
| `src/lib/appTypes.ts` | thêm `SupportTicket`, `SupportTicketMessage`, `SupportTicketStatus`, danh sách chủ đề |
| `src/pages/SupportPage.tsx` | mới |
| `src/pages/admin/AdminSupportSection.tsx` | mới |
| `src/App.tsx` | thay `ComingSoonPage` ở nhánh `help`; thêm `support_replied` vào `handleNotificationNavigate` |
| `src/pages/admin/AdminPage.tsx` | thêm section + nav item |
| `src/pages/admin/AdminApp.tsx` | điều hướng notification |
| `src/components/Navigation.tsx` | nới union `onNavigate` về `AppPage`, bỏ `as any` |
| `src/lib/database.types.ts` | `npm run gen:types` (không sửa tay) |

## Kiểm chứng

`package.json` chưa có script `test`, nhưng repo **chạy test được**: các file
test sẵn có viết cho `node:test` và Node v26 tự bóc kiểu TypeScript. Đã kiểm
chứng: `node --test` chạy được file `.ts`, nhưng **hỏng với `.tsx`**
(`ERR_UNKNOWN_FILE_EXTENSION` — Node không xử lý JSX), nên các file
`*.test.tsx` hiện có đang không chạy được.

Vì vậy logic thuần của tính năng này tách ra `src/lib/supportMappers.ts` (chỉ
`import type`) để có test tự động thật, còn phần còn lại kiểm chứng thủ công:

1. `npm run lint` — không lỗi type.
2. `npm run dev`, test tay đủ vòng: tạo ticket → hiện ở màn admin → admin trả
   lời → học viên thấy phản hồi và trạng thái đổi → học viên nhắn tiếp → ticket
   mở lại `processing`.
3. Hai bất biến do server giữ, phải thử bằng cách gọi thẳng PostgREST chứ
   không qua UI: gửi ticket kèm `code` bịa (phải bị ghi đè) và gửi tin nhắn kèm
   `is_staff: true` từ tài khoản học viên (phải bị ép về `false`).
4. Trần 5 ticket đang mở: tạo liên tiếp tới khi bị chặn, xác nhận màn học viên
   hiện toast chứ không văng lỗi thô.
5. Bấm thông báo ở **cả hai phía**: chuông admin mở section Hỗ trợ, chuông học
   viên mở màn `/help`.
6. Badge trạng thái sau khi ghi: admin gửi phản hồi xong, badge trên **màn học
   viên** (tải lại) phải là "Đã xử lý"; học viên nhắn tiếp xong, badge trên màn
   admin phải quay về "Đang xử lý". Đây là phép thử cho quy tắc "tải lại, không
   vá tại chỗ".
7. RLS: cần hai tài khoản (một thường, một admin) để xác nhận học viên A không
   đọc được ticket của học viên B. Nếu chưa có tài khoản test thứ hai, phải báo
   rõ là chưa kiểm chứng được, không được coi là xong.

Nếu Supabase local chưa chạy được `npm run gen:types` thì dừng ở đó và báo,
không sửa tay `database.types.ts`.
