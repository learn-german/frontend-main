# Điền chỗ trống linh hoạt — nhiều ô trống mỗi câu hỏi

## Bối cảnh

Hiện tại loại câu hỏi `fill-blank` chỉ hỗ trợ **đúng 1 ô trống** mỗi câu: `question_text` là văn bản gợi ý thuần, đáp án nằm trong cột `correct_answer` (TEXT, 1 chuỗi duy nhất), học viên nhập vào 1 `<input>` duy nhất. Ràng buộc 1-ô này cứng ở mọi tầng: DB (`correct_answer TEXT`), type (`correctAnswer?: string`), admin UI (1 ô nhập đáp án), learner UI (1 input), và Edge Function `quiz-submit` (so sánh 1 chuỗi).

Yêu cầu mới: cho phép admin tự do tạo nhiều ô trống trong 1 câu hỏi, kể cả trong 1 đoạn văn dài (không chỉ 1 câu ngắn), mà không cần thêm UI phức tạp.

## Quyết định thiết kế đã chốt

### Cú pháp đánh dấu chỗ trống
Admin viết **toàn bộ câu/đoạn văn đúng** ngay trong ô `question_text` hiện có, đánh dấu mỗi đáp án bằng `{{đáp_án}}`. Nhiều biến thể đúng cho cùng 1 ô cách nhau bởi `|`:

```
Ich {{bin|Bin}} Student. Ich komme {{aus}} Vietnam.
```

- Số lượng `{{...}}` trong text = số ô trống, không giới hạn.
- Dùng chung cơ chế cho cả câu ngắn lẫn đoạn văn dài (điền từ trong đoạn văn = cùng loại câu hỏi, chỉ khác độ dài `question_text`).
- So khớp đáp án: không phân biệt hoa/thường, đúng 1 trong các biến thể liệt kê bằng `|` là được (giữ nguyên logic case-insensitive hiện có).
- `question_text` là **nguồn dữ liệu duy nhất** — không thêm cột DB mới, không thêm field admin mới. Cột `correct_answer` (cũ) không còn dùng cho `fill-blank` mới; ô nhập "Đáp án đúng" trong admin UI sẽ **ẩn đi** khi `type = fill-blank`, thay bằng dòng ghi chú hướng dẫn cú pháp `{{...}}`.

### Tương thích ngược
Câu hỏi `fill-blank` cũ đã tồn tại (không chứa `{{...}}` trong `question_text`, đáp án nằm ở `correct_answer` cũ) tiếp tục hoạt động y hệt như hiện tại — 1 input, so với `correct_answer`. Không cần migrate dữ liệu cũ. Việc dùng cú pháp mới hay không được xác định tự động: nếu `question_text` chứa ít nhất 1 `{{...}}` → dùng luồng multi-blank mới; nếu không → dùng luồng cũ (1 input, `correct_answer`).

### Bảo mật đáp án
`question_text` (bảng gốc) chứa đáp án thật trong `{{...}}`, nên **không được** gửi nguyên văn cho client. `quiz_questions_public` (view công khai, admin/client-facing hooks đọc từ đây) sẽ thay mỗi `{{...}}` bằng token cố định `{{blank}}` ngay trong định nghĩa view (SQL `regexp_replace`), áp dụng cho mọi câu hỏi (regex chỉ khớp khi có `{{...}}`, câu hỏi cũ không bị ảnh hưởng vì không chứa cú pháp này). Học viên chỉ thấy `Ich {{blank}} Student. Ich komme {{blank}} Vietnam.` — không bao giờ thấy đáp án qua network response.

Edge Function `quiz-submit` (chạy `service_role`, đã đọc trực tiếp từ bảng gốc `quiz_questions` chứ không qua view) tự tách các đáp án từ `{{...}}` trong `question_text` gốc để chấm — dùng regex giống nhau ở cả 2 nơi (SQL view và Edge Function) để đảm bảo nhất quán vị trí/số lượng ô trống.

### Học viên làm bài (`QuizPage.tsx`)
- Với câu hỏi `fill-blank` có chứa token `{{blank}}` trong `questionText` (đã ẩn): tách văn bản theo token này, chèn 1 `<input>` nhỏ ngay tại vị trí đó (inline, giống cloze test truyền thống) — không phải danh sách ô nhập riêng bên dưới.
- Với câu hỏi `fill-blank` không chứa `{{blank}}` (câu hỏi cũ): giữ nguyên UI hiện tại — 1 input duy nhất bên dưới văn bản.
- Học viên nhập từng ô, đáp án thu thập thành mảng theo đúng thứ tự xuất hiện trong văn bản, gửi lên khi nộp bài.

### Chấm điểm (`quiz-submit` Edge Function)
- Với câu hỏi multi-blank mới: mỗi ô trống là **1 đơn vị điểm riêng** (partial credit) — không phải cả câu là 1 đơn vị như trước. So khớp theo vị trí: ô thứ N trong đáp án học viên so với ô thứ N trong danh sách `{{...}}` tách từ `question_text` gốc, case-insensitive, đúng 1 trong các biến thể `|`.
- Với câu hỏi cũ (1 ô, không có `{{}}`): giữ nguyên logic hiện tại — cả câu là 1 đơn vị điểm.
- **Tổng mẫu số của cả bài học** (dùng cho ngưỡng hoàn thành 80% trong `completion.ts`/`lesson-complete`) cũng đổi theo: câu hỏi multi-blank N ô đóng góp N vào cả tử số (số ô đúng) và mẫu số (tổng số ô), thay vì 1 như trước. Câu hỏi các loại khác (multiple-choice, matching, listening, fill-blank cũ 1-ô) vẫn đóng góp 1 như hiện tại.
- Thanh tiến trình "Câu X/Y" khi đang làm bài (điều hướng UI, không phải điểm số) **không đổi** — vẫn đếm theo số câu hỏi, không đếm theo số ô trống. Chỉ công thức % hoàn thành cuối cùng mới đếm theo ô trống.

### Admin — `AdminQuizSection.tsx`
- Ô `question_text` (textarea) giữ nguyên vị trí, chỉ thêm dòng ghi chú/placeholder hướng dẫn cú pháp `{{đáp_án}}` hoặc `{{đáp_án_1|đáp_án_2}}` khi `type = fill-blank`.
- Ô "Đáp án đúng" (hiện có cho `fill-blank`) **ẩn đi** khi `type = fill-blank` VÀ `question_text` chứa ít nhất 1 `{{...}}` — vì đáp án đã nằm trong `question_text`. Nếu admin xoá hết `{{...}}` (quay về câu hỏi 1-ô kiểu cũ), ô "Đáp án đúng" hiện lại để nhập như trước — chuyển đổi mượt giữa 2 chế độ dựa trên nội dung `question_text` hiện tại, không cần toggle riêng.
- Không cần nút "Chèn chỗ trống" hỗ trợ — admin tự gõ cú pháp `{{...}}` trực tiếp.
- Danh sách câu hỏi (bảng xem nhanh) hiển thị preview `question_text` — không cần xử lý đặc biệt gì thêm (hiện nguyên văn có `{{...}}` cho admin xem, vì đây là trang admin không phải trang public).

## Ngoài phạm vi

- Không đổi cơ chế chấm điểm/threshold cho các loại câu hỏi khác (multiple-choice, matching, listening).
- Không thêm nút/UI hỗ trợ chèn `{{...}}` tại vị trí con trỏ — admin tự gõ.
- Không migrate câu hỏi `fill-blank` cũ sang cú pháp mới — 2 luồng (cũ/mới) cùng tồn tại, phân biệt tự động qua sự có mặt của `{{...}}` trong `question_text`.
- Không đổi cách hiển thị thanh tiến trình "Câu X/Y" khi làm bài.
- Không hỗ trợ chỗ trống dạng lựa chọn (dropdown/multiple-choice) tại từng ô — chỉ nhập tự do (text input), giống cơ chế hiện tại.

## Testing / verification

- `npm run lint` pass.
- Migration: `quiz_questions_public` view trả về `{{blank}}` thay cho `{{...}}` có nội dung thật — verify bằng cách query trực tiếp view với 1 câu hỏi mẫu chứa `{{test}}`.
- Admin: tạo câu hỏi `fill-blank` với `question_text` chứa 2-3 `{{...}}` → ô "Đáp án đúng" tự ẩn; xoá hết `{{...}}` → ô "Đáp án đúng" hiện lại.
- Học viên: câu hỏi multi-blank hiện đúng số ô input tại đúng vị trí trong văn bản; câu hỏi cũ (1-ô, không `{{}}`) vẫn hiện UI cũ không đổi.
- Nộp bài: câu hỏi 3 ô trống, đúng 2/3 ô → tính đúng 2 đơn vị vào tử số và 3 đơn vị vào mẫu số của bài học; câu hỏi cũ 1-ô vẫn đóng góp đúng 1 đơn vị như trước.
- Đáp án thật (`{{...}}` nội dung) không bao giờ xuất hiện trong response `quiz_questions_public` hoặc bất kỳ network request nào tới client.
