# Badge trạng thái bài tập + ẩn set rỗng

Ngày: 2026-08-05

2 mục trong `requirement.md`: "Bug trạng thái 'Đang làm' và 'Chưa đạt' chưa
được phân biệt với 'Chưa làm'" và "Bug set đã xoá hết câu hỏi vẫn hiển thị,
số 'Bài N' tự dồn khi xoá bài ở giữa". Gộp chung 1 spec vì cùng chạm
`GrammarSetListPage.tsx`/`QuizSetListPage.tsx` và cùng compute ở component
cha trước khi render `SetRow`.

## Bối cảnh

Học viên bấm "Lưu" khi đang làm dở bài tập ngữ pháp/nghe/đọc — draft được
ghi vào `exercise_set_drafts` (đã có từ Phase 3, xem
[2026-07-30-exercise-set-drafts-design.md](./2026-07-30-exercise-set-drafts-design.md))
nhưng không có tín hiệu nào cho học viên biết đã lưu thành công: không
toast, và badge trong danh sách bài tập vẫn hiện "Chưa làm" y như trước khi
lưu. Badge hiện chỉ nhị phân (`isPassed ? "Đã đạt" : "Chưa làm"` — xem
`GrammarSetListPage.tsx:67`, `QuizSetListPage.tsx:551`), nên "đã nộp nhưng
dưới 80%" và "chưa từng động vào" hiện chung một nhãn.

Riêng biệt: khi admin xoá hết câu hỏi của 1 set (không xoá chính set), set
rỗng đó vẫn nằm trong `exercise_sets` với `status = "published"`, nên vẫn
lọt qua filter hiện có và hiện thành "Bài N" cho học viên — mở ra thì thấy
"Bài tập ngữ pháp cho bài học này chưa được soạn."

## Phạm vi

Chỉ sửa 2 trang danh sách bài tập cho học viên
(`GrammarSetListPage.tsx`, `QuizSetListPage.tsx`) và phần "Lưu" trong
`GrammarExerciseSetBody`/`QuizExerciseSetBody` cùng file. Không đổi Admin —
admin vẫn cần thấy và sửa được set rỗng. Không đổi cách tính điểm,
`pickHydrateSource`, hay schema DB.

Đánh số "Bài N" sau khi ẩn set rỗng vẫn tính theo vị trí trong danh sách
còn lại (dồn số bình thường như mọi list) — **không** thêm cột DB lưu số cố
định theo set. Nếu sau này cần số ổn định vĩnh viễn, đó là spec riêng.

## Data flow

Component cha (`GrammarSetListPage`/`QuizSetListPage`) đã fetch
`sets` (`useExerciseSets`) và `attemptsBySetId` (`useExerciseSetAttempts`).
Thêm 2 hook batched mới theo đúng pattern của `useExerciseSetAttempts`:

```ts
// src/lib/hooks/useNonEmptySetIds.ts
export function useNonEmptySetIds(setIds: string[]): {
  nonEmptySetIds: Set<string>;
  loading: boolean;
}
```
1 query `grammar_exercises_public.select("set_id").in("set_id", setIds)`
(bảng câu hỏi dùng chung cho cả 3 category — xem `useGrammarExercises.ts`),
gom `set_id` xuất hiện ít nhất 1 lần thành `Set<string>`.

```ts
// src/lib/hooks/useExerciseSetDrafts.ts
export function useExerciseSetDrafts(setIds: string[]): {
  draftSetIds: Set<string>;
  loading: boolean;
  markDraftSaved: (setId: string, hasDraft: boolean) => void;
}
```
1 query `exercise_set_drafts.select("set_id").in("set_id", setIds)`.
`markDraftSaved` cập nhật lạc quan ngay sau khi Lưu/Nộp bài thành công,
cùng cơ chế `updateAttempt` đã có trong `useExerciseSetAttempts`.

Ở component cha, thứ tự xử lý:

1. Lọc `sets` theo `status === "published"` (đã có) **và**
   `nonEmptySetIds.has(set.id)` (mới).
2. Tính `orderNumber = index + 1` trên danh sách đã lọc ở bước 1.
3. Với mỗi set còn lại, tính badge status:
   ```ts
   type SetStatus = "not_started" | "in_progress" | "failed" | "passed";

   function computeSetStatus(
     attempt: { isPassed: boolean } | undefined,
     hasDraft: boolean,
   ): SetStatus {
     if (attempt?.isPassed) return "passed";
     if (hasDraft) return "in_progress";
     if (attempt) return "failed";
     return "not_started";
   }
   ```
   Draft thắng attempt cũ khi cả hai cùng tồn tại (học viên nộp rớt, sửa
   lại, bấm Lưu) — nhất quán với `pickHydrateSource` đã dùng cho Phase 3.
4. Trong lúc `nonEmptySetIds`/`draftSetIds` đang loading, danh sách hiện
   trạng thái loading chung (không render `SetRow` nào) — tránh nhấp nháy
   số thứ tự khi set rỗng bị lọc ra sau đó.

`SetRow` nhận prop `status: SetStatus` thay vì `isPassed: boolean`, badge
map:

| status | Nhãn | Màu |
|---|---|---|
| `passed` | Đã đạt | xanh lá (giữ nguyên) |
| `in_progress` | Đang làm | xanh dương |
| `failed` | Chưa đạt | cam (giữ nguyên style "chưa làm" cũ) |
| `not_started` | Chưa làm | xám |

## Feedback khi bấm Lưu

Trong `GrammarExerciseSetBody`/`QuizExerciseSetBody`, nút "Lưu" hiện gọi
thẳng `saveDraft(collectAllAnswers())`. Đổi thành:

```ts
const handleSaveDraft = async () => {
  const answers = collectAllAnswers();
  const { error } = await saveDraft(answers); // saveDraft đổi để trả {error}
  if (error) {
    showToast("Không thể lưu, vui lòng thử lại.", "warning");
    return;
  }
  showToast("Đã lưu bài làm dở.", "success");
  onDraftSaved?.(true);
};
```

`saveDraft` trong `useExerciseSetDraft.ts` hiện nuốt lỗi (`if (!error)
setDraft(...)`, không trả gì) — đổi để trả `{ error: string | null }` ra
ngoài, đúng pattern `renameSet`/các hàm ghi khác trong `useExerciseSets.ts`.

`onDraftSaved` là prop mới, cùng dạng `onAttemptUpdate` đã có — cha gọi
`markDraftSaved(setId, true)`. Khi nộp bài thành công (`handleSubmit` đã
gọi `deleteDraft()`), gọi thêm `onDraftSaved?.(false)` để badge chuyển đúng
sang "Đã đạt"/"Chưa đạt" ngay, không kẹt ở "Đang làm" do state cũ trong
`draftSetIds`.

## Error handling

- Lỗi fetch `nonEmptySetIds`/`draftSetIds`: coi như rỗng (`Set()`), không
  chặn render danh sách — set không lọc được vẫn hiện, badge fallback về
  dữ liệu attempt (không tệ hơn hành vi hiện tại).
- Lỗi `saveDraft`: toast cảnh báo, không đổi badge (giữ nguyên trạng thái
  trước đó, đúng vì chưa lưu được gì mới).

## Testing

- `computeSetStatus` tách hàm thuần, test bằng `node:test` — 4 nhánh
  (not_started/in_progress/failed/passed) + trường hợp draft thắng attempt
  cũ.
- Lọc set rỗng + đánh số: test hàm thuần nhận `sets` +
  `nonEmptySetIds` trả về danh sách đã lọc + đánh số, không cần mock
  Supabase.
- Phần còn lại (hook fetch, toast, Supabase thật) verify thủ công trên
  trình duyệt — theo đúng giới hạn effort đã áp dụng ở Phase 3.

## Acceptance Criteria

- [ ] Set đã lưu draft (chưa nộp) hiện badge "Đang làm", không phải
      "Chưa làm".
- [ ] Set đã nộp nhưng dưới 80% hiện badge "Chưa đạt", tách biệt "Chưa
      làm".
- [ ] Bấm "Lưu" thành công hiện toast xác nhận; lưu lỗi hiện toast cảnh
      báo, không giả vờ thành công.
- [ ] Set không còn câu hỏi nào không hiện trong danh sách bài tập của học
      viên (ngữ pháp lẫn nghe/đọc).
- [ ] Số "Bài N" sau khi ẩn set rỗng vẫn liền mạch 1, 2, 3...
- [ ] Admin vẫn thấy và sửa được set rỗng ở trang quản trị (không đổi).
- [ ] Nộp bài xong, draft bị xoá và badge không còn kẹt ở "Đang làm".

## Out of scope

- Số "Bài N" cố định vĩnh viễn theo từng set (cần cột DB mới + sửa logic
  admin sắp xếp) — xem ghi chú trong `requirement.md`.
- Gộp query fetch chi tiết câu hỏi của từng `SetRow` thành 1 query duy nhất
  cho cả lesson (ponytail debt đã ghi trong `GrammarSetListPage.tsx`) — spec
  này chỉ thêm 1 query đếm nhẹ (`select("set_id")`) để lọc set rỗng, không
  đụng vào cách mỗi row tự fetch câu hỏi khi mở rộng.
- Bug câu con "Phân loại" không hiện đúng/sai trước khi Pass — mục riêng
  trong `requirement.md`, spec riêng.
