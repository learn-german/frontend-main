# Câu Phân loại: giới hạn 1 câu/nhóm bài + bỏ lưới 3-cột — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin không thể gộp câu Phân loại thứ 2 vào chung 1 nhóm bài; bên học viên và Admin preview module nghe/đọc, nhóm bài loại Phân loại hiển thị full-width thay vì bị ép vào lưới 1/2/3-cột.

**Architecture:** Thuần điều kiện hiển thị JSX ở 4 vị trí trong 3 file component đã có. Không đổi data model, không đổi DB, không thêm hàm thuần mới cần unit test.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4.

## Global Constraints

- Không đổi DB/migration, không đổi `grammar-submit`.
- Không đổi `validateForm`/`buildPayload`/các hàm form khác trong `grammarExerciseForm.ts`.
- Không đổi hành vi gộp nhiều câu của các loại câu hỏi khác — chỉ riêng Phân loại bị giới hạn 1 câu/nhóm.
- Không xử lý/dọn dữ liệu cũ — nhóm Phân loại đã có sẵn ≥2 câu (nếu có) giữ nguyên trong DB, chỉ đổi cách hiển thị.
- Không đổi block preview classification-groups-as-columns trong modal Preview (Eye icon) của Admin — ngoài phạm vi.

---

## File Structure

- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx` — ẩn 2 nút cho phép gộp thêm câu Phân loại vào 1 nhóm.
- Modify: `src/pages/GrammarExercisePage.tsx` — grid layout nhóm bài Phân loại full-width.
- Modify: `src/pages/QuizSetListPage.tsx` — grid layout nhóm bài Phân loại full-width (nghe/đọc).

---

### Task 1: Admin — ẩn nút "Thêm câu" trên dòng nhóm bài Phân loại đã có

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx:213-223`

**Interfaces:**
- Consumes: `exerciseGroup: GrammarExerciseGroup<GrammarExercise>` (đã có sẵn trong scope của `SortableExerciseGroupRow`, có field `exerciseGroup.type`).
- Produces: không có API mới.

- [ ] **Step 1: Đọc lại đúng vị trí hiện tại**

Đọc `src/pages/admin/AdminGrammarExerciseSection.tsx` quanh dòng 213-223 để xác nhận offset chính xác trước khi sửa (component `SortableExerciseGroupRow`, ngay sau khối `<LessonStatusBadge>`).

- [ ] **Step 2: Bọc điều kiện ẩn theo type**

Thay khối JSX hiện tại:

```tsx
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onAddChildren(exerciseGroup, groupIndex);
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-orange-600 hover:bg-orange-50 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm câu
        </button>
```

bằng:

```tsx
        {exerciseGroup.type !== "classification" && (
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onAddChildren(exerciseGroup, groupIndex);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-orange-600 hover:bg-orange-50 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm câu
          </button>
        )}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): ẩn nút Thêm câu trên nhóm bài Phân loại đã có"
```

---

### Task 2: Admin — ẩn nút "+ Thêm câu cùng loại" khi đang tạo/thêm câu Phân loại

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx:1624-1631`

**Interfaces:**
- Consumes: `entries: EditForm[]` (state cục bộ đã có trong component cha, `entries[0].type` phản ánh loại đang chọn — reset về 1 entry mỗi khi đổi loại qua `handleTypeChange`), `modalMode: ModalMode` (đã có).
- Produces: không có API mới.

- [ ] **Step 1: Đọc lại đúng vị trí hiện tại**

Đọc `src/pages/admin/AdminGrammarExerciseSection.tsx` quanh dòng 1624-1631 để xác nhận offset chính xác (ngay sau vòng lặp `entries.map(...)` render `ExerciseEntryFields`, trước khối nút "Hủy"/"Lưu").

- [ ] **Step 2: Thêm điều kiện type vào nhánh hiện**

Thay:

```tsx
            {modalMode !== "edit" && (
              <button
                onClick={addEntry}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu cùng loại
              </button>
            )}
```

bằng:

```tsx
            {modalMode !== "edit" && entries[0]?.type !== "classification" && (
              <button
                onClick={addEntry}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu cùng loại
              </button>
            )}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Test thủ công trên browser**

Chạy `npm run dev`, vào Admin → Quản lý bài tập ngữ pháp:
- Bấm "Thêm bài tập mới", chọn loại "Phân loại" → xác nhận nút "+ Thêm câu cùng loại" không hiện.
- Đổi loại sang "Sắp xếp từ" (`word_reorder`) hoặc loại khác → xác nhận nút "+ Thêm câu cùng loại" hiện lại bình thường, bấm vẫn thêm được entry thứ 2 như cũ.
- Trong danh sách bài đã có, tìm 1 nhóm bài loại Phân loại → xác nhận không còn nút "Thêm câu" trên dòng nhóm đó (Task 1). Tìm 1 nhóm bài loại khác → nút "Thêm câu" vẫn hiện, bấm vào vẫn mở modal thêm câu như cũ.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): ẩn nút Thêm câu cùng loại khi tạo/thêm câu Phân loại"
```

---

### Task 3: Học viên — bỏ lưới 3-cột cho nhóm bài Phân loại trong `GrammarExercisePage.tsx`

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx:463`

**Interfaces:**
- Consumes: `group: (typeof groups)[number]` (đã có trong scope của `renderGroupContent`, có field `group.type`).
- Produces: không có API mới.

- [ ] **Step 1: Đọc lại đúng vị trí hiện tại**

Đọc `src/pages/GrammarExercisePage.tsx` quanh dòng 463 để xác nhận offset chính xác (bên trong `renderGroupContent`, ngay trước `group.exercises.map((exercise, childIndex) => <ExerciseAnswerInput .../>)`).

- [ ] **Step 2: Đổi class container theo `group.type`**

Thay:

```tsx
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
```

bằng:

```tsx
        <div className={group.type === "classification" ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "feat: nhóm bài Phân loại hiển thị full-width thay vì lưới 3-cột (ngữ pháp)"
```

---

### Task 4: Học viên — bỏ lưới 3-cột cho nhóm bài Phân loại trong `QuizSetListPage.tsx`

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx:324`

**Interfaces:**
- Consumes: `group: (typeof groups)[number]` (đã có trong scope của `renderGroupContent`, có field `group.type`) — cùng kiểu dữ liệu như Task 3, file khác (nghe/đọc thay vì ngữ pháp).
- Produces: không có API mới.

- [ ] **Step 1: Đọc lại đúng vị trí hiện tại**

Đọc `src/pages/QuizSetListPage.tsx` quanh dòng 324 để xác nhận offset chính xác (bên trong `renderGroupContent`, ngay trước `group.exercises.map((exercise, childIndex) => <ExerciseAnswerInput .../>)`).

- [ ] **Step 2: Đổi class container theo `group.type`**

Thay:

```tsx
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
```

bằng:

```tsx
        <div className={group.type === "classification" ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Test thủ công trên browser**

Chạy `npm run dev` (nếu chưa chạy), vào 1 bài học ngữ pháp có nhóm câu Phân loại → xác nhận card Phân loại chiếm full-width (Task 3). Vào 1 bài nghe hoặc đọc có nhóm câu Phân loại → xác nhận tương tự (Task 4). So sánh với 1 nhóm bài loại khác có nhiều câu cạnh nhau → xác nhận vẫn chia lưới 1/2/3-cột như cũ, không bị ảnh hưởng.

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat: nhóm bài Phân loại hiển thị full-width thay vì lưới 3-cột (nghe/đọc)"
```

---

### Task 5: Refresh GitNexus + `detect_changes` + chạy test suite + push

**Files:** không tạo/sửa file mới — task xác minh cuối cùng trước khi push.

- [ ] **Step 1: Refresh GitNexus index**

Run: `node .gitnexus/run.cjs analyze`

Nếu lỗi FTS-index corruption: `node .gitnexus/run.cjs clean --force && npx gitnexus analyze`.

- [ ] **Step 2: Chạy `detect_changes` so với `origin/main`**

Dùng `mcp__gitnexus__detect_changes` với `scope: "compare"`, `base_ref: "origin/main"`, `repo: "frontend-main"`. Xác nhận các symbol/flow bị ảnh hưởng chỉ nằm trong phạm vi: `SortableExerciseGroupRow`/khối modal trong `AdminGrammarExerciseSection.tsx`, `renderGroupContent` trong `GrammarExercisePage.tsx` và `QuizSetListPage.tsx`. Nếu thấy symbol ngoài phạm vi bị ảnh hưởng bất ngờ → dừng lại, điều tra trước khi push.

- [ ] **Step 3: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (không có test mới trong plan này vì không có hàm thuần nào thay đổi — chỉ xác nhận không phá vỡ test hiện có).

Run thêm 2 script test riêng:
```bash
npx tsx src/lib/completion.test.ts
npx tsx supabase/functions/daily-progress-report/completion.test.ts
```
Expected: cả 2 in ra `completion.test.ts OK`.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage:**
- Mục 1 spec (khoá 2 nút gộp câu Phân loại) → Task 1 (nút "Thêm câu" trên nhóm đã có) + Task 2 (nút "+ Thêm câu cùng loại" khi tạo/thêm). ✓
- Mục 2 spec (bỏ lưới 3-cột, full-width) → Task 3 (`GrammarExercisePage.tsx`) + Task 4 (`QuizSetListPage.tsx`). ✓
- "Không đổi" (DB, `grammar-submit`, `validateForm`/`buildPayload`, hành vi loại câu khác, preview modal Eye icon, dữ liệu cũ) → không có task nào động tới các phần này. ✓
- Testing (lint sau mỗi thay đổi, test thủ công) → có trong Task 2 và Task 4 (gộp test thủ công cho cả 2 phần liên quan mới xong ngay trước đó, tránh lặp lại bước mở browser). Task 5 chạy lại automated test suite để đảm bảo không phá vỡ gì. ✓

**2. Placeholder scan:** không còn "TBD"/mô tả mơ hồ — mọi bước code đều có diff before/after đầy đủ.

**3. Type consistency:** `exerciseGroup.type`/`entries[0]?.type`/`group.type` đều so sánh với literal `"classification"` (khớp `EditForm["type"]` và `GrammarExercise["type"]` đã định nghĩa sẵn trong codebase, không có type mới).
