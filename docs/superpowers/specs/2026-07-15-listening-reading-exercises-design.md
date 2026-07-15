# Bài tập Nghe/Đọc dựa trên nền tảng category

## Bối cảnh

PR trước (#34) đã xây xong nền tảng: `quiz_questions`/`lesson_progress` có cột `category` (`'nguphap' | 'nghe' | 'doc'`), 2 Edge Function (`quiz-submit`, `lesson-complete`) đã category-aware, `useUserStats` chỉ tính điểm/hoàn thành theo `'nguphap'`, `QuizPage.tsx` đã nhận sẵn prop `category` (mặc định `"nguphap"`), và `AdminQuizSection.tsx` đã cho phép admin tạo câu hỏi ở cả 3 category. **Chưa có gì phía học viên** để thực sự bắt đầu 1 bài tập Nghe/Đọc — tab Nghe/Đọc trong `LessonDetailPage.tsx` hiện chỉ hiển thị audio player/đoạn văn thuần, không có cách nào để chuyển sang làm bài tập.

Dự án này nối nốt phần còn thiếu: cho học viên thực sự làm bài tập Nghe/Đọc, tái dùng gần như toàn bộ cơ chế `QuizPage` đã có sẵn.

## Quyết định thiết kế đã chốt

- Bài tập Nghe/Đọc dùng **chung UI làm bài với Quiz** (chuyển sang trang riêng khi bấm "Bắt đầu", từng câu một, màn kết quả cuối) — không xây UI làm bài mới.
- Khi làm bài Đọc, đoạn văn (DE + dịch VI) hiển thị lại trên trang làm bài, phía trên câu hỏi — vì học viên cần đối chiếu lại đoạn văn trong lúc trả lời.
- Sau khi hoàn thành bài Nghe/Đọc: chỉ có nút "Quay lại bài học" — không gợi ý "bài tiếp theo" (khác Quiz, vì đây là bài tập bổ trợ, không phải bài kiểm tra chính khóa).
- Hành vi tab Quiz hiện tại (category `'nguphap'`) **giữ nguyên 100%** — không có gì thay đổi cho luồng đó.
- Không cần thay đổi gì ở Admin — `AdminQuizSection.tsx` đã hỗ trợ tạo câu hỏi cho cả 3 category từ PR #34.
- Nút "Bắt đầu bài tập" chỉ hiện khi lesson đã có audio (Nghe) / đoạn văn (Đọc) — không hiện trong trạng thái "Sắp có" hiện tại (đúng tinh thần "Đọc là optional, có thể không có").

## Thiết kế chi tiết

### 1. `src/pages/LessonDetailPage.tsx` — nút "Bắt đầu bài tập"

- Tab Nghe (`bottomTab === "nghe"`): trong nhánh có audio (`lesson.audioR2Key` hoặc `lesson.listeningUrl`), thêm nút "Bắt đầu bài tập nghe" ngay dưới `<audio>`, gọi `onStartQuiz(lesson.id, "nghe")`.
- Tab Đọc (`bottomTab === "doc"`): trong nhánh có `lesson.readingText`, thêm nút "Bắt đầu bài tập đọc" dưới đoạn văn, gọi `onStartQuiz(lesson.id, "doc")`.
- Nhánh "Sắp có" của cả 2 tab giữ nguyên, không thêm nút.
- `LessonDetailPageProps.onStartQuiz` đổi signature từ `(lessonId: string) => void` thành `(lessonId: string, category?: "nguphap" | "nghe" | "doc") => void`. Lời gọi hiện có ở tab Quiz (`onStartQuiz(lesson.id)`) không đổi, category mặc định `"nguphap"` phía App.tsx.

### 2. `src/App.tsx` — điều hướng theo category

- Thêm state `activeExerciseCategory: "nguphap" | "nghe" | "doc"` (mặc định `"nguphap"`).
- Hàm hiện tại truyền vào `onStartQuiz` (đổi thành nhận thêm category, mặc định `"nguphap"` nếu không truyền): set `selectedLessonId`, set `activeExerciseCategory`, set `currentPage("quiz")`.
- Thêm 1 callback mới `onBackToLesson: () => void` truyền xuống `QuizPage` — set `currentPage("lesson-detail")` (không đổi `selectedLessonId`, quay lại đúng bài học đang làm).
- `<QuizPage>` nhận thêm `category={activeExerciseCategory}` và `onBackToLesson={...}`.

### 3. `src/pages/QuizPage.tsx`

- Hiện đoạn văn khi `category === "doc"`: thêm 1 khối hiển thị `lesson.readingText`/`lesson.readingTextVi` phía trên phần câu hỏi (chỉ render khi category là `"doc"` và có nội dung).
- Màn hình kết quả: nếu `category !== "nguphap"`, thay toàn bộ nhánh nút hiện tại (retry + next-lesson-nếu-đạt / back-to-roadmap-nếu-rớt) bằng: "Làm lại bài Test" (giữ nguyên `handleRetry`) + "Quay lại bài học" (gọi `onBackToLesson`, prop mới). Nhánh `category === "nguphap"` giữ nguyên y hệt hành vi cũ.
- Thông báo khi không có câu hỏi (`questions.length === 0`): hiện tại là "Không tải được câu hỏi quiz. Vui lòng thử lại sau." — đổi thành thông báo đúng theo category, ví dụ: "Bài tập [Ngữ pháp/Nghe/Đọc] cho bài học này chưa được soạn." Nút "Quay về Lộ trình" giữ nguyên cho category `nguphap`; với `nghe`/`doc` đổi thành gọi `onBackToLesson` (quay lại đúng bài học, không phải Lộ trình) để nhất quán với hành vi mới.

## Ngoài phạm vi

- Không đổi Admin UI (`AdminQuizSection.tsx`) — đã đủ dùng.
- Không đổi tên tab "Quiz" thành "Bài tập ngữ pháp" (dự án riêng, sau này).
- Không thêm loại câu hỏi mới — vẫn dùng `multiple-choice`/`fill-blank` như đã thống nhất.
- Không thêm cơ chế "khóa" bài Nghe/Đọc dựa trên tiến trình — luôn có thể làm bất cứ lúc nào miễn lesson có nội dung.

## Testing / verification

- `npm run lint` pass.
- Test browser thủ công (mock props, không cần đăng nhập):
  - Lesson có `audioR2Key`: tab Nghe hiện nút "Bắt đầu bài tập nghe"; bấm vào chuyển đúng sang trang làm bài với câu hỏi category `'nghe'` (mock `useQuizQuestions` trả về vài câu category nghe).
  - Lesson có `readingText`: tab Đọc hiện nút tương tự; trang làm bài hiện lại đúng đoạn văn phía trên câu hỏi.
  - Hoàn thành bài Nghe/Đọc: màn kết quả chỉ có "Làm lại" + "Quay lại bài học" (không có nút bài tiếp theo), bấm "Quay lại bài học" về đúng `LessonDetailPage` của bài đó.
  - Lesson category `'nghe'`/`'doc'` không có câu hỏi nào: hiện đúng thông báo "chưa được soạn" (không phải thông báo lỗi mạng), nút quay lại đúng bài học.
  - Tab Quiz (category `'nguphap'`): xác nhận hành vi không đổi — vẫn "Học bài tiếp theo" khi đạt, "Quay về Lộ trình" khi rớt.
  - Lesson không có audio/đoạn văn ("Sắp có"): xác nhận không hiện nút "Bắt đầu bài tập".
