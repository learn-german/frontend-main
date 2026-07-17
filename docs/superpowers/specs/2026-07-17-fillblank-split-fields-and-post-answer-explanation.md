# Tách block Câu hỏi/Câu trả lời cho Điền chỗ trống + Block Giải thích sau khi trả lời

## Bối cảnh

Nối tiếp [[2026-07-17-multi-blank-fill-blank]] (cơ chế `{{đáp_án}}` nhiều ô trống trong `question_text`). Hai vấn đề hiện tại:

1. **Mọi loại câu hỏi** đều có sẵn field `explanation` (DB + type), nhưng hiện chỉ hiển thị ở màn hình kết quả cuối cùng ("Giải thích từng câu hỏi") sau khi nộp *toàn bộ* bài — không có nơi nào hiển thị nó ngay trong lúc làm từng câu.
2. **Điền chỗ trống multi-blank**: admin phải gõ *chung* 1 ô `question_text` vừa là câu dẫn/hướng dẫn vừa là câu chứa `{{...}}` — không tách được phần "câu hỏi" (hướng dẫn) khỏi phần "câu trả lời" (câu có chỗ trống), gây khó đọc/khó soạn.

## Quyết định thiết kế đã chốt

### 1. Block "Giải thích" hiện ngay trong lúc làm bài (mọi loại câu hỏi)

- Không thêm field mới — dùng lại `explanation` đã có sẵn (đã được `quiz_questions_public` expose, đã được `useQuizQuestions` fetch sẵn cho toàn bộ danh sách câu hỏi trước khi nộp bài).
- Hiển thị trong thẻ câu hỏi ở `QuizPage.tsx`, **chỉ sau khi học viên đã cung cấp đáp án đầy đủ cho câu đang active** — không hiện trước đó (tránh gợi ý/xao nhãng khi chưa trả lời):
  - `multiple-choice` / `listening`: đã chọn 1 lựa chọn (`selectedOption !== ""`).
  - `fill-blank` multi-blank: đã điền **tất cả** các ô (`fillBlankValues` đủ số lượng và không có ô nào rỗng sau `trim()`).
  - `fill-blank` legacy 1-ô: `fillBlankValue.trim() !== ""`.
  - `matching`: đã ghép đủ tất cả các cặp (`Object.keys(matchedPairs).length === totalPairs` — logic y hệt điều kiện enable nút "Tiếp theo" hiện tại).
- Không hiện dấu ✓/✗ đúng-sai — chỉ hiện nội dung `explanation` thuần túy, vì `correctAnswer`/kết quả đúng-sai không bao giờ có ở client trước khi nộp bài (chấm điểm chạy server-side trong `quiz-submit`).
- Nếu `explanation` rỗng (chuỗi `""`) thì không render block.
- Trạng thái hiện/ẩn tự reset khi chuyển câu (đã có `useEffect` reset các state đáp án theo `currentIdx` — block giải thích tự ẩn theo vì điều kiện "đã trả lời" cũng reset).

### 2. Tách Điền chỗ trống thành 2 field: Câu hỏi / Câu trả lời

**Cột DB mới**: `answer_text TEXT NULL` trên bảng `quiz_questions`. Không backfill dữ liệu cũ (giữ nguyên các câu multi-blank đã tạo trước đây, admin tự sửa dần nếu muốn).

**Ngữ nghĩa 2 field cho `type = fill-blank`:**
- `question_text`: câu hỏi/hướng dẫn thuần túy, **không chứa `{{...}}`**. Có thể để trống nếu câu không cần hướng dẫn riêng.
- `answer_text`: câu/đoạn chứa `{{đáp_án}}` — giữ nguyên 100% cú pháp cũ (`{{a|b}}` nhiều biến thể, nhiều `{{...}}` trong 1 câu/đoạn).

Với các loại câu hỏi khác (`multiple-choice`, `matching`, `listening`), `answer_text` luôn `NULL`, không dùng.

**Tương thích ngược (bắt buộc — vì không backfill):**
Câu `fill-blank` cũ (tạo trước tính năng này) vẫn còn `{{...}}` nằm trong `question_text`, `answer_text` là `NULL`. Toàn hệ thống áp dụng quy tắc fallback thống nhất, ở **cả 2 nơi** (SQL view và Edge Function, để nhất quán vị trí/số ô trống):

> Nếu `answer_text` có nội dung (không `NULL`/rỗng) → đây là câu hỏi *mới*, dùng `answer_text` làm nguồn `{{...}}`.
> Nếu `answer_text` rỗng/`NULL` → đây là câu hỏi *cũ*, dùng `question_text` làm nguồn `{{...}}` (y hệt hành vi hiện tại trước tính năng này).

Nhờ vậy các câu hỏi multi-blank đã tồn tại tiếp tục hoạt động và chấm điểm đúng như cũ, không cần admin sửa gì ngay. Câu nào admin chủ động sửa sang dùng `answer_text` sẽ tự chuyển sang chế độ 2-block mới.

**Bảo mật đáp án (view công khai):**
`quiz_questions_public` áp `regexp_replace(..., '\{\{[^}]*\}\}', '{{blank}}', 'g')` lên **cả `question_text` lẫn `answer_text`**, vô điều kiện theo mọi row bất kể `type` (giữ nguyên nguyên tắc bảo mật đã có ở migration trước — phòng trường hợp đổi nhầm `type` hoặc dữ liệu cũ chưa dọn). `regexp_replace(NULL, ...)` trả về `NULL` trong Postgres nên không cần `COALESCE`, `answer_text = NULL` vẫn giữ nguyên `NULL` qua view.

**Chấm điểm (`quiz-submit` Edge Function):**
`scoring.ts` nhận thêm `answer_text` trong `ScorableQuestion`. Hàm chọn nguồn text theo đúng quy tắc fallback ở trên trước khi gọi `extractBlanks()`:
```ts
const sourceText = q.type === "fill-blank"
  ? (q.answer_text?.trim() ? q.answer_text : q.question_text)
  : "";
```
Phần còn lại của logic tách ô/so khớp/partial-credit giữ nguyên 100% như migration trước, chỉ đổi nguồn text đầu vào.

### 3. Học viên làm bài (`QuizPage.tsx`)

- `fillBlankSegments`/`fillBlankCount` tính từ nguồn theo đúng quy tắc fallback (ưu tiên `answerText`, rồi tới `questionText`) — dùng chung 1 hàm nhỏ áp cho cả 2 field.
- **Heading câu hỏi** (`<h2>{questionText}</h2>`):
  - Câu hỏi *mới* (có `answerText`): **luôn hiện** heading — vì giờ `questionText` chỉ còn là hướng dẫn thuần, không trùng lặp với câu chứa chỗ trống bên dưới.
  - Câu hỏi *cũ* (fallback, không có `answerText`, multi-blank nằm trong `questionText`): **ẩn heading** như hành vi hiện tại (vì hiện nó sẽ trùng lặp y hệt nội dung trong block chỗ-trống-điền bên dưới).
- Block nhập chỗ trống (inline `<input>` xen giữa các đoạn text) giữ nguyên UI/logic hiện có, chỉ đổi nguồn `fillBlankSegments`.
- Trường hợp `fill-blank` không có `{{...}}` ở cả 2 field (không multi-blank) → giữ nguyên UI 1-input hiện tại (`correct_answer`), không đổi.

### 4. Admin — `AdminQuizSection.tsx`

- Textarea "Câu hỏi" hiện tại **giữ nguyên vị trí/field** (`question_text`), nhưng với `type = fill-blank`: bỏ dòng ghi chú hướng dẫn `{{...}}` (dời sang field mới), đổi placeholder thành gợi ý nhập câu dẫn/hướng dẫn (có thể để trống).
- Thêm textarea mới **"Câu trả lời"** (chỉ hiện khi `type = fill-blank`), bind vào `form.answer_text`, `rows=4`, mang dòng ghi chú hướng dẫn cú pháp `{{đáp_án}}` / `{{đáp_án_1|đáp_án_2}}` (dời từ field cũ sang).
- `isMultiBlank` chuyển sang kiểm tra trên `form.answer_text` thay vì `form.question_text`.
- Validate khi lưu: `type = fill-blank` bắt buộc `answer_text` không rỗng (câu trả lời không thể thiếu); `question_text` (câu hỏi/hướng dẫn) **không bắt buộc** với `fill-blank` — có thể để trống nếu admin muốn chỉ có câu chứa chỗ trống, không cần hướng dẫn riêng.
- `openEdit`/`EMPTY_FORM`/payload lưu (`handleSave`) thêm field `answer_text`.
- Bảng danh sách câu hỏi (`QuestionTable`) tiếp tục hiển thị `question_text` như hiện tại — không đổi (nằm ngoài phạm vi).

## Ngoài phạm vi

- Không backfill/migrate dữ liệu `fill-blank` cũ sang `answer_text` — dựa hoàn toàn vào fallback runtime.
- Không đổi cách tính điểm/partial-credit theo ô trống, không đổi ngưỡng 80%, không đổi thanh tiến trình "Câu X/Y" — giữ nguyên như migration multi-blank trước.
- Không đổi `mockData.ts` — dữ liệu mock dùng format cũ hơn nữa (`correctAnswer` riêng, không `{{}}`), không liên quan.
- Không đổi cột "Câu hỏi" trong bảng danh sách admin.
- Không thêm nút/toggle bật-tắt xem giải thích thủ công — logic hiện/ẩn hoàn toàn tự động theo trạng thái đã-trả-lời-hay-chưa.
- Không đổi hành vi màn hình kết quả cuối ("Giải thích từng câu hỏi") — vẫn hiện như cũ, độc lập với block mới trong lúc làm bài.

## Testing / verification

- `npm run lint` pass.
- Migration: `quiz_questions_public` trả `answer_text` đã strip `{{...}}` thành `{{blank}}`; row có `answer_text = NULL` vẫn trả `NULL` (không lỗi, không thành chuỗi rỗng).
- Câu hỏi `fill-blank` **cũ** (seed sẵn, `answer_text = NULL`, `{{...}}` trong `question_text`) sau khi deploy: hiển thị & chấm điểm y hệt trước khi có migration này (không cần sửa gì).
- Tạo câu hỏi `fill-blank` **mới** qua admin: nhập "Câu hỏi" = hướng dẫn, "Câu trả lời" = câu có `{{...}}` → learner UI hiện heading hướng dẫn + block chỗ trống riêng bên dưới; nộp bài chấm đúng theo `answer_text`.
- Đổi nhầm `type` của 1 câu có `{{...}}` còn sót trong `answer_text` sang loại khác → verify view vẫn ẩn `{{...}}`, không lộ qua network.
- Mọi loại câu hỏi (`multiple-choice`, `fill-blank` cả 2 chế độ, `matching`, `listening`) có `explanation` không rỗng: trả lời xong → block "Giải thích" hiện ra trong thẻ câu hỏi; chưa trả lời → không hiện; chuyển sang câu tiếp theo → block ẩn lại đúng theo câu mới.
- Câu hỏi có `explanation = ""` → không render block giải thích ở bất kỳ trạng thái nào.
