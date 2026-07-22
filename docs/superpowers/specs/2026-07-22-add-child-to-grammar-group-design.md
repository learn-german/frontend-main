# Thêm câu con vào câu lớn hiện có

Ngày: 2026-07-22

## Bối cảnh

PR #60 chuyển bài tập ngữ pháp sang cấu trúc câu lớn–câu con dựa trên `group_id`. Admin có thể tạo một nhóm mới với nhiều câu con, nhưng sau khi lưu chưa có thao tác thêm câu con vào đúng câu lớn đã tồn tại.

## Mục tiêu

- Thêm nút `Thêm câu con` trên header từng câu lớn trong admin.
- Tái sử dụng modal và validation tạo bài tập hiện có.
- Khóa loại bài theo câu lớn, lưu câu mới vào đúng nhóm và đặt ở cuối nhóm.
- Cho phép thêm một hoặc nhiều câu con trong cùng lần lưu, không giới hạn số lượng.
- Hỗ trợ dữ liệu cũ có `group_id = null` mà không tạo nhóm hiển thị mới ngoài ý muốn.

## Thiết kế

### Nút hành động

- Header câu lớn trong `ExerciseGroupList` nhận callback `onAddChildren(group, groupIndex)`.
- Hiển thị nút `Thêm câu con` cạnh số lượng câu con.
- Nút dừng propagation để không mở/đóng accordion, không kích hoạt checkbox và không bắt đầu kéo thả.
- Nút bị disable trong lúc lesson đang lưu reorder.

### Chế độ modal

Modal có ba chế độ rõ ràng:

1. `create-group`: tạo câu lớn mới như hiện tại.
2. `append-children`: thêm câu con vào câu lớn hiện có.
3. `edit`: sửa một câu con hiện có.

Khi mở `append-children`:

- Tiêu đề là `Thêm câu con vào Câu N`.
- `type` lấy từ nhóm và select loại bài bị disable.
- Form khởi tạo một entry rỗng; nút `Thêm câu cùng loại` tiếp tục cho phép append không giới hạn entry.
- Không hiển thị trạng thái publish ở cấp nhóm; câu mới giữ mặc định `draft` như luồng tạo mới.
- Hủy modal không thay đổi nhóm.

### Group ID

- Nhóm có `group_id`: insert các câu mới với đúng ID này.
- Nhóm legacy có `group_id = null`: khi admin bấm thêm câu con, tạo một UUID mới. Trước khi insert, update câu legacy hiện có từ null sang UUID mới; sau đó insert các câu mới cùng UUID.
- Nếu update legacy thất bại, không insert câu mới và giữ modal mở.
- Nếu update legacy thành công nhưng insert thất bại, rollback câu legacy về `group_id = null`. Nếu rollback cũng thất bại, refetch dữ liệu và hiển thị lỗi nêu rõ nhóm cần được kiểm tra lại.

### Thứ tự

- Khi mở modal, lấy `max(order_index)` của toàn bài học cộng một làm `appendStartOrder`.
- Các câu mới nhận `order_index = appendStartOrder + entryIndex`.
- Mặc dù giá trị DB nằm sau toàn bộ lesson, tiện ích gom nhóm vẫn đặt câu vào đúng nhóm theo `group_id`; bên trong nhóm, các câu mới đứng cuối vì có order lớn nhất.
- Số trình bày được suy ra lại từ vị trí: nhóm có `2.1`, `2.2` sẽ hiển thị câu mới thành `2.3` mà không lưu chuỗi số vào DB.
- Lần kéo thả câu lớn tiếp theo tiếp tục chuẩn hóa toàn bộ `order_index` thành dãy liên tiếp.

### Lưu dữ liệu

- `handleSave` phân nhánh theo modal mode thay vì chỉ dựa vào `editId`.
- `create-group` tạo UUID mới như PR #60.
- `append-children` dùng group ID hiện có hoặc ID vừa gán cho legacy group.
- `edit` chỉ update bản ghi đang sửa và giữ nguyên `group_id`/`order_index`.
- Thành công: toast `Đã thêm N câu con.`, đóng modal và refetch.
- Thất bại: toast cảnh báo, modal và dữ liệu nhập giữ nguyên.

## Đơn vị kiểm thử

Tách quyết định group ID thành hàm thuần để kiểm tra mà không gọi Supabase:

- `resolveAppendGroupId(groupId, createId)` trả group ID hiện có và không gọi `createId`.
- Với `groupId = null`, hàm gọi `createId` đúng một lần và trả UUID mới.
- Câu mới được append theo thứ tự entry và số UI tự tăng ở cuối nhóm.

Xác minh UI/Supabase:

- Nút nằm đúng header và không toggle accordion khi bấm.
- Modal khóa đúng loại bài và cho thêm nhiều entry.
- Nhóm thường insert đúng `group_id`.
- Nhóm legacy được gán UUID rồi nhận câu mới; lỗi insert rollback về null.
- Sau refetch, câu mới xuất hiện ở cuối nhóm và số `N.x` liên tục.
- `npm run lint` và `npm run build` exit 0.

## Phạm vi PR

- PR mới được tạo từ nhánh `codex/hierarchical-grammar-groups` và target nhánh đó, vì phụ thuộc vào PR #60.
- Không thay đổi màn hình học viên, schema DB, Edge Function chấm điểm hoặc hành vi kéo thả.
