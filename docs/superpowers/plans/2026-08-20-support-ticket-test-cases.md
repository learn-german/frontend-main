# Support Ticket — Bộ test case đầy đủ

**Spec:** `docs/superpowers/specs/2026-08-20-support-ticket-design.md`
**Kế hoạch:** `docs/superpowers/plans/2026-08-20-support-ticket.md`

## Tổng quan

| Tầng | Số case | Chạy bằng | Trạng thái |
|---|---|---|---|
| SQL — lược đồ, RLS, trigger, RPC | 47 | `npm run test:db` (pgTAP) | **Đã chạy: 47 pass** trên project Deutsch |
| TypeScript — logic thuần | 20 | `npm test` | **Đã chạy: 20 pass** |
| HTTP — bất biến qua PostgREST | 5 | `curl` thủ công | Cần Supabase local |
| Giao diện — học viên, admin, thông báo | 26 | Thao tác tay trên browser | Cần Supabase local |
| **Tổng** | **98** | | |

Hai lệnh chạy toàn bộ phần tự động:

```bash
npm test
```

```bash
npm run test:db
```

`npm test` hiện chạy **164 test sẵn có của repo**; sau khi làm Task 3 sẽ là 184.

Không cần Docker: `test:db` chạy pgTAP trên project Supabase đã link
(`supabase test db --linked`).

---

## 1. Tầng SQL — pgTAP

Ba file trong `supabase/tests/`, chạy bằng `supabase test db`. Mỗi case tự dựng
dữ liệu nền rồi `rollback`, không để lại gì.

### 1.1 `support_schema_test.sql` — 15 case

| ID | Khẳng định |
|---|---|
| DB-01 | Bảng `support_tickets` tồn tại |
| DB-02 | Bảng `support_ticket_messages` tồn tại |
| DB-03 | Sequence `support_ticket_code_seq` tồn tại |
| DB-04 | Hàm `create_support_ticket(text, text, text)` tồn tại |
| DB-05 | RLS đã bật trên `support_tickets` |
| DB-06 | RLS đã bật trên `support_ticket_messages` |
| DB-07 | `topic` ngoài 5 giá trị hợp lệ bị `CHECK` chặn |
| DB-08 | `status` ngoài 3 giá trị hợp lệ bị `CHECK` chặn |
| DB-09…DB-13 | Cả 5 `topic` hợp lệ đều được chấp nhận (một case mỗi giá trị) |
| DB-14 | `code` có dạng `SD-<số>` |
| DB-15 | Xoá ticket thì tin nhắn trong ticket bị xoá theo (`ON DELETE CASCADE`) |

### 1.2 `support_rls_test.sql` — 14 case

| ID | Khẳng định |
|---|---|
| RLS-01 | `support_tickets` có **đúng 3 policy** — chốt việc không có policy UPDATE/DELETE cho học viên |
| RLS-02 | `support_ticket_messages` có đúng 3 policy |
| RLS-03 | A đọc được ticket của chính mình |
| RLS-04 | A **không đổi được** trạng thái ticket của mình |
| RLS-05 | A **không xoá được** ticket của mình |
| RLS-06 | A không tạo được ticket đứng tên B |
| RLS-07 | A không tạo được ticket với trạng thái khác `pending` |
| RLS-08 | A tạo được ticket hợp lệ của chính mình |
| RLS-09 | A đọc được tin nhắn trong ticket của mình |
| RLS-10 | B không đọc được ticket của A |
| RLS-11 | B không đọc được tin nhắn trong ticket của A |
| RLS-12 | B không gửi được tin nhắn vào ticket của A |
| RLS-13 | A không gán được tin nhắn đứng tên B |
| RLS-14 | Admin đọc và đổi được trạng thái mọi ticket |

### 1.3 `support_triggers_test.sql` — 18 case

| ID | Khẳng định |
|---|---|
| TRG-01 | RPC sinh `code` dạng `SD-<số>` |
| TRG-02 | RPC tạo **đúng một** tin nhắn đầu |
| TRG-03 | Tin nhắn của học viên có `is_staff = false` |
| TRG-04 | Ticket mới ở trạng thái `pending` |
| TRG-05 | `code` do client gửi **bị ghi đè** |
| TRG-06 | `is_staff` do client khai **bị ép về false** |
| TRG-07 | Mỗi ticket mới sinh một thông báo broadcast cho admin |
| TRG-08 | Admin trả lời → ticket chuyển `resolved` |
| TRG-09 | Admin trả lời → học viên nhận đúng một thông báo `support_replied` |
| TRG-10 | Học viên nhắn vào ticket `resolved` → mở lại `processing` |
| TRG-11 | Mỗi tin nhắn tiếp theo của học viên sinh một thông báo `support_message` |
| TRG-12 | Nhắn vào ticket `pending` → trạng thái giữ nguyên |
| TRG-13 | Đổi trạng thái → `updated_at` được làm mới |
| TRG-14 | Có tin nhắn mới → `updated_at` được làm mới |
| TRG-15 | Ticket thứ 6 đang mở bị chặn |
| TRG-16 | Ticket đã `resolved` không tính vào trần |
| TRG-17 | Không role nào insert trực tiếp vào `notifications` được |
| TRG-18 | Tạo ticket mới **không** sinh thêm `support_message` — chống thông báo trùng |

**Về TRG-13 và TRG-14:** `now()` cố định trong suốt một transaction, nên không
thể so `updated_at` trước/sau một cách bình thường. Hai case này tắt tạm trigger
`trg_support_ticket_touch_updated_at`, đẩy `updated_at` về `2020-01-01`, bật
lại trigger rồi mới thao tác — nếu trigger không chạy thì giá trị vẫn là 2020 và
case fail.

---

## 2. Tầng TypeScript — 20 case

File `src/lib/supportMappers.test.ts` (tạo ở Task 3), chạy bằng `npm test`.
**Đã chạy thật: 20 pass, 0 fail**, và `tsc --noEmit --strict` sạch.

| ID | Khẳng định |
|---|---|
| TS-01 | `mapTicket` đổi đủ 8 trường snake_case sang camelCase |
| TS-02 | `author` là `null` khi không nhúng `profiles` |
| TS-03 | `author` là `null` khi nhúng `profiles` nhưng không có row |
| TS-04 | Lấy đúng email và tên khi có nhúng `profiles` |
| TS-05 | `author` **không** null khi có email nhưng `full_name` là null |
| TS-06 | `mapMessage` đổi đủ 6 trường |
| TS-07 | `mapMessage` giữ nguyên `is_staff = true` |
| TS-08 | `computeTicketStats` trả 0 cho danh sách rỗng |
| TS-09 | Đếm đúng từng trạng thái |
| TS-10 | Ticket `resolved` **đúng mốc** 7 ngày vẫn được tính |
| TS-11 | Ticket `resolved` sớm hơn mốc **1 mili-giây** thì không tính |
| TS-12 | Ticket `pending`/`processing` cũ không lọt vào thẻ "trong tuần", nhưng vẫn đếm ở thẻ của nó |
| TS-13 | `filterTickets` không lọc gì khi từ khoá rỗng và trạng thái `all` |
| TS-14 | Khớp mã ticket không phân biệt hoa thường |
| TS-15 | Khớp tiêu đề tiếng Việt có dấu, không phân biệt hoa thường |
| TS-16 | Bỏ khoảng trắng thừa quanh từ khoá |
| TS-17 | Trả mảng rỗng khi không khớp gì |
| TS-18 | Lọc theo từng trạng thái |
| TS-19 | Áp đồng thời cả từ khoá lẫn trạng thái |
| TS-20 | Không sửa mảng gốc |

TS-10 và TS-11 là cặp quan trọng nhất: chúng khóa hành vi ở đúng ranh giới, chỗ
mà lỗi lệch dấu `>` / `>=` sẽ lọt qua mọi test khác.

---

## 3. Tầng HTTP — 5 case thủ công

pgTAP chạy **bên trong** Postgres nên không đi qua PostgREST. Muốn biết client
thật có gửi lọt `code` hay `is_staff` qua HTTP hay không thì phải gọi HTTP thật.
Đây cũng là hai bất biến mà **giao diện không bao giờ chạm tới được**, vì giao
diện không gửi hai cột đó.

Lấy access token (DevTools Console, sau khi đăng nhập):

```js
const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
copy(JSON.parse(localStorage.getItem(key)).access_token);
```

| ID | Thao tác | Kỳ vọng |
|---|---|---|
| API-01 | `POST /rest/v1/support_tickets` kèm `"code":"SD-0001"` | Trả về `code` khác `SD-0001` |
| API-02 | `POST /rest/v1/support_ticket_messages` kèm `"is_staff":true` | Trả về `"is_staff": false` |
| API-03 | `POST /rest/v1/support_ticket_messages` kèm `author_id` của người khác | HTTP 403 |
| API-04 | `GET /rest/v1/support_tickets` bằng token của học viên thứ hai | Không có ticket của học viên thứ nhất |
| API-05 | `POST /rest/v1/rpc/create_support_ticket` chỉ với `apikey`, không có `Authorization` | Lỗi, không tạo được ticket |

API-02 là case nghiêm trọng nhất: nếu trả về `true`, học viên gửi được tin nhắn
hiển thị như phản hồi chính thức của đội ngũ hỗ trợ.

---

## 4. Tầng giao diện — 26 case thủ công

### 4.1 Màn học viên — 10 case

| ID | Thao tác | Kỳ vọng |
|---|---|---|
| UI-U-01 | Vào `/help` khi chưa có ticket nào | Hiện "Bạn chưa gửi yêu cầu hỗ trợ nào.", không phải bảng trống |
| UI-U-02 | Mở modal, bấm gửi khi cả ba trường trống | Ba dòng lỗi đỏ, modal **không** đóng |
| UI-U-03 | Điền tiêu đề và chủ đề, bỏ trống mô tả, bấm gửi | Chỉ trường mô tả báo lỗi |
| UI-U-04 | Điền đủ ba trường, bấm gửi | Modal đóng, toast "Đã gửi yêu cầu hỗ trợ.", ticket ở đầu danh sách, badge "Đang chờ xử lý", mã dạng `SD-1000` |
| UI-U-05 | Mở ticket vừa tạo | Thread hiện đúng nội dung mô tả đã nhập |
| UI-U-06 | Nhắn thêm một tin | Tin xuất hiện trong thread, ô nhập trống lại |
| UI-U-07 | Bấm "Quay lại danh sách" | Về danh sách, ticket vẫn còn |
| UI-U-08 | Sau khi admin trả lời, tải lại `/help` | Badge là "Đã xử lý", thread có bong bóng phản hồi căn phải |
| UI-U-09 | Nhắn tiếp vào ticket đã "Đã xử lý" | Badge đổi về "Đang xử lý" |
| UI-U-10 | Tạo ticket thứ 6 khi đang có 5 ticket mở | Toast báo có quá nhiều yêu cầu chưa xử lý, **không** văng lỗi thô ra màn hình |

### 4.2 Màn admin — 12 case

| ID | Thao tác | Kỳ vọng |
|---|---|---|
| UI-A-01 | Đăng nhập `/admin` | Sidebar có mục "Hỗ trợ" |
| UI-A-02 | Mở mục "Hỗ trợ" | Bảng hiện ticket; cột "Học viên" có tên hoặc email, **không rỗng** |
| UI-A-03 | Đối chiếu ba thẻ số liệu với bảng | Số khớp với số dòng từng trạng thái |
| UI-A-04 | Chọn trạng thái "Đang chờ xử lý" ở bộ lọc | Chỉ còn ticket đang chờ; tiêu đề "Hỗ trợ (n)" đổi theo |
| UI-A-05 | Gõ mã ticket vào ô tìm kiếm | Chỉ còn đúng ticket đó |
| UI-A-06 | Gõ một phần tiêu đề, chữ thường không dấu đúng | Ticket tương ứng vẫn hiện |
| UI-A-07 | Khi có hơn 15 ticket | Phân trang xuất hiện, trang 1 có đúng 15 dòng |
| UI-A-08 | Bấm vào một dòng | Mở chi tiết: thread bên trái, panel thông tin học viên và ticket bên phải |
| UI-A-09 | Bấm "Bắt đầu xử lý" | Pill đổi sang "Đang xử lý" màu hổ phách, có toast |
| UI-A-10 | Gõ phản hồi, bấm "Gửi phản hồi & hoàn tất" | Bong bóng cam xuất hiện, pill đổi "Đã xử lý", ô nhập trống, có toast |
| UI-A-11 | Đổi trạng thái bằng ô select bên phải | Pill đổi theo lựa chọn |
| UI-A-12 | Bấm "Quay lại danh sách ticket" | Về bảng, trạng thái vừa đổi đã phản ánh đúng |

### 4.3 Thông báo — 4 case

Cần hai cửa sổ: một đăng nhập học viên, một đăng nhập admin (dùng cửa sổ ẩn danh).

| ID | Thao tác | Kỳ vọng |
|---|---|---|
| UI-N-01 | Học viên tạo ticket mới | Chuông **admin** hiện "Có ticket hỗ trợ mới: …" |
| UI-N-02 | Bấm vào thông báo đó | Nhảy đúng mục "Hỗ trợ" |
| UI-N-03 | Admin gửi phản hồi | Chuông **học viên** hiện "Ticket SD-… đã có phản hồi…" |
| UI-N-04 | Bấm vào thông báo đó | Nhảy đúng màn `/help` |

UI-N-03 và UI-N-04 là cặp dễ bị bỏ sót nhất: `handleNotificationNavigate` phía
học viên trong `src/App.tsx` ban đầu chỉ xử lý `writing_graded`, thiếu nhánh
`support_replied` thì bấm vào thông báo sẽ không có gì xảy ra.

---

## 5. Bảng đối chiếu với spec

Mỗi yêu cầu trong spec ứng với ít nhất một case.

| Yêu cầu trong spec | Case |
|---|---|
| Hai bảng, sequence, index | DB-01, DB-02, DB-03 |
| `topic` giới hạn 5 giá trị | DB-07, DB-09…DB-13 |
| `status` giới hạn 3 giá trị | DB-08 |
| `code` do server sinh, không dùng `DEFAULT` | DB-14, TRG-01, TRG-05, API-01 |
| Xoá ticket kéo theo tin nhắn | DB-15 |
| RLS bật trên cả hai bảng | DB-05, DB-06 |
| Học viên chỉ đọc ticket của mình | RLS-03, RLS-10, API-04, UI-U-01 |
| Học viên không có policy UPDATE/DELETE | RLS-01, RLS-04, RLS-05 |
| Học viên chỉ tạo ticket của mình, luôn `pending` | RLS-06, RLS-07, RLS-08, TRG-04 |
| Học viên chỉ đọc/gửi tin trong ticket của mình | RLS-09, RLS-11, RLS-12 |
| Không giả mạo được tác giả tin nhắn | RLS-13, API-03 |
| Admin toàn quyền | RLS-14, UI-A-02 |
| `is_staff` do server quyết | TRG-03, TRG-06, API-02 |
| RPC tạo ticket + tin nhắn đầu nguyên tử | TRG-01, TRG-02, DB-04 |
| RPC dùng `auth.uid()`, `SECURITY INVOKER` | RLS-06, API-05 |
| Admin trả lời → `resolved` | TRG-08, UI-A-10, UI-U-08 |
| Học viên nhắn vào `resolved` → mở lại | TRG-10, UI-U-09 |
| Nhắn vào `pending` → giữ nguyên | TRG-12 |
| `updated_at` làm mới ở mọi đường ghi | TRG-13, TRG-14 |
| Ba loại thông báo | TRG-07, TRG-09, TRG-11 |
| Không ai ghi thẳng vào `notifications` | TRG-17 |
| Trần 5 ticket đang mở | TRG-15, TRG-16, UI-U-10 |
| Nhúng `profiles` nullable, không `!inner` | TS-02, TS-03, TS-04, TS-05, UI-A-02 |
| Ba thẻ số liệu suy từ danh sách đã tải | TS-08…TS-12, UI-A-03 |
| Lọc và phân trang client-side | TS-13…TS-20, UI-A-04…UI-A-07 |
| Ghi xong phải tải lại, không vá tại chỗ | UI-U-08, UI-U-09, UI-A-09, UI-A-12 |
| Nối thông báo cả hai phía | UI-N-01…UI-N-04 |
| Modal có validate ba trường | UI-U-02, UI-U-03, UI-U-04 |
| Dùng `showToast()`, không `window.alert()` | UI-U-04, UI-U-10, UI-A-09 |

---

## 6. Đã kiểm chứng tới đâu

- **47 case pgTAP: đã chạy thật, 47 pass.** Cách chạy: ghép DDL của cả hai
  migration với toàn bộ test thành một transaction kết thúc bằng `rollback`, gửi
  tới project Deutsch. Cơ sở dữ liệu không đổi một dòng nào.

  Lượt chạy đầu ra **45/46**: case TRG-11 fail vì tin nhắn đầu do RPC tạo cũng
  kích hoạt thông báo `support_message`, nghĩa là tạo một ticket thì admin nhận
  hai thông báo cho cùng một việc. Đó là lỗi thiết kế thật, đã sửa trigger và
  thêm TRG-18 để chốt lại. Đọc bằng mắt bốn vòng review không ra lỗi này.

- **20 case TypeScript: đã chạy thật, 20 pass**, cộng `tsc --noEmit --strict`
  sạch. Chạy trên bản trích ra thư mục tạm vì `src/lib/supportMappers.ts` được
  tạo ở Task 3.

- **5 case HTTP và 26 case giao diện: chưa chạy.** Chúng cần app chạy thật cùng
  tài khoản đăng nhập, nên chỉ làm được trong lúc triển khai Task 5–8.

Tóm lại: **67 trong 98 case đã được chứng minh chạy đúng**; phần còn lại là
những case buộc phải thao tác qua giao diện hoặc HTTP.
