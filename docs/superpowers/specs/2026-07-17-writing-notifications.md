# Schreiben (Viết) — bài tập viết chấm tay + thông báo trong app + sắp xếp lại tab

## Bối cảnh

Bài học hiện có 5 tab: Từ vựng, Nói (Sprechen, freeform Markdown không chấm điểm), Bài tập ngữ pháp, Nghe, Đọc. Cần thêm tab thứ 6 — **Viết (Schreiben)** — cũng là nội dung không tự động chấm điểm: admin soạn đề bài, học viên viết bài tự luận, admin vào trang riêng để chấm điểm + để lại nhận xét. Kèm theo đó cần hệ thống thông báo trong app cho cả 2 phía khi có sự kiện nộp bài / chấm bài, và sắp xếp lại toàn bộ tab bài học sang tiếng Đức theo thứ tự chuẩn.

## Quyết định thiết kế đã chốt

### Thứ tự & nhãn tab (`LessonDetailPage.tsx`)
Đổi nhãn tab sang tiếng Đức, đúng thứ tự sau (cả nút tab lẫn thứ tự render nội dung panel):

**Wortschatz | Grammatikübungen | Lesen | Hören | Schreiben | Sprechen**

Ánh xạ: Wortschatz = Từ vựng, Grammatikübungen = Bài tập ngữ pháp, Lesen = Đọc, Hören = Nghe, Schreiben = Viết (mới), Sprechen = Nói.

### Ẩn tab khi không có nội dung (áp dụng cho cả 6 tab)
Thay vì hiện tab kèm trạng thái "Sắp có" như hiện tại (Nghe/Đọc), **ẩn hẳn nút tab** khi bài học không có nội dung khả dụng cho mục đó:

| Tab | Điều kiện ẩn |
|---|---|
| Wortschatz | `lesson.vocabulary.length === 0` |
| Grammatikübungen | Bài học không có câu hỏi `category = 'nguphap'` nào |
| Lesen | `lesson.readingPassages.length === 0` |
| Hören | `lesson.listeningClips.length === 0` |
| Schreiben | `lesson.writingPromptMd` rỗng/null |
| Sprechen | `lesson.speakingMd` rỗng/null |

Grammatikübungen hiện chưa có tín hiệu "có câu hỏi hay không" trên `Lesson` (code hiện tại giả định luôn có). Thêm field mới `Lesson.hasNguphapQuestions: boolean`, tính bằng 1 truy vấn đếm số câu hỏi `category='nguphap'` theo `lesson_id` (group by lesson_id) trong `useModules.ts`, tương tự cách `listeningClips`/`readingPassages` đã là tín hiệu "có nội dung" cho Nghe/Đọc.

Nếu TẤT CẢ 6 tab đều ẩn (trường hợp cực hiếm — bài học trống hoàn toàn), Wortschatz vẫn hiện như tab mặc định tối thiểu (an toàn: giữ hành vi hiện tại "luôn có ít nhất 1 tab hiện", tránh trang trắng) — nếu ngay cả Wortschatz cũng trống thì hiện thông báo "Bài học chưa có nội dung" thay vì crash hoặc trang trắng.

### Đề bài viết (admin soạn)
- Thêm field `Lesson.writingPromptMd?: string` (Markdown), tương tự `speakingMd` đã có — admin soạn trong `AdminLessonEditor.tsx`, cột DB mới `lessons.writing_prompt_md`.
- Tab Schreiben của học viên hiển thị đề bài (render Markdown, dùng lại `MarkdownBlock` như tab Sprechen), bên dưới là 1 ô textarea để học viên viết bài + nút "Nộp bài".

### Bài nộp của học viên
- Bảng mới `writing_submissions`: `id` (uuid), `lesson_id` (FK lessons), `user_id` (FK auth.users), `content` (text, bài viết của học viên), `score` (int, NULL = chưa chấm), `comment` (text, NULL), `graded_at` (timestamptz, NULL), `submitted_at` (timestamptz), `updated_at` (timestamptz). Unique constraint `(lesson_id, user_id)` — mỗi học viên chỉ có 1 bài nộp hiện tại cho mỗi bài học (nộp lại = ghi đè, không giữ lịch sử các lần nộp trước).
- Học viên **được nộp lại bất cứ lúc nào**, kể cả sau khi đã được chấm — nộp lại sẽ: cập nhật `content`, đặt `score = NULL`, `comment = NULL`, `graded_at = NULL` (bài quay về trạng thái "chưa chấm"), cập nhật `submitted_at` mới.
- RLS: học viên chỉ đọc/ghi được bài nộp của chính mình (`user_id = auth.uid()`, `INSERT`/`UPDATE` cho phép, nhưng chỉ được set/đổi `content`, không được tự đổi `score`/`comment`/`graded_at` — admin mới có quyền ghi các cột đó). Admin đọc/ghi toàn quyền (`app_metadata.role = 'admin'`).

### Chấm điểm (admin) — `AdminWritingSection.tsx` (trang mới)
- Danh sách bài nộp, nhóm theo bài học (giống cấu trúc `AdminQuizSection.tsx`/`AdminUsersSection.tsx`) — hiện tên học viên, thời gian nộp, trạng thái (chưa chấm / đã chấm).
- Click vào 1 bài nộp → xem nội dung bài viết (đầy đủ), nhập điểm (0–100) + ô nhận xét (comment) tự do, nút "Lưu điểm" → set `score`, `comment`, `graded_at = now()`.
- Thang điểm: **0–100** (đồng nhất với `quiz_score` hiện có trong hệ thống).

### Không tính vào điều kiện hoàn thành bài học
- `writing`/Schreiben **không** được thêm vào `QuizCategory` trong `src/lib/completion.ts` — hoàn toàn tách biệt khỏi `applicableCategories`/ngưỡng 80% pass, giống hệt cách `noi` (Sprechen) đã bị loại trừ hiện nay. Điểm bài viết chỉ mang tính tham khảo/phản hồi, không ảnh hưởng tiến độ học.

### Thông báo trong app (hệ thống mới — chưa có gì tồn tại trước đó)
- Bảng mới `notifications`: `id` (uuid), `user_id` (uuid, NULL nếu là thông báo broadcast cho admin), `for_admin` (boolean, default false), `type` (text: `'writing_submitted'` | `'writing_graded'`), `lesson_id` (FK lessons), `message` (text, nội dung hiển thị), `read_at` (timestamptz, NULL = chưa đọc), `created_at` (timestamptz).
- Sự kiện tạo thông báo:
  - Học viên nộp bài viết → tạo 1 row `for_admin = true`, `user_id = NULL`, `type = 'writing_submitted'` — **mọi admin đều thấy chung 1 thông báo này** (không tạo riêng cho từng admin).
  - Admin chấm bài (lưu điểm) → tạo 1 row `user_id = <học viên>`, `for_admin = false`, `type = 'writing_graded'`.
- Hiển thị: icon chuông kèm số lượng chưa đọc (badge đỏ) trên thanh điều hướng — cả ở web học viên và trang admin. Click chuông mở dropdown danh sách thông báo gần nhất (mới nhất trên đầu), click vào 1 thông báo → đánh dấu `read_at = now()` cho thông báo đó (không đánh dấu tất cả).
- Chỉ hiển thị trong web (không email, không push notification, không SMS) — đúng theo yêu cầu.
- Không có cơ chế polling phức tạp bắt buộc — cho phép fetch số lượng chưa đọc khi tải trang / khi mở dropdown (không cần realtime subscription, tránh phức tạp không cần thiết).

## Ngoài phạm vi

- Không hỗ trợ nhiều đề bài viết/bài học (chỉ 1 đề bài duy nhất mỗi bài học, giống Sprechen).
- Không giữ lịch sử các lần nộp bài trước (chỉ giữ bài nộp mới nhất).
- Không có realtime notification (không dùng Supabase Realtime/websocket) — chỉ fetch khi cần.
- Không gửi email/push notification.
- Bài viết không tính vào điều kiện pass/hoàn thành bài học.
- Không đổi cơ chế chấm điểm quiz hiện có (`quiz-submit`, ngưỡng 80%).
- Không thêm cơ chế nhắc nhở admin ngoài thông báo trong app (không cron job, không digest email).

## Testing / verification

- `npm run lint` pass.
- Migration: tạo bảng `writing_submissions`, `notifications`; verify RLS qua `execute_sql` (học viên không tự set được `score`).
- Admin: soạn đề bài viết cho 1 bài học → tab Schreiben của học viên hiện đề bài; bài học chưa có đề bài → tab Schreiben ẩn.
- Học viên: viết bài, nộp → xuất hiện trong `AdminWritingSection`; admin chấm điểm + comment → học viên nhận được thông báo (`writing_graded`), thấy điểm/comment khi quay lại tab Schreiben.
- Học viên nộp lại sau khi đã được chấm → điểm/comment cũ bị xoá, trạng thái quay về "chưa chấm", admin nhận thông báo mới (`writing_submitted`).
- Tất cả 6 tab hiển thị đúng thứ tự Wortschatz | Grammatikübungen | Lesen | Hören | Schreiben | Sprechen; tab nào thiếu nội dung tương ứng thì ẩn hoàn toàn, không hiện "Sắp có" nữa.
- Bài viết không ảnh hưởng đến % hoàn thành bài học / điều kiện pass các bài trước.
- Icon chuông hiện đúng badge số chưa đọc, dropdown hiện đúng nội dung, click đánh dấu đã đọc đúng 1 thông báo.
