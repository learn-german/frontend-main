# Ngữ pháp then chốt: chuyển thành tab + hiển thị bài tập theo nhóm loại

Ngày: 2026-07-20

## Bối cảnh

Hiện tại trong `LessonDetailPage`:
- "Ngữ pháp then chốt" (lý thuyết ngữ pháp) là 1 khối full-width đứng riêng phía trên tab bar, không phải 1 tab.
- Tab bar (`BOTTOM_TABS`) gồm: Wortschatz (`tuvung`), Grammatikübungen (`quiz` — CTA sang trang bài tập ngữ pháp), Lesen (`doc`), Hören (`nghe`), Schreiben (`viet`), Sprechen (`noi`).
- Trang làm bài tập ngữ pháp (`GrammarExercisePage`) hiển thị 1 câu hỏi/màn hình, có nút "Câu tiếp theo", nộp bài ở câu cuối cùng.
- Admin tạo bài tập ngữ pháp (`AdminGrammarExerciseSection`) qua modal, mỗi lần tạo 1 câu.

## Mục tiêu

1. Đưa "Ngữ pháp then chốt" (lý thuyết) vào làm 1 tab riêng trong tab bar, đứng đầu tiên và được mở mặc định. Tab "Grammatikübungen" (bài tập) vẫn tách biệt, đứng ngay sau.
2. Trong modal admin tạo bài tập ngữ pháp, thêm nút "+" để thêm nhiều câu hỏi cùng loại bài tập trong 1 lần lưu.
3. Khi học viên làm bài, các câu cùng loại bài tập được gộp hiển thị chung trên 1 trang (thay vì từng câu một).
4. Bố cục hiển thị dàn rộng ra (lưới 2 cột) để 1 màn hình chuẩn hiển thị được khoảng 10 câu hỏi không cần cuộn trang.

## Thiết kế

### 1. Tab "Ngữ pháp then chốt" (`src/pages/LessonDetailPage.tsx`)

- Xoá khối full-width "Row 2" (dòng ~163–193) hiện hiển thị lý thuyết ngữ pháp phía trên tab bar.
- Thêm tab mới `id: "nguphapthenchot"` vào **đầu** mảng `BOTTOM_TABS`, label "Ngữ pháp then chốt".
- Nội dung tab = đúng nội dung đang render ở Row 2 hiện tại: ưu tiên `lesson.grammarMd` (qua `MarkdownBlock`, giữ `onWordClick` phát âm), fallback cấu trúc cũ `lesson.grammar.{title, rule, examples}`.
- `visibleTabs` filter cho tab này: hiển thị nếu `lesson.grammarMd` hoặc `lesson.grammar.rule` có nội dung.
- `BottomTab` type thêm `"nguphapthenchot"`.
- Không đổi cơ chế chọn tab mặc định (`useState(() => visibleTabs[0]?.id ...)`) — vì tab mới đứng đầu mảng, nó tự động là mặc định.
- Tab "Grammatikübungen" (`quiz`) và các tab còn lại giữ nguyên vị trí tương đối, hành vi không đổi.

### 2. Admin — thêm nhiều câu cùng loại bằng nút "+" (`src/pages/admin/AdminGrammarExerciseSection.tsx`)

- Chỉ áp dụng ở chế độ **tạo mới**; chế độ sửa (`editId` có giá trị) vẫn thao tác trên 1 câu duy nhất, không hiển thị nút "+".
- Đổi state modal: từ `form: EditForm` (1 object) sang `entries: EditForm[]` (mảng, khởi tạo 1 phần tử rỗng khi mở modal tạo mới).
- Dropdown "Loại bài tập" áp dụng chung cho toàn bộ `entries`: đổi loại sẽ reset `entries` về `[EMPTY_FORM cho loại mới]` (tránh dữ liệu lẫn loại khác nhau trong cùng lần lưu).
- Mỗi phần tử của `entries` render 1 khối field giống hệt form hiện tại (đánh số "Câu 1", "Câu 2", ...). Có nút xoá (X) riêng cho từng khối khi `entries.length > 1`.
- Nút "+" ở cuối danh sách khối field → append 1 `EditForm` rỗng cùng loại vào `entries`.
- `handleSave`:
  - Validate tuần tự từng entry bằng `validateForm` hiện có; nếu entry nào lỗi, báo lỗi kèm số thứ tự câu và dừng lại (không lưu entry nào).
  - Nếu tất cả hợp lệ: build mảng payload (dùng logic build payload hiện tại cho từng entry), `order_index` tự tăng dần bắt đầu từ `nextOrder` truyền vào lúc mở modal.
  - Insert 1 lần bằng `supabase.from("grammar_exercises").insert([...payloads])`.
  - Case sửa (`editId`) giữ nguyên `update` với 1 payload duy nhất như hiện tại.
- Không đổi: `validateForm`, cấu trúc bảng `grammar_exercises`, các thao tác publish/revert/delete.

### 3. Học viên — gộp theo loại + lưới rộng (`src/pages/GrammarExercisePage.tsx`)

- Sau khi `useGrammarExercises` trả về `exercises`, nhóm theo `type`:
  - Thứ tự nhóm = theo `order_index` nhỏ nhất xuất hiện của mỗi `type` (tôn trọng thứ tự admin sắp đặt).
  - Trong mỗi nhóm, nếu số câu > 10, chia tiếp thành các trang con liên tiếp tối đa 10 câu/trang (ví dụ 15 câu cùng loại → 2 trang: 10 câu + 5 câu).
  - Kết quả: `pages: GrammarExercise[][]`, mỗi phần tử là 1 trang (≤10 câu, cùng loại).
- State đổi từ `currentIdx` (1 câu) sang `currentPageIdx` (1 trang). `answers: Record<exerciseId, string>` giữ nguyên, cộng dồn qua các trang.
- Input state của từng loại (`selectedTokens`, `textAnswer`, `itemGroups`) chuyển từ singleton sang **keyed theo `exercise.id`** (vd `Record<exerciseId, string[]>` cho token, `Record<exerciseId, string>` cho text...) để nhiều câu trên cùng trang giữ đáp án độc lập, hiển thị đồng thời.
- Layout 1 trang: lưới `grid grid-cols-1 lg:grid-cols-2 gap-4`, mỗi câu là 1 card thu gọn (giảm padding/spacing so với card hiện tại) chứa đúng UI theo `type` như hiện có (word-reorder token picker, input text cho error_correction/translation/sentence_transformation/guided_sentence_writing, dropdown cho classification).
- Nút điều hướng: "Trang tiếp theo" — disable nếu còn câu chưa trả lời trong trang hiện tại (áp dụng lại logic `hasAnsweredCurrent`/`getCurrentAnswerString` nhưng lặp qua toàn bộ câu trong trang). Ở trang cuối cùng, nút đổi thành "Nộp bài", gọi Edge Function `grammar-submit` với toàn bộ `answers` — không đổi payload/contract.
- Thanh tiến trình đổi từ "Câu hỏi X / N" sang "Trang X / N" (tổng số trang sau khi nhóm+chia).
- Màn hình kết quả (result) sau khi nộp bài: giữ nguyên logic hiện tại (liệt kê giải thích từng câu theo `exercises` gốc).

### Không đổi

- Schema DB (`grammar_exercises`, view `grammar_exercises_public`), Edge Function `grammar-submit`.
- `useGrammarExercises` hook — vẫn trả về mảng phẳng `GrammarExercise[]`, việc nhóm/chia trang xử lý ở client trong `GrammarExercisePage`.
- `src/lib/appTypes.ts` — không cần trường mới.

## Kiểm thử

- Lint: `npm run lint`.
- Thủ công trên trình duyệt:
  - Mở 1 bài học có `grammarMd`/`grammar.rule` → xác nhận tab "Ngữ pháp then chốt" hiển thị đầu tiên và được mở mặc định; tab "Grammatikübungen" vẫn hoạt động như cũ.
  - Bài học không có nội dung ngữ pháp lý thuyết → tab bị ẩn (không lỗi, không tab trống).
  - Admin: tạo mới 1 bài tập, bấm "+" thêm 2-3 câu cùng loại, lưu 1 lần → xác nhận tất cả câu được tạo với `order_index` tăng dần; đổi loại giữa chừng → các khối cũ bị reset.
  - Admin: sửa 1 câu có sẵn → không thấy nút "+", chỉ sửa đúng 1 câu.
  - Học viên: bài học có nhiều loại bài tập, 1 loại có >10 câu → xác nhận phân trang đúng theo loại, trang con 10+còn lại; lưới 2 cột hiển thị đủ không cần cuộn ở màn hình chuẩn desktop; trả lời đủ mới bấm được "Trang tiếp theo"/"Nộp bài"; kết quả nộp bài khớp với đáp án đã nhập qua nhiều trang.
