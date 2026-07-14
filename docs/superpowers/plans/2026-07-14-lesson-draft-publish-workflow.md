# Lesson Draft/Publish Workflow + Admin Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Draft/Published status to lessons so admins can identify unfinished content, gate learner visibility on it via RLS, prevent learners from skipping over a draft lesson mid-sequence on the Roadmap, and let admins reorder lessons within a module via drag-and-drop.

**Architecture:** A new `status` column on `lessons` (RLS-gated: non-admins only see `published` rows). A separate minimal-metadata view `lesson_positions` (id/module_id/order_index/status only, no content) lets the Roadmap know a draft lesson exists at a given position without leaking its content, so the existing position-based unlock algorithm in `RoadmapPage.tsx` naturally blocks progression past it. Admin UI (`AdminLessonEditor.tsx`, `AdminContentSection.tsx`) gets Save/Public/Revert-to-draft actions, a status badge, and `@dnd-kit`-based drag-and-drop reordering that persists via `order_index` updates — the same column every other sequencing mechanism already relies on.

**Tech Stack:** React 19, TypeScript 5.8, Supabase (Postgres RLS + views), `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new dependencies), Tailwind CSS v4, lucide-react.

## Global Constraints

- Không dùng `window.alert()`/`window.confirm()` — dùng `showToast()` từ `src/lib/toast.ts`.
- Chỉ thêm đúng 3 package mới: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — không thêm package nào khác.
- Không sửa `src/lib/database.types.ts` bằng tay (file này hiện không tồn tại trong repo — không cần chạy `gen:types`).
- RLS bắt buộc bật trên mọi bảng. View `lesson_positions` là ngoại lệ có chủ đích (bypass RLS để lộ 4 cột không nhạy cảm: id/module_id/order_index/status) — đây là pattern đã có tiền lệ trong repo (`quiz_questions_public`, xem `supabase/migrations/20260624000003_helpers.sql`).
- Không áp dụng trạng thái Nháp/Public cho `modules`, chỉ cho `lessons`.
- Không kéo-thả bài học giữa 2 module khác nhau.
- Không thêm cơ chế lưu song song 2 phiên bản nội dung (draft content + published content) — chỉ 1 bộ nội dung + 1 cờ trạng thái.
- Node: `source ~/.nvm/nvm.sh && nvm use 20` trước khi chạy `npm run dev`/`npm run lint`.
- Dự án không có test runner (không có `*.test.*`, không có `test` script) — verification là `npm run lint` (tsc --noEmit) + kiểm tra thủ công (browser cho UI, Supabase SQL trực tiếp cho RLS/view).

---

### Task 1: Migration — `status` column, RLS policy, `lesson_positions` view

**Files:**
- Create: `supabase/migrations/20260714000010_lesson_status_draft_publish.sql`

**Interfaces:**
- Produces: `lessons.status` column (`'draft' | 'published'`, NOT NULL, default `'draft'`, backfilled to `'published'` for all pre-existing rows). `lesson_positions` view with columns `id, module_id, order_index, status`, granted SELECT to `authenticated`.
- Consumes: existing `"lessons: authenticated read"` policy (`supabase/migrations/20260624000001_initial_schema.sql:172-175`, currently `USING (true)`), existing `"lessons: admin write"` policy (`supabase/migrations/20260629000004_admin_role.sql`, unaffected by this task — it already gates all admin writes via `app_metadata.role = 'admin'`).

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================================
-- DeutschPath — Lesson draft/publish status + minimal-metadata position view
-- =============================================================================

-- 1. Add status column, backfill existing lessons as 'published' so nothing
--    currently visible to learners disappears when this migration runs.
ALTER TABLE lessons
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

UPDATE lessons SET status = 'published';

-- 2. Restrict SELECT: non-admin only sees published lessons; admin sees all.
--    Replaces the previous unconditional "USING (true)" policy.
DROP POLICY IF EXISTS "lessons: authenticated read" ON lessons;

CREATE POLICY "lessons: authenticated read"
  ON lessons FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- 3. lesson_positions: minimal-metadata view exposing id/module_id/order_index
--    /status for EVERY lesson (including drafts), so the Roadmap can block
--    progression at the correct position without leaking draft content
--    (no title/video/vocabulary/grammar exposed here).
--
--    This view intentionally runs with the view owner's privileges (the
--    migration role), NOT the querying user's — same pattern already used
--    for quiz_questions_public (see supabase/migrations/20260624000003_helpers.sql).
--    That means it bypasses the base table's RLS policy above by design:
--    the only data exposed is 4 non-sensitive columns.
CREATE VIEW lesson_positions AS
  SELECT id, module_id, order_index, status FROM lessons;

GRANT SELECT ON lesson_positions TO authenticated;
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Load the Supabase MCP tools if not already loaded (`ToolSearch` with query `"select:mcp__6c5f47ff-759a-40a7-ae05-33e169423511__apply_migration,mcp__6c5f47ff-759a-40a7-ae05-33e169423511__execute_sql"`), then apply the migration file above via the `apply_migration` tool (name: `lesson_status_draft_publish`, use the SQL from Step 1).

- [ ] **Step 3: Verify backfill — no existing lesson silently became invisible**

Run via `execute_sql`:

```sql
SELECT status, count(*) FROM lessons GROUP BY status;
```

Expected: every pre-existing row shows `status = 'published'`; count matches the total row count of `lessons` before this migration (no rows should show `status = 'draft'` yet, since none existed before this feature).

- [ ] **Step 4: Verify RLS — non-admin cannot SELECT a draft lesson's content, but CAN see it via `lesson_positions`**

Run via `execute_sql`, wrapped in a transaction that's rolled back so no test data persists:

```sql
BEGIN;

-- Make one lesson a draft for this test only.
UPDATE lessons SET status = 'draft' WHERE id = (SELECT id FROM lessons LIMIT 1);

-- Simulate a non-admin authenticated request.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"app_metadata": {"role": "user"}, "sub": "00000000-0000-0000-0000-000000000000"}';

-- Expect: fewer rows than total lessons (the draft one is excluded).
SELECT count(*) AS visible_to_user FROM lessons;

-- Expect: ALL lessons visible here, including the draft one (id/status only).
SELECT id, status FROM lesson_positions;

RESET role;
ROLLBACK;
```

Expected: the first `count(*)` is 1 less than the total lesson count; the `lesson_positions` query returns every lesson id including the one marked `status = 'draft'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260714000010_lesson_status_draft_publish.sql
git commit -m "feat: add lesson draft/publish status, RLS gate, and minimal-metadata position view"
```

---

### Task 2: Types — `Lesson.status` and `LessonPosition`

**Files:**
- Modify: `src/lib/appTypes.ts`

**Interfaces:**
- Consumes: Task 1's `lessons.status` column and `lesson_positions` view (no runtime dependency yet, just documents the shape).
- Produces: `Lesson.status?: "draft" | "published"` (optional — learner-facing `Lesson` objects built by `useModules.ts` are never populated with `status` today, since RLS already guarantees only published rows reach that hook; making it optional avoids having to touch every `Lesson` object literal in `src/data/mockData.ts`, which has no notion of draft/publish). `LessonPosition` interface: `{ id: string; moduleId: string; orderIndex: number; status: "draft" | "published" }` — consumed by Task 6.

- [ ] **Step 1: Add `status` to `Lesson` and add the new `LessonPosition` interface**

In `src/lib/appTypes.ts`, find:

```ts
export interface Lesson {
  id: string;
  moduleId?: string;
  moduleTitle: string;
  level: Level;
  title: string;
  titleVi: string;
  duration: string;
  objective: string;
  summary: string;
  youtubeId?: string;
  orderIndex?: number;
  nextLessonId?: string | null;
  vocabulary: VocabularyItem[];
  grammar: GrammarExplanation;
  grammarMd?: string;
  listeningUrl?: string;
  videoR2Key?: string;
  audioR2Key?: string;
  readingText?: string;
  readingTextVi?: string;
  quiz?: QuizQuestion[];
}

export interface Module {
  id: string;
  level: Level;
  title: string;
  titleVi: string;
  lessons: Lesson[];
}
```

Replace with:

```ts
export interface Lesson {
  id: string;
  moduleId?: string;
  moduleTitle: string;
  level: Level;
  title: string;
  titleVi: string;
  duration: string;
  objective: string;
  summary: string;
  youtubeId?: string;
  orderIndex?: number;
  nextLessonId?: string | null;
  vocabulary: VocabularyItem[];
  grammar: GrammarExplanation;
  grammarMd?: string;
  listeningUrl?: string;
  videoR2Key?: string;
  audioR2Key?: string;
  readingText?: string;
  readingTextVi?: string;
  quiz?: QuizQuestion[];
  status?: "draft" | "published";
}

export interface Module {
  id: string;
  level: Level;
  title: string;
  titleVi: string;
  lessons: Lesson[];
}

export interface LessonPosition {
  id: string;
  moduleId: string;
  orderIndex: number;
  status: "draft" | "published";
}
```

- [ ] **Step 2: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/appTypes.ts
git commit -m "feat: add Lesson.status and LessonPosition types"
```

---

### Task 3: Admin editor — status badge + Save/Public/Revert-to-draft

**Files:**
- Modify: `src/components/DesignSystem.tsx`
- Modify: `src/pages/admin/AdminLessonEditor.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks at compile time (this task's `LessonEditable` is a locally-defined interface, not imported from `appTypes.ts`).
- Produces: `LessonStatusBadge` component (exported from `DesignSystem.tsx`) — consumed by Task 4. `LessonEditable.status: "draft" | "published"` field — consumed by Task 4 (`AdminLesson extends LessonEditable`).

- [ ] **Step 1: Add `LessonStatusBadge` to `DesignSystem.tsx`**

In `src/components/DesignSystem.tsx`, find:

```tsx
  return (
    <span
      className={`inline-flex items-center justify-center font-display font-bold text-xs uppercase px-2.5 py-1 rounded-lg border ${styles[level]} ${className}`}
    >
      {level}
    </span>
  );
};

// Progress Bar Component
```

Replace with:

```tsx
  return (
    <span
      className={`inline-flex items-center justify-center font-display font-bold text-xs uppercase px-2.5 py-1 rounded-lg border ${styles[level]} ${className}`}
    >
      {level}
    </span>
  );
};

// Lesson Status Badge Component
export const LessonStatusBadge: React.FC<{ status: "draft" | "published"; className?: string }> = ({
  status,
  className = ""
}) => {
  const styles = {
    draft: "bg-amber-50 text-amber-700 border-amber-200",
    published: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  const labels = {
    draft: "Nháp",
    published: "Đã public",
  };

  return (
    <span
      className={`inline-flex items-center justify-center font-display font-bold text-xs px-2.5 py-1 rounded-lg border ${styles[status]} ${className}`}
    >
      {labels[status]}
    </span>
  );
};

// Progress Bar Component
```

- [ ] **Step 2: Add `status` to `LessonEditable`**

In `src/pages/admin/AdminLessonEditor.tsx`, find:

```tsx
export interface LessonEditable {
  id: string;
  title: string;
  title_vi: string;
  level: string;
  duration: string;
  xp_reward: number;
  youtube_id: string | null;
  objective: string | null;
  summary?: string | null;
  vocabulary: VocabItem[];
  grammar: Grammar;
  grammar_md?: string | null;
  listening_url?: string | null;
  video_r2_key?: string | null;
  audio_r2_key?: string | null;
  reading_text?: string | null;
  reading_text_vi?: string | null;
}
```

Replace with:

```tsx
export interface LessonEditable {
  id: string;
  title: string;
  title_vi: string;
  level: string;
  duration: string;
  xp_reward: number;
  youtube_id: string | null;
  objective: string | null;
  summary?: string | null;
  vocabulary: VocabItem[];
  grammar: Grammar;
  grammar_md?: string | null;
  listening_url?: string | null;
  video_r2_key?: string | null;
  audio_r2_key?: string | null;
  reading_text?: string | null;
  reading_text_vi?: string | null;
  status: "draft" | "published";
}
```

- [ ] **Step 3: Import the new icons and `LessonStatusBadge`**

In `src/pages/admin/AdminLessonEditor.tsx`, find:

```tsx
import React, { useState } from "react";
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2, Headphones, FileText,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { MarkdownBlock } from "../../components/MarkdownBlock";
import { showToast } from "../../lib/toast";
```

Replace with:

```tsx
import React, { useState } from "react";
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2, Headphones, FileText,
  Globe, EyeOff,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { MarkdownBlock } from "../../components/MarkdownBlock";
import { showToast } from "../../lib/toast";
```

- [ ] **Step 4: Add `handlePublish` and `handleRevertToDraft`**

In `src/pages/admin/AdminLessonEditor.tsx`, find the end of `handleSave`:

```tsx
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      onSaved();
    }
  };
```

Replace with (adds two new functions after `handleSave`, `handleSave` itself unchanged):

```tsx
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      onSaved();
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
    } else {
      showToast("Đã public bài học.", "success");
      onSaved();
    }
  };

  const handleRevertToDraft = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({ status: "draft" }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Chuyển về Nháp thất bại: " + error.message, "warning");
    } else {
      showToast("Đã chuyển về Nháp.", "success");
      onSaved();
    }
  };
```

- [ ] **Step 5: Update the header buttons — add badge, Public, Revert-to-draft**

In `src/pages/admin/AdminLessonEditor.tsx`, find:

```tsx
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-500">
            <span className="text-xs font-bold text-slate-400">XP</span>
            <input type="number" value={data.xp_reward} onChange={e => upd({ xp_reward: parseInt(e.target.value) || 0 })} className="w-16 bg-transparent outline-none font-bold text-blue-600 text-center" />
          </div>
          <Button variant="primary" onClick={handleSave} className="flex-1 sm:flex-initial">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Lưu bài học
          </Button>
        </div>
```

Replace with:

```tsx
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <LessonStatusBadge status={data.status} />
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-500">
            <span className="text-xs font-bold text-slate-400">XP</span>
            <input type="number" value={data.xp_reward} onChange={e => upd({ xp_reward: parseInt(e.target.value) || 0 })} className="w-16 bg-transparent outline-none font-bold text-blue-600 text-center" />
          </div>
          <Button variant="secondary" onClick={handleSave} className="flex-1 sm:flex-initial">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Lưu bài học
          </Button>
          {data.status === "draft" ? (
            <Button variant="primary" onClick={handlePublish} className="flex-1 sm:flex-initial">
              <Globe className="w-4 h-4 mr-1" /> Public
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleRevertToDraft}>
              <EyeOff className="w-4 h-4 mr-1" /> Chuyển về Nháp
            </Button>
          )}
        </div>
```

- [ ] **Step 6: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Mount `AdminLessonEditor` with a mock `LessonEditable` (`status: "draft"`) via a throwaway harness (`dbgtest.html`/`dbgtest.tsx` at repo root, importing `../src/index.css`, deleted after use — same pattern used earlier in this session). Confirm:
- Badge shows "Nháp" (amber).
- "Public" button visible, "Chuyển về Nháp" not visible.
- Change `status` to `"published"` in the mock prop, reload: badge shows "Đã public" (green), "Chuyển về Nháp" visible, "Public" button not visible.

- [ ] **Step 8: Commit**

```bash
git add src/components/DesignSystem.tsx src/pages/admin/AdminLessonEditor.tsx
git commit -m "feat: add lesson status badge and Save/Public/Revert-to-draft actions"
```

---

### Task 4: Admin content list — status badge + draft-by-default insert

**Files:**
- Modify: `src/pages/admin/AdminContentSection.tsx`

**Interfaces:**
- Consumes: `LessonStatusBadge` from Task 3 (`src/components/DesignSystem.tsx`), `LessonEditable.status` from Task 3 (inherited by `AdminLesson extends LessonEditable`).
- Produces: nothing new consumed by later tasks (Task 5 modifies this same file further, on top of this task's result).

- [ ] **Step 1: Import `LessonStatusBadge`**

In `src/pages/admin/AdminContentSection.tsx`, find:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";
import { showToast } from "../../lib/toast";
```

Replace with:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
```

- [ ] **Step 2: Add `status` to `LESSON_SELECT`**

Find:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index`;
```

Replace with:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index, status`;
```

- [ ] **Step 3: Insert new lessons as `draft` explicitly**

Find:

```tsx
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        id,
        module_id: mod.id,
        level: mod.level,
        title: "Bài học mới",
        title_vi: "Bài học mới",
        duration: "10 phút",
        xp_reward: 10,
        order_index: n,
        vocabulary: [],
        grammar: { title: "", rule: "", examples: [] },
      })
      .select(LESSON_SELECT)
      .single();
```

Replace with:

```tsx
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        id,
        module_id: mod.id,
        level: mod.level,
        title: "Bài học mới",
        title_vi: "Bài học mới",
        duration: "10 phút",
        xp_reward: 10,
        order_index: n,
        vocabulary: [],
        grammar: { title: "", rule: "", examples: [] },
        status: "draft",
      })
      .select(LESSON_SELECT)
      .single();
```

- [ ] **Step 4: Show the status badge in each lesson row**

Find:

```tsx
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono text-slate-400">{lesson.youtube_id || "—"}</span>
                      <span className="text-xs font-bold text-blue-600">{lesson.xp_reward} XP</span>
```

Replace with:

```tsx
                    <div className="flex items-center gap-3 shrink-0">
                      <LessonStatusBadge status={lesson.status} />
                      <span className="text-xs font-mono text-slate-400">{lesson.youtube_id || "—"}</span>
                      <span className="text-xs font-bold text-blue-600">{lesson.xp_reward} XP</span>
```

- [ ] **Step 5: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manual browser verification**

Mount `AdminContentSection` with mock modules/lessons (mixing `status: "draft"` and `status: "published"`) via a throwaway harness (deleted after use). Confirm each lesson row shows the correct badge, and clicking "Thêm bài học" creates a new lesson row showing "Nháp".

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminContentSection.tsx
git commit -m "feat: show lesson status badge in admin list, default new lessons to draft"
```

---

### Task 5: Admin content list — drag-and-drop reordering

**Files:**
- Modify: `package.json` (new dependencies)
- Modify: `src/pages/admin/AdminContentSection.tsx`

**Interfaces:**
- Consumes: `AdminModule`/`AdminLesson` interfaces already defined in this file (from Task 4's state), `LessonStatusBadge` (Task 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the `@dnd-kit` dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: `package.json` gains `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` under `dependencies`.

- [ ] **Step 2: Add drag-and-drop imports**

In `src/pages/admin/AdminContentSection.tsx`, find:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
```

Replace with:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, Plus, Trash2, X, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
```

- [ ] **Step 3: Extract the lesson row into a sortable sub-component**

In `src/pages/admin/AdminContentSection.tsx`, find (the interfaces near the top of the file, right after `LESSON_SELECT`):

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index, status`;

export const AdminContentSection: React.FC = () => {
```

Replace with:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index, status`;

const SortableLessonRow: React.FC<{
  lesson: AdminLesson;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ lesson, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors group">
      <button {...attributes} {...listeners} className="p-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0" title="Kéo để sắp xếp">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{lesson.title_vi}</p>
        <p className="text-xs text-slate-400 truncate">
          {lesson.objective || <span className="italic text-slate-300">Chưa có mục tiêu</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <LessonStatusBadge status={lesson.status} />
        <span className="text-xs font-mono text-slate-400">{lesson.youtube_id || "—"}</span>
        <span className="text-xs font-bold text-blue-600">{lesson.xp_reward} XP</span>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
          title="Chỉnh sửa bài học"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          title="Xóa bài học"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const AdminContentSection: React.FC = () => {
```

- [ ] **Step 4: Add drag sensors and the reorder handler**

Find:

```tsx
  const [deleteTarget, setDeleteTarget] = useState<AdminLesson | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchModules = () => {
```

Replace with:

```tsx
  const [deleteTarget, setDeleteTarget] = useState<AdminLesson | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (mod: AdminModule, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = mod.lessons.findIndex(l => l.id === active.id);
    const newIndex = mod.lessons.findIndex(l => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(mod.lessons, oldIndex, newIndex);
    setModules(prev => prev.map(m => (m.id === mod.id ? { ...m, lessons: reordered } : m)));

    const results = await Promise.all(
      reordered.map((lesson, i) => supabase.from("lessons").update({ order_index: i + 1 }).eq("id", lesson.id))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      showToast("Cập nhật thứ tự thất bại: " + failed.error.message, "warning");
      fetchModules();
    }
  };

  const fetchModules = () => {
```

- [ ] **Step 5: Wrap the lesson list in `DndContext`/`SortableContext`**

Find:

```tsx
            {expanded[mod.id] && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {mod.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{lesson.title_vi}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {lesson.objective || <span className="italic text-slate-300">Chưa có mục tiêu</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <LessonStatusBadge status={lesson.status} />
                      <span className="text-xs font-mono text-slate-400">{lesson.youtube_id || "—"}</span>
                      <span className="text-xs font-bold text-blue-600">{lesson.xp_reward} XP</span>
                      <button
                        onClick={() => setEditing({ ...lesson, ...emptyVocabGrammar(lesson) })}
                        className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
                        title="Chỉnh sửa bài học"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(lesson)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Xóa bài học"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3">
```

Replace with:

```tsx
            {expanded[mod.id] && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(mod, e)}>
                  <SortableContext items={mod.lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {mod.lessons.map((lesson) => (
                      <SortableLessonRow
                        key={lesson.id}
                        lesson={lesson}
                        onEdit={() => setEditing({ ...lesson, ...emptyVocabGrammar(lesson) })}
                        onDelete={() => setDeleteTarget(lesson)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <div className="px-4 py-3">
```

- [ ] **Step 6: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Mount `AdminContentSection` with a mock module containing 3+ lessons via a throwaway harness (deleted after use). Confirm: dragging a lesson row by its grip handle to a new position updates the visible order immediately, and after a page reload (re-fetch) the new order persists (i.e. `order_index` was actually written).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/pages/admin/AdminContentSection.tsx
git commit -m "feat: add drag-and-drop lesson reordering in admin content list"
```

---

### Task 6: Roadmap — block progression at a draft lesson's position

**Files:**
- Create: `src/lib/hooks/useLessonPositions.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/RoadmapPage.tsx`

**Interfaces:**
- Consumes: `LessonPosition` type from Task 2 (`src/lib/appTypes.ts`), `lesson_positions` view from Task 1.
- Produces: `useLessonPositions(userId: string | null): { positions: LessonPosition[]; loading: boolean }` — consumed only within this task (wired in `App.tsx`, passed to `RoadmapPage`).

- [ ] **Step 1: Create `useLessonPositions` hook**

Create `src/lib/hooks/useLessonPositions.ts`:

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { LessonPosition } from "../appTypes";

type SupabaseLessonPosition = {
  id: string;
  module_id: string;
  order_index: number;
  status: string;
};

export function useLessonPositions(userId: string | null): { positions: LessonPosition[]; loading: boolean } {
  const [positions, setPositions] = useState<LessonPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("lesson_positions")
      .select("id, module_id, order_index, status")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setPositions((data as SupabaseLessonPosition[]).map((row) => ({
            id: row.id,
            moduleId: row.module_id,
            orderIndex: row.order_index,
            status: row.status as "draft" | "published",
          })));
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  return { positions, loading };
}
```

- [ ] **Step 2: Wire the hook into `App.tsx` and pass it to `RoadmapPage`**

In `src/App.tsx`, find:

```tsx
import { useModules } from "./lib/hooks/useModules";
import { useUserStats } from "./lib/hooks/useUserStats";
```

Replace with:

```tsx
import { useModules } from "./lib/hooks/useModules";
import { useLessonPositions } from "./lib/hooks/useLessonPositions";
import { useUserStats } from "./lib/hooks/useUserStats";
```

Find:

```tsx
  const { stats, setStats } = useUserStats(user?.id ?? null);
  const { modules, loading: modulesLoading } = useModules(user?.id ?? null);
```

Replace with:

```tsx
  const { stats, setStats } = useUserStats(user?.id ?? null);
  const { modules, loading: modulesLoading } = useModules(user?.id ?? null);
  const { positions } = useLessonPositions(user?.id ?? null);
```

Find:

```tsx
              {currentPage === "roadmap" && user && (
                <RoadmapPage
                  stats={stats}
                  modules={modules}
                  onSelectLesson={handleSelectLesson}
                />
              )}
```

Replace with:

```tsx
              {currentPage === "roadmap" && user && (
                <RoadmapPage
                  stats={stats}
                  modules={modules}
                  positions={positions}
                  onSelectLesson={handleSelectLesson}
                />
              )}
```

- [ ] **Step 3: Rewrite `RoadmapPage.tsx`'s sequencing to include draft placeholders**

In `src/pages/RoadmapPage.tsx`, find:

```tsx
import React from "react";
import { Check, Lock, Play, ArrowRight, LockKeyhole } from "lucide-react";
import { ProgressBar } from "../components/DesignSystem";
import { UserStats, Lesson, Module } from "../lib/appTypes";

interface RoadmapPageProps {
  stats: UserStats;
  modules: Module[];
  onSelectLesson: (lessonId: string) => void;
}

export const RoadmapPage: React.FC<RoadmapPageProps> = ({
  stats,
  modules,
  onSelectLesson
}) => {
  const unlockedModules = modules.filter(m => stats.unlockedLevels.includes(m.level));

  const allLessons: { lesson: Lesson; indexInAll: number }[] = [];
  let currentIdx = 0;
  unlockedModules.forEach(m => {
    m.lessons.forEach(l => {
      allLessons.push({ lesson: l, indexInAll: currentIdx++ });
    });
  });

  const getLessonStatus = (lessonId: string, indexInAll: number) => {
    if (stats.completedLessons.includes(lessonId)) {
      return "completed";
    }
    if (indexInAll === 0) {
      return "current";
    }
    // Check if the previous lesson was completed
    const prevLessonId = allLessons[indexInAll - 1].lesson.id;
    if (stats.completedLessons.includes(prevLessonId)) {
      return "current"; // Highlight current uncompleted lesson
    }
    return "locked";
  };
```

Replace with:

```tsx
import React from "react";
import { Check, Lock, Play, ArrowRight, LockKeyhole, Clock } from "lucide-react";
import { ProgressBar } from "../components/DesignSystem";
import { UserStats, Lesson, Module, LessonPosition } from "../lib/appTypes";
import { showToast } from "../lib/toast";

interface RoadmapPageProps {
  stats: UserStats;
  modules: Module[];
  positions: LessonPosition[];
  onSelectLesson: (lessonId: string) => void;
}

type RoadmapItem =
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "draft"; id: string };

export const RoadmapPage: React.FC<RoadmapPageProps> = ({
  stats,
  modules,
  positions,
  onSelectLesson
}) => {
  const unlockedModules = modules.filter(m => stats.unlockedLevels.includes(m.level));
  const unlockedModuleIds = new Set(unlockedModules.map(m => m.id));
  const draftPositions = positions.filter(p => p.status === "draft" && unlockedModuleIds.has(p.moduleId));

  const orderedItems: RoadmapItem[] = [];
  unlockedModules.forEach(m => {
    const draftsInModule = draftPositions.filter(p => p.moduleId === m.id);
    const combined: { orderIndex: number; item: RoadmapItem }[] = [
      ...m.lessons.map(l => ({ orderIndex: l.orderIndex ?? 0, item: { kind: "lesson" as const, lesson: l } })),
      ...draftsInModule.map(p => ({ orderIndex: p.orderIndex, item: { kind: "draft" as const, id: p.id } })),
    ];
    combined.sort((a, b) => a.orderIndex - b.orderIndex);
    combined.forEach(c => orderedItems.push(c.item));
  });

  const allLessons: { item: RoadmapItem; indexInAll: number }[] =
    orderedItems.map((item, indexInAll) => ({ item, indexInAll }));

  const idOf = (item: RoadmapItem): string => (item.kind === "lesson" ? item.lesson.id : item.id);

  const getLessonStatus = (lessonId: string, indexInAll: number) => {
    if (stats.completedLessons.includes(lessonId)) {
      return "completed";
    }
    if (indexInAll === 0) {
      return "current";
    }
    // Check if the previous lesson was completed
    const prevLessonId = idOf(allLessons[indexInAll - 1].item);
    if (stats.completedLessons.includes(prevLessonId)) {
      return "current"; // Highlight current uncompleted lesson
    }
    return "locked";
  };
```

- [ ] **Step 4: Update the total/progress counters to use the new item shape**

Find:

```tsx
  const totalLessons = allLessons.length;
  const completedTotal = stats.completedLessons.length;
  const overAllProgress = totalLessons > 0 ? Math.round((completedTotal / totalLessons) * 100) : 0;
```

This line does not reference `.lesson` and needs no change — confirm it still reads `allLessons.length` (now the merged array including draft placeholders, which is correct: a draft placeholder should still count toward "how many lessons total" for the progress bar denominator, and it can never be in `completedLessons`, so it correctly never counts as completed).

- [ ] **Step 5: Update the render loop to branch on `item.kind`**

Find:

```tsx
            {allLessons.map(({ lesson, indexInAll }) => {
              const status = getLessonStatus(lesson.id, indexInAll);

              const cardStyles = {
                completed: "border-green-250 bg-white hover:border-green-300 shadow-sm hover:shadow",
                current: "border-orange-500 bg-white shadow-md ring-4 ring-orange-50/50 active-lesson-pulse",
                locked: "border-slate-200 bg-slate-50/50 opacity-75 cursor-not-allowed",
              };

              return (
                <div
                  key={lesson.id}
                  id={`roadmap-lesson-card-${lesson.id}`}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[170px] relative overflow-hidden group ${cardStyles[status]}`}
                >
```

Replace with:

```tsx
            {allLessons.map(({ item, indexInAll }) => {
              if (item.kind === "draft") {
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 opacity-75 flex flex-col justify-between min-h-[170px] relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                          Bài {indexInAll + 1}
                        </span>
                        <h3 className="text-sm font-display font-bold text-slate-500 font-sans">
                          Đang chỉnh sửa
                        </h3>
                      </div>
                      <div className="shrink-0 pt-0.5 select-none">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200" title="Bài học đang được chỉnh sửa">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 mt-1 flex justify-end items-center">
                      <button
                        onClick={() => showToast("Bài học đang được chỉnh sửa. Hãy quay lại sau.", "warning")}
                        className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-display font-bold text-slate-400 cursor-not-allowed"
                      >
                        Chưa khả dụng
                      </button>
                    </div>
                  </div>
                );
              }

              const lesson = item.lesson;
              const status = getLessonStatus(lesson.id, indexInAll);

              const cardStyles = {
                completed: "border-green-250 bg-white hover:border-green-300 shadow-sm hover:shadow",
                current: "border-orange-500 bg-white shadow-md ring-4 ring-orange-50/50 active-lesson-pulse",
                locked: "border-slate-200 bg-slate-50/50 opacity-75 cursor-not-allowed",
              };

              return (
                <div
                  key={lesson.id}
                  id={`roadmap-lesson-card-${lesson.id}`}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[170px] relative overflow-hidden group ${cardStyles[status]}`}
                >
```

The rest of the lesson card's JSX (from `{/* Top section indicators */}` through the closing `</div>` and `);` before the `})}`) is unchanged — it still references `lesson`, `status`, and `indexInAll`, all of which are now defined by the code above instead of the old destructured `{ lesson, indexInAll }`.

- [ ] **Step 6: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Mount `App` (or `RoadmapPage` directly with mock `modules`/`positions`/`stats` props) via a throwaway harness (deleted after use), with this scenario: 3 lessons in one module, lesson 1 and 3 `published`, lesson 2 only present in `positions` as `{ status: "draft" }` (not in `modules[].lessons`), `stats.completedLessons = ["<lesson-1-id>"]`. Confirm:
- Lesson 1 renders as `completed`.
- Position 2 renders as the "Đang chỉnh sửa" placeholder card (not lesson 3).
- Lesson 3 (now at `indexInAll === 2`) renders as `locked` — NOT `current` (this is the core bug fix: without the placeholder, lesson 3 would incorrectly become `current` right after lesson 1's completion).
- Clicking the placeholder's "Chưa khả dụng" button shows the toast "Bài học đang được chỉnh sửa. Hãy quay lại sau."

- [ ] **Step 8: Commit**

```bash
git add src/lib/hooks/useLessonPositions.ts src/App.tsx src/pages/RoadmapPage.tsx
git commit -m "feat: block Roadmap progression at a draft lesson's position instead of skipping it"
```

---

### Task 7: App.tsx — fix silent wrong-lesson fallback

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `handleNavigate` (already defined earlier in `App.tsx`), `Button` component from `src/components/DesignSystem.tsx`.
- Produces: nothing consumed by later tasks (last task in this plan).

- [ ] **Step 1: Import `Button`**

In `src/App.tsx`, find:

```tsx
import { AppLoadingSkeleton } from "./components/Skeleton";
import { Navbar, Sidebar } from "./components/Navigation";
```

Replace with:

```tsx
import { AppLoadingSkeleton } from "./components/Skeleton";
import { Navbar, Sidebar } from "./components/Navigation";
import { Button } from "./components/DesignSystem";
```

- [ ] **Step 2: Remove the silent wrong-lesson fallback**

Find:

```tsx
  // Find active Lesson detail item
  const flatLessons = modules.flatMap(m => m.lessons);
  const activeLessonObject: Lesson | undefined = flatLessons.find(l => l.id === selectedLessonId) ?? flatLessons[0];
```

Replace with:

```tsx
  // Find active Lesson detail item — no fallback to flatLessons[0]: if the
  // selected id isn't found (deleted, or just reverted to draft while the
  // learner was on it), we must show a "not available" message, not a
  // different lesson silently swapped in.
  const flatLessons = modules.flatMap(m => m.lessons);
  const activeLessonObject: Lesson | undefined = flatLessons.find(l => l.id === selectedLessonId);
```

- [ ] **Step 3: Add the "not available" message branch**

Find:

```tsx
              {currentPage === "lesson-detail" && user && activeLessonObject && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId) => {
                    setSelectedLessonId(lessonId);
                    setCurrentPage("quiz");
                  }}
                />
              )}
```

Replace with:

```tsx
              {currentPage === "lesson-detail" && user && activeLessonObject && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId) => {
                    setSelectedLessonId(lessonId);
                    setCurrentPage("quiz");
                  }}
                />
              )}

              {currentPage === "lesson-detail" && user && !activeLessonObject && !modulesLoading && (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <p className="text-sm font-display font-bold text-slate-600">
                    Bài học không khả dụng, có thể đang được chỉnh sửa.
                  </p>
                  <p className="text-xs text-slate-400">Hãy quay lại sau.</p>
                  <Button variant="secondary" onClick={() => handleNavigate("roadmap")}>
                    Quay về Lộ trình học
                  </Button>
                </div>
              )}
```

- [ ] **Step 4: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual browser verification**

Mount `App` (or drive the real dev server logged in as a test user) and set `selectedLessonId` to an id that doesn't exist in the fetched `modules` (e.g. via React DevTools, or by temporarily hardcoding a bad id in `useState<string>("a1-l1")`'s initial value during the test). Confirm: the lesson-detail page now shows "Bài học không khả dụng..." with a working "Quay về Lộ trình học" button, instead of silently rendering a different, wrong lesson.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "fix: show not-available message instead of silently swapping to a different lesson"
```
