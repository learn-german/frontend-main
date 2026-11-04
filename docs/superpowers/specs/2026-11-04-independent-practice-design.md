# Luyện tập bổ trợ độc lập

Nguồn: Notion 40292cf518d8806f8f03e899d0e6e313 và README trong deutschselbst-independent-practice-ui.zip (23/10/2026).

## Thiết kế

- User/Admin có menu Luyện tập. Cấu trúc loại bài (nguphap/doc/nghe) → level mặc định A1 → chủ đề → exercise sets → câu hỏi. Tìm chủ đề không dấu; topic list có số bài/câu/đã làm, set list có draft/attempt status, start/continue/retry và đường quay lại.
- Reuse lessons làm container với content_scope='practice', practice_category; main lesson mặc định content_scope='lesson'. Practice phải không có module/next lesson, xp_reward=0. Dùng lại exercise_sets, editor, runner, draft và server grading hiện có. Không đưa practice vào course catalog, reports, dictionary lesson pickers hay progress queries.
- Admin tạo/sửa chủ đề, category/level được kế thừa; nhúng editor tương ứng chỉ hiển thị chủ đề đã chọn. Giữ custom set title, reorder set/question; preview/draft/publish validation dùng existing implementation. Không tạo dữ liệu minh họa trên production.
- User chỉ thấy chủ đề có published set và published content. A1 cho tài khoản đang có quyền học A1 (trial A1 được luyện tập); level khác theo unlocked_levels và subscription hiện có. Nội dung unpublished, đáp án và transcription vẫn được bảo vệ server-side. Metadata RPC whitelist không trả transcription; các runners lấy nội dung qua luồng bảo vệ hiện có.
- Quyết định trong phạm vi user yêu cầu không hỏi lại: giữ pass threshold/attempt/reveal rules hiện có, không tự mở đáp án ngay như demo. Backend xác định practice từ DB, bỏ tất cả XP/streak/lesson_progress side effects kể cả retry/idempotency paths. lesson-complete từ chối practice. Attempt/draft theo user+set; history append-only riêng cho practice.
- Không thay đổi bài học chính hoặc tạo bộ chấm thứ hai. Migration và Edge Functions được deploy trước frontend; regression checks bảo đảm course flow vẫn nguyên.

## Thực hiện và kiểm tra

1. Backend: scope constraints, publication/access RLS và safe metadata RPC; attempt history; grading side-effect isolation, lesson-complete guard; SQL và Edge tests.
2. Admin: topic CRUD/list/filter, reuse 3 editor sections theo topic context, preserve set titles và reorder.
3. User: list/search/count/status + reuse 3 runner sections; persist answers/drafts/history; routes/navigation.
4. Cross-cutting: lọc main lessons khỏi mọi main selector/report, ACL/media gates; TypeScript/tests/build/SQL checks, review độc lập toàn diff, PR riêng, merge main rồi Notion review.

## Rủi ro cần kiểm tra

Scope dùng chung lessons tác động nhiều luồng: mọi query main lesson phải lọc content_scope. Kiểm tra RLS trên child tables và media không chỉ dựa frontend. Không chấp nhận score/correct answers từ client. Không dùng service_role phía client.
