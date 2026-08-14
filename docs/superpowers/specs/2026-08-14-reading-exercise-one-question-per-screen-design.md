# Phase 6d — Mỗi màn hình 1 câu hỏi, bỏ chấm điểm giữa chừng

## Bối cảnh

Tiếp nối [2026-08-12-reading-exercise-per-passage-flow-design.md](2026-08-12-reading-exercise-per-passage-flow-design.md)
(Phase 6c), hiện `ReadingExerciseSetBody` chia bài theo **từng đoạn văn**
(Đoạn 1/2, 2/2): mỗi bước hiện toàn bộ câu hỏi của 1 đoạn cùng lúc, nộp
xong đoạn là chấm điểm/tô xanh-đỏ ngay rồi mới cho sang đoạn kế.

Yêu cầu người dùng (kèm ảnh chụp giao diện đích): đổi sang **mỗi màn hình
chỉ hiện 1 câu hỏi** (dạng "Câu hỏi 1/2" có chấm tròn phân trang), có nút
Quay lại để lùi tự do, và **bỏ hẳn việc chấm điểm giữa chừng** — chỉ chấm
điểm 1 lần khi bấm "Nộp bài" ở câu cuối cùng của toàn bộ set.

Đã xác nhận với người dùng:
1. Phân trang "Câu hỏi X/Y" đếm theo số câu **trong 1 nhóm (Teil)** —
   không hiện nhãn "Đoạn X/Y" nữa, đoạn văn/tiêu đề Teil tự đổi khi câu hỏi
   hiện tại thuộc nhóm/đoạn khác.
2. Bỏ hoàn toàn state/luồng chấm điểm giữa chừng (`passageReveal`,
   "Nộp đoạn này") — card câu hỏi không tô xanh/đỏ khi đang làm.
3. Nút "Quay lại" cho lùi tự do xuyên suốt toàn bộ set (kể cả qua ranh giới
   đoạn/nhóm), miễn là chưa bấm "Nộp bài" cuối cùng.
4. `multiple_choice` cũng áp dụng cùng kiểu 1-câu-1-màn-hình để đồng nhất.
5. Không thêm nhãn "Nachricht" phía trên box đoạn văn (giữ nguyên như hiện
   tại, không có caption).

## Phạm vi

**Trong phạm vi:**
- `ReadingSetListPage.tsx` (`ReadingExerciseSetBody`, `ReadingGroupBody`):
  - Dựng danh sách phẳng "câu hỏi" từ `groups` (đã sort theo đoạn → nhóm →
    thứ tự câu trong nhóm), thay `currentPassageIndex` bằng
    `currentScreenIndex` chạy suốt toàn set.
  - Bỏ `passageSubmitting`, `passageReveal`, `handleSubmitPassage`, nút
    "Nộp đoạn này".
  - Thêm nút "Quay lại" (lùi `currentScreenIndex`).
  - `ReadingGroupBody` (hoặc tách riêng cho màn làm bài) chỉ render 1 câu
    hỏi tại 1 thời điểm, kèm chấm tròn phân trang theo số câu trong nhóm
    hiện tại.
  - Đổi UI Richtig/Falsch từ 2 nút pill nhỏ cùng dòng với statement → 2
    dòng radio full-width (khoanh tròn + label) theo ảnh mẫu.
  - `multiple_choice`: chỉ hiện 1 `subQuestion` tại 1 thời điểm thay vì
    toàn bộ danh sách.
- `supabase/functions/reading-submit/index.ts`: xoá nhánh `passage_id`
  (dòng 80-101) — không còn nơi gọi tới vì bỏ "Nộp đoạn này". Request body
  không còn field `passage_id`.

**Ngoài phạm vi:**
- Màn kết quả cuối (`if (result)` block) — không đổi, vẫn hiện đầy đủ toàn
  bộ câu hỏi + đáp án dạng danh sách cuộn như hiện tại (không phân trang),
  vì đây là màn xem lại/tổng kết, không phải màn làm bài.
- Công thức tính điểm, ngưỡng 80%, `computeSetAttemptUpdate`,
  `exercise_set_attempts`/`exercise_set_drafts` schema — không đổi.
- `useReadingQuestionGroups.ts`, `LessonDetailPage.tsx` tab Lesen, Admin
  (`AdminReadingExerciseSection.tsx`) — không đổi.
- Nút "Lưu" (save draft toàn bộ `answersByKey`) — giữ nguyên hành vi và vị
  trí, không scope theo câu/đoạn hiện tại.

## Thiết kế chi tiết

### 1. Danh sách câu hỏi phẳng

```ts
type ReadingScreen = {
  passageId: string;
  group: ReadingQuestionGroupPublic;
  questionIndex: number;       // index trong group.statements / group.subQuestions
  questionCount: number;       // group.statements.length / group.subQuestions.length
  key: string;                 // itemKey(group.id, questionIndex)
};

const screens: ReadingScreen[] = useMemo(() => {
  const orderedGroups = [...groups].sort((a, b) => {
    const pa = passagesById[a.passageId]?.orderIndex ?? 0;
    const pb = passagesById[b.passageId]?.orderIndex ?? 0;
    return pa !== pb ? pa - pb : 0; // thứ tự groups cùng đoạn giữ nguyên thứ tự query
  });
  return orderedGroups.flatMap((group) => {
    const count = group.questionType === "richtig_falsch" ? group.statements.length : group.subQuestions.length;
    return Array.from({ length: count }, (_, i) => ({
      passageId: group.passageId,
      group,
      questionIndex: i,
      questionCount: count,
      key: itemKey(group.id, i),
    }));
  });
}, [groups, passagesById]);
```

Thay toàn bộ `currentPassageIndex`/`passageOrder`/`currentGroups`/
`currentKeys`/`currentAnswered` bằng:

```ts
const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
const currentScreen = screens[currentScreenIndex];
const isLastScreen = currentScreenIndex === screens.length - 1;
const currentAnswered = !!answersByKey[currentScreen.key];
```

`handleRetry` reset `setCurrentScreenIndex(0)` thay vì
`setCurrentPassageIndex(0)`; bỏ `setPassageReveal(null)`.

### 2. Render màn làm bài (thay block dòng ~368-426 hiện tại)

```tsx
<div className="space-y-4 animate-in fade-in duration-300">
  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    {currentScreen.group.title && (
      <p className="text-sm font-display font-bold text-slate-800">{currentScreen.group.title}</p>
    )}
    {currentScreen.group.questionIntro && (
      <p className="text-xs text-slate-500">{currentScreen.group.questionIntro}</p>
    )}
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <MarkdownBlock content={passagesById[currentScreen.passageId]?.textDe ?? ""} lessonId={lesson.id} />
    </div>

    <ReadingSingleQuestion
      lesson={lesson}
      screen={currentScreen}
      answersByKey={answersByKey}
      onAnswer={(value) => setAnswersByKey((prev) => ({ ...prev, [currentScreen.key]: value }))}
    />

    {/* chấm tròn phân trang trong nhóm hiện tại */}
    <div className="flex items-center justify-center gap-1.5 pt-1">
      {Array.from({ length: currentScreen.questionCount }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${i === currentScreen.questionIndex ? "bg-red-500" : "bg-slate-200"}`}
        />
      ))}
    </div>
  </div>

  <div className="flex justify-end gap-3">
    <Button variant="secondary" onClick={handleSaveDraft}>Lưu</Button>
    <Button variant="secondary" disabled={currentScreenIndex === 0} onClick={() => setCurrentScreenIndex((i) => i - 1)}>
      Quay lại
    </Button>
    {isLastScreen ? (
      <Button variant="primary" disabled={!currentAnswered || submitting} onClick={handleSubmit}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Nộp bài
      </Button>
    ) : (
      <Button variant="primary" disabled={!currentAnswered} onClick={() => setCurrentScreenIndex((i) => i + 1)}>
        Tiếp theo <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    )}
  </div>
</div>
```

`handleSaveDraft` = thân hàm `onClick` của nút Lưu hiện tại (không đổi
logic, chỉ đặt tên lại cho gọn).

### 3. `ReadingSingleQuestion` — component mới, tách khỏi `ReadingGroupBody`

`ReadingGroupBody` hiện tại (dòng 52-147) **giữ nguyên không đổi**, tiếp
tục dùng cho màn kết quả cuối (hiện toàn bộ câu + đáp án, không phân
trang). Thêm component mới chỉ render 1 câu hỏi, dùng cho màn làm bài:

```tsx
const ReadingSingleQuestion: React.FC<{
  lesson: Lesson;
  screen: ReadingScreen;
  answersByKey: Record<string, string>;
  onAnswer: (value: string) => void;
}> = ({ lesson, screen, answersByKey, onAnswer }) => {
  const picked = answersByKey[screen.key];

  if (screen.group.questionType === "richtig_falsch") {
    const statement = screen.group.statements[screen.questionIndex];
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">{statement.text}</p>
        {(["richtig", "falsch"] as const).map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => onAnswer(val)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl border transition-colors ${
              picked === val ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"
            }`}
          >
            <span className={`w-4 h-4 rounded-full border-2 ${picked === val ? "border-orange-500 bg-orange-500" : "border-slate-300"}`} />
            {val === "richtig" ? "Richtig" : "Falsch"}
          </button>
        ))}
      </div>
    );
  }

  const q = screen.group.subQuestions[screen.questionIndex];
  return (
    <div className="space-y-2">
      {q.text_snippet && <p className="text-xs text-slate-500">{q.text_snippet}</p>}
      {q.image_key && <SubQuestionImage lessonId={lesson.id} imageKey={q.image_key} />}
      <p className="text-sm font-medium text-slate-700">{q.question}</p>
      <div className="space-y-1">
        {q.options.map((opt, oi) => {
          const optKey = String(oi);
          return (
            <button
              key={oi}
              type="button"
              onClick={() => onAnswer(optKey)}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                picked === optKey ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              {String.fromCharCode(65 + oi)}. {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

Không cần `itemResults`/`revealed`/`correctAnswers` — màn làm bài không
còn chấm điểm giữa chừng nữa.

### 4. `supabase/functions/reading-submit/index.ts`

Xoá khối dòng 80-101 (nhánh `if (passage_id)`) và biến `passage_id` ở
dòng 31. Không còn caller nào gửi field này sau khi bỏ "Nộp đoạn này".
Phần còn lại của hàm (submit thật, idempotency theo `submission_id`,
rollup `lesson_progress`) **không đổi**.

`scoring.ts` (`computeReadingScore`, `projectAnswers`, `deriveCorrectAnswers`,
`deriveExplanations`) không đổi — vẫn dùng nguyên cho nhánh submit thật.

## Testing

- `npm run lint` sau khi code xong.
- `supabase/functions/reading-submit/scoring.test.ts` — không cần test
  case mới (hàm scoring không đổi hành vi). Nếu có test riêng cho nhánh
  `passage_id` cũ trong `index.ts`, xoá cùng lúc với code.
- Test thủ công trên browser (dùng set có ≥ 2 đoạn văn, nhiều nhóm câu hỏi
  mỗi đoạn — set đã tạo qua Admin từ Phase 6c):
  - Mở bài đọc: thấy đúng 1 câu hỏi + đoạn văn của nó, chấm tròn phân
    trang đúng số câu trong nhóm hiện tại, không thấy trạng thái đúng/sai.
  - Bấm "Tiếp theo" (disabled khi chưa chọn đáp án) qua hết câu hỏi trong
    1 nhóm: tiêu đề Teil/đoạn văn tự đổi khi sang nhóm/đoạn kế mà không
    cần thao tác gì thêm.
  - Bấm "Quay lại" từ câu đầu tiên của nhóm 2: quay đúng về câu cuối của
    nhóm 1, đáp án đã chọn trước đó vẫn còn (không mất `answersByKey`).
  - Nút "Quay lại" bị disable ở đúng câu hỏi đầu tiên của toàn set.
  - Câu hỏi cuối cùng của toàn set: nút đổi thành "Nộp bài", bấm xong vào
    thẳng màn kết quả (giống hành vi Phase 6b, không qua bước reveal
    trung gian nào).
  - Màn kết quả cuối vẫn hiện đầy đủ tất cả câu hỏi + đáp án như trước
    (không bị ảnh hưởng bởi thay đổi màn làm bài).
  - "Lưu" giữa chừng rồi rời trang, quay lại: khôi phục đúng
    `answersByKey`, nhưng `currentScreenIndex` reset về 0 (không lưu vị
    trí đang làm dở — chấp nhận được, giống hành vi hiện tại không lưu
    `currentPassageIndex`).

## Không đổi

- `reading_question_groups`, `reading_passages` schema, RLS,
  `reading_question_groups_public` view.
- `useReadingQuestionGroups.ts`, `useExerciseSetAttempt`,
  `useExerciseSetAttempts`, `useExerciseSetDraft`, `useExerciseSetDrafts`,
  `useNonEmptyReadingSetIds`.
- `LessonDetailPage.tsx`, Admin (`AdminReadingExerciseSection.tsx`).
- Màn kết quả cuối (`if (result)` block) và `ReadingGroupBody` — dùng
  nguyên cho màn đó.
- Công thức điểm, ngưỡng 80%, XP, rollup `lesson_progress`.

## Rủi ro

- Xoá nhánh `passage_id` trong edge function là thay đổi API bề mặt
  (request field không còn được xử lý) — không phá gì vì chỉ
  `handleSubmitPassage` (đang bị xoá cùng lúc) từng gọi với field này.
- `currentScreenIndex` không được lưu vào draft — refresh giữa chừng mất
  vị trí đang làm (quay về câu 1), chỉ mất **vị trí**, không mất đáp án đã
  chọn (`answersByKey` vẫn có trong draft nếu đã bấm Lưu). Chấp nhận được
  vì hành vi hiện tại (`currentPassageIndex`) cũng không được lưu.
