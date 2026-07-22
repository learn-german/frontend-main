# Gợi ý cho bài tập Ngữ pháp

## Mục tiêu

Bổ sung một nội dung gợi ý không bắt buộc cho mỗi bài tập Ngữ pháp. Trong mô hình hiện tại, một bài tập là một nhóm các câu con có cùng `group_id`. Admin có thể tạo, sửa hoặc xóa gợi ý trong modal quản lý bài tập; học viên chỉ thấy nút mở gợi ý khi nhóm đang làm có nội dung gợi ý.

Không triển khai logic dò tìm, cảnh báo hoặc chặn gợi ý dựa trên đáp án đúng. Chất lượng nội dung và việc tránh làm lộ đáp án thuộc trách nhiệm biên tập của Admin/Content Manager.

## Mô hình dữ liệu

Thêm cột nullable `hint TEXT` vào `grammar_exercises`. Vì bảng hiện tại lưu mỗi câu con thành một dòng, cùng một gợi ý được lưu trên tất cả các dòng có chung `group_id`.

Migration áp dụng các quy tắc sau:

- `NULL` biểu thị nhóm không có gợi ý và bảo đảm bài tập cũ tiếp tục hoạt động.
- Giá trị chỉ có khoảng trắng không được lưu; UI chuẩn hóa thành `NULL` trước khi ghi.
- Database có check constraint `hint IS NULL OR char_length(hint) <= 1000` để giữ giới hạn ngay cả khi dữ liệu không đi qua UI.
- `grammar_exercises_public` trả thêm cột `hint` nhưng vẫn không trả đáp án đúng hoặc nhóm phân loại đúng.

Việc lặp giá trị trên các dòng trong nhóm là chủ ý để không tạo thêm bảng và không thay đổi cấu trúc bài tập hiện có. Mọi thao tác sửa hoặc xóa gợi ý phải cập nhật toàn bộ các dòng trong `group_id`, nhờ đó dữ liệu của nhóm luôn nhất quán.

## Admin

Modal thêm/sửa bài tập có textarea **Gợi ý** ngay dưới select **Loại bài tập**. Đây là state dùng chung của bài tập, đặt ngoài danh sách form câu con.

- Trường không bắt buộc, hỗ trợ nhiều dòng và hiển thị bộ đếm `n/1000`.
- Giá trị đang nhập được giữ nguyên trong modal nếu validation hoặc request lưu thất bại.
- Chuỗi chỉ có khoảng trắng được chuẩn hóa thành `null`.
- Đúng 1.000 ký tự được lưu; từ 1.001 ký tự, thao tác lưu/publish bị chặn và toast báo rõ `Gợi ý không được vượt quá 1.000 ký tự.`
- Khi tạo nhóm, payload của mọi câu con nhận cùng giá trị `hint`.
- Khi mở sửa, textarea lấy gợi ý từ dòng được chọn. Lưu nội dung câu hỏi tiếp tục cập nhật dòng đang sửa; gợi ý được cập nhật cho tất cả dòng có cùng `group_id`. Với dữ liệu cũ không có `group_id`, chỉ cập nhật dòng hiện tại.
- Xóa nội dung textarea rồi lưu sẽ ghi `NULL` cho toàn nhóm.
- Đổi loại bài tập không làm mất nội dung gợi ý đang nhập.
- Publish/chuyển về nháp không thay đổi nội dung gợi ý.

Quyền truy cập tiếp tục dùng cơ chế phân quyền của màn hình quản trị hiện tại; đặc tả này không bổ sung vai trò tài khoản mới.

## Học viên

`useGrammarExercises` đọc và ánh xạ `hint` từ public view vào `GrammarExercise`. Trang làm bài lấy gợi ý không rỗng của nhóm/câu lớn đang hiển thị.

Ngay phía trên danh sách câu con của trang hiện tại:

- Nếu nhóm không có gợi ý, không render nút, nội dung hoặc wrapper nên không tạo khoảng trắng thừa.
- Nếu có gợi ý, render nút **Xem gợi ý**; nội dung mặc định đóng.
- Nút chuyển được giữa trạng thái mở và đóng. Nhãn khi mở là **Ẩn gợi ý**.
- Nội dung dùng text node và CSS `whitespace-pre-wrap`; không dùng `dangerouslySetInnerHTML` hoặc renderer HTML/Markdown. Nội dung nhiều dòng giữ xuống dòng và chuỗi `<script>` chỉ hiển thị như văn bản.
- Trạng thái mở/đóng chỉ là state cục bộ của UI. Nó không gọi Supabase, không ghi answer, không đổi trang, không reset input và không tham gia payload `grammar-submit`.
- Khi chuyển sang nhóm/câu lớn khác, gợi ý trở về trạng thái đóng để mỗi nhóm luôn mặc định thu gọn.

Khối gợi ý dùng chiều rộng container hiện tại, nút có vùng bấm phù hợp mobile và nội dung tự xuống dòng. Không tạo breakpoint hoặc chiều rộng cố định mới có thể gây tràn màn hình.

## Validation và lỗi

Tạo helper thuần dùng chung cho UI Admin:

- `normalizeGrammarHint(value: string): string | null` trả `null` nếu `value.trim()` rỗng; nếu không, giữ nguyên nội dung người dùng đã nhập để bảo toàn khoảng trắng và xuống dòng có ý nghĩa.
- `validateGrammarHint(value: string): string | null` trả lỗi khi `value.length > 1000`.

Validation gợi ý chạy trước validation từng câu và trước mọi request ghi. Lỗi từ database/request dùng luồng toast hiện có và không đóng modal.

## Kiểm thử

Phát triển theo chu trình test-first trong phạm vi hạ tầng hiện tại:

- Test helper cho chuỗi rỗng, chỉ khoảng trắng, nhiều dòng, đúng 1.000 và 1.001 ký tự.
- Test logic xác định gợi ý theo nhóm và trạng thái reset khi chuyển nhóm nếu có thể tách thành helper/component thuần.
- TypeScript typecheck và production build phải thành công.
- Rà migration để xác nhận cột nullable, check constraint, public view có `hint` và vẫn không lộ `correct_answer`/nhóm đúng.
- Kiểm tra thủ công Admin: create không hint, create có hint, lỗi 1.001 ký tự giữ dữ liệu, edit, xóa, mở lại.
- Kiểm tra thủ công Học viên: không hint không có khoảng trắng; multiline và HTML/script hiển thị như text; toggle không reset câu trả lời; kiểm tra ở desktop và viewport mobile.

## Ngoài phạm vi

- Tự động phát hiện gợi ý chứa hoặc ám chỉ đáp án đúng.
- Cảnh báo biên tập về nội dung đáp án.
- Thay đổi thuật toán chấm điểm, số lượt làm bài, XP, điều kiện Pass hoặc Edge Function `grammar-submit`.
- Tạo bảng nhóm bài tập mới hoặc thay đổi cách `group_id` gom các câu con.
- Bổ sung hệ thống vai trò Content Manager mới.
