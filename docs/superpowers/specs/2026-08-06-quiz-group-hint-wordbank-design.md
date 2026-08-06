# Phase 3b — Học viên nhìn thấy group/hint/word-bank khi làm bài nghe/đọc

## Bối cảnh

Roadmap "Áp dụng toàn bộ kiểu câu hỏi từ ngữ pháp sang nghe/đọc" chia 3 phase:
- Phase 1 (xong) — `ExerciseAnswerInput` dùng chung cho phần nhập bài làm.
- Phase 2 (xong) — `ExerciseResultReview` dùng chung cho phần hiển thị kết quả.
- Phase 3a (xong) — Admin dùng chung form tạo/sửa câu hỏi, đủ 10 loại + group/hint/word-bank ở tầng authoring cho nghe/đọc.
- **Phase 3b (spec này)** — học viên nhìn thấy group/hint/word-bank khi làm bài nghe/đọc, giống hệt ngữ pháp.

## Hiện trạng (đã xác nhận bằng cách đọc code)

`GrammarSetListPage.tsx`/`QuizSetListPage.tsx` đã giống nhau ở tầng ngoài (accordion "Bài N" theo `exercise_sets`). Khác biệt nằm hoàn toàn trong 2 component:

- **`GrammarExerciseSetBody`** (`GrammarExercisePage.tsx`): group câu hỏi trong set theo `group_id` (`groupGrammarExercises`), mỗi group hiện `GrammarExerciseHint` + word-bank chip picker (chỉ áp dụng `fill_in_the_blank`) + `ExerciseAnswerInput` cho từng câu. Nếu set có >1 group thì mỗi group là 1 accordion con "Bài N" riêng; set kết quả cũng group tương tự, dùng `ExerciseResultReview`.
- **`QuizExerciseSetBody`** (`QuizSetListPage.tsx`): hiện flat — không group theo `group_id`, không hint, không word-bank. Có thêm phần Grammar không có: banner audio (`ClipRow`-style playback) hoặc đoạn văn đọc, hiện 1 lần ở đầu set (không theo group).

Dữ liệu đã sẵn sàng — **không cần đổi backend/data layer**: `useGrammarExercises(setId)` là hook dùng chung cho cả 2 trang (query thẳng `set_id`, không lọc category), đã trả về `groupId`/`hint`/`wordBank` cho MỌI exercise bất kể category. `GrammarExerciseHint` là component thuần hiển thị, không phụ thuộc gì ngữ pháp. Phase 3b vì vậy là thuần túy thay đổi tầng render trong `QuizExerciseSetBody`.

Đồng thời phát hiện 3 gap ở card kết quả của `QuizExerciseSetBody` (hardcode rỗng dù dữ liệu đã có sẵn, chấp nhận tạm ở Phase 2):
- `submittedText=""` — Quiz chưa có snapshot "bài làm gốc" như Grammar (`submittedAnswerSnapshot`/`getSubmittedTextFor`).
- `userGroups={{}}` — trong khi `itemGroupsByExercise` (dùng cho classification) đã tồn tại sẵn trong state.
- `classificationResults={undefined}` — server (`grammar-submit`) đã trả `classificationResults` cho mọi category, nhưng `QuizResult` interface phía client chưa khai báo field này.

## Kiến trúc

Port trực tiếp logic grouping/hint/word-bank/snapshot từ `GrammarExerciseSetBody` sang `QuizExerciseSetBody`, giữ nguyên style code đã có (2 component này vốn đã duplicate ~90% logic hydrate/autosave/submit/retry từ trước, không phải lần đầu duplicate). Không đụng vào `GrammarExerciseSetBody`/`GrammarExercisePage.tsx` (trừ việc export thêm `GRAMMAR_TYPE_INSTRUCTIONS` để dùng chung, không đổi hành vi).

### 1. Grouping

Thêm vào `QuizExerciseSetBody`:
```ts
const groups = useMemo(() => groupGrammarExercises(exercises), [exercises]);
const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
```
Thay khối JSX flat `<div className="grid...">{exercises.map(...)}</div>` (phần đang làm bài) bằng đúng pattern Grammar đang dùng: nếu `groups.length === 1` hiện thẳng nội dung group, ngược lại mỗi group là 1 `<section>` accordion "Bài N" (badge loại câu hỏi + số câu), có `renderGroupContent` dùng chung cho cả 2 cách hiện.

### 2. Hint + word bank

Thêm state `blankAssignments`/`focusedBlank` (kiểu `BlankAssignments`/`BlankFocus` từ `grammarFillInBlank.ts`). `renderGroupContent` copy nguyên khối của Grammar: `<GrammarExerciseHint hint={group.exercises[0]?.hint} groupKey={group.key} />`, dòng hướng dẫn theo loại (`GRAMMAR_TYPE_INSTRUCTIONS[group.type]`), và word-bank chip picker (chỉ hiện khi `group.type === "fill_in_the_blank"` và `wordBank` tồn tại) dùng `applyChipToBlank`/`findBlankTarget`/`getUsedWordIndexes`.

### 3. Banner audio/đoạn văn

Không đổi vị trí — vẫn 1 khối duy nhất ở đầu set (không theo group), lấy từ `exercises[0]` như hiện tại, đặt phía trên phần group/accordion.

### 4. Sửa 3 gap ở card kết quả

- Thêm `submittedAnswerSnapshot` state + hàm `getSubmittedTextFor` (copy nguyên từ Grammar), set khi hydrate từ attempt và khi submit thành công.
- `QuizResult` interface thêm `classificationResults: Record<string, boolean[]>`; effect hydrate-từ-attempt truyền `classificationResults: attempt.classificationResults` (field đã có sẵn trong `useExerciseSetAttempt` hook).
- Card kết quả chuyển từ `exercises.map` phẳng sang `groups.map` + `group.exercises.map` (đúng cấu trúc Grammar), truyền `submittedText={getSubmittedTextFor(ex)}`, `userGroups={itemGroupsByExercise[ex.id] ?? {}}`, `classificationResults={result.classificationResults?.[ex.id]}` thay vì giá trị hardcode rỗng. `matchedPairs`/`blankValues`/`selectedChoice`/`choiceResult` giữ nguyên cách lấy hiện tại (đã đúng).

### 5. Type labels dùng chung

Xoá `QUIZ_TYPE_LABELS` cục bộ (3 entry) trong `QuizSetListPage.tsx`. Export thêm `GRAMMAR_TYPE_INSTRUCTIONS` từ `GrammarExercisePage.tsx` (hiện chưa export, chỉ `GRAMMAR_TYPE_LABELS` đã export). Import cả 2 vào `QuizSetListPage.tsx`, dùng thay `QUIZ_TYPE_LABELS`/instructions tự viết.

### 6. Numbering

Sau khi group, đổi `numberLabel` từ `` `Câu ${index+1} · ${type label}` `` sang `` `${groupIndex+1}.${childIndex+1}` `` (khớp Grammar) — badge loại câu hỏi đã hiện ở header group nên không cần lặp lại trên từng câu. Áp dụng cho cả `ExerciseAnswerInput` (đang làm bài) lẫn `ExerciseResultReview` (kết quả).

## Không đổi

- Không đổi `GrammarExerciseSetBody`/`GrammarExercisePage.tsx` hành vi hiện có (chỉ export thêm 1 hằng số).
- Không đổi `ExerciseAnswerInput.tsx`/`ExerciseResultReview.tsx` (Phase 1/2) — props interface đã đủ dùng, không cần sửa.
- Không đổi backend (`grammar-submit` edge function, DB schema) — dữ liệu group/hint/word-bank/classificationResults đã có sẵn từ trước.
- Không đổi cấu trúc `SetRow`/`QuizSetListPage` ở tầng ngoài (accordion theo `exercise_sets` giữ nguyên).

## Testing

- Không có logic thuần mới cần unit test riêng — mọi hàm dùng lại (`groupGrammarExercises`, `applyChipToBlank`, v.v.) đã có test từ trước, không đổi hành vi của chúng.
- `npm run lint` sau khi sửa.
- Chạy lại toàn bộ test suite hiện có (131 test) — không được có test nào fail (đảm bảo không phá vỡ `grammarExerciseGroups.test.ts`, `grammarFillInBlank.test.ts`, `grammarAnswerCodec.test.ts`, v.v. mà file này phụ thuộc).
- Xác minh thủ công trên trình duyệt (sandbox không có `.env.local` nên chỉ ghi checklist, không tự chạy được): mở 1 set nghe/đọc có nhiều group (tạo qua Admin ở Phase 3a) chung hint/word-bank cho `fill_in_the_blank`, xác nhận hiện đúng hint + chip word-bank + accordion theo group; nộp bài, xác nhận card kết quả hiện đúng group + đáp án đúng-sai + "bài làm của bạn" (submittedText) cho loại text-based; xác nhận banner audio/đoạn văn vẫn hiện đúng vị trí không đổi.

## Rủi ro

- Diff tập trung hoàn toàn trong `QuizSetListPage.tsx` (1 file) — không đụng `GrammarExercisePage.tsx` ngoài 1 export mới, nên rủi ro với ngữ pháp gần như bằng 0.
- Nếu dữ liệu nghe/đọc thật hiện tại (nếu có) chưa có `group_id` (tạo trước Phase 3a), mỗi câu tự thành 1 group riêng (logic `getGroupKey` trong `grammarExerciseGroups.ts` đã xử lý sẵn trường hợp `groupId` null) — không cần migrate dữ liệu cũ, hiển thị vẫn đúng (chỉ không có group nhiều câu).
