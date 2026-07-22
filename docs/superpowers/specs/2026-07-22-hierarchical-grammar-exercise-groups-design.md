# Nhóm bài tập ngữ pháp dạng câu lớn–câu con

Ngày: 2026-07-22

## Bối cảnh

Admin hiện có thể tạo nhiều bài tập ngữ pháp cùng loại trong một lần. Các bản ghi được lưu chung một `group_id`, nhưng màn hình quản trị vẫn trình bày thành bảng phẳng. Màn hình học viên đã gom các bài tập thành trang, nhưng chưa thể hiện rõ cấu trúc câu lớn–câu con, chưa thu gọn theo nhóm và số thứ tự đang dựa một phần vào `order_index` nhập tay.

## Mục tiêu

1. Hiển thị mỗi `group_id` thành một câu lớn có thể mở/đóng ở cả admin và màn hình học viên.
2. Tự động đánh số câu lớn `1`, `2`, `3` và câu con `1.1`, `1.2`, `2.1` theo thứ tự hiển thị.
3. Không giới hạn số câu con trong một câu lớn.
4. Cho phép admin chọn và xoá hàng loạt ở cả cấp câu lớn lẫn câu con.
5. Tự động gán thứ tự khi tạo câu hỏi, không yêu cầu admin nhập số thủ công.
6. Đổi nhãn tab `Ngữ pháp then chốt` thành `Schlüsselgrammatik`.
7. Cho phép admin kéo thả câu lớn để đổi thứ tự xuất hiện và lưu thứ tự đó cho màn hình học viên.

## Quyết định thiết kế

- Dùng `grammar_exercises.group_id` hiện có làm định danh câu lớn; không tạo bảng mới và không đổi schema.
- Một bản ghi cũ có `group_id = null` được coi là một nhóm riêng gồm đúng một câu. Khóa nhóm tổng hợp phải chứa `exercise.id` để các bản ghi null không bị gộp với nhau.
- Câu lớn không có nội dung hay tiêu đề riêng trong DB. Header được tạo từ số thứ tự tự động, nhãn loại bài tập và số câu con.
- Thứ tự hiển thị dựa trên `order_index`, với `id` làm tie-breaker ổn định khi dữ liệu cũ có số trùng.
- Số `1`, `1.1` chỉ là số trình bày được suy ra từ vị trí sau khi sắp xếp; không lưu các số này vào DB.
- Không đặt giới hạn phía UI hoặc validation cho số câu con. Modal tạo mới tiếp tục cho phép thêm câu cùng loại tùy ý.
- Dùng dependency `@dnd-kit` đã có trong dự án để kéo thả câu lớn; không thêm package mới.

## Kiến trúc và đơn vị xử lý

### Tiện ích nhóm dùng chung

Tách logic thuần thành một module dùng chung cho admin và học viên. Module nhận mảng bài tập phẳng đã có `id`, `group_id`/`groupId`, `type` và `order_index` (hoặc vị trí đầu vào nếu kiểu public không trả trường này), rồi trả về các nhóm có:

- `key`: `group:<group_id>` hoặc `exercise:<id>` cho dữ liệu cũ.
- `type`: loại bài tập của nhóm.
- `exercises`: các câu con đã sắp xếp.
- Thứ tự nhóm được xác định bởi câu con đứng đầu nhóm.

Nếu dữ liệu lỗi có nhiều loại trong cùng một `group_id`, giao diện vẫn tách thành các nhóm theo cặp `group_id + type` để không render sai loại câu hỏi.

### Màn hình quản trị

Trong mỗi bài học, thay bảng phẳng bằng danh sách accordion nhóm:

- Header câu lớn hiển thị checkbox, chevron, số lớn, nhãn loại và tổng số câu con.
- Bấm vùng header (trừ checkbox và action) mở hoặc đóng danh sách câu con.
- Khi mở, mỗi hàng con hiển thị số tự động dạng `1.1`, nội dung rút gọn, trạng thái và các action xem trước/sửa/xoá hiện có.
- Checkbox câu lớn chọn hoặc bỏ chọn toàn bộ ID con.
- Nếu chỉ một phần câu con được chọn, checkbox câu lớn dùng trạng thái `indeterminate`.
- Checkbox câu con chọn riêng từng bản ghi.
- Khi có lựa chọn, hiển thị thanh hành động `Xóa N câu đã chọn`.
- Xoá hàng loạt luôn qua modal xác nhận. Sau xác nhận, gọi delete với toàn bộ ID đã chọn, đóng modal, xoá selection đã thành công và fetch lại dữ liệu. Nếu lỗi, giữ selection để admin thử lại và hiển thị toast cảnh báo.
- Xoá đơn lẻ tiếp tục dùng modal hiện có; có thể dùng chung hàm xoá theo danh sách ID để tránh hai luồng hành vi khác nhau.
- Mỗi header câu lớn có drag handle. Admin chỉ bắt đầu kéo từ handle để thao tác mở/đóng và checkbox không xung đột với drag.

Selection được lưu bằng `Set<string>` theo exercise ID. Khi fetch lại, các ID không còn tồn tại phải được loại khỏi selection.

### Tạo mới và tự động đánh số

- Bỏ input `Thứ tự (#)` khỏi từng khối câu trong modal tạo/sửa.
- Khi mở tạo mới, lấy `max(order_index)` thực tế trong bài học và bắt đầu từ `max + 1`, thay vì dùng số lượng bản ghi.
- Mỗi lần thêm câu con trong modal, thứ tự nội bộ tăng liên tiếp.
- Khi lưu, payload được gán `order_index = startOrder + childIndex` bất kể state UI cũ, đảm bảo cả nhóm mới liên tục.
- Khi sửa một câu, giữ nguyên `order_index` đã có; việc sửa nội dung không làm thay đổi vị trí.
- Sau khi xoá không cần cập nhật lại toàn bộ `order_index`. Số hiển thị vẫn tự động liên tục vì được suy ra từ vị trí danh sách.

### Kéo thả thứ tự câu lớn

- Phạm vi kéo thả nằm trong từng bài học; không cho kéo nhóm sang bài học khác.
- Khi thả, client đổi vị trí nhóm trong danh sách ngay. Ví dụ nhóm đang hiển thị số `5` được kéo lên vị trí `2` thì nhóm đó lập tức mang số `2`, câu con `5.1` thành `2.1`, và các nhóm cũ ở vị trí `2` đến `4` tự dịch xuống.
- Sau khi có thứ tự nhóm mới, client flatten toàn bộ nhóm theo thứ tự mới, giữ nguyên thứ tự câu con trong từng nhóm, rồi gán lại `order_index` liên tiếp `0..n-1` cho tất cả bài tập của bài học.
- Lưu các giá trị `order_index` bằng upsert/update theo ID. Trong lúc lưu, khóa thao tác kéo tiếp theo và hiển thị trạng thái đang lưu.
- Nếu lưu thành công, giữ thứ tự mới và fetch lại để xác nhận dữ liệu server.
- Nếu lưu thất bại, rollback về thứ tự trước khi kéo và hiển thị toast cảnh báo. Không để UI hiển thị thứ tự chưa được lưu.
- Màn hình học viên đã fetch theo `order_index`, vì vậy lần tải tiếp theo sẽ dùng đúng thứ tự admin đã lưu mà không đổi contract API.

### Màn hình học viên

- Dùng cùng quy tắc nhóm `group_id` và fallback dữ liệu cũ như admin.
- Mỗi nhóm là một câu lớn dạng accordion, đánh số `1`, `2`, `3`.
- Ban đầu các nhóm ở trạng thái đóng. Bấm header mới hiển thị toàn bộ câu con, đánh số `1.1`, `1.2`...
- Không chia một nhóm sau 10 câu và không giới hạn số câu con. Các câu con vẫn dùng UI trả lời hiện có theo `type`.
- State đáp án tiếp tục keyed theo `exercise.id`, nên mở/đóng accordion không làm mất dữ liệu đã nhập.
- Câu lớn được coi là đã trả lời khi tất cả câu con có đáp án hợp lệ theo kiểm tra hiện tại. Header hiển thị trạng thái hoàn thành để học viên biết nhóm nào còn thiếu.
- Nút nộp bài chỉ bật khi tất cả câu con trong tất cả nhóm đã được trả lời. Payload gửi `grammar-submit` không đổi: vẫn là map `exercise.id -> answer`.
- Màn hình kết quả giữ contract hiện tại và liệt kê theo thứ tự nhóm/câu con tự động.

Không tự động mở một nhóm khi tải trang, vì yêu cầu là bấm câu lớn mới hiển thị câu con. Có thể mở nhiều nhóm cùng lúc; trạng thái mở được lưu bằng tập khóa nhóm.

### Đổi nhãn tiếng Đức

Trong `LessonDetailPage`, đổi label tab từ `Ngữ pháp then chốt` thành `Schlüsselgrammatik`. Nội dung, điều kiện ẩn/hiện và tab mặc định không thay đổi.

## Dòng dữ liệu

1. Supabase trả về danh sách bài tập phẳng.
2. Client sắp xếp và gom bằng tiện ích dùng chung.
3. UI suy ra số câu lớn và câu con từ index của mảng nhóm.
4. Khi admin kéo thả, client flatten thứ tự mới và cập nhật `order_index` của toàn bộ bài tập trong bài học.
5. Admin selection chỉ lưu exercise ID; thao tác xoá gửi đúng các ID được chọn.
6. Học viên lưu đáp án theo exercise ID và gửi contract hiện hữu khi toàn bộ nhóm hoàn thành.

## Xử lý lỗi và trường hợp biên

- Bản ghi không có `group_id`: một nhóm riêng, không bị gộp với bản ghi null khác.
- Nhóm có một câu: vẫn hiển thị câu lớn và câu con `N.1` để cấu trúc nhất quán.
- `order_index` trùng: dùng `id` làm tie-breaker để giao diện ổn định.
- Nhóm dữ liệu lỗi chứa nhiều loại: tách theo `group_id + type`.
- Xoá hàng loạt thất bại: không xoá selection khỏi UI, không giả định dữ liệu đã mất, hiển thị lỗi Supabase qua toast.
- Danh sách rỗng sau khi xoá: hiển thị empty state hiện có.
- Sau khi xoá câu con hoặc cả nhóm, số câu lớn và câu con được suy ra lại từ danh sách mới nên tự động liền số, không cần ghi lại số hiển thị vào DB.
- Số câu con lớn: render toàn bộ khi mở, không đặt giới hạn nghiệp vụ; accordion đóng giúp giảm nhiễu khi chưa cần xem.
- Kéo thả lưu thất bại: rollback thứ tự UI và giữ nguyên thứ tự server.

## Kiểm thử và xác minh

Repo chưa có test runner riêng. Không thêm dependency mới. Tách logic nhóm/chọn thứ tự thành hàm thuần để có thể kiểm tra bằng script TypeScript hiện có hoặc kiểm tra build-time; phần UI được xác minh thủ công.

Các trường hợp bắt buộc:

- Nhóm hai hoặc nhiều câu có số `1.1`, `1.2`; nhóm tiếp theo bắt đầu `2.1`.
- Hai bản ghi `group_id = null` tạo thành hai nhóm riêng.
- Nhóm cùng `group_id` nhưng khác `type` được tách an toàn.
- Số hiển thị liên tục dù `order_index` bị hở hoặc trùng.
- Checkbox nhóm chọn toàn bộ con, bỏ chọn toàn bộ con và hiển thị indeterminate khi chọn một phần.
- Xoá nhiều nhóm/câu con gửi đúng tập ID và refresh đúng sau thành công.
- Xoá `1.2` khiến câu `1.3` cũ hiển thị thành `1.2`; xoá cả nhóm `2` khiến nhóm `3` cũ hiển thị thành `2`.
- Modal tạo số lượng câu con lớn hơn 10 và lưu với `order_index` liên tiếp.
- Kéo nhóm `5` lên vị trí `2` đổi số nhóm thành `2`, đổi `5.1` thành `2.1`, dịch các nhóm giữa xuống và lưu `order_index` liên tiếp.
- Tải lại admin và màn hình học viên sau khi kéo thả vẫn giữ đúng thứ tự đã lưu.
- Giả lập lỗi lưu reorder xác nhận UI rollback và hiển thị toast.
- Mở/đóng nhóm học viên không làm mất đáp án.
- Không thể nộp khi còn bất kỳ câu con nào chưa trả lời; payload nộp bài không đổi.
- Tab hiển thị đúng `Schlüsselgrammatik`.
- Chạy `npm run lint` và `npm run build` thành công.

## Ngoài phạm vi

- Tiêu đề hoặc mô tả tùy chỉnh cho câu lớn.
- Kéo thả sắp xếp câu con bên trong một câu lớn.
- Publish/draft ở cấp câu lớn.
- Migration để chuẩn hóa dữ liệu `group_id = null` cũ.
- Thay đổi Edge Function `grammar-submit` hoặc thuật toán chấm điểm.
