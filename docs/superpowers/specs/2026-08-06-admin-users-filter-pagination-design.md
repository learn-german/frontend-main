# Admin Users — filter theo cột + phân trang

## Bối cảnh

`AdminUsersSection.tsx` (trang Admin > Người dùng) hiện chỉ có 1 ô tìm kiếm chung (khớp email/họ tên) và hiện toàn bộ user trong 1 bảng không phân trang. Roadmap (`requirement.md`) yêu cầu thêm filter riêng theo cột Role, Cấp độ mở, Ngày tạo. Trong lúc làm, người dùng yêu cầu thêm luôn phân trang (15 user/trang) vì 2 việc cùng đụng vào `filtered`/bảng hiển thị.

Dữ liệu hiện tải toàn bộ 1 lần (`fetchUsers()` — 1 query `profiles`, không phân trang ở tầng DB), lọc thuần client-side qua biến `filtered`. Filter và phân trang mới đều làm ở tầng client, giữ nguyên pattern này — không đổi cách fetch.

## Kiến trúc

### 1. Filter theo cột

Thêm 3 state mới trong `AdminUsersSection`:
```ts
const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin">("all");
const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
const [dateFrom, setDateFrom] = useState("");
const [dateTo, setDateTo] = useState("");
```

Mở rộng biến `filtered` (hiện chỉ lọc theo `search`) thành AND tất cả điều kiện đang bật:
- **Role**: `roleFilter === "all" || u.role === roleFilter`.
- **Cấp độ mở**: `levelFilter.size === 0 || u.unlockedLevels.some((l) => levelFilter.has(l))` — chọn nhiều cấp độ, khớp nếu user có ít nhất 1 trong số đó (OR) — đúng bản chất dữ liệu hiện tại (4 checkbox độc lập, không thứ bậc).
- **Ngày tạo**: so `u.created_at` (ISO timestamp) với `dateFrom`/`dateTo` (chuỗi `YYYY-MM-DD` từ `<input type="date">`) — `dateTo` cộng thêm `T23:59:59` để bao trọn ngày cuối.

UI: 1 hàng mới chèn giữa header (tiêu đề + ô tìm kiếm + nút Thêm user) và bảng — luôn hiện, không ẩn trong panel:
- Dropdown Role: "Tất cả" / "User" / "Admin".
- 4 nút toggle A1/A2/B1/B2 (bấm để bật/tắt trong `levelFilter`, style giống nút filter thường — active có nền cam).
- 2 input `type="date"` (Từ ngày / Đến ngày), native HTML, không thêm thư viện date-picker.
- Nút "Xoá bộ lọc" chỉ hiện khi có ít nhất 1 filter đang bật (role khác "all", hoặc levelFilter không rỗng, hoặc có dateFrom/dateTo), reset cả 4 state về mặc định.

### 2. Phân trang

Thêm state:
```ts
const [currentPage, setCurrentPage] = useState(1);
const PAGE_SIZE = 15;
```

Tính `totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))`, cắt `filtered` thành `paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)` — bảng render `paginated` thay vì `filtered` trực tiếp.

Reset `currentPage` về 1 bất cứ khi nào `search`/`roleFilter`/`levelFilter`/`dateFrom`/`dateTo` đổi — dùng 1 `useEffect` theo dõi cả 5 giá trị (tránh phải gọi `setCurrentPage(1)` thủ công ở từng `onChange`).

UI: thanh điều hướng bên dưới bảng — "Trang {currentPage}/{totalPages}" + nút Trước/Sau (disable khi ở trang đầu/cuối), ẩn hoàn toàn khi `totalPages <= 1`.

## Không đổi

- Không đổi cách fetch (`fetchUsers()` vẫn 1 query tải hết, không phân trang DB) — dữ liệu admin quy mô nhỏ, phân trang chỉ để đỡ dài trang, không phải để giảm tải query.
- Không đổi các modal (tạo/sửa/xoá user, xem tiến độ) — không liên quan phạm vi này.
- Không thêm npm package mới (theo CLAUDE.md) — dùng `<input type="date">` + `<select>`/button thuần.

## Testing

- Không có logic phức tạp cần tách riêng — filter/phân trang là phép lọc mảng thuần, có thể viết 1 file test cho hàm lọc nếu tách ra được hàm thuần (`filterUsers(users, {search, role, levels, dateFrom, dateTo})`), tách để dễ test độc lập với React state thay vì test qua component.
- `npm run lint` sau khi sửa.
- Xác minh thủ công trên trình duyệt (sandbox không có `.env.local` — chỉ ghi checklist): tạo/seed đủ >15 user để thấy phân trang hoạt động, thử từng filter riêng lẻ và kết hợp nhiều filter cùng lúc, xác nhận đổi filter luôn nhảy về trang 1.

## Rủi ro

- Thấp — toàn bộ thay đổi nằm trong 1 file (`AdminUsersSection.tsx`), không đụng backend/DB, không đụng component khác.
