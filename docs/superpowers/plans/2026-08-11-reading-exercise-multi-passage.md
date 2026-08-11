# Nhiều văn bản trong 1 bài đọc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (not subagent-driven-development — user chỉ định thực thi trong cùng session, không dispatch subagent). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 "bài đọc" (`exercise_sets` category=`doc`) chứa được nhiều văn bản (`reading_passages`), mỗi văn bản có bộ câu hỏi Trắc nghiệm/Đúng-Sai riêng, với nút "Thêm văn bản" trong admin.

**Architecture:** Đảo chiều FK `reading_passages ↔ exercise_sets` từ 1:1 (`exercise_sets.passage_id`) sang N:1 (`reading_passages.set_id`). Tách các phép lọc/tính tổng đang inline trong component admin ra module thuần `readingSetView.ts` (test đầy đủ). Rewire `AdminReadingExerciseSection.tsx` để lồng N văn bản/thẻ.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + PostgREST), `node --import tsx --test` cho unit test.

## Global Constraints

- Ngôn ngữ code: English (biến/hàm/type); nội dung hiển thị user: Tiếng Việt.
- Không dùng `any` — type cụ thể hoặc `unknown`.
- Không sửa tay `src/lib/database.types.ts` — generate qua Supabase MCP `generate_typescript_types` (thay `npm run gen:types` vì CLI chưa `supabase login` trong sandbox này).
- Không dùng `window.alert`/`window.confirm` — `showToast()` hoặc modal UI có sẵn.
- Project Supabase: `awdhqlgxnjwymwgxltlw` (tên "Deutsch", xác nhận qua `list_projects` + đối chiếu bảng `lessons`/`exercise_sets` khớp app).
- Dữ liệu Đọc hiện có trên remote là rác test rỗng (đã xác nhận qua `execute_sql`) — xoá thẳng khi migrate, không backfill.

---

### Task 1: Migration — `reading_passages.set_id` thay `exercise_sets.passage_id`

**Files:**
- Create: `supabase/migrations/20260811010000_reading_passages_set_id.sql`
- Commit as-is (không sửa nội dung): `supabase/migrations/20260811000000_exercise_sets_passage_id.sql` (đã áp dụng lên remote từ trước, chưa commit — phải track để lịch sử migration khớp remote)

**Interfaces:**
- Produces: cột `reading_passages.set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE` (nullable); cột `exercise_sets.passage_id` không còn tồn tại.

- [ ] **Step 1: Xác nhận lại dữ liệu Đọc hiện có trên remote là rác test (double-check trước khi xoá)**

Dùng Supabase MCP tool `execute_sql` (project_id `awdhqlgxnjwymwgxltlw`):

```sql
select count(*) as passages, (select count(*) from exercise_sets where category='doc') as doc_sets, (select count(*) from reading_question_groups) as groups from reading_passages;
```

Expected: `passages=1, doc_sets=1, groups=0` (khớp kết quả đã kiểm tra lúc brainstorm — 1 passage rỗng, 1 set draft chưa gắn gì, 0 câu hỏi). Nếu khác (ví dụ đã có văn bản có nội dung/câu hỏi thật), DỪNG lại và báo người dùng trước khi xoá.

- [ ] **Step 2: Viết migration file**

`supabase/migrations/20260811010000_reading_passages_set_id.sql`:

```sql
-- =============================================================================
-- Revert 20260811000000 (exercise_sets.passage_id, 1:1) — sai hướng, chặn yêu
-- cầu "1 bài đọc có nhiều văn bản". Đổi sang reading_passages.set_id (N:1):
-- 1 exercise_sets (category=doc) chứa nhiều reading_passages.
-- Xem docs/superpowers/specs/2026-08-11-reading-exercise-multi-passage-design.md.
--
-- Dữ liệu Đọc hiện có toàn rác test rỗng (đã xác nhận qua execute_sql trước khi
-- viết migration này) — xoá thẳng, không backfill, giống quyết định gốc ở
-- 20260810120000_reading_question_groups.sql.
-- =============================================================================

DELETE FROM reading_question_groups;
DELETE FROM reading_passages;
DELETE FROM exercise_sets WHERE category = 'doc';

ALTER TABLE reading_passages
  ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;

ALTER TABLE exercise_sets
  DROP COLUMN passage_id;
```

- [ ] **Step 3: Apply migration lên Supabase**

Dùng Supabase MCP tool `apply_migration`:
- `project_id`: `awdhqlgxnjwymwgxltlw`
- `name`: `reading_passages_set_id`
- `query`: đúng nội dung SQL ở Step 2

- [ ] **Step 4: Verify schema sau migration**

Dùng `execute_sql`:

```sql
select column_name from information_schema.columns where table_name='reading_passages' and column_name='set_id';
select column_name from information_schema.columns where table_name='exercise_sets' and column_name='passage_id';
```

Expected: query đầu trả 1 row (`set_id`), query sau trả 0 row (cột đã bị xoá).

- [ ] **Step 5: Commit cả 2 migration file**

```bash
git add supabase/migrations/20260811000000_exercise_sets_passage_id.sql supabase/migrations/20260811010000_reading_passages_set_id.sql
git commit -m "feat(db): reading_passages.set_id — 1 bài đọc chứa nhiều văn bản

Revert exercise_sets.passage_id (1:1, sai hướng) sang N:1. Xoá thẳng dữ liệu
Đọc hiện có (rác test rỗng, không có nội dung thật)."
```

---

### Task 2: `src/lib/readingSetView.ts` — pure logic tách khỏi component (TDD)

**Files:**
- Create: `src/lib/readingSetView.ts`
- Test: `src/lib/readingSetView.test.ts`

**Interfaces:**
- Produces:
  - `type ReadingQuestionType = "richtig_falsch" | "multiple_choice"`
  - `READING_QUESTION_TYPES: readonly ReadingQuestionType[]`
  - `itemCount(group: { question_type, statements, sub_questions }): number`
  - `passagesForSet<T extends { id: string; set_id: string | null; order_index: number }>(passages: T[], setId: string): T[]`
  - `groupsForPassage<T extends { passage_id: string; order_index: number }>(groups: T[], passageId: string): T[]`
  - `missingQuestionTypesForPassage(groups: { passage_id, question_type }[], passageId: string): ReadingQuestionType[]`
  - `readingSetStats(passages: { set_id }[], groups: { set_id, question_type, statements, sub_questions }[], setId: string): { passageCount: number; typeCount: number; questionCount: number }`

- [ ] **Step 1: Viết test file (sẽ fail vì module chưa tồn tại)**

`src/lib/readingSetView.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  itemCount,
  passagesForSet,
  groupsForPassage,
  missingQuestionTypesForPassage,
  readingSetStats,
} from "./readingSetView";

test("itemCount: richtig_falsch đếm theo statements", () => {
  assert.equal(itemCount({ question_type: "richtig_falsch", statements: [{}, {}], sub_questions: null }), 2);
});

test("itemCount: multiple_choice đếm theo sub_questions", () => {
  assert.equal(itemCount({ question_type: "multiple_choice", statements: null, sub_questions: [{}, {}, {}] }), 3);
});

test("itemCount: mảng null coi là 0", () => {
  assert.equal(itemCount({ question_type: "richtig_falsch", statements: null, sub_questions: null }), 0);
});

test("passagesForSet: lọc đúng theo set_id, sort theo order_index", () => {
  const passages = [
    { id: "p2", set_id: "s1", order_index: 1 },
    { id: "p3", set_id: "s2", order_index: 0 },
    { id: "p1", set_id: "s1", order_index: 0 },
  ];
  const result = passagesForSet(passages, "s1");
  assert.deepEqual(result.map((p) => p.id), ["p1", "p2"]);
});

test("passagesForSet: set không có văn bản trả mảng rỗng", () => {
  assert.deepEqual(passagesForSet([{ id: "p1", set_id: "s1", order_index: 0 }], "s2"), []);
});

test("passagesForSet: set_id null không khớp bất kỳ set thật nào", () => {
  assert.deepEqual(passagesForSet([{ id: "p1", set_id: null, order_index: 0 }], "s1"), []);
});

test("groupsForPassage: lọc đúng theo passage_id, sort theo order_index", () => {
  const groups = [
    { id: "g2", passage_id: "p1", order_index: 1 },
    { id: "g3", passage_id: "p2", order_index: 0 },
    { id: "g1", passage_id: "p1", order_index: 0 },
  ];
  const result = groupsForPassage(groups, "p1");
  assert.deepEqual(result.map((g) => g.id), ["g1", "g2"]);
});

test("missingQuestionTypesForPassage: cả 2 loại chưa có -> trả cả 2", () => {
  assert.deepEqual(missingQuestionTypesForPassage([], "p1"), ["multiple_choice", "richtig_falsch"]);
});

test("missingQuestionTypesForPassage: đã có richtig_falsch -> chỉ còn multiple_choice", () => {
  const groups = [{ passage_id: "p1", question_type: "richtig_falsch" as const }];
  assert.deepEqual(missingQuestionTypesForPassage(groups, "p1"), ["multiple_choice"]);
});

test("missingQuestionTypesForPassage: nhóm của văn bản khác không ảnh hưởng", () => {
  const groups = [{ passage_id: "p2", question_type: "richtig_falsch" as const }];
  assert.deepEqual(missingQuestionTypesForPassage(groups, "p1"), ["multiple_choice", "richtig_falsch"]);
});

test("missingQuestionTypesForPassage: đủ cả 2 loại -> mảng rỗng", () => {
  const groups = [
    { passage_id: "p1", question_type: "richtig_falsch" as const },
    { passage_id: "p1", question_type: "multiple_choice" as const },
  ];
  assert.deepEqual(missingQuestionTypesForPassage(groups, "p1"), []);
});

test("readingSetStats: gộp đúng passageCount/typeCount/questionCount qua nhiều văn bản", () => {
  const passages = [{ set_id: "s1" }, { set_id: "s1" }, { set_id: "s2" }];
  const groups = [
    { set_id: "s1", question_type: "richtig_falsch" as const, statements: [{}, {}], sub_questions: null },
    { set_id: "s1", question_type: "multiple_choice" as const, statements: null, sub_questions: [{}] },
    { set_id: "s2", question_type: "richtig_falsch" as const, statements: [{}], sub_questions: null },
  ];
  const stats = readingSetStats(passages, groups, "s1");
  assert.deepEqual(stats, { passageCount: 2, typeCount: 2, questionCount: 3 });
});

test("readingSetStats: set không có gì -> toàn 0", () => {
  assert.deepEqual(readingSetStats([], [], "s1"), { passageCount: 0, typeCount: 0, questionCount: 0 });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail vì thiếu module**

Run: `node --import tsx --test src/lib/readingSetView.test.ts`
Expected: FAIL — `Cannot find module './readingSetView'`

- [ ] **Step 3: Viết `src/lib/readingSetView.ts`**

```ts
export type ReadingQuestionType = "richtig_falsch" | "multiple_choice";

export const READING_QUESTION_TYPES: readonly ReadingQuestionType[] = ["multiple_choice", "richtig_falsch"];

interface PassageLite {
  set_id: string | null;
  order_index: number;
}

interface GroupOrderLite {
  passage_id: string;
  order_index: number;
}

interface GroupCountLite {
  question_type: ReadingQuestionType;
  statements: unknown[] | null;
  sub_questions: unknown[] | null;
}

interface GroupTypeLite {
  passage_id: string;
  question_type: ReadingQuestionType;
}

export function itemCount(group: GroupCountLite): number {
  return group.question_type === "richtig_falsch" ? (group.statements ?? []).length : (group.sub_questions ?? []).length;
}

export function passagesForSet<T extends PassageLite>(passages: T[], setId: string): T[] {
  return passages.filter((p) => p.set_id === setId).sort((a, b) => a.order_index - b.order_index);
}

export function groupsForPassage<T extends GroupOrderLite>(groups: T[], passageId: string): T[] {
  return groups.filter((g) => g.passage_id === passageId).sort((a, b) => a.order_index - b.order_index);
}

export function missingQuestionTypesForPassage(groups: GroupTypeLite[], passageId: string): ReadingQuestionType[] {
  return READING_QUESTION_TYPES.filter((qt) => !groups.some((g) => g.passage_id === passageId && g.question_type === qt));
}

export interface ReadingSetStats {
  passageCount: number;
  typeCount: number;
  questionCount: number;
}

export function readingSetStats(
  passages: PassageLite[],
  groups: (GroupCountLite & { set_id: string })[],
  setId: string,
): ReadingSetStats {
  const setGroups = groups.filter((g) => g.set_id === setId);
  return {
    passageCount: passages.filter((p) => p.set_id === setId).length,
    typeCount: setGroups.length,
    questionCount: setGroups.reduce((sum, g) => sum + itemCount(g), 0),
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --import tsx --test src/lib/readingSetView.test.ts`
Expected: PASS, 14 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/readingSetView.ts src/lib/readingSetView.test.ts
git commit -m "feat: readingSetView — pure helpers cho lọc/tính tổng bài đọc nhiều văn bản"
```

---

### Task 3: `useExerciseSets.ts` — bỏ `passageId` 1:1, tạo passage sau khi tạo set

**Files:**
- Modify: `src/lib/hooks/useExerciseSets.ts`

**Interfaces:**
- Consumes: (không đổi từ bên ngoài — vẫn `useExerciseSets()` trả `{ sets, loading, refetch, toggleSetStatus, createSet, createReadingSet }`)
- Produces: `ExerciseSet` không còn field `passageId`. `createReadingSet(forLessonId, orderIndex)` giữ nguyên signature, nhưng giờ tạo `exercise_sets` trước rồi `reading_passages` sau (đảo thứ tự so với hiện tại).

- [ ] **Step 1: Bỏ `passageId`/`passage_id` khỏi type + `fromRow` + query select**

Trong `src/lib/hooks/useExerciseSets.ts`, sửa:

```ts
export interface ExerciseSet {
  id: string;
  lessonId: string;
  category: string;
  title: string;
  orderIndex: number;
  status: "draft" | "published";
}

interface ExerciseSetRow {
  id: string;
  lesson_id: string;
  category: string;
  title: string;
  order_index: number;
  status: "draft" | "published";
}

const fromRow = (row: ExerciseSetRow): ExerciseSet => ({
  id: row.id,
  lessonId: row.lesson_id,
  category: row.category,
  title: row.title,
  orderIndex: row.order_index,
  status: row.status,
});
```

(Xoá `passageId: string | null;` khỏi `ExerciseSet`, `passage_id: string | null;` khỏi `ExerciseSetRow`, và `passageId: row.passage_id,` khỏi `fromRow`.)

Trong `refetch`, sửa select bỏ `passage_id`:

```ts
.select("id, lesson_id, category, title, order_index, status")
```

- [ ] **Step 2: Viết lại `createReadingSet` — tạo set trước, passage sau, gắn `set_id`**

Thay toàn bộ hàm `createReadingSet` bằng:

```ts
  // Bài đọc (category="doc") tạo kèm sẵn 1 văn bản đầu tiên (UX mượt, không để
  // set rỗng ngay sau khi tạo) — nhưng khác trước, giờ set tạo TRƯỚC rồi mới
  // insert reading_passages với set_id trỏ về, vì 1 set có thể chứa NHIỀU văn
  // bản (reading_passages.set_id là N:1, không còn exercise_sets.passage_id
  // 1:1 nữa). Lỗi ở bước tạo passage -> rollback set vừa tạo.
  const createReadingSet = async (
    forLessonId: string,
    orderIndex: number,
  ): Promise<{ data: ExerciseSet | null; error: string | null }> => {
    const existingCountForLesson = sets.filter((s) => s.lessonId === forLessonId).length;
    const { data, error } = await supabase
      .from("exercise_sets")
      .insert({
        lesson_id: forLessonId,
        category: "doc",
        title: nextDefaultSetTitle(existingCountForLesson),
        order_index: orderIndex,
        status: "draft",
      })
      .select("id, lesson_id, category, title, order_index, status")
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài đọc." };

    const { error: passageError } = await supabase
      .from("reading_passages")
      .insert({ lesson_id: forLessonId, set_id: data.id, text_de: "", order_index: 0 });
    if (passageError) {
      await supabase.from("exercise_sets").delete().eq("id", data.id);
      return { data: null, error: passageError.message };
    }

    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: Lỗi TypeScript ở `src/pages/admin/AdminReadingExerciseSection.tsx` (dùng `set.passageId` — sẽ sửa ở Task 4). Xác nhận KHÔNG còn lỗi nào trong `useExerciseSets.ts` — nếu còn, sửa trước khi qua bước tiếp.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useExerciseSets.ts
git commit -m "feat: createReadingSet gắn passage qua set_id thay vì exercise_sets.passage_id 1:1"
```

---

### Task 4: `AdminReadingExerciseSection.tsx` — lồng nhiều văn bản/thẻ, nút "Thêm văn bản"

**Files:**
- Modify: `src/pages/admin/AdminExerciseSetMedia.tsx:18-23` (interface `ReadingPassage`)
- Modify: `src/pages/admin/AdminReadingExerciseSection.tsx` (toàn bộ)

**Interfaces:**
- Consumes: `passagesForSet`, `groupsForPassage`, `missingQuestionTypesForPassage`, `readingSetStats`, `itemCount` từ `../../lib/readingSetView` (Task 2); `ExerciseSet` không còn `passageId` (Task 3).

- [ ] **Step 1: Thêm `set_id` vào `ReadingPassage` interface**

Trong `src/pages/admin/AdminExerciseSetMedia.tsx`, sửa:

```ts
export interface ReadingPassage {
  id: string;
  lesson_id: string;
  set_id: string | null;
  text_de: string;
  order_index: number;
}
```

- [ ] **Step 2: Viết lại toàn bộ `AdminReadingExerciseSection.tsx`**

Thay toàn bộ nội dung file bằng:

```tsx
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2, Pencil, X, Eye, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets } from "../../lib/hooks/useExerciseSets";
import { type ReadingPassage, PassageEditRow } from "./AdminExerciseSetMedia";
import {
  createEmptyReadingForm,
  buildReadingPayload,
  addStatement,
  setStatementText,
  setStatementAnswer,
  addSubQuestion,
  setSubQuestionField,
  setSubQuestionOptions,
  type ReadingQuestionGroupForm,
} from "../../lib/readingExerciseForm";
import { addOption, setOption, removeOption, optionLabel, validateChoiceForm, buildMultipleChoicePayload } from "../../lib/grammarMultipleChoice";
import { uploadMedia } from "../../lib/uploadMedia";
import { MarkdownBlock } from "../../components/MarkdownBlock";
import {
  itemCount,
  passagesForSet,
  groupsForPassage,
  missingQuestionTypesForPassage,
  readingSetStats,
  type ReadingQuestionType,
} from "../../lib/readingSetView";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

type ReadingStatementRow = { text: string; correct_answer: "richtig" | "falsch" };
type ReadingSubQuestionRow = { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string };

interface ReadingQuestionGroupRowData {
  id: string;
  passage_id: string;
  set_id: string;
  order_index: number;
  title: string | null;
  question_intro: string | null;
  question_type: ReadingQuestionType;
  statements: ReadingStatementRow[] | null;
  sub_questions: ReadingSubQuestionRow[] | null;
  explanation: string | null;
}

const QUESTION_TYPE_LABEL: Record<ReadingQuestionType, string> = {
  richtig_falsch: "Đúng / Sai",
  multiple_choice: "Trắc nghiệm",
};

const ReadingGroupPreview: React.FC<{ group: ReadingQuestionGroupRowData; passageText: string; lessonId: string }> = ({ group, passageText, lessonId }) => {
  const [picked, setPicked] = useState<Record<number, "richtig" | "falsch">>({});
  const [chosenOption, setChosenOption] = useState<Record<number, number>>({});

  return (
    <div className="space-y-3">
      {group.title && <p className="text-sm font-display font-bold text-slate-800">{group.title}</p>}
      {group.question_intro && <p className="text-xs text-slate-500">{group.question_intro}</p>}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <MarkdownBlock content={passageText} lessonId={lessonId} />
      </div>
      {group.question_type === "richtig_falsch" && (group.statements ?? []).map((s, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl">
          <span className="flex-1 text-sm text-slate-700">{s.text}</span>
          {(["richtig", "falsch"] as const).map((val) => (
            <button
              key={val}
              onClick={() => setPicked((prev) => ({ ...prev, [i]: val }))}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${picked[i] === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
            >
              {val === "richtig" ? "Richtig" : "Falsch"}
            </button>
          ))}
        </div>
      ))}
      {group.question_type === "multiple_choice" && (group.sub_questions ?? []).map((q, qi) => (
        <div key={qi} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
          {q.text_snippet && <p className="text-xs text-slate-500">{q.text_snippet}</p>}
          <p className="text-sm font-medium text-slate-700">{q.question}</p>
          <div className="space-y-1">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setChosenOption((prev) => ({ ...prev, [qi]: oi }))}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border ${chosenOption[qi] === oi ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-slate-200 text-slate-700"}`}
              >
                {optionLabel(oi)}. {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

interface ItemModalState {
  setId: string;
  lessonId: string;
  questionType: ReadingQuestionType;
  groupId: string | null;
  itemIndex: number | null;
}

export const AdminReadingExerciseSection: React.FC = () => {
  const [lessons, setLessons] = useState<LessonGroup[]>([]);
  const [passages, setPassages] = useState<ReadingPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);
  const { modules: moduleOrder, loading: moduleOrderLoading } = useModuleOrder();
  const { sets, toggleSetStatus, createReadingSet } = useExerciseSets();

  const [groups, setGroups] = useState<ReadingQuestionGroupRowData[]>([]);
  const [previewTarget, setPreviewTarget] = useState<ReadingQuestionGroupRowData | null>(null);
  const [expandedTypeSections, setExpandedTypeSections] = useState<Set<string>>(new Set());

  const [addTypePassageId, setAddTypePassageId] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [itemForm, setItemForm] = useState<ReadingQuestionGroupForm>(createEmptyReadingForm());
  const [savingItem, setSavingItem] = useState(false);
  const [subQuestionUploading, setSubQuestionUploading] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ group: ReadingQuestionGroupRowData; index: number } | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const [deleteSetTarget, setDeleteSetTarget] = useState<{ setId: string } | null>(null);
  const [deletingSet, setDeletingSet] = useState(false);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);

  const docSets = sets.filter((s) => s.category === "doc");

  const fetchAll = async () => {
    setLoading(true);
    const [lessonsRes, passagesRes, groupsRes] = await Promise.all([
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("reading_passages").select("*").order("set_id").order("order_index"),
      supabase.from("reading_question_groups").select("*").order("set_id").order("order_index"),
    ]);
    setLessons(
      (lessonsRes.data ?? []).map((l) => ({
        lesson_id: l.id,
        lesson_title: l.title_vi,
        module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      })),
    );
    setPassages((passagesRes.data ?? []) as ReadingPassage[]);
    setGroups((groupsRes.data ?? []) as ReadingQuestionGroupRowData[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSavePassage = async (passageId: string, textDe: string) => {
    setSavingPassageId(passageId);
    const { error } = await supabase.from("reading_passages").update({ text_de: textDe }).eq("id", passageId);
    setSavingPassageId(null);
    if (error) showToast("Lưu thất bại: " + error.message, "warning");
    else { showToast("Đã lưu văn bản.", "success"); fetchAll(); }
  };

  const handleCreateReadingSet = async (lessonId: string, nextOrder: number) => {
    const { error } = await createReadingSet(lessonId, nextOrder);
    if (error) { showToast("Tạo bài đọc thất bại: " + error, "warning"); return; }
    fetchAll();
  };

  const handleAddPassage = async (setId: string, lessonId: string) => {
    const orderIndex = passagesForSet(passages, setId).length;
    const { error } = await supabase
      .from("reading_passages")
      .insert({ set_id: setId, lesson_id: lessonId, text_de: "", order_index: orderIndex });
    if (error) { showToast("Thêm văn bản thất bại: " + error.message, "warning"); return; }
    fetchAll();
  };

  const handleDeleteSet = async () => {
    if (!deleteSetTarget) return;
    setDeletingSet(true);
    // reading_passages.set_id ON DELETE CASCADE -> xoá set tự xoá theo mọi văn
    // bản của nó (và reading_question_groups của từng văn bản qua cascade kế
    // tiếp), không cần tự xoá từng passage như trước.
    const { error } = await supabase.from("exercise_sets").delete().eq("id", deleteSetTarget.setId);
    setDeletingSet(false);
    if (error) { showToast("Xóa thất bại: " + error.message, "warning"); return; }
    showToast("Đã xóa bài đọc.", "success");
    setDeleteSetTarget(null);
    fetchAll();
  };

  const handleDeletePassage = async () => {
    if (!deletePassageTarget) return;
    setDeletingPassage(true);
    const { error } = await supabase.from("reading_passages").delete().eq("id", deletePassageTarget.id);
    setDeletingPassage(false);
    if (error) { showToast("Xóa thất bại: " + error.message, "warning"); return; }
    showToast("Đã xóa văn bản.", "success");
    setDeletePassageTarget(null);
    fetchAll();
  };

  // ---- Thêm/sửa/xoá TỪNG câu hỏi — lưu ngay khi bấm Lưu, không gộp nhiều
  // thay đổi vào 1 form rồi mới lưu 1 lần (nguồn gốc bug mất dữ liệu/xoá lỗi
  // ở bản modal-gộp-cả-nhóm trước đây).

  const openAddType = (setId: string, lessonId: string, questionType: ReadingQuestionType, passageId: string) => {
    let f: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), questionType, passageId };
    f = questionType === "richtig_falsch" ? addStatement(f) : addSubQuestion(f);
    setItemForm(f);
    setItemModal({ setId, lessonId, questionType, groupId: null, itemIndex: null });
    setAddTypePassageId(null);
  };

  const openAddItem = (group: ReadingQuestionGroupRowData, lessonId: string) => {
    let f: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), questionType: group.question_type, passageId: group.passage_id };
    f = group.question_type === "richtig_falsch" ? addStatement(f) : addSubQuestion(f);
    setItemForm(f);
    setItemModal({ setId: group.set_id, lessonId, questionType: group.question_type, groupId: group.id, itemIndex: null });
  };

  const openEditItem = (group: ReadingQuestionGroupRowData, index: number, lessonId: string) => {
    let f: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), questionType: group.question_type, passageId: group.passage_id };
    if (group.question_type === "richtig_falsch") {
      const s = (group.statements ?? [])[index];
      f = addStatement(f);
      const id = f.statements[0].id;
      f = setStatementText(f, id, s.text);
      f = setStatementAnswer(f, id, s.correct_answer);
    } else {
      const q = (group.sub_questions ?? [])[index];
      f = addSubQuestion(f);
      const id = f.subQuestions[0].id;
      f = setSubQuestionField(f, id, "textSnippet", q.text_snippet ?? "");
      f = setSubQuestionField(f, id, "imageKey", q.image_key);
      f = setSubQuestionField(f, id, "question", q.question);
      const correctIndex = q.options.findIndex((_, i) => String(i) === q.correct_option_id);
      f = setSubQuestionOptions(f, id, { options: q.options, correctIndex });
    }
    setItemForm(f);
    setItemModal({ setId: group.set_id, lessonId, questionType: group.question_type, groupId: group.id, itemIndex: index });
  };

  const handleItemImageUpload = async (lessonId: string, subQuestionId: string, file: File) => {
    setSubQuestionUploading(true);
    try {
      const objectKey = await uploadMedia(file, lessonId, "image", () => {});
      setItemForm((prev) => setSubQuestionField(prev, subQuestionId, "imageKey", objectKey));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
    } finally {
      setSubQuestionUploading(false);
    }
  };

  const handleSaveItem = async () => {
    if (!itemModal) return;

    if (itemModal.questionType === "richtig_falsch") {
      const s = itemForm.statements[0];
      if (!s?.text.trim()) { showToast("Nhận định không được để trống.", "warning"); return; }
      if (!s.correctAnswer) { showToast("Cần chọn Đúng hoặc Sai.", "warning"); return; }
    } else {
      const q = itemForm.subQuestions[0];
      if (!q?.question.trim()) { showToast("Câu hỏi không được để trống.", "warning"); return; }
      const optionError = validateChoiceForm(q.question, { options: q.options, correctIndex: q.correctIndex });
      if (optionError) { showToast(optionError, "warning"); return; }
    }

    setSavingItem(true);

    if (itemModal.groupId === null) {
      const orderIndex = groupsForPassage(groups, itemForm.passageId).length;
      const payload = buildReadingPayload(itemForm, itemModal.setId, orderIndex);
      const { error } = await supabase.from("reading_question_groups").insert(payload);
      setSavingItem(false);
      if (error) { showToast("Lưu thất bại: " + error.message, "warning"); return; }
    } else {
      const group = groups.find((g) => g.id === itemModal.groupId);
      if (!group) { setSavingItem(false); return; }
      let updatePayload: Record<string, unknown>;
      if (itemModal.questionType === "richtig_falsch") {
        const s = itemForm.statements[0];
        const newItem: ReadingStatementRow = { text: s.text, correct_answer: s.correctAnswer as "richtig" | "falsch" };
        const current = group.statements ?? [];
        const nextArray = itemModal.itemIndex === null
          ? [...current, newItem]
          : current.map((item, i) => (i === itemModal.itemIndex ? newItem : item));
        updatePayload = { statements: nextArray };
      } else {
        const q = itemForm.subQuestions[0];
        const choicePayload = buildMultipleChoicePayload({ options: q.options, correctIndex: q.correctIndex });
        const newItem: ReadingSubQuestionRow = {
          text_snippet: q.textSnippet.trim() || null,
          image_key: q.imageKey,
          question: q.question,
          options: choicePayload.options ?? q.options,
          correct_option_id: choicePayload.correct_answer,
        };
        const current = group.sub_questions ?? [];
        const nextArray = itemModal.itemIndex === null
          ? [...current, newItem]
          : current.map((item, i) => (i === itemModal.itemIndex ? newItem : item));
        updatePayload = { sub_questions: nextArray };
      }
      const { error } = await supabase.from("reading_question_groups").update(updatePayload).eq("id", group.id);
      setSavingItem(false);
      if (error) { showToast("Lưu thất bại: " + error.message, "warning"); return; }
    }

    showToast("Đã lưu câu hỏi.", "success");
    setItemModal(null);
    fetchAll();
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    const { group, index } = deleteItemTarget;
    setDeletingItem(true);

    if (group.question_type === "richtig_falsch") {
      const nextArray = (group.statements ?? []).filter((_, i) => i !== index);
      const { error } = nextArray.length === 0
        ? await supabase.from("reading_question_groups").delete().eq("id", group.id)
        : await supabase.from("reading_question_groups").update({ statements: nextArray }).eq("id", group.id);
      setDeletingItem(false);
      if (error) { showToast("Xóa thất bại: " + error.message, "warning"); return; }
    } else {
      const nextArray = (group.sub_questions ?? []).filter((_, i) => i !== index);
      const { error } = nextArray.length === 0
        ? await supabase.from("reading_question_groups").delete().eq("id", group.id)
        : await supabase.from("reading_question_groups").update({ sub_questions: nextArray }).eq("id", group.id);
      setDeletingItem(false);
      if (error) { showToast("Xóa thất bại: " + error.message, "warning"); return; }
    }

    showToast("Đã xóa câu hỏi.", "success");
    setDeleteItemTarget(null);
    fetchAll();
  };

  if (loading || moduleOrderLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  const orderedLessons = moduleOrder
    .flatMap((mod) => mod.lessonIds)
    .map((lid) => lessons.find((l) => l.lesson_id === lid))
    .filter((l): l is LessonGroup => !!l);

  return (
    <div className="space-y-3">
      {orderedLessons.map((lesson) => {
        const lessonSets = docSets.filter((s) => s.lessonId === lesson.lesson_id);
        const isExpanded = expanded[lesson.lesson_id] ?? false;
        return (
          <div key={lesson.lesson_id} className="rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [lesson.lesson_id]: !isExpanded }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 text-left rounded-t-2xl"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className="text-sm font-display font-bold text-slate-700">{lesson.lesson_title}</span>
              <span className="text-xs text-slate-400">{lesson.module_title}</span>
              <span className="ml-auto text-xs text-slate-400">{lessonSets.length} bài đọc</span>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => handleCreateReadingSet(lesson.lesson_id, lessonSets.length)}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm bài đọc
                  </button>
                </div>
                {lessonSets.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có bài đọc nào.</p>}

                {lessonSets.map((set) => {
                  const setPassages = passagesForSet(passages, set.id);
                  const stats = readingSetStats(passages, groups, set.id);

                  return (
                    <div key={set.id} className="rounded-2xl border border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-display font-black text-slate-900">{set.title}</span>
                        <span role="button" onClick={() => toggleSetStatus(set.id, set.status)}>
                          <LessonStatusBadge status={set.status} />
                        </span>
                        <span className="ml-auto flex items-center gap-3">
                          <span className="text-xs text-slate-400">
                            {stats.passageCount} bài văn · {stats.typeCount} loại câu hỏi · {stats.questionCount} câu hỏi
                          </span>
                          <button onClick={() => setDeleteSetTarget({ setId: set.id })} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Xóa cả bài đọc này">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-display font-bold text-slate-500 uppercase">Văn bản</span>
                          <button
                            type="button"
                            onClick={() => handleAddPassage(set.id, lesson.lesson_id)}
                            className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                          >
                            <Plus className="w-3.5 h-3.5" /> Thêm văn bản
                          </button>
                        </div>
                        {setPassages.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có văn bản nào.</p>}

                        {setPassages.map((passage, passageIndex) => {
                          const passageGroups = groupsForPassage(groups, passage.id);
                          const missingTypes = missingQuestionTypesForPassage(groups, passage.id);

                          return (
                            <div key={passage.id} className="border border-slate-200 rounded-xl p-3 space-y-3">
                              <PassageEditRow
                                passage={passage}
                                lessonId={lesson.lesson_id}
                                index={passageIndex}
                                saving={savingPassageId === passage.id}
                                onSave={handleSavePassage}
                                onDelete={() => setDeletePassageTarget(passage)}
                              />

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-display font-bold text-slate-500 uppercase">Các loại câu hỏi</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setPreviewTarget(passageGroups[0] ?? null)}
                                      disabled={passageGroups.length === 0}
                                      className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    {missingTypes.length > 0 && (
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={() => setAddTypePassageId((prev) => (prev === passage.id ? null : passage.id))}
                                          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                                        >
                                          <Plus className="w-3.5 h-3.5" /> Thêm loại câu hỏi
                                        </button>
                                        {addTypePassageId === passage.id && (
                                          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                                            {missingTypes.map((qt) => (
                                              <button
                                                key={qt}
                                                type="button"
                                                onClick={() => openAddType(set.id, lesson.lesson_id, qt, passage.id)}
                                                className="block w-full text-left px-3 py-2 text-xs font-bold text-slate-600 hover:bg-orange-50 hover:text-orange-600 whitespace-nowrap"
                                              >
                                                {QUESTION_TYPE_LABEL[qt]}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {passageGroups.map((group) => {
                                  const sectionKey = group.id;
                                  const sectionExpanded = expandedTypeSections.has(sectionKey);
                                  return (
                                    <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedTypeSections((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
                                          return next;
                                        })}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-left"
                                      >
                                        {group.question_type === "richtig_falsch"
                                          ? <span className="w-5 h-5 rounded border border-orange-300 text-orange-500 flex items-center justify-center text-[10px] font-black shrink-0">✓✗</span>
                                          : <span className="w-5 h-5 rounded border border-orange-300 text-orange-500 flex items-center justify-center text-[10px] font-black shrink-0">≡</span>}
                                        <span className="text-sm font-display font-bold text-slate-700">{QUESTION_TYPE_LABEL[group.question_type]}</span>
                                        <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">{itemCount(group)} câu hỏi</span>
                                        <span className="ml-auto flex items-center gap-2">
                                          <span
                                            role="button"
                                            onClick={(e) => { e.stopPropagation(); openAddItem(group, lesson.lesson_id); }}
                                            className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                                          >
                                            <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                                          </span>
                                          {sectionExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                        </span>
                                      </button>
                                      {sectionExpanded && (
                                        <div className="divide-y divide-slate-100">
                                          {group.question_type === "richtig_falsch"
                                            ? (group.statements ?? []).map((s, i) => (
                                                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                                  <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                                                  <span className="text-sm text-slate-700 flex-1 truncate">{s.text}</span>
                                                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">Đúng / Sai</span>
                                                  <button onClick={() => openEditItem(group, i, lesson.lesson_id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                                                  <button onClick={() => setDeleteItemTarget({ group, index: i })} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                              ))
                                            : (group.sub_questions ?? []).map((q, i) => (
                                                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                                  <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                                                  <span className="text-sm text-slate-700 flex-1 truncate">{i + 1}. {q.question}</span>
                                                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">Một đáp án</span>
                                                  <button onClick={() => openEditItem(group, i, lesson.lesson_id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                                                  <button onClick={() => setDeleteItemTarget({ group, index: i })} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                              ))}
                                          {itemCount(group) === 0 && <p className="text-xs text-slate-400 italic px-3 py-2.5">Chưa có câu hỏi nào.</p>}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {passageGroups.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có loại câu hỏi nào.</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {deleteSetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa toàn bộ bài đọc này? Mọi văn bản và câu hỏi đã thêm sẽ bị xoá theo, không khôi phục được.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteSetTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeleteSet} disabled={deletingSet} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingSet ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa văn bản này? Mọi câu hỏi thuộc văn bản này sẽ bị xoá theo, không khôi phục được.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletePassageTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeletePassage} disabled={deletingPassage} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingPassage ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-xl w-full my-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-800">
                {itemModal.itemIndex === null ? "Thêm câu hỏi" : "Sửa câu hỏi"} — {QUESTION_TYPE_LABEL[itemModal.questionType]}
              </h3>
              <button onClick={() => setItemModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>

            {itemModal.questionType === "richtig_falsch" ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500">Nhận định *</label>
                <textarea
                  rows={2}
                  value={itemForm.statements[0]?.text ?? ""}
                  onChange={(e) => setItemForm((prev) => setStatementText(prev, prev.statements[0].id, e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                  placeholder="Nhận định..."
                />
                <div className="flex gap-2">
                  {(["richtig", "falsch"] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setItemForm((prev) => setStatementAnswer(prev, prev.statements[0].id, val))}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${itemForm.statements[0]?.correctAnswer === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
                    >
                      {val === "richtig" ? "Đúng (Richtig)" : "Sai (Falsch)"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={itemForm.subQuestions[0]?.textSnippet ?? ""}
                  onChange={(e) => setItemForm((prev) => setSubQuestionField(prev, prev.subQuestions[0].id, "textSnippet", e.target.value))}
                  placeholder="Văn bản ngắn (tuỳ chọn)..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50">
                    {subQuestionUploading ? "Đang tải..." : "Thêm ảnh"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={subQuestionUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleItemImageUpload(itemModal.lessonId, itemForm.subQuestions[0].id, f); e.target.value = ""; }}
                    />
                  </label>
                  {itemForm.subQuestions[0]?.imageKey && <span className="text-[11px] text-emerald-600">Đã có ảnh</span>}
                </div>
                <label className="block text-xs font-bold text-slate-500">Câu hỏi *</label>
                <input
                  type="text"
                  value={itemForm.subQuestions[0]?.question ?? ""}
                  onChange={(e) => setItemForm((prev) => setSubQuestionField(prev, prev.subQuestions[0].id, "question", e.target.value))}
                  placeholder="Câu hỏi..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
                <label className="block text-xs font-bold text-slate-500">Phương án *</label>
                <div className="space-y-1.5">
                  {(itemForm.subQuestions[0]?.options ?? []).map((opt, oi) => {
                    const q = itemForm.subQuestions[0];
                    return (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="w-5 text-center text-xs font-display font-bold text-slate-400">{optionLabel(oi)}</span>
                        <input
                          type="radio"
                          checked={q.correctIndex === oi}
                          onChange={() => setItemForm((prev) => setSubQuestionOptions(prev, q.id, { options: q.options, correctIndex: oi }))}
                          className="h-4 w-4 accent-orange-500"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => setItemForm((prev) => setSubQuestionOptions(prev, q.id, setOption({ options: q.options, correctIndex: q.correctIndex }, oi, e.target.value)))}
                          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                          placeholder={`Phương án ${optionLabel(oi)}`}
                        />
                        <button onClick={() => setItemForm((prev) => setSubQuestionOptions(prev, q.id, removeOption({ options: q.options, correctIndex: q.correctIndex }, oi)))} className="p-1 text-slate-300 hover:text-rose-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setItemForm((prev) => setSubQuestionOptions(prev, prev.subQuestions[0].id, addOption({ options: prev.subQuestions[0].options, correctIndex: prev.subQuestions[0].correctIndex })))}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700"
                  >
                    + Thêm phương án
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setItemModal(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Hủy</button>
              <button onClick={handleSaveItem} disabled={savingItem} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl disabled:opacity-50">
                {savingItem ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteItemTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa câu hỏi này?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteItemTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeleteItem} disabled={deletingItem} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingItem ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-xl w-full my-8 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-800">Xem trước</h3>
              <button onClick={() => setPreviewTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <ReadingGroupPreview
              group={previewTarget}
              passageText={passages.find((p) => p.id === previewTarget.passage_id)?.text_de ?? ""}
              lessonId={passages.find((p) => p.id === previewTarget.passage_id)?.lesson_id ?? ""}
            />
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: 0 lỗi TypeScript.

- [ ] **Step 4: Xác nhận trong file mới không còn tham chiếu API cũ**

Run: `grep -n "set.passageId\|passage_id: string | null" src/pages/admin/AdminReadingExerciseSection.tsx`
Expected: không có kết quả (đã thay hết bằng `passagesForSet`/`set_id`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminExerciseSetMedia.tsx src/pages/admin/AdminReadingExerciseSection.tsx
git commit -m "feat(admin): lồng nhiều văn bản/thẻ bài đọc, nút Thêm văn bản, xoá riêng từng văn bản"
```

---

### Task 5: Regenerate types + verify end-to-end

**Files:**
- Modify: `src/lib/database.types.ts` (generated, không sửa tay)

- [ ] **Step 1: Regenerate `database.types.ts`**

Dùng Supabase MCP tool `generate_typescript_types` (project_id `awdhqlgxnjwymwgxltlw`), ghi output đè lên `src/lib/database.types.ts` nguyên văn (không chỉnh sửa tay theo CLAUDE.md).

- [ ] **Step 2: Chạy toàn bộ test liên quan**

Run: `node --import tsx --test src/lib/readingSetView.test.ts src/lib/readingExerciseForm.test.ts src/lib/exerciseSetTitle.test.ts src/lib/exerciseSetStatus.test.ts`
Expected: PASS toàn bộ, 0 fail.

- [ ] **Step 3: Type-check toàn repo**

Run: `npm run lint`
Expected: 0 lỗi.

- [ ] **Step 4: Verify browser thủ công (Chrome preview tool)**

Mở `npm run dev` qua preview tool, đăng nhập admin, vào Admin → Bài tập → tab Đọc:
1. Mở 1 lesson, bấm "Thêm bài đọc" — kỳ vọng thẻ mới hiện ra với đúng 1 "Văn bản 1" rỗng.
2. Bấm "Thêm văn bản" — kỳ vọng "Văn bản 2" xuất hiện, header đổi thành "2 bài văn...".
3. Ở mỗi văn bản, bấm "Thêm loại câu hỏi" → chọn Trắc nghiệm, điền 1 câu hỏi, Lưu — kỳ vọng lưu thành công, không lẫn sang văn bản khác.
4. Xoá 1 văn bản (không phải văn bản cuối) — kỳ vọng: chỉ mất đúng văn bản đó + câu hỏi của nó, thẻ và văn bản còn lại nguyên vẹn, header cập nhật đúng số liệu.
5. Xoá cả thẻ bài đọc — kỳ vọng: toàn bộ văn bản + câu hỏi trong thẻ biến mất.
6. Bấm icon mắt (Preview) ở 1 văn bản có câu hỏi — kỳ vọng hiện đúng văn bản + câu hỏi của văn bản đó, không lẫn văn bản khác.

- [ ] **Step 5: GitNexus detect_changes trước khi commit cuối**

Chạy `mcp__gitnexus__detect_changes` (hoặc `node .gitnexus/run.cjs analyze` nếu index stale trước) để xác nhận thay đổi chỉ ảnh hưởng đúng phạm vi (`AdminReadingExerciseSection`, `useExerciseSets`, `readingSetView`, `AdminExerciseSetMedia`) — không đụng luồng học viên/chấm điểm.

- [ ] **Step 6: Commit types**

```bash
git add src/lib/database.types.ts
git commit -m "chore(db): regenerate database.types.ts sau migration reading_passages.set_id"
```
