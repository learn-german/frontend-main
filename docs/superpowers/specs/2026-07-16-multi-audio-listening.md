# Nhiều file mp3 cho bài tập Nghe + chuyển quản lý audio vào "Quản lý bài tập"

## Bối cảnh

Hiện tại mỗi bài học chỉ có 1 file audio (`lessons.audio_r2_key`/`listening_url`), quản lý trong trang "Sửa bài học" (`AdminLessonEditor.tsx`). Câu hỏi Nghe (`quiz_questions` với `category='nghe'`) chỉ gắn với `lesson_id`, không gắn với file audio cụ thể — vì trước giờ chỉ có 1 file/bài nên không cần.

Yêu cầu mới: mỗi bài học có thể có **nhiều** file mp3, mỗi file có **nhóm câu hỏi riêng**, và toàn bộ việc upload/quản lý audio chuyển từ "Sửa bài học" sang trang "Quản lý bài tập" (`AdminQuizSection.tsx`).

## Quyết định thiết kế đã chốt

### Luồng làm bài (học viên)
- Học viên làm **tất cả các file trong 1 lượt**: bấm "Bắt đầu bài tập nghe" 1 lần → lần lượt nghe file 1 + trả lời câu hỏi của file 1, rồi sang file 2..., nộp 1 lần cuối cùng.
- Chấm điểm **gộp cho cả bài học** (không đổi `quiz-submit` Edge Function, không đổi ngưỡng 80%, không đổi cơ chế completion đã có ở feature trước).

### Dữ liệu
- Bảng mới `listening_clips`: `id` (uuid), `lesson_id` (FK `lessons`), `r2_key` (text), `order_index` (int, thứ tự = thứ tự upload, không hỗ trợ kéo-thả sắp xếp lại).
- Không đặt tên/nhãn riêng cho từng file (chỉ hiện theo thứ tự "File 1", "File 2"... trong UI admin, tính từ `order_index`).
- Thêm cột `audio_clip_id` (nullable, FK `listening_clips.id`) vào `quiz_questions` — chỉ áp dụng ý nghĩa cho câu hỏi `category='nghe'` (câu hỏi `nguphap`/`doc` giữ `NULL`).
- Migration backfill: với mỗi bài học đang có `audio_r2_key` (ví dụ `a1-l1`), tạo 1 dòng `listening_clips` từ file đó (`order_index=0`), rồi gán `audio_clip_id` cho toàn bộ câu hỏi `nghe` hiện có của bài đó vào clip mới này — không mất dữ liệu/audio đã upload thật trước đó.
- RLS cho `listening_clips`: mirror `quiz_questions` — admin có toàn quyền đọc/ghi; người dùng đã đăng nhập được đọc (cần để học viên xem/nghe danh sách clip).
- Không xóa cột `lessons.audio_r2_key`/`listening_url` khỏi DB (tránh migration rủi ro không cần thiết) nhưng **không còn nơi nào trong code đọc/ghi 2 cột này nữa** — coi như đã deprecated.

### Admin — "Quản lý bài tập" (`AdminQuizSection.tsx`)
- Tab "Nghe": mỗi bài học (đã có sẵn cấu trúc nhóm-mở-rộng) hiện thêm danh sách các file mp3 đã upload (mỗi file: nút phát thử, nút xóa, số câu hỏi thuộc file đó).
- Nút "Tải file mp3 lên" cho mỗi bài học (dùng lại flow upload R2 đã có — `uploadMedia`) → tạo 1 dòng `listening_clips` mới.
- "Thêm câu hỏi" trong tab Nghe giờ yêu cầu chọn thuộc file mp3 nào (dropdown chọn clip) trước khi mở form câu hỏi như cũ — câu hỏi lưu kèm `audio_clip_id`.
- Xóa 1 file mp3 → xóa luôn các câu hỏi thuộc file đó (giống hành vi xóa câu hỏi hiện có, dùng `ON DELETE CASCADE` ở DB thay vì xử lý thủ công ở client).

### Admin — "Sửa bài học" (`AdminLessonEditor.tsx`)
- **Bỏ hẳn khối "Luyện nghe"** (input upload audio + input URL thủ công) — không còn quản lý audio ở trang này.

### Học viên — trang bài học (`LessonDetailPage.tsx`) + làm bài (`QuizPage.tsx`)
- Tab "Nghe" trên trang bài học: hiện danh sách các file mp3 (mỗi file có player để nghe thử), thay vì 1 player duy nhất như hiện tại.
- Nút "Bắt đầu bài tập nghe" chỉ hiện khi bài học có **ít nhất 1** clip (thay điều kiện cũ `audioR2Key || listeningUrl`).
- `QuizPage` khi `category="nghe"`: hiển thị câu hỏi được nhóm theo từng file mp3 tuần tự — mỗi nhóm câu hỏi có audio player của file tương ứng ở đầu, làm hết nhóm này sang nhóm kia, nộp bài 1 lần cuối cùng cho toàn bộ câu hỏi (giữ nguyên UI nộp bài/kết quả hiện có).

### `completion.ts`
- `applicableCategories`: điều kiện "Nghe áp dụng" đổi từ `audioR2Key || listeningUrl` sang "bài học có ít nhất 1 `listening_clips`". Cần thêm field vào `Lesson`/`LessonContentFlags` phản ánh việc này (ví dụ `listeningClipCount: number` hoặc `hasListeningClips: boolean`).

## Ngoài phạm vi

- Không đổi cơ chế chấm điểm/threshold 80%, không đổi Edge Function `quiz-submit`/`lesson-complete`.
- Không hỗ trợ đặt tên/nhãn riêng cho từng file mp3.
- Không hỗ trợ kéo-thả sắp xếp lại thứ tự file (thứ tự = thứ tự upload).
- Không xóa cột `audio_r2_key`/`listening_url` khỏi DB (chỉ ngừng dùng trong code).
- Không đổi cách hiển thị/luồng bài tập Ngữ pháp và Đọc.

## Testing / verification

- `npm run lint` pass.
- Migration: verify live DB — bài `a1-l1` có đúng 1 `listening_clips` row từ `audio_r2_key` cũ, 3 câu hỏi nghe hiện có được gán đúng `audio_clip_id` vào clip đó; các bài khác không có `audio_r2_key` thì không tạo clip nào.
- Admin: upload thêm 1 file mp3 mới cho 1 bài học → xuất hiện trong danh sách clip; thêm câu hỏi chọn đúng clip → câu hỏi lưu đúng `audio_clip_id`; xóa 1 clip → câu hỏi thuộc clip đó biến mất theo.
- Học viên: bài có 2 file mp3 trở lên → tab Nghe hiện đủ 2 player; bắt đầu bài tập nghe → hiện đúng thứ tự nhóm câu hỏi theo từng file, nộp 1 lần chấm điểm đúng tổng số câu của cả 2 file.
- Bài không có clip nào → tab Nghe hiện "Sắp có" như cũ, không có nút bắt đầu bài tập.
- `AdminLessonEditor.tsx` không còn khối "Luyện nghe" nào.
