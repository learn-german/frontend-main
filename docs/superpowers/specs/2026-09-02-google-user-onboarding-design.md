# Google User Onboarding Design

## Mục tiêu

Sau khi đăng nhập bằng Google, hệ thống phân biệt user đã hoàn tất hồ sơ và user mới bằng `profiles.full_name`:

- User có `full_name` tiếp tục vào ứng dụng.
- User chưa có `full_name` phải nhập tên hiển thị trước khi sử dụng ứng dụng.
- User cũ có `full_name` trống được điền một lần từ tên Google, không ghi đè tên đã tồn tại.

Google vẫn là phương thức đăng nhập duy nhất.

## Quyết định thiết kế

Không thêm cột `onboarding_completed`. `profiles.full_name` là trường bắt buộc về mặt luồng ứng dụng và đồng thời biểu diễn trạng thái onboarding:

- `NULL` hoặc chuỗi trắng: chưa hoàn tất.
- Chuỗi hợp lệ: đã hoàn tất.

Cách này tránh thêm state trùng lặp và không tạo tình huống `onboarding_completed = true` nhưng tên lại trống.

## Thay đổi database

Tạo một migration mới với hai thay đổi theo đúng thứ tự:

1. Backfill user cũ có `profiles.full_name` đang `NULL` hoặc chỉ chứa khoảng trắng. Nguồn tên lấy từ `auth.users.raw_user_meta_data` theo thứ tự:
   - `full_name`
   - `name`
   - `email`

   Giá trị được trim trước khi ghi. Migration không ghi đè `profiles.full_name` đã có nội dung.

2. Thay `handle_new_user()` để các user tạo sau migration nhận:
   - `profiles.id = auth.users.id`
   - `profiles.email = auth.users.email`
   - `profiles.full_name = NULL`
   - một hàng `user_stats` như hiện tại

Trigger vẫn chạy ở database để profile và stats được tạo nguyên tử cùng user Auth. Không đưa service-role key vào client.

Migration phải giữ nguyên các biện pháp bảo vệ hiện có của `handle_new_user()`, gồm `SECURITY DEFINER`, `SET search_path = public` và việc thu hồi quyền gọi trực tiếp khỏi `PUBLIC`.

## Luồng ứng dụng sau OAuth

`App` không xây dựng tên hiển thị từ `session.user.user_metadata` nữa. Sau khi Supabase khôi phục session hoặc phát sự kiện đăng nhập:

1. Đọc hàng `profiles` của `session.user.id` bằng quyền của chính user.
2. Nếu profile có `full_name` hợp lệ, tạo app user từ `profiles.full_name` và tiếp tục điều hướng hiện tại.
3. Nếu profile có `full_name` trống, giữ session nhưng hiển thị trang hoàn tất đăng ký.
4. Nếu profile bị thiếu bất thường, client thử `upsert` hàng của chính user với `id`, `email` và `full_name = NULL`, sau đó hiển thị onboarding. RLS phải giới hạn thao tác vào `auth.uid()`.
5. Nếu đọc hoặc khôi phục profile thất bại, không cho vào ứng dụng; hiển thị lỗi có thể thử lại.

User đã đăng nhập trước đó nhưng chưa hoàn tất onboarding cũng phải quay lại trang nhập tên khi reload.

## Trang hoàn tất đăng ký

Tạo một component tập trung vào một nhiệm vụ: thu tên hiển thị. Giao diện tái sử dụng nhận diện của `LoginPage`:

- Logo DeutschSelbst và card hai cột.
- Hình `/login-illustration.png` ở desktop; mobile chỉ hiển thị form.
- Tiêu đề “Hoàn tất đăng ký”.
- Một input “Tên hiển thị”.
- Nút “Bắt đầu học”.

Validation:

- Trim khoảng trắng đầu/cuối.
- Bắt buộc từ 2 đến 80 ký tự sau khi trim.
- Không chấp nhận chuỗi chỉ có khoảng trắng.

Khi submit, khóa input và nút. Nếu update thất bại, giữ nguyên màn hình và hiển thị lỗi. Khi thành công, cập nhật app user bằng giá trị vừa lưu rồi tiếp tục đến URL đích ban đầu; nếu không có đích cụ thể thì vào dashboard.

## Điều hướng

Onboarding là trạng thái auth nội bộ, không cần thêm public route mới. Khi session tồn tại nhưng profile chưa hoàn tất, onboarding có ưu tiên render cao hơn các trang được bảo vệ và login.

URL hiện tại được giữ nguyên trong suốt OAuth và onboarding. Sau khi lưu tên:

- Deep-link hợp lệ tiếp tục đến đúng trang đó.
- `/` hoặc `/login` chuyển tới `/dashboard` bằng `replaceState`, giữ hành vi hiện tại.

Đăng xuất trong lúc onboarding vẫn đưa user về landing.

## RLS và an toàn dữ liệu

- Client chỉ đọc/sửa profile có `id = auth.uid()`.
- Policy UPDATE phải có cả `USING` và `WITH CHECK` để user không đổi quyền sở hữu hàng.
- Nếu hỗ trợ khôi phục profile bị thiếu qua `INSERT`/`UPSERT`, thêm policy INSERT với `WITH CHECK (id = auth.uid())`.
- Không dùng `user_metadata` để phân quyền. Metadata Google chỉ được dùng trong migration một lần để backfill tên hiển thị.
- Không ghi đè tên đã tồn tại trong `profiles`.

## Xử lý lỗi

- Lỗi đọc profile: hiển thị trạng thái lỗi và nút thử lại; không render dashboard.
- Lỗi tạo lại profile: giữ user tại onboarding và hiển thị lỗi.
- Lỗi validation: hiển thị cạnh input, không gọi Supabase.
- Lỗi update tên: giữ giá trị người dùng đã nhập để họ thử lại.
- Session hết hạn trong onboarding: auth listener đưa user về landing như hiện tại.

## Phạm vi file dự kiến

- Migration mới trong `supabase/migrations/`: backfill, trigger và RLS cần thiết.
- `src/App.tsx`: tải profile, phân nhánh onboarding và dùng tên từ database.
- Component onboarding mới trong `src/pages/`.
- Helper nhỏ trong `src/lib/` chỉ khi cần tách logic thuần để kiểm thử; không tạo abstraction chung nếu một hàm cục bộ đủ dùng.
- Test tương ứng cho phân loại profile, validation và điều hướng.

## Kiểm thử

### Tự động

- User có `full_name` hợp lệ bỏ qua onboarding.
- `full_name` `NULL`, rỗng hoặc chỉ có khoảng trắng đều cần onboarding.
- Validation chặn tên dưới 2, trên 80 ký tự và chuỗi trắng.
- Tên được trim trước khi update.
- Update thành công cập nhật app user và tiếp tục deep-link.
- Update thất bại giữ onboarding và báo lỗi.
- Migration backfill chỉ user cũ có tên trống, ưu tiên `full_name`, sau đó `name`, cuối cùng email.
- Migration không ghi đè tên đã tồn tại.
- Trigger mới tạo profile với `full_name = NULL` và vẫn tạo `user_stats`.
- RLS chặn user ghi profile của user khác.

### Xác minh tích hợp

- Chạy test suite, TypeScript và production build.
- Chạy database tests/migration verification trên Supabase linked hoặc local khi môi trường cho phép.
- Kiểm tra browser desktop/mobile cho login → Google callback → onboarding → dashboard.
- Kiểm tra reload giữa onboarding và deep-link được giữ nguyên.

## Ngoài phạm vi

- Cho phép sửa tên từ trang cài đặt tài khoản.
- Thêm phương thức đăng nhập ngoài Google.
- Đồng bộ lại tên Google sau khi onboarding đã hoàn tất.
- Ghi đè tên profile đã được user hoặc admin đặt.
