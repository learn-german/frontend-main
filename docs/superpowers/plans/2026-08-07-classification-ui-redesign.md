# Đổi UI câu hỏi "Phân loại" (classification) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi UI tương tác của loại câu hỏi "Phân loại" (classification) — học viên chuyển từ `<select>` dropdown sang click-chọn-từ-rồi-click-cột-đích; Admin chuyển từ 2 danh sách tách rời sang card-per-nhóm; kết quả sau khi nộp chuyển từ danh sách phẳng sang cột nhóm giống layout mới.

**Architecture:** Thuần thay đổi lớp UI/tương tác trong 2 file component đã có (`ExerciseAnswerInput.tsx`, `AdminGrammarExerciseSection.tsx`) + 1 hàm mới và 1 hàm sửa hành vi trong `src/lib/grammarExerciseForm.ts`. Không đổi data model, không đổi prop interface, không đổi `grammar-submit`, không đổi database.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4, `node:test` cho unit test hàm thuần.

## Global Constraints

- Prop interface `ExerciseAnswerInput`/`ExerciseResultReview` không đổi.
- Không đổi `grammar-submit` (scoring, wire format `correctAnswerRaw`), không đổi database/migration.
- Không đổi `validateForm`/`buildPayload`/`addGroupToForm`/`setGroupInForm`/`addItemToForm`/`setItemInForm`/`removeItemFromForm` — dùng nguyên.
- Không đổi các loại câu hỏi khác (`matching`, `fill_in_the_blank`, `text_fill_blank`, ...).
- Xoá nhóm ở Admin giờ xoá luôn các từ bên trong nhóm đó (behavior change đã được duyệt trong spec).
- Naming: `camelCase` biến/hàm, không dùng `any`. Nội dung hiển thị cho user: tiếng Việt.

---

## File Structure

- Modify: `src/lib/grammarExerciseForm.ts` — thêm `addWordToGroup`, sửa `removeGroupFromForm`.
- Modify: `src/lib/grammarExerciseForm.test.ts` — test cho 2 hàm trên.
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx` — khối classification trong `ExerciseEntryFields` (dòng ~722-798), đổi sang card-per-nhóm.
- Modify: `src/components/ExerciseAnswerInput.tsx` — khối classification input trong `ExerciseAnswerInput` (dòng ~228-251) và khối classification result trong `ExerciseResultReview` (dòng ~416-443).

---

### Task 1: `grammarExerciseForm.ts` — `addWordToGroup` + sửa `removeGroupFromForm`

**Files:**
- Modify: `src/lib/grammarExerciseForm.ts`
- Test: `src/lib/grammarExerciseForm.test.ts`

**Interfaces:**
- Consumes: `EditForm` interface đã có (`classification_groups: string[]`, `classification_items: { item: string; group: string }[]`).
- Produces: `addWordToGroup(f: EditForm, group: string): EditForm` — thêm 1 item rỗng vào nhóm chỉ định. `removeGroupFromForm(f: EditForm, i: number): EditForm` — hành vi mới: xoá nhóm tại index `i` VÀ xoá luôn mọi item thuộc nhóm đó (thay vì gỡ gán `group: ""`).

- [ ] **Step 1: Đọc lại `grammarExerciseForm.test.ts` để lấy đúng pattern test hiện có**

File hiện tại (đã đọc, xác nhận đúng cấu trúc) dùng `test()` từ `node:test`, `assert` từ `node:assert/strict`, và factory function để tạo fixture `EditForm` classification. Ví dụ pattern factory hiện có trong file (không cần sửa, chỉ tham chiếu để viết test mới cho nhất quán):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FORM,
  addGroupToForm,
  setGroupInForm,
  removeGroupFromForm,
  addItemToForm,
  setItemInForm,
  removeItemFromForm,
  addPairToForm,
  setPairInForm,
  removePairFromForm,
  type EditForm,
} from "./grammarExerciseForm";
```

- [ ] **Step 2: Viết failing test cho `addWordToGroup` và hành vi mới của `removeGroupFromForm`**

Thêm vào cuối `src/lib/grammarExerciseForm.test.ts`:

```ts
test("addWordToGroup thêm 1 item rỗng vào đúng nhóm", () => {
  const f: EditForm = {
    ...EMPTY_FORM,
    classification_groups: ["der", "die"],
    classification_items: [{ item: "Vater", group: "der" }],
  };
  const result = addWordToGroup(f, "die");
  assert.deepEqual(result.classification_items, [
    { item: "Vater", group: "der" },
    { item: "", group: "die" },
  ]);
});

test("removeGroupFromForm xoá nhóm và xoá luôn các item thuộc nhóm đó", () => {
  const f: EditForm = {
    ...EMPTY_FORM,
    classification_groups: ["der", "die"],
    classification_items: [
      { item: "Vater", group: "der" },
      { item: "Mutter", group: "die" },
      { item: "Kind", group: "der" },
    ],
  };
  const result = removeGroupFromForm(f, 0);
  assert.deepEqual(result.classification_groups, ["die"]);
  assert.deepEqual(result.classification_items, [{ item: "Mutter", group: "die" }]);
});
```

Cập nhật import ở đầu file, thêm `addWordToGroup` vào danh sách import từ `./grammarExerciseForm`.

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npx tsx --test src/lib/grammarExerciseForm.test.ts`
Expected: FAIL — `addWordToGroup` chưa tồn tại (import error), và/hoặc `removeGroupFromForm` test fail vì hành vi cũ gỡ gán thay vì xoá.

- [ ] **Step 4: Thêm `addWordToGroup` và sửa `removeGroupFromForm` trong `grammarExerciseForm.ts`**

Đọc lại `src/lib/grammarExerciseForm.ts`, tìm định nghĩa hiện tại của `removeGroupFromForm` (dạng gỡ gán `group: ""`) và thay bằng:

```ts
export const addWordToGroup = (f: EditForm, group: string): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group }],
});

export const removeGroupFromForm = (f: EditForm, i: number): EditForm => {
  const removed = f.classification_groups[i];
  return {
    ...f,
    classification_groups: f.classification_groups.filter((_, idx) => idx !== i),
    classification_items: f.classification_items.filter((it) => it.group !== removed),
  };
};
```

Đặt `addWordToGroup` ngay cạnh các hàm classification khác (`addGroupToForm`, `setGroupInForm`) để nhóm theo chức năng, giữ nguyên vị trí `removeGroupFromForm`.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx tsx --test src/lib/grammarExerciseForm.test.ts`
Expected: PASS — toàn bộ test trong file (cũ + mới) đều pass.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/grammarExerciseForm.ts src/lib/grammarExerciseForm.test.ts
git commit -m "feat: addWordToGroup + đổi removeGroupFromForm sang xoá item khi xoá nhóm"
```

---

### Task 2: Admin — card-per-nhóm trong `AdminGrammarExerciseSection.tsx`

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `addWordToGroup`, `removeGroupFromForm` (từ Task 1) + `addGroupToForm`, `setGroupInForm`, `setItemInForm`, `removeItemFromForm` (đã có sẵn, không đổi signature). `EditForm.classification_groups: string[]`, `EditForm.classification_items: { item: string; group: string }[]`.
- Produces: không có API mới cho task khác — đây là lá cây UI cuối trong Admin.

- [ ] **Step 1: Đọc lại đúng vị trí khối classification hiện tại trong `ExerciseEntryFields`**

Đọc `src/pages/admin/AdminGrammarExerciseSection.tsx` quanh dòng 722-798 để xác nhận offset chính xác trước khi sửa (số dòng có thể lệch nhẹ so với bản đã đọc trước đó trong phiên này).

- [ ] **Step 2: Cập nhật import từ `grammarExerciseForm`**

Trong khối import hiện tại (dòng ~43-57):

```ts
import {
  type EditForm,
  EMPTY_FORM,
  validateForm,
  buildPayload,
  addGroupToForm,
  setGroupInForm,
  removeGroupFromForm,
  addItemToForm,
  setItemInForm,
  removeItemFromForm,
  addPairToForm,
  setPairInForm,
  removePairFromForm,
} from "../../lib/grammarExerciseForm";
```

Thêm `addWordToGroup` vào danh sách:

```ts
import {
  type EditForm,
  EMPTY_FORM,
  validateForm,
  buildPayload,
  addGroupToForm,
  setGroupInForm,
  removeGroupFromForm,
  addWordToGroup,
  addItemToForm,
  setItemInForm,
  removeItemFromForm,
  addPairToForm,
  setPairInForm,
  removePairFromForm,
} from "../../lib/grammarExerciseForm";
```

- [ ] **Step 3: Thay khối classification (2 danh sách tách rời) bằng card-per-nhóm**

Tìm khối JSX hiện tại render classification trong `ExerciseEntryFields` (đoạn có 2 block: 1 block map `entry.classification_groups` render input tên nhóm phẳng, 1 block map `entry.classification_items` render dropdown chọn nhóm cho từng item). Thay toàn bộ bằng:

```tsx
{entry.type === "classification" && (
  <div className="space-y-3">
    {entry.classification_groups.map((group, groupIndex) => {
      const itemsInGroup = entry.classification_items
        .map((it, i) => ({ ...it, originalIndex: i }))
        .filter((it) => it.group === group);
      return (
        <div key={groupIndex} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={group}
              onChange={(e) => onChange((prev) => setGroupInForm(prev, groupIndex, e.target.value))}
              className="flex-1 px-3 py-2 text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder={`Nhóm ${groupIndex + 1}`}
            />
            <button
              type="button"
              onClick={() => onChange((prev) => removeGroupFromForm(prev, groupIndex))}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {itemsInGroup.map(({ item, originalIndex }) => (
              <div key={originalIndex} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-2.5 pr-1 py-1">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => onChange((prev) => setItemInForm(prev, originalIndex, "item", e.target.value))}
                  className="w-20 text-xs focus:outline-none"
                  placeholder="Tisch"
                />
                <button
                  type="button"
                  onClick={() => onChange((prev) => removeItemFromForm(prev, originalIndex))}
                  className="p-0.5 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange((prev) => addWordToGroup(prev, group))}
              disabled={!group.trim()}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm từ
            </button>
          </div>
        </div>
      );
    })}
    <button
      type="button"
      onClick={() => onChange(addGroupToForm)}
      className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
    >
      <Plus className="w-3.5 h-3.5" /> Thêm nhóm
    </button>
  </div>
)}
```

Ghi chú: `onChange` ở đây là prop callback hiện có của `ExerciseEntryFields` kiểu `(updater: (prev: EditForm) => EditForm) => void` (xác nhận theo cách các block khác trong cùng file — vd. `addPairToForm`/`removePairFromForm` — đã gọi `onChange`; giữ đúng cùng pattern gọi, không đổi signature). `X` và `Plus` đã có sẵn trong import icon ở đầu file, không cần thêm import mới.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors. Nếu lint báo `onChange` không khớp kiểu, đọc lại chữ ký thật của prop `onChange` trong `ExerciseEntryFieldsProps` (hoặc tương đương) và chỉnh lời gọi cho khớp — không đổi kiểu prop.

- [ ] **Step 5: Test thủ công trên browser**

Chạy `npm run dev`, vào Admin → Quản lý bài tập ngữ pháp → sửa/tạo 1 câu "Phân loại":
- Sửa tên nhóm → xác nhận input cập nhật, các item con vẫn giữ đúng nhóm (vì `setGroupInForm` đã tự đổi `group` của item liên quan).
- Bấm "+ Thêm từ" trong 1 card → xác nhận thêm đúng 1 input rỗng vào đúng card đó.
- Bấm nút xoá trên 1 chip từ → xác nhận chỉ xoá đúng từ đó.
- Bấm nút xoá nhóm → xác nhận nhóm và toàn bộ từ trong nhóm biến mất khỏi form.
- Bấm "+ Thêm nhóm" → xác nhận thêm 1 card nhóm rỗng ở cuối.
- Lưu câu hỏi → xác nhận `validateForm`/`buildPayload` (không đổi) vẫn hoạt động, câu được lưu đúng.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): đổi UI câu Phân loại sang card-per-nhóm"
```

---

### Task 3: Học viên — click-select input trong `ExerciseAnswerInput`

**Files:**
- Modify: `src/components/ExerciseAnswerInput.tsx`

**Interfaces:**
- Consumes: prop `itemGroups: Record<string, string>`, `onItemGroupChange: (item: string, group: string) => void` (đã có, không đổi). `exercise.classificationItems: string[] | undefined`, `exercise.classificationGroups: string[] | undefined` (đã có).
- Produces: state cục bộ mới `selectedClassificationItem: string | null` — chỉ dùng nội bộ component này, không phải prop, không ảnh hưởng task khác.

- [ ] **Step 1: Đọc lại đúng vị trí khối classification hiện tại trong `ExerciseAnswerInput`**

Đọc `src/components/ExerciseAnswerInput.tsx` quanh dòng 228-251 để xác nhận offset chính xác trước khi sửa.

- [ ] **Step 2: Thêm state cục bộ**

Trong thân hàm `ExerciseAnswerInput` (component đã import sẵn `useState` từ `"react"` ở đầu file — `import React, { useMemo, useState } from "react";`), thêm ngay đầu hàm (cạnh các `useState`/`useMemo` khác nếu có, hoặc dòng đầu tiên của thân hàm nếu chưa có state nào):

```ts
const [selectedClassificationItem, setSelectedClassificationItem] = useState<string | null>(null);
```

- [ ] **Step 3: Thay khối `<select>` bằng khối chip + cột nhóm click-select**

Thay toàn bộ khối JSX hiện tại:

```tsx
{exercise.type === "classification" && (
  <>
    <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">{letter}</span>
    <div className="space-y-1.5">
      {(exercise.classificationItems ?? []).map((item) => (
        <div key={item} className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-800 flex-1">{item}</span>
          <select
            value={itemGroups[item] ?? ""}
            onChange={(e) => onItemGroupChange(item, e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          >
            <option value="">-- Chọn nhóm --</option>
            {(exercise.classificationGroups ?? []).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  </>
)}
```

bằng:

```tsx
{exercise.type === "classification" && (
  <>
    <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">{letter}</span>
    <div className="flex flex-wrap gap-1.5">
      {(exercise.classificationItems ?? [])
        .filter((item) => !itemGroups[item])
        .map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSelectedClassificationItem((prev) => (prev === item ? null : item))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              selectedClassificationItem === item
                ? "bg-orange-50 border-orange-400 text-orange-700"
                : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item}
          </button>
        ))}
      {(exercise.classificationItems ?? []).length > 0 &&
        (exercise.classificationItems ?? []).every((item) => itemGroups[item]) && (
          <span className="text-[11px] text-slate-400 italic">Đã xếp hết</span>
        )}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {(exercise.classificationGroups ?? []).map((group) => (
        <button
          key={group}
          type="button"
          onClick={() => {
            if (!selectedClassificationItem) return;
            onItemGroupChange(selectedClassificationItem, group);
            setSelectedClassificationItem(null);
          }}
          className={`rounded-lg border p-2 text-left transition-colors ${
            selectedClassificationItem ? "border-orange-300 bg-orange-50/40 animate-pulse" : "border-slate-200 bg-slate-50/50"
          }`}
        >
          <span className="block text-xs font-bold text-slate-700 uppercase mb-1">{group}</span>
          <div className="flex flex-wrap gap-1">
            {(exercise.classificationItems ?? [])
              .filter((item) => itemGroups[item] === group)
              .map((item) => (
                <span
                  key={item}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedClassificationItem((prev) => (prev === item ? null : item));
                  }}
                  className={`px-2 py-1 rounded-md border text-xs cursor-pointer transition-colors ${
                    selectedClassificationItem === item
                      ? "bg-orange-50 border-orange-400 text-orange-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-orange-300"
                  }`}
                >
                  {item}
                </span>
              ))}
          </div>
        </button>
      ))}
    </div>
  </>
)}
```

Giải thích hành vi (khớp spec mục 1): click chip chưa xếp → chọn (viền cam); click lại chip đang chọn → bỏ chọn; click chip đã xếp trong 1 cột → chọn lại nó (để chuyển nhóm khác), dùng `stopPropagation` để không kích hoạt luôn `onClick` của cột cha; click header/thân cột nhóm khi đang có `selectedClassificationItem` → gán nhóm rồi bỏ chọn; không có gì chọn thì click cột không làm gì (`if (!selectedClassificationItem) return;`).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Test thủ công trên browser**

Chạy `npm run dev`, vào 1 bài học có câu Phân loại, làm bài:
- Click 1 chip chưa xếp → xác nhận viền cam nổi bật, các cột nhóm chuyển pulse.
- Click 1 cột nhóm → xác nhận từ chuyển vào đúng cột, chip biến mất khỏi khu "chưa xếp", các cột hết pulse.
- Click 1 chip đã nằm trong cột → xác nhận chip đó được chọn lại (viền cam), rồi click cột khác → xác nhận từ chuyển đúng sang cột mới (không bị nhân đôi).
- Click chip đang chọn lần 2 → xác nhận bỏ chọn (hết viền cam, cột hết pulse).
- Xếp hết toàn bộ từ → xác nhận khu "chưa xếp" hiện "Đã xếp hết".

- [ ] **Step 6: Commit**

```bash
git add src/components/ExerciseAnswerInput.tsx
git commit -m "feat: đổi UI làm bài Phân loại sang click-chọn-từ-click-cột-nhóm"
```

---

### Task 4: Kết quả — cột nhóm trong `ExerciseResultReview`

**Files:**
- Modify: `src/components/ExerciseAnswerInput.tsx`

**Interfaces:**
- Consumes: prop `userGroups: Record<string, string>`, `classificationResults: boolean[] | undefined`, `revealed: boolean`, `correctAnswerRaw` (đã có, không đổi), hàm sẵn có `getCorrectGroups(exercise, correctAnswerRaw): Record<string, string>`.
- Produces: không có API mới — đây là lá cây UI cuối cùng.

- [ ] **Step 1: Đọc lại đúng vị trí khối classification result hiện tại trong `ExerciseResultReview`**

Đọc `src/components/ExerciseAnswerInput.tsx` quanh dòng 416-443 để xác nhận offset chính xác (có thể lệch sau Task 3 do file cùng đổi ở phần trên).

- [ ] **Step 2: Thay khối danh sách phẳng bằng cột nhóm + khu "Chưa trả lời"**

Thay khối JSX hiện tại:

```tsx
{exercise.type === "classification" && (
  <div className="mb-2 space-y-1">
    {(exercise.classificationItems ?? []).map((item, itemIndex) => {
      const userGroup = userGroups[item] ?? "—";
      const correctGroup = revealed ? getCorrectGroups(exercise, correctAnswerRaw)[item] : undefined;
      const isCorrect = classificationResults?.[itemIndex] ?? false;
      return (
        <div key={item} className="flex items-center gap-2 text-xs">
          <span className="flex-1 text-slate-700">{item}</span>
          <span className={`rounded-md border px-2 py-1 font-bold ${isCorrect ? "border-green-300 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            {userGroup}
          </span>
          {revealed && !isCorrect && correctGroup && (
            <span className="rounded-md border border-green-300 bg-green-50 px-2 py-1 font-bold text-green-700">
              {correctGroup}
            </span>
          )}
        </div>
      );
    })}
  </div>
)}
```

bằng:

```tsx
{exercise.type === "classification" && (
  <div className="mb-2 space-y-2">
    {(exercise.classificationGroups ?? []).map((group) => {
      const itemsInGroup = (exercise.classificationItems ?? []).filter((item) => userGroups[item] === group);
      if (itemsInGroup.length === 0) return null;
      return (
        <div key={group} className="rounded-lg border border-slate-200 bg-white p-2">
          <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{group}</span>
          <div className="flex flex-wrap gap-1.5">
            {itemsInGroup.map((item) => {
              const itemIndex = (exercise.classificationItems ?? []).indexOf(item);
              const correctGroup = revealed ? getCorrectGroups(exercise, correctAnswerRaw)[item] : undefined;
              const isCorrect = classificationResults?.[itemIndex] ?? false;
              return (
                <span
                  key={item}
                  className={`rounded-md border px-2 py-1 text-xs font-bold ${
                    isCorrect ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"
                  }`}
                >
                  {item}
                  {revealed && !isCorrect && correctGroup && (
                    <span className="ml-1 text-[10px] text-green-700">→ {correctGroup}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      );
    })}
    {(() => {
      const unanswered = (exercise.classificationItems ?? []).filter((item) => !userGroups[item]);
      if (unanswered.length === 0) return null;
      return (
        <div className="rounded-lg border border-dashed border-slate-200 p-2">
          <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Chưa trả lời</span>
          <div className="flex flex-wrap gap-1.5">
            {unanswered.map((item) => (
              <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                {item}
              </span>
            ))}
          </div>
        </div>
      );
    })()}
  </div>
)}
```

Ghi chú: đổi màu "sai" từ xám (`border-slate-200 bg-slate-50 text-slate-600`) sang đỏ (`border-red-300 bg-red-50 text-red-700`) để nhất quán với các loại câu hỏi khác trong cùng file (`fill_in_the_blank`/`matching` đã dùng đỏ cho sai) — cải thiện nhỏ đi kèm redesign, không phải thay đổi ngoài phạm vi vì cùng thuộc "hiện đúng/sai theo màu" đã có trong spec mục 2.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Test thủ công trên browser**

Làm 1 bài Phân loại và nộp bài:
- Xác nhận kết quả hiện đúng theo cột nhóm (không còn danh sách phẳng).
- Item xếp đúng → viền xanh; xếp sai → viền đỏ + hiện đáp án đúng cạnh bên (mũi tên) khi `revealed`.
- Item chưa trả lời (nếu có, vd. thoát giữa chừng) → xuất hiện trong khu "Chưa trả lời" riêng, không lẫn vào cột nào.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExerciseAnswerInput.tsx
git commit -m "feat: đổi UI kết quả câu Phân loại sang cột nhóm"
```

---

### Task 5: Refresh GitNexus + `detect_changes` + push

**Files:** không tạo/sửa file mới — task xác minh cuối cùng trước khi push.

- [ ] **Step 1: Refresh GitNexus index**

Run: `node .gitnexus/run.cjs analyze`

Nếu lỗi FTS-index corruption: `node .gitnexus/run.cjs clean --force && npx gitnexus analyze`.

- [ ] **Step 2: Chạy `detect_changes` so với `origin/main`**

Dùng `mcp__gitnexus__detect_changes` với `scope: "compare"`, `base_ref: "origin/main"`, `repo: "frontend-main"`. Xác nhận các symbol/flow bị ảnh hưởng chỉ nằm trong phạm vi: `addWordToGroup`, `removeGroupFromForm`, `ExerciseEntryFields` (classification block), `ExerciseAnswerInput` (classification block), `ExerciseResultReview` (classification block). Nếu thấy symbol ngoài phạm vi bị ảnh hưởng bất ngờ → dừng lại, điều tra trước khi push.

- [ ] **Step 3: Chạy lại toàn bộ test suite 1 lần cuối**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage:**
- Mục 1 (học viên input) → Task 3. ✓
- Mục 2 (kết quả) → Task 4. ✓
- Mục 3 (Admin card) → Task 2. ✓
- Mục 4 (`addWordToGroup` + `removeGroupFromForm`) → Task 1. ✓
- "Không đổi" (prop interface, `grammar-submit`, DB, các hàm form khác, loại câu hỏi khác) → không có task nào động tới các phần này, đúng như spec yêu cầu. ✓
- Testing (unit test hàm thuần, lint, test thủ công) → có trong Task 1 (unit test) và Task 2-4 (lint + test thủ công theo từng khối). ✓

**2. Placeholder scan:** không còn "TBD"/"tương tự Task N" — mọi khối JSX/code đều viết đầy đủ nguyên văn.

**3. Type consistency:** `selectedClassificationItem: string | null` dùng nhất quán xuyên Task 3. `addWordToGroup(f: EditForm, group: string): EditForm` khớp giữa Task 1 (định nghĩa) và Task 2 (sử dụng). `removeGroupFromForm(f: EditForm, i: number): EditForm` giữ nguyên signature cũ, chỉ đổi thân hàm.
