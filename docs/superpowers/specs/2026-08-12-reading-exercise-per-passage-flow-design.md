# Phase 6c — Làm bài đọc từng đoạn một + bỏ preview văn bản

## Bối cảnh

Tiếp nối [2026-08-10-reading-exercise-learner-design.md](2026-08-10-reading-exercise-learner-design.md)
(Phase 6b) và [2026-08-11-reading-exercise-multi-passage-design.md](2026-08-11-reading-exercise-multi-passage-design.md)
(Phase 6a follow-up, nhiều văn bản/set). Cả hai đều đã xong; phía học viên
(`ReadingSetListPage`, `useReadingQuestionGroups`) đã tương thích schema
N-passage-per-set nhưng UI vẫn hiện **toàn bộ đoạn văn + câu hỏi của cả set
trên 1 màn hình cuộn dài**, chấm điểm 1 lần ở cuối.

Yêu cầu người dùng (kiểm tra qua ảnh chụp `LessonDetailPage` tab Lesen +
mô tả luồng mong muốn):

1. Khi 1 "Bài" (set) có nhiều đoạn văn, mỗi màn hình chỉ hiện **1 đoạn** +
   câu hỏi của đoạn đó, chấm điểm và hiện đáp án **ngay sau khi nộp đoạn
   đó**, rồi mới có nút "Đoạn tiếp theo" sang đoạn kế.
2. Điểm tổng cuối cùng (quyết định đạt/không đạt 80%) tính theo **tổng số
   câu đúng / tổng số câu của cả set** (không phải trung bình cộng % từng
   đoạn) — xác nhận với người dùng, giữ nguyên công thức đang có.
3. Màn xem trước trong `LessonDetailPage` (tab Lesen, trước khi bấm "Bắt đầu
   bài tập đọc") **không hiện văn bản nào nữa**, chỉ hiện thông báo dạng CTA
   giống tab Nghe/Grammatikübungen — văn bản chỉ xuất hiện khi vào màn làm
   bài, theo từng đoạn.

## Phạm vi

**Trong phạm vi:**
- `LessonDetailPage.tsx` — tab "doc": bỏ khối `readingPassages.map(...)`
  hiện text, thay bằng card thông báo đồng bộ tab Nghe.
- `useReadingQuestionGroups.ts` — thêm `orderIndex` vào `ReadingPassageLite`
  (cần để sắp thứ tự đoạn khi render từng bước).
- `ReadingSetListPage.tsx` (`ReadingExerciseSetBody`) — thêm bước
  (`currentPassageIndex`), mỗi bước chỉ render 1 đoạn + nhóm câu hỏi của
  đoạn đó, nút nộp-từng-đoạn gọi chấm điểm tạm (không lưu DB), nút "Đoạn
  tiếp theo"; đoạn cuối cùng mới gọi submit thật (API không đổi, vẫn gửi
  toàn bộ `answersByKey` đã gom qua các đoạn).
- `supabase/functions/reading-submit/index.ts` — thêm nhánh optional
  `passage_id` trong request: chấm điểm subset nhóm câu hỏi thuộc đoạn đó,
  trả `itemResults/correctAnswers/explanations`, **không ghi DB, không XP,
  không rollup `lesson_progress`**.

**Ngoài phạm vi:**
- Công thức tính điểm/ngưỡng đạt 80%, `computeSetAttemptUpdate`,
  `exercise_set_attempts` schema — không đổi (đã xác nhận: tổng đúng/tổng
  câu, không phải trung bình % từng đoạn).
- Admin (`AdminReadingExerciseSection.tsx`) — không đổi, phase 6a follow-up
  đã xong.
- Nút "Quay lại đoạn trước" — không có trong yêu cầu, không thêm (YAGNI).
- Lưu draft (`useExerciseSetDraft`) — vẫn lưu theo `answersByKey` toàn set
  như hiện tại, không cần đổi vì đã hoạt động độc lập với việc render từng
  bước hay cả set.

## Thiết kế chi tiết

### 1. `LessonDetailPage.tsx` tab "doc" — bỏ preview văn bản

Xoá khối hiện tại (dòng ~311-318, `readingPassages.map` + `MarkdownBlock`).
Thay tiêu đề/mô tả để khớp việc không còn xem trước văn bản (đồng bộ
pattern tab Nghe, dòng 282-294):

```
Sẵn sàng luyện đọc chưa?
{SetSummaryLine nếu có}
Bấm bắt đầu để đọc từng đoạn văn và trả lời câu hỏi trắc nghiệm đi kèm.
[Bắt đầu bài tập đọc →]
```

Icon + header "Bài đọc" (FileText) giữ nguyên. `lesson.readingPassages`
vẫn dùng để gate `visibleTabs` (tab ẩn khi rỗng) — không đổi.

### 2. `useReadingQuestionGroups.ts` — thêm `orderIndex` cho passage

`ReadingPassageLite` thêm field `orderIndex: number`. Câu `select` passages
đổi từ `"id, text_de"` thành `"id, text_de, order_index"`, map thêm
`orderIndex: p.order_index as number`. Không đổi gì khác trong hook.

### 3. `ReadingSetListPage.tsx` — `ReadingExerciseSetBody` thành stepper

**State mới:** `currentPassageIndex: number` (mặc định 0), reset về 0 trong
`handleRetry` cùng lúc reset `answersByKey`/`result`.

**Danh sách đoạn theo thứ tự làm bài:**
```ts
const passageOrder = useMemo(
  () => [...new Set(groups.map((g) => g.passageId))]
    .sort((a, b) => (passagesById[a]?.orderIndex ?? 0) - (passagesById[b]?.orderIndex ?? 0)),
  [groups, passagesById],
);
const currentPassageId = passageOrder[currentPassageIndex];
const currentGroups = groups.filter((g) => g.passageId === currentPassageId);
const isLastPassage = currentPassageIndex === passageOrder.length - 1;
```

**Trạng thái reveal của đoạn hiện tại** (mới, tách khỏi `result` cuối set):
`const [passageReveal, setPassageReveal] = useState<{ itemResults, correctAnswers, explanations } | null>(null)`,
reset về `null` mỗi khi `currentPassageIndex` đổi.

**Render (khi chưa có `result` cuối cùng):** chỉ lặp `currentGroups` (thay
vì toàn bộ `groups` như hiện tại), nhãn "ĐOẠN {currentPassageIndex + 1}/{passageOrder.length}"
phía trên (đồng bộ style "Bài {groupIndex + 1}" đang có).

**Nút hành động** thay cho "Lưu"/"Nộp bài" cố định:
- Chưa nộp đoạn hiện tại (`passageReveal === null`): nút "Nộp đoạn này",
  disabled khi chưa trả lời hết các key thuộc `currentGroups` (tái dùng
  logic `allAnswered` nhưng scope theo `currentGroups` thay vì `allKeys`
  toàn set). Nút "Lưu" (save draft) giữ nguyên, không đổi vị trí.
- Đã nộp đoạn hiện tại (`passageReveal !== null`), chưa phải đoạn cuối: nút
  "Đoạn tiếp theo →" — tăng `currentPassageIndex`, reset `passageReveal`.
- Đã nộp đoạn hiện tại, là đoạn cuối: nút "Xem kết quả" — gọi
  `handleSubmit` hiện có (submit thật, không đổi logic).

**Nộp đoạn này** (hàm mới `handleSubmitPassage`):
```ts
const { data } = await supabase.functions.invoke("reading-submit", {
  body: { set_id: set.id, submission_id: submissionIdRef.current, passage_id: currentPassageId, answers: answersByKey },
});
setPassageReveal({ itemResults: data.itemResults, correctAnswers: data.correctAnswers, explanations: data.explanations });
```
Gửi `submission_id` giống hệt cơ chế idempotency hiện có nhưng **không dùng
cho idempotency ở nhánh partial** (nhánh partial không ghi DB nên không cần
chống double-submit theo `submission_id` — double-click chỉ chấm lại, vô
hại vì không ghi gì).

`ReadingGroupBody` hiện tại đã nhận `itemResults`/`revealed`/`correctAnswers`/`explanation`
qua props — tái dùng y nguyên cho hiển thị đoạn đã nộp, không đổi component
này.

**Màn kết quả cuối** (`if (result)`, dòng ~256-336) — không đổi, vẫn hiện
tổng kết + breakdown tất cả các đoạn (`groups.map` như hiện tại, vẫn đúng
vì lúc này đã có `result.itemResults` đầy đủ cho toàn set từ lần submit
thật).

**Retry** (`handleRetry`) — thêm `setCurrentPassageIndex(0)` và
`setPassageReveal(null)`.

### 4. `supabase/functions/reading-submit/index.ts` — nhánh partial

Request thêm field optional `passage_id?: string`. Sau khi load `groups`
(dòng 67-77), thêm `passage_id` vào `select` (`"id, passage_id, question_type, statements, sub_questions, explanation"`).

Ngay sau khi có `groups` đầy đủ của set:
```ts
if (body.passage_id) {
  const passageGroups = groups.filter((g) => g.passage_id === body.passage_id);
  if (passageGroups.length === 0) {
    return new Response(JSON.stringify({ error: "Passage not found in set" }), { status: 404, ... });
  }
  const answers = projectAnswers(passageGroups, rawAnswers);
  const { itemResults } = computeReadingScore(passageGroups, answers);
  return new Response(JSON.stringify({
    itemResults,
    correctAnswers: deriveCorrectAnswers(passageGroups),
    explanations: deriveExplanations(passageGroups),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
// ... luồng hiện tại (submit thật) giữ nguyên y hệt, không đổi
```
Nhánh partial trả về **trước** mọi bước ghi DB/XP/rollup — không đụng gì
phía dưới. Auth/lookup `set` vẫn chạy trước nhánh này như hiện tại (không
đổi thứ tự các bước đầu hàm).

## Testing

- `supabase/functions/reading-submit/scoring.test.ts` — không cần test case
  mới vì `computeReadingScore`/`projectAnswers`/`deriveCorrectAnswers` nhận
  `groups` đã lọc sẵn từ ngoài, hành vi không đổi khi gọi với subset.
- Thêm 1 test thủ công cho nhánh partial trong `index.ts`: gọi trực tiếp
  edge function (hoặc unit test nhỏ nếu file quá dài để review bằng mắt)
  xác nhận nhánh `passage_id` trả đúng `itemResults` chỉ của đoạn đó và
  **không** insert/upsert `exercise_set_attempts` (query lại bảng sau khi
  gọi, kỳ vọng không có row mới/không đổi row cũ).
- `npm run lint` sau khi code xong.
- Test thủ công trên browser (set có ≥ 2 đoạn văn, cần tạo qua Admin trước
  vì DB hiện chỉ có 1 đoạn rác test "Bài 1 check"):
  - Tab Lesen: xác nhận không còn hiện văn bản, chỉ hiện CTA.
  - Bấm "Bắt đầu bài tập đọc": thấy đúng "ĐOẠN 1/2", trả lời hết mới bấm
    được "Nộp đoạn này" được.
  - Nộp đoạn 1: thấy đáp án đúng/sai ngay, nút đổi thành "Đoạn tiếp theo".
  - Sang đoạn 2: chỉ thấy đoạn 2 (không thấy lại đoạn 1), nộp xong nút
    thành "Xem kết quả".
  - Xem kết quả: điểm tổng = tổng đúng/tổng câu cả 2 đoạn, đúng ngưỡng 80%,
    XP cộng đúng 1 lần, `lesson_progress` rollup như cũ.
  - "Làm lại bài Test": quay về đoạn 1, `answersByKey` rỗng.
  - Set chỉ có 1 đoạn (dữ liệu hiện có): luồng vẫn chạy đúng (1 bước duy
    nhất, "Nộp đoạn này" → "Xem kết quả" ngay, không có "Đoạn tiếp theo").

## Không đổi

- `reading_question_groups`, `reading_passages` schema, RLS,
  `reading_question_groups_public` view.
- `computeSetAttemptUpdate`, ngưỡng 80%, `exercise_set_attempts`/
  `exercise_set_drafts`.
- Admin (`AdminReadingExerciseSection.tsx`), `useExerciseSets`.
- `useExerciseSetAttempt`/`useExerciseSetAttempts`/`useExerciseSetDraft`/
  `useExerciseSetDrafts`/`useNonEmptyReadingSetIds` — không đổi.

## Rủi ro

- Nhánh partial trong `reading-submit` không kiểm tra `submission_id`
  trùng lặp (không cần, vì không ghi DB) — nhưng vẫn phải giữ auth check
  (`authHeader`, `supabase.auth.getUser`) y hệt nhánh thật, tránh lộ
  `correctAnswer` cho request không đăng nhập.
- `passageOrder` suy từ `groups` (chỉ chứa đoạn nào **có câu hỏi**) chứ
  không phải toàn bộ `reading_passages` của set — đúng ý vì
  `useNonEmptyReadingSetIds` đã lọc set rỗng từ trước, nhưng nếu 1 đoạn
  trong set có passage mà chưa có nhóm câu hỏi nào, đoạn đó sẽ không xuất
  hiện trong luồng làm bài (giống hành vi ẩn hiện tại, không phải regression
  mới).
