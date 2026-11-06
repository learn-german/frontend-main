# Tiến độ học tập theo kế hoạch và gia hạn

Nguồn yêu cầu: `learning-progress-formula.md` do người dùng cung cấp ngày 06/11/2026.

- Theo từng level: `r=clamp((t-t0)/(t1-t0),0,1)`, kỳ vọng `100*(C0+(N-C0)*r)/N`, thực tế `100*C(t)/N`, Delta = thực tế - kỳ vọng.
- Snapshot cố định tập bài, điều kiện hoàn thành và các bài đã hoàn thành (C0). Mỗi lần đổi ngày kế hoạch/gia hạn tạo snapshot mới; không sửa snapshot cũ hoặc báo cáo lịch sử.
- Gia hạn qua ngày hết hạn gói hiện có của admin: lấy ngày Việt Nam hiện tại làm t0, hạn mới làm t1 cho các level đã mở. Kế hoạch ban đầu vẫn mặc định 90 ngày.
- Giữ trường gap cũ (kỳ vọng - thực tế) và ngưỡng <5, <10, >=10 để tương thích Dashboard; hiển thị Delta có dấu ở admin.
- Từ chối dữ liệu không hợp lệ, không làm tròn số trung gian. Snapshot migration cho kế hoạch cũ chỉ khôi phục từ dữ liệu hiện có trước ngày bắt đầu, không suy diễn lịch sử lần gia hạn chưa được lưu.
- Phương án: snapshot tại database trigger để gia hạn và C0 cùng transaction; không chốt C0 vào lần đọc report đầu tiên vì có thể trễ nhiều ngày. Không triển khai lên production trong tác vụ tạo PR.

Nguồn nền cho migration: Supabase RLS, mục Policies và Bypassing RLS, tài liệu hiện hành đọc 06/11/2026: https://supabase.com/docs/guides/database/postgres/row-level-security
