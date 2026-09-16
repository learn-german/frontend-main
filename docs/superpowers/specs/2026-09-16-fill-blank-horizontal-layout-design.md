# Fill-in-the-blank horizontal layout — Design Spec

**Date:** 2026-09-16  
**Status:** Approved  
**Scope:** Learner Ngữ pháp + Nghe, preview admin Ngữ pháp + Nghe. Layout-only. Không đổi DB, scoring, hay `ExerciseAnswerInput`.

## Problem

Bài `fill_in_the_blank` đang nằm trong lưới `sm:grid-cols-2 lg:grid-cols-3`. Card hẹp nên câu Đức wrap dọc, khó đọc trái→phải. Nghe đang 1 cột full-width nên đỡ hơn, nhưng nhiều câu ngắn vẫn không có lưới 2 cột như mockup.

## Goal

Tự chọn một trong hai layout ngang theo **số câu con trong nhóm**:

| Layout | Điều kiện | Desktop | Mobile |
|---|---|---|---|
| PA01 `passage` | ≤ 1 câu con | 1 panel full-width, đoạn văn liên tục | cùng 1 luồng |
| PA02 `rows` | ≥ 2 câu con | lưới 2 cột, mỗi câu một hàng card | 1 cột |

Không đánh số ô trống. Giữ số câu hiện tại (`1.1` ngữ pháp, `1`/`2`/`3` nghe).

## Decisions (Q&A)

1. **Cả PA01 và PA02**, tự chọn theo nội dung — không thêm field layout trên DB.
2. **Rule:** đếm câu con. `count <= 1` → PA01; `count >= 2` → PA02. Không nhìn độ dài `prompt_text` hay số ô `___`.
3. **Học viên:** Ngữ pháp + Nghe. Đọc (`ReadingSetListPage`) không có type `fill_in_the_blank` — không đụng.
4. **Preview admin:** cả nhóm, cùng rule học viên. Form soạn (textarea `___`) không đổi.
5. **Không** badge số trên từng ô.
6. **Word bank** đặt **dưới** lưới câu của nhóm đó. Lưu/Nộp giữ footer **cấp set** (không ghép chung hàng với bank — bank là cấp nhóm, nút là cấp set).
7. **Cách làm:** helper + sửa tại chỗ. Không tạo component `FillBlankGroupPanel`. Không cột `layout` trên DB.

`count === 0` không render lưới (nhóm rỗng không xảy ra trên UI học viên). `count === 1` luôn PA01 dù câu ngắn.

## Architecture

Không đổi schema, RLS, Edge Function, hay wire format đáp án.

Helper mới trong `src/lib/grammarFillInBlank.ts` (cùng module với `countBlankMarkers`):

```ts
export type FillBlankLayout = "passage" | "rows";

export function fillInBlankLayout(exerciseCount: number): FillBlankLayout {
  return exerciseCount <= 1 ? "passage" : "rows";
}
```

Rule theo **nhóm** (`group.exercises.length`), không theo set. Một set nhiều nhóm: mỗi nhóm `fill_in_the_blank` tự chọn layout.

Tái dùng `ExerciseAnswerInput` (ô `___` inline, `blankInputCharWidth`). Chỉ đổi class lưới bọc ngoài + vị trí word bank + preview admin.

### Grid classes (chỉ khi `group.type === "fill_in_the_blank"`)

- `passage`: `grid grid-cols-1 gap-3`
- `rows`: `grid grid-cols-1 gap-3 md:grid-cols-2` — **bỏ** `lg:grid-cols-3`

Loại bài khác giữ lưới hiện tại (ngữ pháp 2–3 cột, classification 1 cột, nghe MC/RF 1 cột).

## Learner UI

### Surfaces

- `src/pages/GrammarExercisePage.tsx` — `renderGroupContent`
- `src/pages/QuizSetListPage.tsx` — `renderGroupContent` (đường Nghe; nhánh `category === "doc"` trên file này không còn được `App.tsx` mount)

### Trong `renderGroupContent` khi type là `fill_in_the_blank`

1. Hint + câu hướng dẫn: giữ trên, không đổi.
2. Lưới câu: class theo `fillInBlankLayout(group.exercises.length)`. Nghe hiện dùng `flex flex-col` cho mọi type — **riêng** `fill_in_the_blank` đi qua helper, không còn luôn 1 cột.
3. Word bank: **cắt** khỏi vị trí trước lưới, **đặt sau** lưới, vẫn trong group. Chip / `applyChipToBlank` / `single_use` không đổi. Không bank → không render khối chip.
4. Số câu: không đổi (`formatExerciseNumberLabel` / `${groupIndex + 1}.${childIndex + 1}`).
5. Wrap câu dài: hành vi inline hiện có của `ExerciseAnswerInput` — không thêm CSS số ô.

### Không đổi

- Footer Lưu / Nộp bài / Kiểm tra đáp án (cấp set).
- Card kết quả `ExerciseResultReview` (list compact).
- `ExerciseAnswerInput` internals.

## Admin preview

### Ngữ pháp — `AdminGrammarExerciseSection.tsx`

Loại khác: preview 1 câu như cũ.

`fill_in_the_blank`: bấm mắt trên bất kỳ câu con → lấy siblings bằng `groupGrammarExercises` trên list đang có (cùng `group_id`). Render cả nhóm:

- Layout theo helper như học viên.
- Word bank **một lần**, dưới lưới, chip tĩnh (không click-điền).
- Giữ markup `split("___")` + input readonly hiện có — không map sang `ExerciseAnswerInput`.
- Modal `max-w-3xl` khi preview nhóm fill-blank (2 cột không bị `max-w-lg` ép).
- Không tìm thấy sibling → fallback đúng `previewTarget` (PA01).

### Nghe — `AdminListeningExerciseSection.tsx`

Preview set đã render `ExerciseAnswerInput`. Đổi: nhóm bằng `groupGrammarExercises`. Nhóm `fill_in_the_blank` dùng helper lưới + word bank dưới (chip tĩnh). Ô trống vẫn gõ được như preview hiện tại. Nhóm MC/RF giữ 1 cột.

### Đọc — không sửa

`reading_question_groups` chỉ `richtig_falsch` | `multiple_choice`. `AdminReadingExerciseSection` ngoài scope.

## Error / edge cases

| Case | Behavior |
|---|---|
| 1 câu ngắn, 1–2 ô | PA01 full-width |
| ≥ 2 câu, mỗi câu dài wrap | PA02; wrap trong card, luồng đọc ngang |
| Set nghe mix type | Chỉ nhóm fill-blank dùng helper; MC/RF 1 cột |
| Không word bank | Không hiện chip |
| Preview thiếu sibling | 1 câu, PA01 |
| Nhiều accordion nhóm | Bank dưới từng nhóm; Lưu/Nộp dưới cả set |

## Files

| File | Change |
|---|---|
| `src/lib/grammarFillInBlank.ts` | `fillInBlankLayout` |
| `src/lib/grammarFillInBlank.test.ts` | assert 0/1 → passage, 2/8 → rows |
| `src/pages/GrammarExercisePage.tsx` | lưới + dời word bank |
| `src/pages/QuizSetListPage.tsx` | lưới nghe fill-blank + dời word bank |
| `src/pages/admin/AdminGrammarExerciseSection.tsx` | preview cả nhóm |
| `src/pages/admin/AdminListeningExerciseSection.tsx` | preview nhóm + lưới |

## Out of scope

- DB / migration / `database.types.ts`
- `grammar-submit` scoring
- `ExerciseAnswerInput` / `blankInputSize`
- Card kết quả sau nộp
- Admin Đọc / `ReadingSetListPage`
- Form soạn bài (textarea, đáp án từng ô, cấu hình word bank)
- Đánh số ô, field `layout` trên DB, component panel mới

## Verification

**Unit**

- `fillInBlankLayout(0)` và `(1)` → `"passage"`
- `fillInBlankLayout(2)` và `(8)` → `"rows"`

**Manual — học viên**

1. Ngữ pháp, nhóm 1 câu cloze dài → panel full-width, bank dưới lưới, Lưu/Nộp dưới cùng.
2. Ngữ pháp, nhóm ≥ 2 câu ngắn → 2 cột desktop, 1 cột ~375px; mỗi card đọc trái→phải; bank dưới lưới.
3. Nghe, nhóm fill-blank 1 câu / ≥ 2 câu — cùng rule.
4. Nghe mix fill-blank + MC → fill-blank theo helper, MC không vào lưới 2 cột.
5. Nộp bài / chấm / card kết quả / draft Lưu — như cũ.

**Manual — admin**

1. Preview ngữ pháp nhóm 1 câu vs ≥ 2 câu — khớp layout học viên; bank dưới.
2. Preview nghe set fill-blank — cùng rule; MC/RF không đổi cột.
3. Mở form sửa — textarea `___` không đổi.
