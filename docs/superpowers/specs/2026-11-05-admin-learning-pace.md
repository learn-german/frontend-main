# Admin xem tốc độ học

Nguồn Notion 40f92cf518d880f593b9d26513b67dd1 chỉ có tiêu đề yêu cầu Admin check học viên nhanh/chậm. Theo lựa chọn user không hỏi lại, dùng phạm vi tối giản trong modal Tiến độ học tập hiện có tại Admin > Người dùng.

Hiển thị report_date, level hiện tại, số bài hoàn thành/tổng, tiến độ thực tế %, kỳ vọng %, độ chênh theo điểm phần trăm và trạng thái: nhanh hơn kế hoạch nếu actual>expected; đúng tiến độ nếu chậm <5 điểm; cần chú ý nếu chậm 5..<10; chậm tiến độ nếu >=10. Giữ cách tính kế hoạch 90 ngày/level, enrollment dates, completion/pass rules và subscription của daily-progress-report. Chưa có level/enrollment/report hợp lệ hoặc request lỗi phải hiện trạng thái thiếu dữ liệu/lỗi, không suy thành đúng tiến độ. Chuyển user nhanh không được hiện report của người trước. Có tải lại report theo từng user, không tạo bảng tổng hợp/automation mới.

Dùng endpoint POST daily-progress-report với user_id đã có admin JWT guard; không mở quyền tutor/learner đọc người khác. Component mới gọi endpoint khi mở modal, giữ UI nhỏ và responsive.

Bắt buộc sửa nguồn tính: service_role hiện không thấy safe question views do practice_can_read_set đòi auth.uid; cho trusted service_role đọc trong function guard, giữ hạn chế learner/anon. Báo cáo phải đọc đủ grammar/listening + reading question flags với pagination; query thất bại trả lỗi thay vì coi không có bài tập. Practice vẫn không tham gia vì lesson container không thuộc module.

Kiểm tra pure presenter nhanh/đúng/chú ý/chậm/thiếu, component loading/error/stale guards; endpoint admin/learner authorization và đọc flags Đọc; SQL service/learner publication gates, existing report/completion tests; lint/tests/build; review, một PR, merge main, deploy và chuyển Notion review.
