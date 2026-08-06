# Phase 2 — Component dùng chung phần hiển thị kết quả sau khi nộp bài

Ngày: 2026-08-05

Mục cuối trong `requirement.md` ("Áp dụng toàn bộ kiểu câu hỏi ngữ pháp
sang nghe/đọc"). Nối tiếp
[Phase 1](./2026-08-05-shared-exercise-answer-input-design.md) (đã xong —
`ExerciseAnswerInput` dùng chung cho phần nhập bài làm).

## Bối cảnh

Card kết quả sau khi nộp bài đang duplicate riêng giữa 2 file:
- `GrammarExercisePage.tsx` (dòng ~398-503): xử lý 8/10 loại — thiếu
  `text_fill_blank`, `matching`.
- `QuizSetListPage.tsx` (dòng ~297-360): xử lý 3/10 loại (`multiple_choice`,
  `text_fill_blank`, `matching`) — thiếu 7 loại còn lại.

Không cần sửa `blankResults`/`exerciseResults`/`classificationResults` —
đã category-agnostic, đủ dữ liệu cho mọi loại (classification đã fix ở
phiên trước).

`getCorrectGroupsFor`/`getCorrectBlanksFor` (tự viết trong
`GrammarExercisePage.tsx`) parse chuỗi `result.correctAnswers[exerciseId]`
— trùng logic với `parseAnswer` đã có trong `grammarAnswerCodec.ts` (cùng
wire format). Dùng thẳng `parseAnswer`, không viết hàm mới.

### 2 bug phát hiện kèm (không thuộc phạm vi gốc, nhưng chặn Phase 2)

1. **`text_fill_blank` không chấm điểm được**: `grammar-submit/index.ts`
   select `grammar_exercises` không có cột `prompt_text`, trong khi
   `computeGrammarScore`/`extractBlanks` (scoring.ts) cần cột này để chấm
   — hiện luôn nhận `undefined`, `extractBlanks` trả mảng rỗng, câu này
   không tính vào tổng và luôn bị đánh sai.
2. **Quy ước đánh dấu chỗ trống lệch nhau**: Admin nhập theo mẫu
   `"Ich {{bin|Bin}} Student."` (đáp án nằm trong `{{...}}`, khớp
   `extractBlanks`/`BLANK_PATTERN` = `/\{\{([^}]*)\}\}/g`), nhưng frontend
   (`countBlankTokens`, `ExerciseAnswerInput.tsx`) tách theo đúng nghĩa đen
   chuỗi `"{{blank}}"` — không khớp gì cả, câu không hiện ô nhập nào.
   Chưa lộ ra vì DB thật chưa có câu `text_fill_blank` nào.

## Phạm vi

- Fix 2 bug trên (điều kiện tiên quyết để phần còn lại của spec có ý nghĩa).
- Component dùng chung `ExerciseResultReview` — hiển thị đúng/sai + đáp án
  đúng (khi `revealed`) cho đủ 10 loại, dùng ở cả 2 file.
- Không đổi cách tính điểm/pass, không đổi phần nhập bài làm (Phase 1 đã
  xong), không đổi form Admin (Phase 3).

## Fix bug 1 — `prompt_text` thiếu trong select

`supabase/functions/grammar-submit/index.ts:69`, thêm `prompt_text` vào
select:
```ts
.select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, explanation, prompt_text")
```
`ScorableGrammarExercise` (scoring.ts) đã có sẵn field `prompt_text` trong
interface — không cần đổi type, chỉ cần select đủ cột.

`deriveCorrectAnswers` (scoring.ts) — thêm nhánh `text_fill_blank`, dùng
`extractBlanks` đã có sẵn, lấy biến thể đầu tiên mỗi ô (khớp cách
`fill_in_the_blank` đã làm với `acceptedAnswers[0]`):
```ts
if (ex.type === "text_fill_blank") {
  const blanks = extractBlanks(ex.prompt_text ?? "");
  result[ex.id] = JSON.stringify(blanks.map((variants) => variants[0] ?? ""));
  continue;
}
```
Xoá nhánh `ex.type === "text_fill_blank" ? "" : ...` cũ trong dòng cuối.

## Fix bug 2 — quy ước đánh dấu chỗ trống

Đổi `countBlankTokens` (`quizAnswerCodec.ts`) sang khớp đúng regex
`extractBlanks` đã dùng (đếm số nhóm `{{...}}`, không phải đếm chữ
"blank" theo nghĩa đen):
```ts
export function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{[^}]*\}\}/g) ?? []).length;
}
```

Đổi mọi chỗ `.split("{{blank}}")` sang `.split(/\{\{[^}]*\}\}/)` (regex,
bỏ dấu ngoặc/nội dung bên trong khỏi đoạn hiển thị — không lộ đáp án ra
UI vì phần match bị loại bỏ hoàn toàn, thay bằng ô input):
- `ExerciseAnswerInput.tsx` (nhập bài, dòng ~296).
- Card kết quả cũ trong `QuizSetListPage.tsx` (sẽ bị thay bằng
  `ExerciseResultReview` ở phần dưới — áp dụng đúng convention mới ngay
  trong component chung, không cần sửa riêng).

## Kiến trúc `ExerciseResultReview`

Thêm vào cuối `src/components/ExerciseAnswerInput.tsx` (cùng file với
`ExerciseAnswerInput` — 2 component luôn dùng cặp với nhau theo từng loại
câu hỏi, tách file riêng không thêm giá trị rõ ràng ở quy mô này), cùng
export `SubmittedAnswer` (chuyển từ `GrammarExercisePage.tsx`):

```tsx
export const ExerciseResultReview: React.FC<{
  exercise: GrammarExercise;
  numberLabel: string;
  revealed: boolean;
  // word_reorder/error_correction/translation/sentence_transformation/guided_sentence_writing
  submittedText: string;
  exerciseCorrect: boolean | undefined;
  correctAnswerRaw: string | undefined; // result.correctAnswers[ex.id], chỉ có khi revealed
  // classification
  userGroups: Record<string, string>;
  classificationResults: boolean[] | undefined;
  // fill_in_the_blank / text_fill_blank — dùng chung 1 shape, tách theo
  // exercise.type để chọn đúng dấu phân cách khi hiển thị lại prompt
  blankValues: string[];
  blankResults: boolean[] | undefined;
  // multiple_choice
  selectedChoice: number | undefined;
  choiceResult: boolean | undefined;
  // matching — correctPairs không cần truyền riêng: exercise.matchingPairs
  // đã tự chứa đúng cặp (giống cách QuizSetListPage cũ đã làm)
  matchedPairs: Record<string, string>;
  // giải thích, có ở mọi loại
  explanation: string | undefined;
}> = (...) => { ... };
```

Bên trong, dùng `parseAnswer(exercise, correctAnswerRaw ?? "")` để lấy
`correctGroups`/`correctBlanks` cho classification/fill_in_the_blank khi
`revealed` — thay hẳn `getCorrectGroupsFor`/`getCorrectBlanksFor` tự viết.

Mỗi nhánh JSX copy nguyên từ code hiện có ở `GrammarExercisePage.tsx`
(word_reorder-family, classification, fill_in_the_blank, multiple_choice)
và `QuizSetListPage.tsx` (text_fill_blank, matching — cả hai áp dụng luôn
regex mới từ Fix bug 2), gộp vào 1 component switch theo `exercise.type`.

## Wiring

- `GrammarExercisePage.tsx`: xoá `getCorrectGroupsFor`/`getCorrectBlanksFor`
  và toàn bộ khối JSX per-type trong result card, thay bằng
  `groups.map(...) → group.exercises.map(ex => <ExerciseResultReview ... />)`.
  Không đổi phần đầu card (điểm số, nút Làm lại/Tiếp tục).
- `QuizSetListPage.tsx`: xoá toàn bộ khối JSX per-type trong result card
  (dòng ~297-360), thay bằng `exercises.map(ex => <ExerciseResultReview
  ... />)`. Không đổi phần đầu card.
- Cả 2 nơi tự tính `submittedText`/`exerciseCorrect`/... từ state cục bộ
  của từng file (đã đủ tên biến khớp nhau từ Phase 1) truyền vào props —
  `ExerciseResultReview` không tự đọc state, chỉ nhận props (giữ đúng
  ranh giới rõ ràng như Phase 1 đã làm với `ExerciseAnswerInput`).

## Error handling

Không đổi — thiếu dữ liệu (`correctAnswerRaw`/`explanation` undefined) đã
được các nhánh JSX gốc xử lý bằng optional chaining + fallback `"—"`, giữ
nguyên khi copy sang.

## Testing

- Không có logic tính toán mới cần unit test riêng — `parseAnswer` đã có
  test đầy đủ từ Phase 1. `deriveCorrectAnswers`'s nhánh `text_fill_blank`
  mới cần 1 test trong `scoring.test.ts`.
- Checklist thủ công: tạo 1 câu `text_fill_blank` thật qua Admin (theo
  đúng mẫu `{{đáp_án}}`) — xác nhận hiện ô nhập, chấm điểm đúng/sai đúng,
  nộp đủ 5 lần hoặc đúng hết để revealed rồi xác nhận hiện đúng đáp án.
  Chèn thẳng DB 1 câu mỗi loại còn lại (word_reorder, classification,
  matching, ...) cho set nghe/đọc, nộp bài, xác nhận card kết quả hiện
  đúng/sai + đáp án đúng giống hệt bên ngữ pháp.

## Acceptance Criteria

- [ ] `text_fill_blank` chấm điểm đúng (không còn bị bỏ qua khỏi tổng câu).
- [ ] `text_fill_blank` hiện được ô nhập khi làm bài (đúng quy ước
      `{{đáp_án}}`, khớp mẫu gợi ý trong form Admin).
- [ ] `text_fill_blank` hiện đúng đáp án khi `revealed = true`.
- [ ] `ExerciseResultReview` render đúng cho cả 10 loại, dùng ở cả
      `GrammarExercisePage.tsx` và `QuizSetListPage.tsx`.
- [ ] Ngữ pháp không đổi hành vi hiển thị kết quả hiện có.
- [ ] Nghe/đọc hiện đúng/sai + đáp án đúng cho cả 10 loại (miễn có dữ liệu
      — Phase 3 mới có UI Admin tạo được, test Phase 2 vẫn cần chèn DB tay).
- [ ] `npm run lint` sạch, không còn `getCorrectGroupsFor`/
      `getCorrectBlanksFor` trùng lặp logic với `parseAnswer`.

## Out of scope

- Form Admin tạo/sửa 7 loại câu hỏi mới cho nghe/đọc — Phase 3.
- Đổi cách tính điểm/pass, đổi phần nhập bài làm (Phase 1 đã xong, không
  đụng lại trừ 2 bug marker/select ở trên).
