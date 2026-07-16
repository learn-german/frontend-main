# Tiêu chí hoàn thành bài học (≥80%) + Chi tiết tiến độ học viên (Admin) + Cải tiến Roadmap/Dashboard

## Bối cảnh

Hiện tại một bài học được coi là "hoàn thành" (`stats.completedLessons`) chỉ cần tồn tại 1 dòng `lesson_progress` với `category='nguphap'` — bất kể điểm số, kể cả khi được tạo bởi nút "Đánh dấu hoàn thành" (không cần làm bài tập nào). Admin không có cách nào xem chi tiết tiến độ học của từng học viên. Roadmap có 1 khu vực đề xuất luyện tập nhanh (tĩnh, không có logic thật), việc chọn bài học đòi hỏi bấm đúng nút nhỏ, và trang không tự cuộn tới bài đang học.

## Quyết định thiết kế đã chốt

### Phần 1 — Tiêu chí hoàn thành bài học

- Một bài học được coi là **"đã học xong"** khi: với **mỗi mục thực sự có nội dung** (Ngữ pháp luôn áp dụng; Nghe áp dụng nếu bài có `audioR2Key`/`listeningUrl`; Đọc áp dụng nếu bài có `readingText`), điểm `lesson_progress.quiz_score` của mục đó phải **≥ 80**.
- Mục không có nội dung (không có audio/đoạn văn) được bỏ qua — không yêu cầu điểm cho mục đó.
- Tính hoàn toàn ở phía client, không cần Edge Function mới: `useUserStats` sửa để lấy `lesson_progress` của **cả 3 category** (bỏ filter `.eq("category", "nguphap")`), kết hợp với thông tin nội dung bài học (`audioR2Key`/`listeningUrl`/`readingText`) để suy ra `completedLessons`.
- Logic tính này được tách thành 1 hàm dùng chung (`src/lib/completion.ts`, ví dụ `computeCompletedLessons(lessons, progressRows): string[]`), để cả learner (`useUserStats`) và admin (Phần 2) dùng chung, đảm bảo nhất quán.
- Nút "Đánh dấu hoàn thành" trên `LessonDetailPage` giữ nguyên nhưng chỉ hiển thị/kích hoạt được khi bài đã đạt tiêu chí trên (tất cả mục áp dụng đều ≥80%).
- Ảnh hưởng tới: `RoadmapPage` (mở khóa bài tiếp theo dựa vào `completedLessons`), `DashboardPage` (đếm số bài hoàn thành, gợi ý bài tiếp theo), `LessonDetailPage` (điều kiện hiện nút hoàn thành).
- **Không đổi**: cơ chế chấm điểm quiz (`quiz-submit` Edge Function đã có ngưỡng `PASS_THRESHOLD = 80` sẵn, không cần sửa), cơ chế XP/streak hiện có.

### Phần 2 — Chi tiết tiến độ học viên (Admin)

- **Cột mới "Đã học đến bài"** trong bảng danh sách user (`AdminUsersSection.tsx`): hiển thị bài học có order cao nhất mà user đã hoàn thành (theo đúng `computeCompletedLessons` ở Phần 1), dạng `"<Cấp độ> · Bài <số>: <tên bài>"`, hoặc `"Chưa học bài nào"` nếu chưa hoàn thành bài nào.
- Trang tải 1 lần khi mount: toàn bộ `modules`+`lessons` (order đầy đủ, admin đã có quyền đọc) và toàn bộ `lesson_progress` của mọi user (admin RLS "lesson_progress: admin read" đã cho phép) — không cần Edge Function mới, không cần lọc theo từng user riêng lẻ.
- **Bấm vào tên user → mở modal chi tiết tiến độ** (thêm state `progressUser` tương tự pattern `editUser`/`deleteTarget` đã có trong file):
  - Danh sách toàn bộ bài học đã unlock đối với user đó (nhóm theo module, đúng thứ tự `order_index`), mỗi dòng gồm:
    - Tên bài học + trạng thái tổng: **Hoàn thành** / **Đang học** (bài kế tiếp chưa hoàn thành) / **Chưa học**
    - Điểm từng mục Ngữ pháp / Nghe / Đọc: điểm % nếu có dòng `lesson_progress` tương ứng, `"—"` nếu bài không có nội dung mục đó, `"Chưa làm"` nếu có nội dung nhưng chưa có dòng progress
    - Ngày hoàn thành gần nhất của bài (giá trị `completed_at` lớn nhất trong các category đã hoàn thành của bài đó, nếu có)
  - Modal hiển thị thêm ở đầu: tổng quan nhanh (tổng số bài đã hoàn thành / tổng số bài, XP, streak — dùng lại dữ liệu đã có trong bảng danh sách).
- **Sắp xếp theo cột "Đã học đến bài"**: header cột này bấm được để sort tăng/giảm theo order của bài học cao nhất đã hoàn thành (giống pattern sort đơn giản, click để đổi chiều asc/desc, không cần đa cột).

### Phần 3 — Cải tiến Roadmap/Dashboard

1. **Bỏ "Đề xuất rèn luyện nhanh"**: xóa toàn bộ block tĩnh tại `DashboardPage.tsx` (khu vực `<h3>...Đề xuất rèn luyện nhanh</h3>` và 2 card bên dưới) — đây là mock UI không có logic thật, không có mục đích thay thế.
2. **Bấm cả vùng thẻ bài học để vào bài**: thêm `onClick={() => onSelectLesson(lesson.id)}` + `cursor-pointer` cho toàn bộ card trong `RoadmapPage.tsx` khi `status !== "locked"`, giữ nguyên nút "Ôn tập lại"/"Khám phá ngay" bên trong (vẫn hoạt động song song, không xung đột — cả 2 gọi cùng 1 callback). Thêm badge rõ ràng **"Đã xong"** (nền xanh lá, giống kiểu badge "Đang học" hiện có) cho bài có `status === "completed"`, thay vì chỉ có icon dấu tick nhỏ ở góc.
3. **Tự động cuộn đến bài đang học**: `RoadmapPage` đã có sẵn `id={`roadmap-lesson-card-${lesson.id}`}` trên mỗi card. Thêm `useEffect` chạy sau khi danh sách bài đã sẵn sàng (`allLessons.length > 0`), tìm lesson có `status === "current"`, gọi `document.getElementById(...)?.scrollIntoView({ behavior: "smooth", block: "center" })`.

## Ngoài phạm vi

- Không thêm Edge Function mới (mọi truy vấn admin dùng trực tiếp Supabase client + RLS admin-read sẵn có).
- Không đổi cơ chế XP/streak/quiz-submit hiện có.
- Không thêm phân trang cho danh sách user hay modal chi tiết (số lượng user/bài học hiện tại nhỏ, YAGNI).
- Không đổi giao diện nút "Đánh dấu hoàn thành" ngoài điều kiện hiện/disable.
- Không thêm tính năng lọc/tìm kiếm mới trong modal chi tiết tiến độ.

## Testing / verification

- `npm run lint` pass.
- Test browser thủ công (mock data vì cần auth thật):
  - Bài học không có Nghe/Đọc (chỉ có Ngữ pháp): đạt ≥80% Ngữ pháp là đủ để "hoàn thành", nút "Đánh dấu hoàn thành" hiện ra.
  - Bài học có đủ 3 mục: chỉ hoàn thành khi cả 3 đều ≥80%; thiếu 1 mục hoặc điểm <80% thì không hiện nút, `completedLessons` không bao gồm bài đó.
  - Roadmap: bài tiếp theo chỉ mở khóa sau khi bài trước đó đạt tiêu chí mới.
  - Admin: cột "Đã học đến bài" hiển thị đúng bài có order cao nhất đã hoàn thành cho từng user mẫu; modal chi tiết hiển thị đúng điểm từng mục, đúng trạng thái tổng, đúng ngày hoàn thành.
  - Dashboard: khu vực "Đề xuất rèn luyện nhanh" không còn xuất hiện.
  - Roadmap: bấm vào vùng bất kỳ của thẻ bài học (ngoài nút) vẫn điều hướng đúng; bài hoàn thành hiện badge "Đã xong"; trang tự cuộn tới bài đang học khi tải.
