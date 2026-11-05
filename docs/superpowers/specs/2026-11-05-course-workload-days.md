# Khối lượng bài học theo hạn gói

User xác nhận sau khi xem Phát còn17ngày: đánh giá theo số bài cần học thay vì %, cộng tổng bài A1+A2 (mọi level đã mở) rồi chia số ngày còn lại. Phiên bản Admin hiện xét mỗi level với kế hoạch90ngày chưa đáp ứng.

Cách tính: tổng bài published của tất cả level đã mở, trừ bài đã hoàn thành theo completion rules hiện có, chia max(0,ngàyhếthạngói-ngàybáocáo). Hiển thị trung bình bài/ngày và mục tiêu nguyên ceil để dễ thực hiện; số bàiđãxong/cònlại, các level và hạn gói. Phát:23tổng-4xong=19bài; 17ngày =>1,12bài/ngày, mục tiêu2. Không hiển thị % hoặc nhãn nhanh/chậm dựa90ngày trong khối Admin này.

API chỉ bổ sung study_workload response trong daily-progress-report hiện có, không đổi schema hoặc dữ liệu chương trình/mốc enrollment và công thức legacy Dashboard. AdminPOST vẫn adminonly. Phân trang/published/child authorization giữ nguyên.

Nếu thiếu giáo trình published của bất kỳ level đã mở (DB hiệnA2=0), báo rõ thiếu level và chưa tínhmục tiêu toànkhóa; không giả định zero bài. Hết hạn nhưngcònbài: báo hết hạn, không chia0. Khôngcóngàyhếthạn: chưa tính bài/ngày. Tấtcảbàihoànthànhvàkhôngthiếulevel: thôngbáo hoànthành.

Checks: A1+A2 aggregate, subtractcompleted,19/17example, missing/expired/noexpiry/complete, admin auth/non-user data isolation; presenter tests, TypeScript/build, review+PRfollowup, deployEdge và đọc lại báo cáo Phát trênUI. Đây là sửa bổ sung theo phản hồi sau PR152.
