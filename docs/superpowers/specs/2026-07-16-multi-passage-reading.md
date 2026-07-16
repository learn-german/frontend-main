# Nhiều đoạn văn cho bài tập Đọc + chuyển quản lý nội dung vào "Quản lý bài tập"

## Bối cảnh

Hiện tại mỗi bài học chỉ có 1 đoạn văn (`lessons.reading_text`/`reading_text_vi`), quản lý trong trang "Sửa bài học" (`AdminLessonEditor.tsx`). Câu hỏi Đọc (`quiz_questions` với `category='doc'`) chỉ gắn với `lesson_id`, không gắn với đoạn văn cụ thể — vì trước giờ chỉ có 1 đoạn/bài.

Yêu cầu mới: mỗi bài học có thể có **nhiều** đoạn văn (script), mỗi đoạn có **nhóm câu hỏi riêng**, và toàn bộ việc soạn/quản lý đoạn văn chuyển từ "Sửa bài học" sang trang "Quản lý bài tập" (`AdminQuizSection.tsx`) — hoàn toàn tương tự cấu trúc vừa xây cho bài tập Nghe (nhiều file mp3, mỗi file có nhóm câu hỏi riêng).

## Quyết định thiết kế đã chốt

Áp dụng y hệt các quyết định đã chốt cho tính năng Nghe (multi-audio-listening):

### Luồng làm bài (học viên)
- Học viên làm **tất cả các đoạn văn trong 1 lượt**: bấm "Bắt đầu bài tập đọc" 1 lần → đọc đoạn 1 + trả lời câu hỏi của đoạn 1, rồi sang đoạn 2..., nộp 1 lần cuối cùng.
- Chấm điểm **gộp cho cả bài học** (không đổi `quiz-submit` Edge Function, không đổi ngưỡng 80%, không đổi cơ chế completion đã có).

### Dữ liệu
- Bảng mới `reading_passages`: `id` (uuid), `lesson_id` (FK `lessons`), `text_de` (text, tiếng Đức), `text_vi` (text, tiếng Việt, có thể rỗng), `order_index` (int, thứ tự = thứ tự tạo, không hỗ trợ kéo-thả).
- Không đặt tên/nhãn riêng cho từng đoạn (chỉ hiện "Đoạn 1", "Đoạn 2"... theo `order_index` trong UI admin).
- Thêm cột `reading_passage_id` (nullable, FK `reading_passages.id`) vào `quiz_questions` — chỉ áp dụng ý nghĩa cho câu hỏi `category='doc'` (câu hỏi `nguphap`/`nghe` giữ `NULL`).
- Migration backfill: với mỗi bài học đang có `reading_text` (ví dụ `a1-l1`), tạo 1 dòng `reading_passages` từ `reading_text`/`reading_text_vi` (`order_index=0`), rồi gán `reading_passage_id` cho toàn bộ câu hỏi `doc` hiện có của bài đó vào đoạn mới này — không mất dữ liệu đã soạn trước đó.
- RLS cho `reading_passages`: mirror `listening_clips` — admin toàn quyền đọc/ghi; người dùng đã đăng nhập được đọc.
- Không xóa cột `lessons.reading_text`/`reading_text_vi` khỏi DB nhưng **không còn nơi nào trong code đọc/ghi 2 cột này nữa** — coi như deprecated (giống `audio_r2_key`/`listening_url`).
- Không cần R2/upload cho tính năng này (chỉ là text, không phải file).

### Admin — "Quản lý bài tập" (`AdminQuizSection.tsx`)
- Tab "Đọc": mỗi bài học hiện thêm danh sách các đoạn văn đã soạn (mỗi đoạn: ô nhập tiếng Đức + tiếng Việt, nút xóa, số câu hỏi thuộc đoạn đó).
- Nút "Thêm đoạn văn mới" cho mỗi bài học → tạo 1 dòng `reading_passages` mới (2 textarea trống, lưu khi admin gõ xong — không cần bấm lưu riêng, tương tự pattern đã dùng, hoặc có nút Lưu riêng cho đoạn văn — chọn theo pattern textarea debounce/blur-save đơn giản nhất để nhất quán, xem phần Ngoài phạm vi).
- "Thêm câu hỏi" trong tab Đọc giờ yêu cầu chọn thuộc đoạn văn nào (dropdown/chọn đoạn) trước khi mở form câu hỏi — câu hỏi lưu kèm `reading_passage_id`.
- Xóa 1 đoạn văn → xóa luôn các câu hỏi thuộc đoạn đó (`ON DELETE CASCADE` ở DB, không xử lý thủ công ở client) — giống hệt cơ chế xóa file mp3.

### Admin — "Sửa bài học" (`AdminLessonEditor.tsx`)
- **Bỏ hẳn khối "Bài đọc"** (2 textarea Đức/Việt) — không còn quản lý đoạn văn ở trang này.

### Học viên — trang bài học (`LessonDetailPage.tsx`) + làm bài (`QuizPage.tsx`)
- Tab "Đọc" trên trang bài học: hiện danh sách các đoạn văn (mỗi đoạn hiện đầy đủ tiếng Đức + tiếng Việt), thay vì 1 đoạn duy nhất như hiện tại.
- Nút "Bắt đầu bài tập đọc" chỉ hiện khi bài học có **ít nhất 1** đoạn văn (thay điều kiện cũ `readingText`).
- `QuizPage` khi `category="doc"`: hiển thị câu hỏi được nhóm theo từng đoạn văn tuần tự — mỗi nhóm câu hỏi có đoạn văn tương ứng hiện ở đầu (giống bài Nghe hiện audio ở đầu mỗi nhóm câu hỏi), làm hết nhóm này sang nhóm kia, nộp bài 1 lần cuối cùng cho toàn bộ câu hỏi.
- Câu hỏi Đọc không thuộc đoạn văn nào hiện tại (trường hợp hiếm/mồ côi) vẫn được hiển thị (nối vào cuối danh sách), không bị ẩn — áp dụng đúng bài học rút ra từ final review của tính năng Nghe (tránh lệch điểm số client/server).

### `completion.ts`
- `applicableCategories`: điều kiện "Đọc áp dụng" đổi từ `readingText` (string) sang "bài học có ít nhất 1 `reading_passages`". Cần đổi field trên `Lesson`/`LessonContentFlags` phản ánh việc này (ví dụ `readingPassages: {id, textDe, textVi}[]` thay cho `readingText`/`readingTextVi`).

## Ngoài phạm vi

- Không đổi cơ chế chấm điểm/threshold 80%, không đổi Edge Function `quiz-submit`/`lesson-complete`.
- Không hỗ trợ đặt tên/nhãn riêng cho từng đoạn văn.
- Không hỗ trợ kéo-thả sắp xếp lại thứ tự đoạn văn.
- Không xóa cột `reading_text`/`reading_text_vi` khỏi DB (chỉ ngừng dùng trong code).
- Không đổi cách hiển thị/luồng bài tập Ngữ pháp và Nghe.
- Lưu đoạn văn trong admin: dùng cơ chế lưu đơn giản nhất khớp với pattern hiện có trong `AdminQuizSection.tsx` (không cần thiết kế UI lưu phức tạp/tự động-lưu-khi-gõ — có thể là nút "Lưu" rõ ràng cho mỗi đoạn văn, quyết định cụ thể để lúc viết plan).

## Testing / verification

- `npm run lint` pass.
- Migration: verify live DB — bài `a1-l1` có đúng 1 `reading_passages` row từ `reading_text`/`reading_text_vi` cũ, câu hỏi Đọc hiện có được gán đúng `reading_passage_id`; các bài khác không có `reading_text` thì không tạo đoạn nào.
- Admin: thêm 1 đoạn văn mới cho 1 bài học → xuất hiện trong danh sách; thêm câu hỏi chọn đúng đoạn → câu hỏi lưu đúng `reading_passage_id`; xóa 1 đoạn → câu hỏi thuộc đoạn đó biến mất theo.
- Học viên: bài có 2 đoạn văn trở lên → tab Đọc hiện đủ 2 đoạn; bắt đầu bài tập đọc → hiện đúng thứ tự nhóm câu hỏi theo từng đoạn, nộp 1 lần chấm điểm đúng tổng số câu của cả 2 đoạn.
- Bài không có đoạn văn nào → tab Đọc hiện "Sắp có" như cũ, không có nút bắt đầu bài tập.
- `AdminLessonEditor.tsx` không còn khối "Bài đọc" nào.
- Câu hỏi Đọc mồ côi (nếu có) vẫn hiển thị cho học viên, không bị lặng lẽ loại bỏ.
