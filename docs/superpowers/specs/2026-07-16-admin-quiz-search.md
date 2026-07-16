# Tìm kiếm bài học trong "Quản lý bài tập" (Admin)

## Bối cảnh

Trang `AdminQuizSection.tsx` (Quản lý bài tập) liệt kê tất cả bài học dưới dạng danh sách nhóm có thể mở rộng (mỗi nhóm = 1 bài học, chứa các câu hỏi thuộc category tab đang chọn). Khi số lượng bài học lớn, việc tìm 1 bài cụ thể để thêm/sửa câu hỏi khá bất tiện vì phải cuộn thủ công.

## Quyết định thiết kế đã chốt

- Thêm 1 ô tìm kiếm ở đầu trang, cùng vị trí/style với ô "Tìm kiếm..." đã có sẵn ở `AdminUsersSection.tsx` (search icon bên trái, input bo góc, focus ring cam).
- Lọc theo **tên bài học** (`lesson_title`) hoặc **tên module** (`module_title`), không phân biệt hoa/thường, so khớp kiểu "chứa chuỗi con" (giống `.includes()` đã dùng ở trang Người dùng).
- Chỉ lọc DANH SÁCH NHÓM BÀI HỌC hiển thị — không đụng vào nội dung câu hỏi bên trong từng nhóm, không lọc theo category tab hiện có (`activeTab` giữ nguyên hành vi).
- Không gọi lại API khi gõ tìm kiếm — lọc client-side trên `groups` đã fetch sẵn.
- Không thêm quyền hạn/route/migration mới.

## Ngoài phạm vi

- Không tìm trong nội dung câu hỏi/đáp án.
- Không thêm debounce (danh sách bài học nhỏ, lọc client-side tức thời là đủ).
- Không đổi cấu trúc category tab hay modal thêm/sửa câu hỏi.

## Testing / verification

- `npm run lint` pass.
- Test browser thủ công (mock data): gõ từ khóa khớp 1 phần tên bài học → chỉ nhóm khớp còn hiển thị; gõ từ khóa khớp tên module → các bài thuộc module đó hiển thị; xóa từ khóa → toàn bộ danh sách trở lại; gõ từ khóa không khớp gì → hiển thị thông báo rỗng hợp lý (không phải danh sách trống trơn gây hiểu lầm là lỗi).
