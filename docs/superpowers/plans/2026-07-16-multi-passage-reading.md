# Multi-Passage Reading Exercises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each lesson can have multiple reading passages ("scripts"), each with its own group of Đọc (reading) questions, managed entirely from the admin "Quản lý bài tập" page instead of "Sửa bài học". This is a direct structural mirror of the multi-audio-listening feature just shipped, minus the R2/upload layer (passages are plain text, no file storage).

**Architecture:** A new `reading_passages` table (1 lesson → many passages) and a new nullable `quiz_questions.reading_passage_id` column (1 passage → many questions) replace the old single `lessons.reading_text`/`reading_text_vi` model. No R2/API changes needed (unlike the audio feature) since this is pure text stored directly in Postgres.

**Tech Stack:** React 19, TypeScript, Supabase (Postgres + RLS + PostgREST).

## Global Constraints

- Learners do all passages in one sitting: start the Đọc exercise once, work through each passage's questions in order, submit once at the end — one combined score per lesson (no change to `quiz-submit` Edge Function or the 80% pass threshold).
- Each passage has no title/label (UI shows "Đoạn 1", "Đoạn 2"... by creation order) and no drag-reorder (order = creation order via `order_index`).
- **No Vietnamese translation** for reading passages — only German text (`text_de`). `reading_text_vi` is never read anywhere in this feature.
- `quiz_questions.reading_passage_id` is only meaningful for `category='doc'` rows; other categories keep it `NULL`.
- Do not drop `lessons.reading_text`/`reading_text_vi` columns from the DB (avoid migration risk) — but no code anywhere may read or write them after this plan lands.
- No changes to `quiz-submit`/`lesson-complete` Edge Functions, XP/streak logic, or the Ngữ pháp/Nghe flows.
- Deleting a passage in the admin UI deletes its questions via DB `ON DELETE CASCADE`, not manual client-side deletion.
- A Đọc question whose `reading_passage_id` doesn't match any current passage (shouldn't happen post-migration) must still be shown to the learner (appended at the end), never silently dropped — this avoids the client/server scoring-denominator mismatch found and fixed in the final review of the multi-audio-listening feature.

---

### Task 1: Migration — `reading_passages` table + `reading_passage_id` column + backfill

**Files:**
- Create: `supabase/migrations/20260716000015_reading_passages.sql`

**Interfaces:**
- Produces (used by all later tasks): table `reading_passages(id UUID, lesson_id TEXT, text_de TEXT, order_index INTEGER)`; `quiz_questions.reading_passage_id UUID` (nullable, FK to `reading_passages.id`, `ON DELETE CASCADE`); `quiz_questions_public` view now also exposes `reading_passage_id`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716000015_reading_passages.sql`:

```sql
-- =============================================================================
-- DeutschPath — multi-passage reading exercises: reading_passages table,
-- quiz_questions.reading_passage_id, backfill from existing single-passage
-- lessons. No Vietnamese translation field (text_de only, per product
-- decision) — reading_text_vi is intentionally NOT migrated or read anywhere.
-- =============================================================================

-- 1. reading_passages: 1 lesson can now have multiple reading passages.
CREATE TABLE reading_passages (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id   TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text_de     TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE reading_passages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_passages: authenticated read"
  ON reading_passages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "reading_passages: admin write"
  ON reading_passages FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. quiz_questions: link Đọc questions to a specific passage. Deleting a
--    passage cascades to delete its questions (admin UI relies on this
--    instead of manually deleting each question first).
ALTER TABLE quiz_questions
  ADD COLUMN reading_passage_id UUID REFERENCES reading_passages(id) ON DELETE CASCADE;

-- 3. quiz_questions_public view: add reading_passage_id (still no correct_answer).
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    question_text,
    audio_text,
    options,
    matching_pairs,
    audio_clip_id,
    reading_passage_id,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- 4. Backfill: lessons that already have a single reading_text (from before
--    multi-passage support) get one reading_passages row created from it
--    (text only, no VI translation carried over), and their existing 'doc'
--    questions (which had no passage link before) get reassigned to that
--    new passage — preserves already-authored content (e.g. lesson a1-l1).
INSERT INTO reading_passages (lesson_id, text_de, order_index)
SELECT id, reading_text, 0
FROM lessons
WHERE reading_text IS NOT NULL;

UPDATE quiz_questions q
SET reading_passage_id = rp.id
FROM reading_passages rp
WHERE q.category = 'doc'
  AND q.lesson_id = rp.lesson_id
  AND q.reading_passage_id IS NULL;
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the Supabase MCP `apply_migration` tool (project_id `awdhqlgxnjwymwgxltlw`, name `reading_passages`) with the exact SQL above.

- [ ] **Step 3: Verify live**

Run these `execute_sql` queries against the same project and confirm the results:

```sql
SELECT id, lesson_id, text_de, order_index FROM reading_passages ORDER BY lesson_id;
```
Expected: exactly one row, `lesson_id = 'a1-l1'`, `text_de` equal to whatever `a1-l1`'s `reading_text` value was before this migration (query `SELECT reading_text FROM lessons WHERE id = 'a1-l1';` first to confirm it matches), `order_index = 0`.

```sql
SELECT id, question_text, reading_passage_id FROM quiz_questions WHERE lesson_id = 'a1-l1' AND category = 'doc';
```
Expected: all rows (seeded in an earlier plan) have the SAME non-null `reading_passage_id`, equal to the `id` from the `reading_passages` query above.

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'quiz_questions_public';
```
Expected: includes `reading_passage_id`, does NOT include `correct_answer`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260716000015_reading_passages.sql
git commit -m "feat: add reading_passages table + quiz_questions.reading_passage_id, backfill existing reading_text"
```

---

### Task 2: Thread `readingPassages`/`readingPassageId` through types and data hooks

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useModules.ts`
- Modify: `src/lib/hooks/useQuizQuestions.ts`

**Interfaces:**
- Consumes: `reading_passages`/`quiz_questions.reading_passage_id` columns from Task 1.
- Produces (used by Tasks 3, 6, 7, 8): `Lesson.readingPassages: { id: string; textDe: string }[]` (always an array, ordered by creation order, REPLACES `Lesson.readingText`/`readingTextVi`); `QuizQuestion.readingPassageId?: string`.

- [ ] **Step 1: `appTypes.ts` — add `readingPassageId` to `QuizQuestion`, replace reading fields on `Lesson`**

Find:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  audioClipId?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

Replace with:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  audioClipId?: string;
  readingPassageId?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

Find:

```ts
  videoR2Key?: string;
  listeningClips: { id: string; r2Key: string }[];
  readingText?: string;
  readingTextVi?: string;
```

Replace with:

```ts
  videoR2Key?: string;
  listeningClips: { id: string; r2Key: string }[];
  readingPassages: { id: string; textDe: string }[];
```

- [ ] **Step 2: `useModules.ts` — fetch and map `reading_passages`**

Find:

```ts
  video_r2_key: string | null;
  reading_text: string | null;
  reading_text_vi: string | null;
  listening_clips: { id: string; r2_key: string; order_index: number }[];
};
```

Replace with:

```ts
  video_r2_key: string | null;
  listening_clips: { id: string; r2_key: string; order_index: number }[];
  reading_passages: { id: string; text_de: string; order_index: number }[];
};
```

Find:

```ts
          grammar_md, speaking_md, video_r2_key,
          reading_text, reading_text_vi,
          listening_clips (id, r2_key, order_index)
        )
```

Replace with:

```ts
          grammar_md, speaking_md, video_r2_key,
          listening_clips (id, r2_key, order_index),
          reading_passages (id, text_de, order_index)
        )
```

Find:

```ts
      listeningClips: [...(l.listening_clips ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ id: c.id, r2Key: c.r2_key })),
      readingText: l.reading_text ?? undefined,
      readingTextVi: l.reading_text_vi ?? undefined,
```

Replace with:

```ts
      listeningClips: [...(l.listening_clips ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ id: c.id, r2Key: c.r2_key })),
      // Sorted client-side for the same reason as listeningClips above (no
      // reliance on a 3-level-deep Supabase nested .order() call).
      readingPassages: [...(l.reading_passages ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((p) => ({ id: p.id, textDe: p.text_de })),
```

- [ ] **Step 3: `useQuizQuestions.ts` — select and map `reading_passage_id`**

Find:

```ts
      .select("id, type, category, question_text, audio_text, audio_clip_id, options, matching_pairs, explanation, order_index")
```

Replace with:

```ts
      .select("id, type, category, question_text, audio_text, audio_clip_id, reading_passage_id, options, matching_pairs, explanation, order_index")
```

Find:

```ts
              audioClipId: (q.audio_clip_id as string | null) ?? undefined,
```

Replace with:

```ts
              audioClipId: (q.audio_clip_id as string | null) ?? undefined,
              readingPassageId: (q.reading_passage_id as string | null) ?? undefined,
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: errors ONLY in files that reference `Lesson.readingText`/`readingTextVi` (now removed) or construct a `Lesson` object literal without the new required `readingPassages` field — specifically `src/lib/completion.ts`, `src/data/mockData.ts`, `src/hooks/useModules.ts` (the confirmed-dead duplicate at the top-level `src/hooks/` path), `src/pages/LessonDetailPage.tsx`, `src/pages/QuizPage.tsx`, `src/pages/admin/AdminUsersSection.tsx`. Confirm no errors in the 3 files this task touches. Paste the full error list.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useModules.ts src/lib/hooks/useQuizQuestions.ts
git commit -m "feat: thread readingPassages/readingPassageId through Lesson/QuizQuestion types and data hooks"
```

---

### Task 3: Update `completion.ts` + mock data for multi-passage Đọc applicability

**Files:**
- Modify: `src/lib/completion.ts`
- Modify: `src/data/mockData.ts`
- Modify: `src/hooks/useModules.ts` (the dead top-level duplicate, NOT `src/lib/hooks/useModules.ts`)

**Interfaces:**
- Consumes: `Lesson.readingPassages`/`LessonContentFlags.readingPassages` shape from Task 2.
- Produces: `LessonContentFlags.readingPassages?: { id: string }[]` (same field name/shape as elsewhere).

- [ ] **Step 1: Update `LessonContentFlags` and `applicableCategories`**

Find:

```ts
export interface LessonContentFlags {
  id: string;
  listeningClips?: { id: string }[];
  readingText?: string;
}

/**
 * Which quiz categories actually apply to a lesson. Ngữ pháp always applies;
 * Nghe/Đọc only apply if the lesson has at least one listening clip / a
 * reading passage (mirrors the content-gated "Bắt đầu bài tập" buttons on
 * LessonDetailPage).
 */
export function applicableCategories(lesson: LessonContentFlags): QuizCategory[] {
  const categories: QuizCategory[] = ["nguphap"];
  if ((lesson.listeningClips?.length ?? 0) > 0) categories.push("nghe");
  if (lesson.readingText) categories.push("doc");
  return categories;
}
```

Replace with:

```ts
export interface LessonContentFlags {
  id: string;
  listeningClips?: { id: string }[];
  readingPassages?: { id: string }[];
}

/**
 * Which quiz categories actually apply to a lesson. Ngữ pháp always applies;
 * Nghe/Đọc only apply if the lesson has at least one listening clip / at
 * least one reading passage (mirrors the content-gated "Bắt đầu bài tập"
 * buttons on LessonDetailPage).
 */
export function applicableCategories(lesson: LessonContentFlags): QuizCategory[] {
  const categories: QuizCategory[] = ["nguphap"];
  if ((lesson.listeningClips?.length ?? 0) > 0) categories.push("nghe");
  if ((lesson.readingPassages?.length ?? 0) > 0) categories.push("doc");
  return categories;
}
```

- [ ] **Step 2: Add `readingPassages: []` to the pre-existing mock `Lesson` object literals**

Since `Lesson.readingPassages` is now a required (non-optional) field (Task 2), the two files below — which already needed `listeningClips: []` added in an earlier plan — will fail `tsc --noEmit` otherwise. Both already have a `listeningClips: [],` line in each literal (added in the multi-audio-listening plan); add `readingPassages: [],` immediately after each one.

`src/data/mockData.ts` has 4 such literals (confirmed via `grep -n listeningClips src/data/mockData.ts` — lines 19, 120, 217, 318 at the time this plan was written; line numbers may have shifted). For each occurrence, find:

```ts
        listeningClips: [],
```

Replace with:

```ts
        listeningClips: [],
        readingPassages: [],
```

`src/hooks/useModules.ts` (the dead top-level duplicate) has one such literal. Find:

```ts
            listeningClips: [],
```

Replace with:

```ts
            listeningClips: [],
            readingPassages: [],
```

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: errors ONLY remain in `src/pages/LessonDetailPage.tsx`, `src/pages/QuizPage.tsx`, and `src/pages/admin/AdminUsersSection.tsx` (fixed by Tasks 6/7/8, not this task). Confirm `completion.ts`, `mockData.ts`, and `src/hooks/useModules.ts` are all clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/completion.ts src/data/mockData.ts src/hooks/useModules.ts
git commit -m "feat: update applicableCategories to check readingPassages instead of single reading_text field"
```

---

### Task 4: Remove reading-passage editing from "Sửa bài học"

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx`
- Modify: `src/pages/admin/AdminContentSection.tsx`

**Interfaces:** None — self-contained removal, no props/exports affected.

- [ ] **Step 1: Remove `reading_text`/`reading_text_vi` from `LessonEditable`**

Find:

```tsx
  grammar_md?: string | null;
  speaking_md?: string | null;
  video_r2_key?: string | null;
  reading_text?: string | null;
  reading_text_vi?: string | null;
  status: "draft" | "published";
```

Replace with:

```tsx
  grammar_md?: string | null;
  speaking_md?: string | null;
  video_r2_key?: string | null;
  status: "draft" | "published";
```

- [ ] **Step 2: Remove the fields from `handleSave`'s and `handlePublish`'s payloads**

Find (in `handleSave`):

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
```

Replace with:

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
```

Find (in `handlePublish`):

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
```

Replace with:

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
```

- [ ] **Step 3: Remove the now-unused `FileText` icon import**

`FileText` is only used inside the "Đọc section" block being removed in Step 4 below (confirmed via `grep -n "FileText" src/pages/admin/AdminLessonEditor.tsx` — only 2 hits: the import line and 1 use inside that block). Find:

```tsx
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2, FileText,
  Globe, EyeOff,
} from "lucide-react";
```

Replace with:

```tsx
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2,
  Globe, EyeOff,
} from "lucide-react";
```

- [ ] **Step 4: Remove the "Đọc section" JSX block**

Find:

```tsx
          {/* Đọc section */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-500" /> Bài đọc
            </h3>
            <div>
              <label className={labelCls}>Đoạn văn tiếng Đức</label>
              <textarea
                rows={5}
                value={data.reading_text ?? ""}
                onChange={e => upd({ reading_text: e.target.value })}
                placeholder="Nhập đoạn văn tiếng Đức..."
                className={inputCls + " resize-y"}
              />
            </div>
            <div>
              <label className={labelCls}>Bản dịch tiếng Việt</label>
              <textarea
                rows={5}
                value={data.reading_text_vi ?? ""}
                onChange={e => upd({ reading_text_vi: e.target.value })}
                placeholder="Nhập bản dịch tiếng Việt..."
                className={inputCls + " resize-y"}
              />
            </div>
          </div>
        </div>
```

Replace with:

```tsx
        </div>
```

- [ ] **Step 5: Update `AdminContentSection.tsx`'s `LESSON_SELECT`**

Find:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                video_r2_key,
                reading_text, reading_text_vi, order_index, status`;
```

Replace with:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                video_r2_key, order_index, status`;
```

- [ ] **Step 6: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors in the 2 files this task touches; errors remain in `LessonDetailPage.tsx`/`QuizPage.tsx`/`AdminUsersSection.tsx` (out of scope, Tasks 6/7/8).

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx src/pages/admin/AdminContentSection.tsx
git commit -m "refactor: remove single-passage reading-text editing from lesson editor"
```

---

### Task 5: Admin — passage management UI in "Quản lý bài tập"

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan beyond the DB schema (Task 1) — this task talks to Supabase directly, mirroring how the existing `ClipCard`/clip-management code in this same file already works (no shared library needed, since passages are plain text with no upload step).
- Produces: nothing new for later tasks (this is a leaf admin-UI task, alongside the existing clip management already in this file from the multi-audio-listening plan).

This is a full-file rewrite of `src/pages/admin/AdminQuizSection.tsx` (same file the multi-audio-listening plan's Task 7 already modified) because the Đọc tab's rendering branches out from the other two tabs, similar to how the Nghe tab already does. Read the file's CURRENT content first (`Read src/pages/admin/AdminQuizSection.tsx`) to confirm you're starting from the right base (it should already contain `ListeningClip`/`ClipCard`/`handleUploadClip`/etc. from the prior plan), then apply the changes below as a whole-file replacement.

- [ ] **Step 1: Replace the full file content**

Replace the entire contents of `src/pages/admin/AdminQuizSection.tsx` with:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, GripVertical, Search, Headphones } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { uploadMedia } from "../../lib/uploadMedia";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";

interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  audio_text: string | null;
  audio_clip_id: string | null;
  reading_passage_id: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}

interface ListeningClip {
  id: string;
  lesson_id: string;
  r2_key: string;
  order_index: number;
}

interface ReadingPassage {
  id: string;
  lesson_id: string;
  text_de: string;
  order_index: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  questions: QuizQuestion[];
  clips: ListeningClip[];
  passages: ReadingPassage[];
}

type EditForm = Omit<QuizQuestion, "id" | "lesson_id">;

const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  audio_text: null,
  audio_clip_id: null,
  reading_passage_id: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};

const TYPE_LABELS: Record<string, string> = {
  "multiple-choice": "Trắc nghiệm",
  "fill-blank": "Điền chỗ trống",
  "matching": "Ghép đôi",
  "listening": "Nghe hiểu",
};

const CATEGORY_LABELS: Record<string, string> = {
  "nguphap": "Ngữ pháp",
  "nghe": "Nghe",
  "doc": "Đọc",
};

const TYPE_COLORS: Record<string, string> = {
  "multiple-choice": "bg-blue-50 text-blue-700",
  "fill-blank": "bg-purple-50 text-purple-700",
  "matching": "bg-teal-50 text-teal-700",
  "listening": "bg-amber-50 text-amber-700",
};

const QuestionTable: React.FC<{
  questions: QuizQuestion[];
  onEdit: (q: QuizQuestion) => void;
  onDelete: (q: QuizQuestion) => void;
}> = ({ questions, onEdit, onDelete }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-slate-50">
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-28">Loại</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-40">Đáp án đúng</th>
        <th className="px-4 py-2 w-20"></th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-50">
      {questions.map((q) => (
        <tr key={q.id} className="hover:bg-slate-50/50 group">
          <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
          <td className="px-4 py-2.5">
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[q.type] ?? "bg-slate-100 text-slate-500"}`}>
              {TYPE_LABELS[q.type] ?? q.type}
            </span>
          </td>
          <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{q.question_text}</td>
          <td className="px-4 py-2.5 text-green-700 font-mono text-xs max-w-[160px] truncate">{q.correct_answer}</td>
          <td className="px-4 py-2.5">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(q)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Chỉnh sửa"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(q)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ))}
      {questions.length === 0 && (
        <tr>
          <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
        </tr>
      )}
    </tbody>
  </table>
);

const ClipCard: React.FC<{
  lessonId: string;
  clip: ListeningClip;
  index: number;
  questions: QuizQuestion[];
  onDeleteClip: (clip: ListeningClip) => void;
  onAddQuestion: (lessonId: string, nextOrder: number, refId?: string) => void;
  onEditQuestion: (q: QuizQuestion) => void;
  onDeleteQuestion: (q: QuizQuestion) => void;
}> = ({ lessonId, clip, index, questions, onDeleteClip, onAddQuestion, onEditQuestion, onDeleteQuestion }) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2_key, clip.id);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-slate-50/60">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">File {index + 1}</span>
        <div className="flex-1 min-w-0">
          {playback.loading && <p className="text-[11px] text-slate-400">Đang tải...</p>}
          {playback.url && (
            <audio controls src={playback.url} className="w-full h-8">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
          {playback.error && <p className="text-[11px] text-red-500">Không tải được: {playback.error}</p>}
        </div>
        <button
          onClick={() => onAddQuestion(lessonId, questions.length, clip.id)}
          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Câu hỏi
        </button>
        <button
          onClick={() => onDeleteClip(clip)}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0"
          title="Xóa file mp3 này (xóa luôn các câu hỏi thuộc file)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <QuestionTable questions={questions} onEdit={onEditQuestion} onDelete={onDeleteQuestion} />
    </div>
  );
};

const PassageCard: React.FC<{
  lessonId: string;
  passage: ReadingPassage;
  index: number;
  questions: QuizQuestion[];
  saving: boolean;
  onSavePassage: (passageId: string, textDe: string) => void;
  onDeletePassage: (passage: ReadingPassage) => void;
  onAddQuestion: (lessonId: string, nextOrder: number, refId?: string) => void;
  onEditQuestion: (q: QuizQuestion) => void;
  onDeleteQuestion: (q: QuizQuestion) => void;
}> = ({ lessonId, passage, index, questions, saving, onSavePassage, onDeletePassage, onAddQuestion, onEditQuestion, onDeleteQuestion }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const dirty = textDe !== passage.text_de;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-3 bg-slate-50/60 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-display font-bold text-slate-600 shrink-0">Đoạn {index + 1}</span>
          <div className="flex items-center gap-2 shrink-0">
            {dirty && (
              <button
                onClick={() => onSavePassage(passage.id, textDe)}
                disabled={saving}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu đoạn văn"}
              </button>
            )}
            <button
              onClick={() => onAddQuestion(lessonId, questions.length, passage.id)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Câu hỏi
            </button>
            <button
              onClick={() => onDeletePassage(passage)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              title="Xóa đoạn văn này (xóa luôn các câu hỏi thuộc đoạn)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <textarea
          rows={4}
          value={textDe}
          onChange={(e) => setTextDe(e.target.value)}
          placeholder="Nhập đoạn văn tiếng Đức..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y"
        />
      </div>
      <QuestionTable questions={questions} onEdit={onEditQuestion} onDelete={onDeleteQuestion} />
    </div>
  );
};

export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
  const [search, setSearch] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = create
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuizQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteClipTarget, setDeleteClipTarget] = useState<ListeningClip | null>(null);
  const [deletingClip, setDeletingClip] = useState(false);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);

  const fetchQuestions = async () => {
    const [questionsRes, lessonsRes, clipsRes, passagesRes] = await Promise.all([
      supabase.from("quiz_questions").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("listening_clips").select("*").order("lesson_id").order("order_index"),
      supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
    ]);

    const questionsByLesson: Record<string, QuizQuestion[]> = {};
    for (const q of questionsRes.data ?? []) {
      (questionsByLesson[q.lesson_id] ??= []).push(q as QuizQuestion);
    }

    const clipsByLesson: Record<string, ListeningClip[]> = {};
    for (const c of clipsRes.data ?? []) {
      (clipsByLesson[c.lesson_id] ??= []).push(c as ListeningClip);
    }

    const passagesByLesson: Record<string, ReadingPassage[]> = {};
    for (const p of passagesRes.data ?? []) {
      (passagesByLesson[p.lesson_id] ??= []).push(p as ReadingPassage);
    }

    // Build one group per lesson (ALL lessons, not just ones that already
    // have questions) so admins can add the first Nghe/Đọc question for
    // any lesson, not only lessons that already have Ngữ pháp questions.
    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      questions: questionsByLesson[l.id] ?? [],
      clips: clipsByLesson[l.id] ?? [],
      passages: passagesByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, []);

  const openCreate = (lessonId: string, nextOrder: number, refId?: string) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setForm({
      ...EMPTY_FORM,
      category: activeTab,
      order_index: nextOrder,
      audio_clip_id: activeTab === "nghe" ? (refId ?? null) : null,
      reading_passage_id: activeTab === "doc" ? (refId ?? null) : null,
    });
    setModalOpen(true);
  };

  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      audio_text: q.audio_text,
      audio_clip_id: q.audio_clip_id,
      reading_passage_id: q.reading_passage_id,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (!form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }

    setSaving(true);

    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      audio_text: form.audio_text || null,
      audio_clip_id: form.category === "nghe" ? form.audio_clip_id : null,
      reading_passage_id: form.category === "doc" ? form.reading_passage_id : null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("quiz_questions").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("quiz_questions").insert({ ...payload, lesson_id: editLessonId }));
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast(editId ? "Đã cập nhật câu hỏi." : "Đã thêm câu hỏi.", "success");
      setModalOpen(false);
      fetchQuestions();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("quiz_questions").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa câu hỏi.", "success");
      setDeleteTarget(null);
      fetchQuestions();
    }
  };

  const handleUploadClip = async (lessonId: string, file: File) => {
    setUploadingFor(lessonId);
    setUploadPct(0);
    try {
      const clipId = crypto.randomUUID();
      const objectKey = await uploadMedia(file, lessonId, "audio", setUploadPct, clipId);
      const group = groups.find((g) => g.lesson_id === lessonId);
      const nextOrder = group?.clips.length ?? 0;
      const { error } = await supabase
        .from("listening_clips")
        .insert({ id: clipId, lesson_id: lessonId, r2_key: objectKey, order_index: nextOrder });
      if (error) throw new Error(error.message);
      showToast("Đã tải file mp3 lên.", "success");
      fetchQuestions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải file mp3 thất bại", "warning");
    } finally {
      setUploadingFor(null);
      setUploadPct(null);
    }
  };

  const handleDeleteClip = async () => {
    if (!deleteClipTarget) return;
    setDeletingClip(true);
    const { error } = await supabase.from("listening_clips").delete().eq("id", deleteClipTarget.id);
    setDeletingClip(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa file mp3 và các câu hỏi thuộc file.", "success");
      setDeleteClipTarget(null);
      fetchQuestions();
    }
  };

  const handleAddPassage = async (lessonId: string) => {
    const group = groups.find((g) => g.lesson_id === lessonId);
    const nextOrder = group?.passages.length ?? 0;
    const { error } = await supabase
      .from("reading_passages")
      .insert({ lesson_id: lessonId, text_de: "", order_index: nextOrder });
    if (error) {
      showToast("Thêm đoạn văn thất bại: " + error.message, "warning");
    } else {
      fetchQuestions();
    }
  };

  const handleSavePassage = async (passageId: string, textDe: string) => {
    setSavingPassageId(passageId);
    const { error } = await supabase.from("reading_passages").update({ text_de: textDe }).eq("id", passageId);
    setSavingPassageId(null);
    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu đoạn văn.", "success");
      fetchQuestions();
    }
  };

  const handleDeletePassage = async () => {
    if (!deletePassageTarget) return;
    setDeletingPassage(true);
    const { error } = await supabase.from("reading_passages").delete().eq("id", deletePassageTarget.id);
    setDeletingPassage(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa đoạn văn và các câu hỏi thuộc đoạn.", "success");
      setDeletePassageTarget(null);
      fetchQuestions();
    }
  };

  // Helpers for form fields
  const setOption = (i: number, val: string) => {
    setForm((prev) => {
      const opts = [...(prev.options ?? [])];
      opts[i] = val;
      return { ...prev, options: opts };
    });
  };

  const addOption = () => setForm((prev) => ({ ...prev, options: [...(prev.options ?? []), ""] }));
  const removeOption = (i: number) =>
    setForm((prev) => ({ ...prev, options: (prev.options ?? []).filter((_, idx) => idx !== i) }));

  const setPair = (i: number, key: "de" | "vi", val: string) => {
    setForm((prev) => {
      const pairs = [...(prev.matching_pairs ?? [])];
      pairs[i] = { ...pairs[i], [key]: val };
      return { ...prev, matching_pairs: pairs };
    });
  };

  const addPair = () =>
    setForm((prev) => ({ ...prev, matching_pairs: [...(prev.matching_pairs ?? []), { de: "", vi: "" }] }));
  const removePair = (i: number) =>
    setForm((prev) => ({ ...prev, matching_pairs: (prev.matching_pairs ?? []).filter((_, idx) => idx !== i) }));

  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";

  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Quản lý bài tập</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm bài học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200/60">
        {(Object.keys(CATEGORY_LABELS) as ("nguphap" | "nghe" | "doc")[]).map((val) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-2.5 text-sm font-display font-bold border-b-2 transition-colors ${
              activeTab === val
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {CATEGORY_LABELS[val]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredGroups.map((group) => {
          const filteredQuestions = group.questions.filter((q) => q.category === activeTab);
          return (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">
                  {group.module_title} · {filteredQuestions.length} câu hỏi
                  {activeTab === "nghe" && ` · ${group.clips.length} file mp3`}
                  {activeTab === "doc" && ` · ${group.passages.length} đoạn văn`}
                </p>
              </div>
              {activeTab !== "nghe" && activeTab !== "doc" && (
                <span
                  onClick={(e) => { e.stopPropagation(); openCreate(group.lesson_id, filteredQuestions.length); }}
                  className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                </span>
              )}
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {activeTab === "nghe" ? (
                  <>
                    <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition w-fit">
                      <Headphones className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className="text-xs font-bold text-slate-600">
                        {uploadingFor === group.lesson_id
                          ? `Đang tải lên... ${uploadPct}%`
                          : "Tải file mp3 mới (.mp3 / .m4a / .wav)"}
                      </span>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"
                        className="hidden"
                        disabled={uploadingFor !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadClip(group.lesson_id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {group.clips.length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-sm">Chưa có file mp3 nào cho bài học này.</p>
                    ) : (
                      <div className="space-y-3">
                        {group.clips.map((clip, idx) => (
                          <ClipCard
                            key={clip.id}
                            lessonId={group.lesson_id}
                            clip={clip}
                            index={idx}
                            questions={filteredQuestions.filter((q) => q.audio_clip_id === clip.id)}
                            onDeleteClip={setDeleteClipTarget}
                            onAddQuestion={openCreate}
                            onEditQuestion={openEdit}
                            onDeleteQuestion={setDeleteTarget}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : activeTab === "doc" ? (
                  <>
                    <button
                      onClick={() => handleAddPassage(group.lesson_id)}
                      className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors w-fit"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm đoạn văn mới
                    </button>
                    {group.passages.length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-sm">Chưa có đoạn văn nào cho bài học này.</p>
                    ) : (
                      <div className="space-y-3">
                        {group.passages.map((passage, idx) => (
                          <PassageCard
                            key={passage.id}
                            lessonId={group.lesson_id}
                            passage={passage}
                            index={idx}
                            questions={filteredQuestions.filter((q) => q.reading_passage_id === passage.id)}
                            saving={savingPassageId === passage.id}
                            onSavePassage={handleSavePassage}
                            onDeletePassage={setDeletePassageTarget}
                            onAddQuestion={openCreate}
                            onEditQuestion={openEdit}
                            onDeleteQuestion={setDeleteTarget}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <QuestionTable questions={filteredQuestions} onEdit={openEdit} onDelete={setDeleteTarget} />
                )}
              </div>
            )}
          </div>
          );
        })}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>

      {/* Edit / Create modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">{editId ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi mới"}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category, Type & Order */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Dạng bài tập</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as EditForm["category"] }))}
                  className={inputCls}
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Loại câu hỏi</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EditForm["type"] }))}
                  className={inputCls}
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thứ tự (#)</label>
                <input
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                  className={inputCls}
                  min={0}
                />
              </div>
            </div>

            {/* Question text */}
            <div>
              <label className={labelCls}>Câu hỏi *</label>
              <textarea
                rows={2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Nhập nội dung câu hỏi..."
              />
            </div>

            {/* Audio text (listening) */}
            {form.type === "listening" && (
              <div>
                <label className={labelCls}>Nội dung nghe (audio_text)</label>
                <textarea
                  rows={2}
                  value={form.audio_text ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, audio_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Văn bản sẽ được đọc lên..."
                />
              </div>
            )}

            {/* Options (multiple-choice, listening) */}
            {(form.type === "multiple-choice" || form.type === "listening") && (
              <div>
                <label className={labelCls}>Các lựa chọn</label>
                <div className="space-y-2">
                  {(form.options ?? []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-5 text-center">{String.fromCharCode(65 + i)}</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder={`Lựa chọn ${String.fromCharCode(65 + i)}`}
                      />
                      {(form.options ?? []).length > 2 && (
                        <button onClick={() => removeOption(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addOption}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
                  </button>
                </div>
              </div>
            )}

            {/* Matching pairs */}
            {form.type === "matching" && (
              <div>
                <label className={labelCls}>Các cặp ghép đôi</label>
                <div className="space-y-2">
                  {(form.matching_pairs ?? []).map((pair, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <input
                        type="text"
                        value={pair.de}
                        onChange={(e) => setPair(i, "de", e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder="Tiếng Đức"
                      />
                      <span className="text-slate-300">↔</span>
                      <input
                        type="text"
                        value={pair.vi}
                        onChange={(e) => setPair(i, "vi", e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder="Tiếng Việt"
                      />
                      {(form.matching_pairs ?? []).length > 1 && (
                        <button onClick={() => removePair(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addPair}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm cặp
                  </button>
                </div>
              </div>
            )}

            {/* Correct answer */}
            <div>
              <label className={labelCls}>Đáp án đúng *</label>
              {(form.type === "multiple-choice" || form.type === "listening") && (form.options ?? []).some(Boolean) ? (
                <select
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- Chọn đáp án đúng --</option>
                  {(form.options ?? []).filter(Boolean).map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                  placeholder={form.type === "matching" ? 'JSON: [{"de":"...", "vi":"..."}]' : "Đáp án đúng..."}
                />
              )}
            </div>

            {/* Explanation */}
            <div>
              <label className={labelCls}>Giải thích</label>
              <textarea
                rows={2}
                value={form.explanation}
                onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Giải thích tại sao đáp án này đúng..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editId ? "Lưu thay đổi" : "Thêm câu hỏi"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete question */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa câu hỏi?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 line-clamp-2">
              {deleteTarget.question_text}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Hủy</Button>
              <button
                onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete clip */}
      {deleteClipTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa file mp3?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toàn bộ câu hỏi thuộc file này cũng sẽ bị xóa. Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteClipTarget(null)}>Hủy</Button>
              <button
                onClick={handleDeleteClip}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deletingClip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete passage */}
      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa đoạn văn?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toàn bộ câu hỏi thuộc đoạn này cũng sẽ bị xóa. Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeletePassageTarget(null)}>Hủy</Button>
              <button
                onClick={handleDeletePassage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deletingPassage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

CRITICAL WARNING: multiple implementers earlier in this session submitted reports claiming "browser verification" that were actually just static code re-reading or on-paper reasoning — no real Browser pane tool was ever called. This was caught and rejected every time, requiring a full re-dispatch. Do NOT repeat this.

This component does its own internal Supabase fetches (no injectable mock props) and is gated behind `AdminApp.tsx`'s login screen, which this sandbox has no admin credentials for (confirmed repeatedly earlier in this session — do not attempt to create an account, log in, or bypass this gate). Verify by:
(a) Loading the admin route in the Browser pane (`preview_start`/`navigate`, check `.claude/launch.json` for the dev server config) and using `read_console_messages`/`read_network_requests` to confirm the edited `AdminQuizSection.tsx` compiles/serves with no errors (a 200 response, no console errors, no Vite overlay).
(b) A careful WRITTEN code-level trace (not a browser action, but explicit reasoning) confirming:
   - `PassageCard`'s local `textDe` state correctly initializes from `passage.text_de` and the "Lưu đoạn văn" button only appears when `dirty` is true (i.e., the local text differs from the last-saved prop value) — this is plain React state, no hooks-conditional risk.
   - `handleAddPassage` inserts with `text_de: ""` (empty), and after `fetchQuestions()` re-runs, the new passage row shows up as a `PassageCard` with an empty textarea and no "Lưu đoạn văn" button visible yet (since local state starts equal to the fresh empty `text_de`, `dirty` is initially false) — correct, expected first-render state.
   - `openCreate`'s `refId` parameter is correctly routed to `audio_clip_id` for `activeTab === "nghe"` and `reading_passage_id` for `activeTab === "doc"`, and to neither for `activeTab === "nguphap"` (both null) — confirm by reading the function body.
   - The header's quick-add "Thêm câu hỏi" span is now hidden for BOTH `nghe` AND `doc` tabs (`activeTab !== "nghe" && activeTab !== "doc"`), matching the requirement that both content-grouped categories only add questions via their own per-clip/per-passage buttons.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: add multi-passage reading management to admin quiz page's Đọc tab"
```

---

### Task 6: Update `AdminUsersSection.tsx` for the new Đọc-applicability field

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Consumes: `src/lib/completion.ts`'s `LessonContentFlags.readingPassages?: {id:string}[]` from Task 3 — this file's local `ProgressLesson` type must structurally satisfy it.

- [ ] **Step 1: Update `ProgressLesson` and the fetch/mapping**

Find:

```tsx
interface ProgressLesson {
  id: string;
  title: string;
  titleVi: string;
  moduleTitle: string;
  level: string;
  listeningClips: { id: string }[];
  readingText?: string;
}
```

Replace with:

```tsx
interface ProgressLesson {
  id: string;
  title: string;
  titleVi: string;
  moduleTitle: string;
  level: string;
  listeningClips: { id: string }[];
  readingPassages: { id: string }[];
}
```

Find:

```tsx
        lessons (id, title, title_vi, order_index, status, reading_text, listening_clips(id))
      `)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        const flat: ProgressLesson[] = (data ?? []).flatMap((m) =>
          (m.lessons ?? [])
            .filter((l: { status: string }) => l.status === "published")
            .map((l: { id: string; title: string; title_vi: string; reading_text: string | null; listening_clips: { id: string }[] | null }) => ({
              id: l.id,
              title: l.title,
              titleVi: l.title_vi,
              moduleTitle: m.title_vi,
              level: m.level,
              listeningClips: l.listening_clips ?? [],
              readingText: l.reading_text ?? undefined,
            })),
        );
        setOrderedLessons(flat);
      });
```

Replace with:

```tsx
        lessons (id, title, title_vi, order_index, status, listening_clips(id), reading_passages(id))
      `)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        const flat: ProgressLesson[] = (data ?? []).flatMap((m) =>
          (m.lessons ?? [])
            .filter((l: { status: string }) => l.status === "published")
            .map((l: { id: string; title: string; title_vi: string; listening_clips: { id: string }[] | null; reading_passages: { id: string }[] | null }) => ({
              id: l.id,
              title: l.title,
              titleVi: l.title_vi,
              moduleTitle: m.title_vi,
              level: m.level,
              listeningClips: l.listening_clips ?? [],
              readingPassages: l.reading_passages ?? [],
            })),
        );
        setOrderedLessons(flat);
      });
```

- [ ] **Step 2: Update the `hasDoc` computation in the progress modal**

Find:

```tsx
                      const hasDoc = !!l.readingText;
```

Replace with:

```tsx
                      const hasDoc = l.readingPassages.length > 0;
```

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors in this file; errors remain in `LessonDetailPage.tsx`/`QuizPage.tsx` (Tasks 7/8).

- [ ] **Step 4: Manual verification**

Same sandbox limitation as other admin-page tasks (no admin session available). Verify: (a) a real Browser-pane check that the edited file compiles/serves with no console/network errors on the admin login route, and (b) a written trace confirming `ProgressLesson.readingPassages: {id:string}[]` structurally satisfies `LessonContentFlags.readingPassages?: {id:string}[]` (field name and inner shape match exactly), so `computeCompletedLessons`/`furthestCompletedLesson` (called elsewhere in this file, unchanged) keep compiling and behaving correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: update admin progress view to use readingPassages instead of single reading_text field"
```

---

### Task 7: LessonDetailPage — show multiple reading passages

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: `Lesson.readingPassages` from Task 2.
- Produces: nothing new for later tasks.

No new component needed here (unlike the Nghe feature's `ListeningClipPlayer`) — reading passages are plain text with no async fetch, so they render as plain inline JSX.

- [ ] **Step 1: Replace the Đọc tab content**

Find:

```tsx
          {/* Đọc tab */}
          {bottomTab === "doc" && (
            <div className="space-y-4">
              {lesson.readingText ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
                      <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{lesson.readingText}</p>
                    </div>
                    {lesson.readingTextVi && (
                      <>
                        <div className="h-px bg-slate-100" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇻🇳 Tiếng Việt</span>
                          <p className="text-xs text-slate-500 leading-relaxed font-sans italic whitespace-pre-wrap">{lesson.readingTextVi}</p>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài đọc hiểu cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.readingText && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                    Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

Replace with:

```tsx
          {/* Đọc tab */}
          {bottomTab === "doc" && (
            <div className="space-y-4">
              {lesson.readingPassages.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
                  </div>
                  <div className="space-y-4">
                    {lesson.readingPassages.map((passage, idx) => (
                      <div key={passage.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đoạn {idx + 1}</span>
                        <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{passage.textDe}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài đọc hiểu cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.readingPassages.length > 0 && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                    Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: errors remain ONLY in `src/pages/QuizPage.tsx` (fixed by Task 8).

- [ ] **Step 3: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

Build a throwaway harness `dbgtest.html` + `dbgtest.tsx` at repo root rendering `LessonDetailPage` with mock props: a `Lesson` with `readingPassages: []` (confirm "Sắp có" shows, no "Bắt đầu bài tập đọc" button), and a second scenario with `readingPassages: [{id:"p1", textDe:"Erster Absatz..."}, {id:"p2", textDe:"Zweiter Absatz..."}]` (confirm both passages render with "Đoạn 1"/"Đoạn 2" labels and their respective German text, and the start button appears). Use `read_page`/`get_page_text`/`computer` to click the "Đọc" tab and capture rendered text. Delete `dbgtest.html`/`dbgtest.tsx` before committing — they must never be committed. Paste literal tool output into the report.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: show list of reading passages (instead of single passage) on lesson page"
```

---

### Task 8: QuizPage — group Đọc questions by passage

**Files:**
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: `Lesson.readingPassages` (Task 2), `QuizQuestion.readingPassageId` (Task 2).

- [ ] **Step 1: Extend the question-grouping `useMemo` to handle `doc` alongside the existing `nghe` branch**

Find:

```tsx
  const { questions: rawQuestions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id, category);

  // For Nghe, group+reorder questions by their owning clip (in clip upload
  // order) so the learner works through one mp3's questions at a time,
  // rather than relying on raw order_index alone. A question whose
  // audioClipId doesn't match any of the lesson's clips (shouldn't happen
  // post-migration) is appended at the end instead of dropped, so the
  // client-rendered question count always matches the server's scoring
  // denominator in quiz-submit. The per-clip audio recap below already
  // degrades gracefully for these (activeClip is undefined).
  const questions = useMemo(() => {
    if (category !== "nghe") return rawQuestions;
    const grouped = (lesson.listeningClips ?? []).flatMap((clip) => rawQuestions.filter((q) => q.audioClipId === clip.id));
    const groupedIds = new Set(grouped.map((q) => q.id));
    const orphans = rawQuestions.filter((q) => !groupedIds.has(q.id));
    return [...grouped, ...orphans];
  }, [category, lesson.listeningClips, rawQuestions]);
```

Replace with:

```tsx
  const { questions: rawQuestions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id, category);

  // For Nghe/Đọc, group+reorder questions by their owning clip/passage (in
  // upload/creation order) so the learner works through one mp3 or one
  // passage's questions at a time, rather than relying on raw order_index
  // alone. A question whose audioClipId/readingPassageId doesn't match any
  // of the lesson's current clips/passages (shouldn't happen post-migration)
  // is appended at the end instead of dropped, so the client-rendered
  // question count always matches the server's scoring denominator in
  // quiz-submit. The per-group recap below already degrades gracefully for
  // these (activeClip/activePassage is undefined).
  const questions = useMemo(() => {
    if (category === "nghe") {
      const grouped = (lesson.listeningClips ?? []).flatMap((clip) => rawQuestions.filter((q) => q.audioClipId === clip.id));
      const groupedIds = new Set(grouped.map((q) => q.id));
      const orphans = rawQuestions.filter((q) => !groupedIds.has(q.id));
      return [...grouped, ...orphans];
    }
    if (category === "doc") {
      const grouped = (lesson.readingPassages ?? []).flatMap((p) => rawQuestions.filter((q) => q.readingPassageId === p.id));
      const groupedIds = new Set(grouped.map((q) => q.id));
      const orphans = rawQuestions.filter((q) => !groupedIds.has(q.id));
      return [...grouped, ...orphans];
    }
    return rawQuestions;
  }, [category, lesson.listeningClips, lesson.readingPassages, rawQuestions]);
```

- [ ] **Step 2: Compute the active passage alongside the active clip**

Find:

```tsx
  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;
  const activeClip = category === "nghe" && activeQuestion
    ? (lesson.listeningClips ?? []).find((c) => c.id === activeQuestion.audioClipId)
    : undefined;
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", activeClip?.r2Key, activeClip?.id);
```

Replace with:

```tsx
  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;
  const activeClip = category === "nghe" && activeQuestion
    ? (lesson.listeningClips ?? []).find((c) => c.id === activeQuestion.audioClipId)
    : undefined;
  const activePassage = category === "doc" && activeQuestion
    ? (lesson.readingPassages ?? []).find((p) => p.id === activeQuestion.readingPassageId)
    : undefined;
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", activeClip?.r2Key, activeClip?.id);
```

- [ ] **Step 3: Update the reading passage recap block to use `activePassage`**

Find:

```tsx
      {/* Reading passage recap (Đọc exercises only) */}
      {category === "doc" && lesson.readingText && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
            <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{lesson.readingText}</p>
          </div>
          {lesson.readingTextVi && (
            <>
              <div className="h-px bg-slate-100" />
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇻🇳 Tiếng Việt</span>
                <p className="text-xs text-slate-500 leading-relaxed font-sans italic whitespace-pre-wrap">{lesson.readingTextVi}</p>
              </div>
            </>
          )}
        </div>
      )}
```

Replace with:

```tsx
      {/* Reading passage recap (Đọc exercises only) — shows the passage that owns the current question */}
      {category === "doc" && activePassage && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
            <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{activePassage.textDe}</p>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: **zero errors anywhere in the project** — this is the final task, confirm the whole codebase is clean now, not just this file.

- [ ] **Step 5: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

Build a throwaway harness (module-stub `useQuizQuestions` the way earlier tasks in this session's history stubbed hooks) rendering `QuizPage` with `category="doc"`, a mock `lesson.readingPassages = [{id:"p1", textDe:"..."}, {id:"p2", textDe:"..."}]`, and mock questions where 2 questions tagged `readingPassageId: "p2"` appear BEFORE 2 questions tagged `readingPassageId: "p1"` in the raw returned array (deliberately out of passage order, to prove the grouping logic — not just raw array order — determines navigation order). Verify via `read_page`/`get_page_text`:
1. The FIRST question shown (`currentIdx=0`) is one of the `p1`-tagged questions (not a `p2` one) — proves `lesson.readingPassages` order (p1 before p2) drives navigation, not raw fetch order.
2. The reading-passage recap block shows `p1`'s `textDe` for this first question.
3. Advancing through all 4 questions (via the "Tiếp theo" button, providing a minimal valid answer each time to enable it) visits both `p1` questions before either `p2` question, and the recap text switches to `p2`'s `textDe` once you reach a `p2`-tagged question.

Delete the harness before committing. Paste literal tool output into the report.

- [ ] **Step 6: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: group and reorder Đọc questions by their owning reading passage"
```

---

## Final Notes

- Tasks 1 → 2 → 3 must land in order (each depends on the DB/type contract the previous one establishes).
- Task 4 depends on Task 2 (needs `LessonEditable` to no longer need the removed fields — actually Task 4 only touches `AdminLessonEditor.tsx`'s own local type, independent of `appTypes.ts`, so it could in principle run in parallel with Task 2/3, but this plan lists it sequentially after Task 3 for simplicity).
- Task 5 depends on Task 1 (DB schema) but not on Tasks 2/3/4/6/7/8 (it does its own independent Supabase queries, like the existing clip-management code in the same file).
- Task 6 depends on Task 3 (needs `LessonContentFlags.readingPassages`).
- Tasks 7 and 8 depend on Task 2 (need `Lesson.readingPassages`/`QuizQuestion.readingPassageId`).
- After all 8 tasks pass task-level review, run a final whole-branch review (mirroring the pattern used for the multi-audio-listening plan, given the structural similarity and the real bugs that review previously caught), then `superpowers:finishing-a-development-branch`.
