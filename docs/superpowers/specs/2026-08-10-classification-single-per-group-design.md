# Câu Phân loại: giới hạn 1 câu/nhóm bài + bỏ lưới 3-cột

## Bối cảnh

Sau khi đổi UI câu hỏi Phân loại sang card-per-nhóm (Admin) và click-chọn-click-cột-nhóm (học viên) — xem [2026-08-07-classification-ui-redesign-design.md](2026-08-07-classification-ui-redesign-design.md) — mỗi câu Phân loại đã là 1 card khá "nặng" (nhiều nhóm × nhiều từ). Admin hiện vẫn có thể gộp nhiều câu Phân loại vào chung 1 nhóm bài (giống các loại câu khác như `word_reorder`, `matching`...), hiển thị cạnh nhau dạng "1.1, 1.2, 1.3" trong lưới 3-cột. Với câu Phân loại, cách này làm layout chật và không hợp UI mới.

Yêu cầu: (1) không cho Admin gộp thêm câu Phân loại thứ 2 vào cùng 1 nhóm bài — mỗi nhóm bài loại Phân loại luôn chỉ có đúng 1 câu; (2) bên học viên (và Admin preview module nghe/đọc), khi hiển thị các câu trong 1 nhóm bài, câu Phân loại tràn full-width thay vì bị ép vào lưới 1/2/3-cột như các loại câu khác.

## Kiến trúc

### 1. Admin — khoá gộp nhiều câu Phân loại vào 1 nhóm (`AdminGrammarExerciseSection.tsx`)

Hai nút hiện cho phép thêm câu cùng loại vào 1 nhóm bài, không phân biệt loại câu:

- Nút "+ Thêm câu cùng loại" trong modal tạo mới/thêm câu (dòng ~1624-1631, hiện khi `modalMode !== "edit"`). Sửa điều kiện hiện thành `modalMode !== "edit" && entries[0]?.type !== "classification"` — khi Admin đang tạo/thêm câu loại Phân loại (chọn qua `handleTypeChange`, hoặc đang ở chế độ `append-children` cho 1 nhóm Phân loại có sẵn), nút này ẩn hẳn, không cho bấm thêm entry thứ 2 vào form.
- Nút "Thêm câu" trên mỗi dòng nhóm bài trong danh sách (dòng ~213-223, component `SortableExerciseGroupRow`, gọi `onAddChildren` → `openAppendChildren`). Sửa: ẩn nút này khi `exerciseGroup.type === "classification"` (thay vì luôn hiện, chỉ `disabled` theo `reorderSaving` như hiện tại).

Không đổi DB/`validateForm`/`buildPayload`, không thêm ràng buộc ở tầng dữ liệu — đây là khoá ở lớp UI Admin (nội bộ, không phải input công khai), tương tự mức độ bảo vệ hiện có cho các quy tắc form khác trong file này. Các nhóm bài Phân loại cũ (nếu đã lỡ có ≥2 câu từ trước khi có giới hạn này) không bị đụng tới, không cần dọn dữ liệu — chỉ chặn tạo mới từ nay.

Các loại câu khác (`word_reorder`, `matching`, `fill_in_the_blank`, ...) giữ nguyên hành vi gộp nhiều câu như cũ.

### 2. Học viên + Admin preview module — bỏ lưới 3-cột cho nhóm bài Phân loại

Hai nơi dùng chung layout lưới để xếp các câu (`ExerciseAnswerInput`) trong 1 nhóm bài khi làm bài:

- [`GrammarExercisePage.tsx:463`](../../../src/pages/GrammarExercisePage.tsx) (bài ngữ pháp).
- [`QuizSetListPage.tsx:324`](../../../src/pages/QuizSetListPage.tsx) (bài nghe/đọc — đã port cùng logic nhóm từ Phase 3b).

Cả hai hiện dùng chung class `"grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"` bọc quanh `group.exercises.map((exercise) => <ExerciseAnswerInput .../>)`. Sửa: class của container này chọn theo `group.type` — nếu `group.type === "classification"` thì dùng `"grid grid-cols-1 gap-3"` (1 cột, full-width, không chia 1/2/3 cột); các loại câu khác giữ nguyên class lưới responsive cũ.

Vì đây là giá trị dùng lại 2 lần (2 file), viết class theo cùng công thức inline ở cả 2 chỗ (không tách hàm riêng — chỉ là 1 dòng ternary, không đáng tách module).

Khối "Giải thích từng câu hỏi" / kết quả sau khi nộp (dùng `ExerciseResultReview`, ở cả 2 file) đã sẵn full-width theo từng câu (`space-y-3`, không phải lưới) — không cần sửa.

## Không đổi

- Không đổi DB/migration, không đổi `grammar-submit`.
- Không đổi `validateForm`/`buildPayload`/các hàm form khác trong `grammarExerciseForm.ts`.
- Không đổi hành vi gộp nhiều câu của các loại câu hỏi khác (chỉ riêng Phân loại bị giới hạn 1 câu/nhóm).
- Không xử lý/dọn dữ liệu cũ (nhóm Phân loại đã có sẵn ≥2 câu từ trước, nếu có, vẫn giữ nguyên trong DB — chỉ hiển thị full-width thay vì lưới 3-cột, không xoá bớt câu).
- Không đổi block preview classification-groups-as-columns trong modal Preview (Eye icon) của Admin (dòng ~1847+, `previewTarget.type === "classification"`) — đây là preview nội dung nhóm/từ của 1 câu, khác với layout-nhiều-câu-trong-1-nhóm đang sửa ở đây.

## Testing

- Không có hàm thuần mới cần unit test — cả 2 thay đổi đều là JSX/điều kiện hiển thị.
- `npm run lint` sau khi sửa.
- Test thủ công trên browser (cần user tự làm, sandbox không có `.env.local`):
  - Admin: tạo mới 1 câu Phân loại → xác nhận không thấy nút "+ Thêm câu cùng loại"; mở 1 nhóm Phân loại đã có sẵn trong danh sách → xác nhận không thấy nút "Thêm câu" trên dòng nhóm đó.
  - Admin: tạo mới 1 câu loại khác (vd. `word_reorder`) → xác nhận nút "+ Thêm câu cùng loại" vẫn hiện và hoạt động như cũ; nhóm bài loại khác đã có sẵn → nút "Thêm câu" vẫn hiện.
  - Học viên: mở 1 bài ngữ pháp có nhóm câu Phân loại → xác nhận card Phân loại tràn full-width, không bị chia cột với câu khác trong cùng nhóm (nếu nhóm chỉ có 1 câu thì trước/sau đều trông giống nhau về mặt chiếm không gian — cần kiểm tra rõ nhất ở trường hợp nhóm có nhiều câu loại khác nằm cạnh 1 nhóm Phân loại riêng, hoặc màn hình rộng để thấy khác biệt 1-cột vs 1/3-cột).
  - Học viên: mở 1 bài nghe/đọc (QuizSetListPage) có nhóm câu Phân loại → kiểm tra tương tự.

## Rủi ro

- Không có ràng buộc DB — nếu sau này có đường tạo dữ liệu khác (ví dụ import trực tiếp qua SQL/script) thì vẫn có thể tạo ra nhóm Phân loại nhiều câu, lúc đó chỉ hiển thị full-width (không lỗi, không crash) nhưng không đúng ý "luôn đúng 1 câu" — chấp nhận vì phạm vi yêu cầu là khoá ở Admin UI, không phải ràng buộc dữ liệu cứng.
