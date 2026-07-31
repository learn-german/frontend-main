# Gộp danh sách bài tập ngữ pháp thành 1 trang accordion — Spec

## Bối cảnh

Phase 2 (`GrammarSetListPage` → chọn set → `GrammarExercisePage` full-page riêng)
đã merge vào `main`, kèm 2 vấn đề bị phát hiện khi test trên production:

1. Set sau bị khóa (`Khóa`) cho tới khi pass set trước — **không đúng ý người
   dùng**: tất cả bài tập ngữ pháp trong 1 lesson phải mở được ngay, không
   khóa tuần tự.
2. Chuyển giữa danh sách set và trang làm bài là chuyển toàn trang (route
   state `activeSetId` trong `GrammarExerciseFlow`) — người dùng muốn bấm vào
   là mở ra làm ngay tại chỗ (accordion), không chuyển sang trang mới.

Spec này gộp `GrammarSetListPage` + `GrammarExercisePage` + loại bỏ
`GrammarExerciseFlow` thành 1 trang duy nhất, dạng accordion 2 cấp:
- **Cấp 1 (mới)**: danh sách các bài tập (`exercise_sets`) của lesson — mỗi
  set là 1 hàng accordion, không khóa.
- **Cấp 2 (giữ nguyên, không đổi)**: bên trong 1 set đang mở, các nhóm câu
  hỏi theo loại (`groupGrammarExercises`) — accordion này đã tồn tại và hoạt
  động đúng, không cần sửa.

## Kiến trúc

### Xóa
- `src/pages/GrammarExerciseFlow.tsx` — không còn cần switch list/detail.

### Sửa

**`src/pages/GrammarExercisePage.tsx`**
- Đổi tên export chính từ `GrammarExercisePage` → `GrammarExerciseSetBody`
  (file giữ nguyên tên, chỉ đổi tên component export — tránh xáo trộn không
  cần thiết so với tách file mới).
- Bỏ mọi phần "page chrome" ngoài cùng: bỏ `<ExercisePageHeader>` (3 chỗ:
  loading, error/empty, danh sách câu hỏi), bỏ `max-w-5xl mx-auto` wrapper —
  vì giờ component này chỉ là **nội dung nhúng bên trong 1 hàng accordion**
  của trang cha, trang cha đã có header riêng của nó.
- Props đổi: bỏ `lessonId` (đã xác nhận: chỉ khai báo trong interface, không
  dùng ở đâu trong thân component — xóa hẳn khỏi interface), bỏ
  `onBackToLesson` (không cần nữa, header đã chuyển lên trang cha). Giữ
  `set`, `onSetFinished`. Đổi `onBackToList` → `onCollapse: () => void` —
  gọi khi bấm "Tiếp tục" sau khi pass, để trang cha thu gọn accordion lại
  (không tự động mở set kế tiếp — người dùng tự bấm set khác vì không còn
  thứ tự khóa).
- 3 khối return sớm (loading / error-rỗng / có `result`) giữ nguyên logic
  điều kiện y hệt, chỉ đổi phần JSX bọc ngoài từ `<div className="max-w-5xl
  mx-auto space-y-8">...<ExercisePageHeader .../>...</div>` thành
  `<div className="space-y-4">...</div>` (bỏ luôn dòng
  `<ExercisePageHeader/>` ở mỗi khối).
- Khối "Tiếp tục" (nút trong result card, dòng ~665-669 bản gốc): đổi
  `onClick={onBackToList}` → `onClick={onCollapse}`.
- Khối render câu hỏi chính (return cuối cùng, dòng ~676-819 bản gốc): bỏ
  `<ExercisePageHeader title="Bài tập ngữ pháp" subtitle="Bấm vào bài để
  hiển thị các câu." onBackToLesson={onBackToLesson} />` — dòng
  "Bấm vào bài để hiển thị các câu." vẫn đúng ngữ cảnh (đây vẫn là accordion
  cấp 2 bên trong set), nhưng không cần lặp lại tiêu đề "Bài tập ngữ pháp"
  (đã có ở trang cha) — bỏ hẳn phần header ở đây, giữ nguyên toàn bộ phần
  accordion nhóm câu hỏi + form nhập liệu bên dưới không đổi gì.

**`src/pages/GrammarSetListPage.tsx`** — trở thành trang duy nhất:
- Props đổi: `lessonId`, `onBackToLesson` (giữ nguyên), thêm
  `onSetFinished: (lessonQuizScore: number, xpEarned: number) => void` (bắc
  cầu thẳng xuống `GrammarExerciseSetBody`, thay cho việc trước đây
  `GrammarExerciseFlow` làm việc này). Bỏ `onSelectSet` (không còn cần báo
  ngược lên App — set đang mở giờ là state nội bộ của chính trang này).
- Thêm state `expandedSetId: string | null` (mặc định `null` — không set
  nào mở sẵn).
- Bỏ toàn bộ logic khóa tuần tự (`unlockedFound`, biến `isUnlocked`). Mỗi
  set chỉ còn 2 trạng thái: `isPassed` (từ `attemptsBySetId[set.id]?.isPassed
  ?? false`) → nhãn **"Đã đạt"** (xanh), ngược lại → nhãn **"Chưa làm"**
  (cam) — bỏ hẳn nhãn "Cần làm"/"Khóa" và icon `Lock`.
- Mọi hàng đều `onClick` được (bỏ `disabled`): bấm vào hàng đang đóng → mở
  nó và đóng hàng khác (`setExpandedSetId(set.id)`); bấm vào hàng đang mở →
  đóng nó (`setExpandedSetId(null)`).
- Khi 1 hàng đang mở (`expandedSetId === set.id`), render
  `<GrammarExerciseSetBody set={{id: set.id, title: set.title}}
  onSetFinished={onSetFinished} onCollapse={() => setExpandedSetId(null)}
  />` ngay bên dưới hàng đó, trong cùng khối border/rounded của hàng (giống
  cấu trúc `<section>` accordion cấp 2 đã có sẵn trong
  `GrammarExercisePage.tsx` — dùng lại đúng pattern
  `overflow-hidden rounded-2xl border ... bg-white shadow-sm` +
  `border-t border-slate-100 p-4` cho phần nội dung mở).
- Nút chevron (`ChevronDown`/`ChevronRight` từ `lucide-react`, đã dùng ở cấp
  2) thay cho icon trạng thái tròn/khóa cũ ở đầu hàng — icon `CheckCircle2`
  vẫn giữ để báo "đã đạt" cạnh chevron.

**`src/App.tsx`** (dòng ~394-403):
- Bỏ import `GrammarExerciseFlow`, import `GrammarSetListPage` thay vào chỗ
  gọi.
- Đổi props truyền xuống: `lessonId={activeLessonObject.id}`,
  `onBackToLesson={() => setCurrentPage("lesson-detail")}`,
  `onSetFinished={handleQuizFinished}` (đây chính là hàm cũ được truyền vào
  làm `onQuizFinished` cho `GrammarExerciseFlow` — cùng 1 hàm, chỉ đổi tên
  prop nhận). Props `onNavigateHome`/`onNextLesson` của
  `GrammarExerciseFlow` cũ vốn đã không được `GrammarExerciseFlow` dùng tới
  (kiểm tra lại file cũ: cả hai đều bị bỏ qua bằng `_onNavigateHome`/
  `_onNextLesson`) — không cần truyền tiếp xuống `GrammarSetListPage`.

### Không đổi
- `src/lib/hooks/useExerciseSets.ts`, `useExerciseSetAttempt.ts`
  (`useExerciseSetAttempt` đơn + `useExerciseSetAttempts` nhiều set),
  `useGrammarExercises.ts`, `useExerciseSetDraft.ts`,
  `exerciseSetDraftLogic.ts`, `grammarAnswerCodec.ts`,
  `grammarExerciseGroups.ts`, `grammarFillInBlank.ts`,
  `supabase/functions/grammar-submit/**` — không thay đổi hành vi hay
  interface, chỉ thay đổi component nào gọi chúng.
- Accordion cấp 2 (nhóm câu hỏi theo loại trong 1 set) — logic, style, và
  hành vi giữ nguyên 100%.
- Trang `nghe`/`đọc` (`QuizPage.tsx`) — không thuộc scope, Phase 4 sẽ xử lý
  riêng.

## Hành vi & edge case

- **Draft**: không đổi. `useExerciseSetDraft(set.id)` vẫn autosave/hydrate
  đúng như cũ ngay cả khi set đó bị thu gọn rồi mở lại (đóng accordion chỉ
  unmount `GrammarExerciseSetBody`, không xóa dữ liệu đã lưu — mount lại sẽ
  tự hydrate lại từ draft/attempt trong DB).
- **Chuyển set khi đang có câu trả lời chưa lưu**: bấm mở set khác trong khi
  set đang mở còn dữ liệu chưa autosave (debounce 1s) — chấp nhận rủi ro mất
  tối đa các thay đổi trong 1 giây gần nhất, giống hành vi hiện tại khi rời
  trang (đã được chấp nhận ở Phase 3, không thay đổi).
- **Nhiều lesson/category dùng lại `GrammarSetListPage`**: hiện tại hard-code
  filter `category === "nguphap"` — giữ nguyên, không mở rộng sang
  nghe/đọc ở spec này (đúng scope Phase 3 đã chốt: "Chỉ Ngữ pháp ngay, Nghe/
  Đọc tự động có sau Phase 4").

## Testing

- Không có logic thuần mới cần unit test — đây là refactor cấu trúc UI/props,
  không đổi hành vi tính điểm/lưu draft.
- Cập nhật lại test Playwright thủ công / checklist tay: xác nhận (1) tất cả
  set bấm mở được không phụ thuộc set khác đã pass, (2) chỉ 1 set mở tại 1
  thời điểm, (3) nộp bài xong bấm "Tiếp tục" thu gọn set đó lại, (4) F5 giữa
  chừng khi đang mở 1 set → quay về danh sách accordion (mọi set đóng), đúng
  hành vi "F5 giữa chừng quay về danh sách set" đã chốt ở Phase 2 (giờ hiểu
  là "quay về trạng thái đóng hết accordion").
- Chạy `npm run lint` + toàn bộ `node:test` suite hiện có sau khi sửa, đảm
  bảo không có test nào phụ thuộc `GrammarExerciseFlow`/`onSelectSet`/
  `onBackToList` bị lỡ tay để sót (grep trước khi coi là xong).
