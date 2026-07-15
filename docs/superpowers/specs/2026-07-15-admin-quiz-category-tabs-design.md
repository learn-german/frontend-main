# Tách trang Admin "Quiz" thành 3 tab theo category

## Bối cảnh

Trang admin quản lý câu hỏi (`AdminQuizSection.tsx`, sidebar mục "Quiz") được xây từ trước khi có khái niệm `category`. Sau khi nền tảng category (`nguphap`/`nghe`/`doc`) và tính năng Nghe/Đọc phía học viên đã hoàn thành, trang admin này không còn phù hợp:

- Sidebar vẫn ghi "Quiz", tiêu đề trang vẫn "Quản lý Quiz" — không khớp với tên mới "Bài tập ngữ pháp" phía học viên.
- Danh sách câu hỏi nhóm theo bài học, category chỉ là badge nhỏ trong từng dòng — không có cách nào xem nhanh hay lọc theo category.
- **Quan trọng**: danh sách bài học hiện chỉ hiển thị **bài đã có ít nhất 1 câu hỏi** (được dựng từ chính danh sách câu hỏi, không phải từ bảng `lessons`). Vì Nghe/Đọc hiện chưa có câu hỏi nào (16/16 câu hiện có đều là `nguphap`), nếu tách tab mà giữ nguyên cách này, tab Nghe/Đọc sẽ trống hoàn toàn và admin không có cách nào tạo câu hỏi đầu tiên.

## Quyết định thiết kế đã chốt

- Tách hẳn thành 3 sub-tab: **Ngữ pháp / Nghe / Đọc**, đặt ở đầu trang, mặc định mở tab Ngữ pháp.
- Danh sách bài học trong mỗi tab dựng từ **toàn bộ bài học có trong hệ thống** (từ bảng `lessons`), không chỉ bài đã có câu hỏi ở category đó — đảm bảo luôn thêm được câu hỏi đầu tiên cho bất kỳ bài nào ở bất kỳ tab nào.
- Đổi tên hiển thị cho khớp kiến trúc mới: sidebar "Quiz" → "Bài tập"; tiêu đề trang "Quản lý Quiz" → "Quản lý bài tập".
- Bỏ cột/badge "Dạng" (category) trong bảng câu hỏi — dư thừa vì đã ngầm định bởi tab đang mở.
- Vẫn fetch toàn bộ câu hỏi 1 lần (dữ liệu nhỏ, hiện 16 dòng) — lọc theo category ở phía client khi hiển thị, không thêm round-trip mạng khi đổi tab.

## Thiết kế chi tiết

### 1. `src/pages/admin/AdminPage.tsx`

Đổi nhãn nav item hiện có (`id: "quiz"`, label hiện tại "Quiz") thành label **"Bài tập"**. Không đổi `id`/routing.

### 2. `src/pages/admin/AdminQuizSection.tsx`

- Thêm state `activeTab: "nguphap" | "nghe" | "doc"` (mặc định `"nguphap"`).
- Thêm thanh sub-tab ngay dưới tiêu đề trang, dùng `CATEGORY_LABELS` đã có sẵn (`nguphap`→"Ngữ pháp", `nghe`→"Nghe", `doc`→"Đọc") để hiển thị nhãn — style tương tự thanh tab đã dùng ở `LessonDetailPage.tsx` (không bắt buộc y hệt, miễn nhất quán về hành vi: click đổi `activeTab`, tab đang chọn có viền/màu nổi bật).
- Đổi tiêu đề trang "Quản lý Quiz" → **"Quản lý bài tập"**.
- Đổi `fetchQuestions`: hiện tại `grouped` chỉ được tạo từ các dòng trong `questionsRes.data` (câu hỏi đã có) — sửa để duyệt qua **toàn bộ `lessonsRes.data`** (mọi bài học) làm nguồn tạo `LessonGroup`, rồi gắn câu hỏi khớp `lesson_id` vào (nếu có). Kết quả: `groups` luôn có đủ mọi bài học, `group.questions` chứa **tất cả category** của bài đó (không lọc tại bước fetch).
- Khi render: với mỗi `group`, tính `filteredQuestions = group.questions.filter(q => q.category === activeTab)` — dùng mảng này để: (a) hiển thị số lượng câu hỏi ở header lesson ("X câu hỏi" phản ánh đúng category đang xem, không phải tổng mọi category), (b) làm nội dung bảng khi expand, (c) hiển thị "Chưa có câu hỏi nào." nếu rỗng.
- Bỏ cột "Dạng" khỏi bảng (header + mỗi dòng) — quay lại đúng bố cục 5 cột gốc (#, Loại, Câu hỏi, Đáp án đúng, thao tác), vì category giờ đã ngầm định bởi tab.
- `openCreate(lessonId, nextOrder)`: `nextOrder` phải tính theo số câu hỏi **trong category đang mở** (`filteredQuestions.length`), không phải tổng số câu hỏi mọi category của bài đó (khác với hành vi cũ).
- Câu hỏi mới tạo qua "+ Thêm câu hỏi" trong 1 tab phải mặc định `category: activeTab` (không còn hardcode `"nguphap"` trong `EMPTY_FORM`) — `openCreate` truyền `category: activeTab` vào form khởi tạo thay vì dùng nguyên `EMPTY_FORM.category`.
- Modal tạo/sửa vẫn giữ nguyên select category (cho phép admin đổi category thủ công nếu cần, ví dụ tạo nhầm tab) — không xóa field này khỏi form, chỉ đổi giá trị mặc định khi tạo mới.

## Ngoài phạm vi

- Không đổi cấu trúc CRUD/validate của modal tạo-sửa câu hỏi (loại câu hỏi, options, matching pairs, đáp án đúng, giải thích) — giữ nguyên.
- Không đổi cách nhóm theo module/lesson (vẫn theo lesson, không nhóm thêm theo module ở admin).
- Không thêm phân trang — dữ liệu còn nhỏ.
- Không đổi bất kỳ gì phía học viên (`LessonDetailPage.tsx`, `QuizPage.tsx`) — chỉ đổi trang admin.

## Testing / verification

- `npm run lint` pass.
- Test browser thủ công (mock props hoặc dữ liệu thật nếu truy cập được Supabase):
  - Mở tab "Nghe": xác nhận TẤT CẢ bài học đều hiện trong danh sách (kể cả bài chưa có câu hỏi Nghe nào), mỗi bài hiện "0 câu hỏi" / "Chưa có câu hỏi nào." đúng như mong đợi.
  - Bấm "+ Thêm câu hỏi" trong tab Nghe cho 1 bài học: xác nhận modal mở với category mặc định là "Nghe" (không phải "Ngữ pháp"), lưu thành công, câu hỏi mới xuất hiện đúng trong tab Nghe với `order_index` bắt đầu từ số lượng câu Nghe hiện có của bài đó (không bị ảnh hưởng bởi số câu Ngữ pháp/Đọc của cùng bài).
  - Chuyển qua tab "Ngữ pháp": xác nhận 16 câu hỏi hiện có (đều category nguphap) vẫn hiển thị đúng như trước, đếm số đúng, bảng không còn cột "Dạng".
  - Xác nhận sidebar Admin hiện "Bài tập" thay vì "Quiz", tiêu đề trang "Quản lý bài tập".
