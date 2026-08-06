# Phase 1 — Component dùng chung phần nhập bài làm cho đủ 10 loại câu hỏi

Ngày: 2026-08-05

Mục cuối trong `requirement.md` ("Áp dụng toàn bộ kiểu câu hỏi từ phần ngữ
pháp sang cho nghe và đọc, giữ nguyên logic như phần ngữ pháp"). Chia 3
phase độc lập (nhập bài làm / hiển thị kết quả / form Admin) — spec này chỉ
phủ **Phase 1: nhập bài làm**.

## Bối cảnh

`GrammarExercisePage.tsx` hỗ trợ 10 loại câu hỏi (`GRAMMAR_TYPE_LABELS`):
word_reorder, error_correction, translation, sentence_transformation,
guided_sentence_writing, classification, fill_in_the_blank,
multiple_choice, text_fill_blank, matching.

`QuizSetListPage.tsx` (nghe/đọc) chỉ tự vẽ input cho 3/10 loại
(`QUIZ_TYPE_LABELS`): multiple_choice, text_fill_blank, matching. `EditForm`
phía Admin (`AdminQuizSection.tsx:18`) cũng chỉ khai báo đúng 3 giá trị này
— 7 loại còn lại không tạo được cho nghe/đọc dù tầng chấm điểm
(`grammar-submit/scoring.ts`) đã category-agnostic từ trước (chấm theo
`type`, không quan tâm `category`).

Đã xác nhận `ExerciseCard` (component nội bộ trong `GrammarExercisePage.tsx`,
dòng ~109-289) đã là 1 renderer input tự chứa, sạch, theo từng loại — chỉ
thiếu 2 loại `text_fill_blank`/`matching` (hiện chỉ có ở `QuizSetListPage.tsx`).
Word-bank chip (gợi ý từ để điền `fill_in_the_blank`) là lớp UI tuỳ chọn vẽ
riêng ở **cấp nhóm câu hỏi** (`GrammarExercisePage.tsx:749`), tương tác qua
đúng props `onBlankFocus`/`onBlankAnswerChange` mà `ExerciseCard` đã có sẵn
— không phải một phần của `ExerciseCard`, giữ nguyên vị trí, không port
sang Quiz ở phase này (`fill_in_the_blank` vẫn dùng được ở nghe/đọc qua gõ
tay trực tiếp, chỉ thiếu gợi ý chip).

## Phạm vi

Chỉ phần **nhập bài làm** (input lúc đang làm bài, chưa nộp). Hiển thị kết
quả sau khi nộp (Phase 2) và form Admin (Phase 3) — spec riêng, không làm
ở đây.

## Kiến trúc

Tách `ExerciseCard` khỏi `GrammarExercisePage.tsx`, chuyển sang
`src/components/ExerciseAnswerInput.tsx` (theo đúng chỗ các component dùng
chung khác đã ở, vd `MultipleChoiceOptions.tsx`), export ra, thêm 2 nhánh
còn thiếu:

```tsx
// src/components/ExerciseAnswerInput.tsx
export const ExerciseAnswerInput: React.FC<{
  exercise: GrammarExercise;
  numberLabel: string;
  selectedTokens: string[];
  onToggleToken: (token: string, tokenIdx: number) => void;
  onClearTokens: () => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
  itemGroups: Record<string, string>;
  onItemGroupChange: (item: string, group: string) => void;
  blankAnswers: string[];
  onBlankFocus: (blankIndex: number) => void;
  onBlankAnswerChange: (blankIndex: number, value: string) => void;
  blankResults?: boolean[];
  selectedChoice: number | undefined;
  onSelectChoice: (index: number) => void;
  choiceResult?: boolean;
  // Mới cho Phase 1 — text_fill_blank (nghe/đọc, khác fill_in_the_blank
  // của ngữ pháp: tách sẵn từng ô {{blank}} trong prompt_text, không có
  // word bank).
  textFillBlankValues: string[];
  onTextFillBlankChange: (blankIndex: number, value: string) => void;
  // Mới cho Phase 1 — matching, bọc lại MatchingExercise đã có sẵn trong
  // QuizSetListPage.tsx (chuyển sang cùng file này).
  matchedPairs: Record<string, string>;
  onMatch: (de: string, vi: string) => void;
}> = (...) => { ... };
```

`text_fill_blank` dùng đúng cách vẽ đã có ở `QuizSetListPage.tsx` (mỗi ô
`{{blank}}` trong `prompt_text` → 1 input trắng, không word bank) —
`countBlankTokens`/`splitBlankAnswers`/`joinBlankAnswers` giữ nguyên trong
`quizAnswerCodec.ts`, không đổi.

`matching` chuyển `MatchingExercise` (hiện đang định nghĩa riêng trong
`QuizSetListPage.tsx:55-121`) sang cùng file `ExerciseAnswerInput.tsx`,
export, dùng lại y nguyên logic xáo trộn 1 lần + click-để-ghép.

## Wiring

- `GrammarExercisePage.tsx`: xoá định nghĩa `ExerciseCard` cũ, import
  `ExerciseAnswerInput` từ component mới, gọi y hệt cách cũ (không truyền
  2 prop mới vì ngữ pháp không có exercise loại `text_fill_blank`/`matching`
  trong thực tế hiện tại — nhưng props vẫn cần optional-safe: mảng/map rỗng
  mặc định để không crash nếu sau này có).
- `QuizSetListPage.tsx` (`QuizExerciseSetBody`): thêm state còn thiếu để
  đủ 10 loại — `selectedTokensByExercise`, `textAnswerByExercise`,
  `itemGroupsByExercise`, `blankAnswersByExercise` (cho `fill_in_the_blank`
  của ngữ pháp, phân biệt với `blankValuesByExercise` đã có cho
  `text_fill_blank`) — theo đúng tên và shape đang dùng trong
  `GrammarExercisePage.tsx`, không đặt tên khác. Xoá `MatchingExercise`
  định nghĩa riêng trong file này (đã chuyển sang file dùng chung), import
  từ đó. Thay toàn bộ JSX per-type hiện có bằng 1 vòng `exercises.map(ex =>
  <ExerciseAnswerInput ... />)`.
- `getAnswerStringFor`/`collectAllAnswers` trong `QuizExerciseSetBody` mở
  rộng để xử lý đủ 10 loại — dùng thẳng `serializeAnswer`/`parseAnswer` từ
  `grammarAnswerCodec.ts` (đã category-agnostic, đang dùng cho ngữ pháp)
  thay vì tự viết lại logic serialize riêng cho từng loại như hiện tại.

## Hydrate draft/attempt

`QuizExerciseSetBody` hiện hydrate qua `applyAnswers()` tự viết, chỉ xử lý
3 loại. Thay bằng gọi thẳng `parseAnswersIntoFormState` (đã dùng cho ngữ
pháp, đã hỗ trợ cả `selectedTokens` cho `word_reorder` — xem
`reconstructWordReorderTokens`, fix hôm nay) — loại bỏ `applyAnswers` tự
viết, tránh lặp lại đúng bug "token picker không phục hồi" đã sửa cho ngữ
pháp nhưng chưa áp dụng cho nghe/đọc.

## Error handling

Không đổi — exercise loại không nhận diện được (`type` lạ) vẫn không hiện
gì (giữ hành vi hiện có của cả 2 file, không throw).

## Testing

- Không có state/logic mới cần test riêng ở Phase 1 — toàn bộ hàm serialize/
  parse/reconstruct đã có test đầy đủ (`grammarAnswerCodec.test.ts`). Phase
  này thuần là lắp ráp JSX + state, verify thủ công trên trình duyệt.
- Checklist thủ công: tạo 1 set nghe với câu hỏi loại `word_reorder` (qua
  Phase 3 sau, hoặc chèn thẳng DB để test riêng Phase 1) → mở làm bài, xác
  nhận chọn từ/ghép câu hoạt động đúng như bên ngữ pháp; lưu draft, mở lại,
  xác nhận token đã chọn được phục hồi.

## Acceptance Criteria

- [ ] `ExerciseAnswerInput` render đúng cho cả 10 loại, dùng ở cả
      `GrammarExercisePage.tsx` và `QuizSetListPage.tsx`.
- [ ] Ngữ pháp không đổi hành vi (regression test thủ công: làm 1 bài
      `word_reorder` và 1 bài `classification` ở ngữ pháp như cũ).
- [ ] Nghe/đọc nhập được đủ 10 loại câu hỏi (miễn Admin đã tạo được — phụ
      thuộc Phase 3, nhưng lớp render/state phải sẵn sàng nhận bất kỳ loại
      nào ngay khi có dữ liệu).
- [ ] Draft/attempt hydrate đúng cho `word_reorder` ở nghe/đọc (dùng
      `parseAnswersIntoFormState`, không tự viết lại `applyAnswers`).
- [ ] `npm run lint` sạch, không còn `MatchingExercise`/`ExerciseCard`
      định nghĩa trùng ở 2 nơi.

## Out of scope (đẩy sang Phase 2/3 hoặc không làm ở phase này)

- Hiển thị đúng/sai sau khi nộp bài cho 7 loại mới ở nghe/đọc — Phase 2.
- Form Admin tạo/sửa 7 loại câu hỏi mới cho nghe/đọc — Phase 3. Nghĩa là
  Phase 1 chưa có cách tạo dữ liệu thật qua UI; test thủ công Phase 1 cần
  chèn dữ liệu mẫu thẳng vào DB.
- Word-bank chip gợi ý cho `fill_in_the_blank` ở nghe/đọc — giữ nguyên là
  tính năng riêng của ngữ pháp, không port.
