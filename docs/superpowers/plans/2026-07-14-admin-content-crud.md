# Admin Content Management + Per-User Level Unlocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins add/delete lessons inside the 4 fixed level-modules (A1/A2/B1/B2, seeding the missing B2) and control which levels each individual learner can access, while the learner-facing Roadmap drops all level/module labeling and shows one continuous, sequentially-unlocked lesson list.

**Architecture:** Two additive migrations (seed module B2; add `profiles.unlocked_levels text[]` with a safe backfill for existing users). `AdminContentSection.tsx` gains add/delete-lesson actions and drops module title editing. `AdminUsersSection.tsx` gains a per-user level-checkbox column that writes straight to `profiles.unlocked_levels` via PostgREST (RLS already permits admin to update any profile). `RoadmapPage.tsx`'s existing sequential-unlock logic (`getLessonStatus`) is preserved untouched — it now runs over a list pre-filtered to the logged-in user's unlocked levels instead of every module.

**Tech Stack:** React 19, TypeScript 5.8, Supabase (PostgREST + RLS) — no new dependencies, no Edge/Vercel Functions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-admin-content-crud-design.md` — read it before starting.
- Do not use `any` anywhere (project rule, CLAUDE.md).
- No new npm packages.
- `src/lib/supabase.ts`'s client is **not** generic over `Database` (`createClient(url, key)`, no `<Database>` type param) — `.select()`/`.update()` calls are not schema-checked at compile time. This means new DB columns do **not** require running `npm run gen:types` for `tsc --noEmit` to pass. Do not run `gen:types` as part of this plan.
- Do not touch `src/hooks/useModules.ts` (unused legacy duplicate of `src/lib/hooks/useModules.ts`) — irrelevant here, noted for consistency with prior plans in this repo.
- Migration filenames continue the existing `YYYYMMDDNNNNNN_description.sql` sequence; the latest existing one is `20260713000006_media_r2_fields.sql`.
- Only touch: `supabase/migrations/` (2 new files), `src/lib/appTypes.ts`, `src/lib/hooks/useUserStats.ts`, `src/pages/admin/AdminContentSection.tsx`, `src/pages/admin/AdminUsersSection.tsx`, `src/pages/RoadmapPage.tsx`.
- Dev server / `npm run lint` need Node 20 in this environment (Node 16 is default via `nvm` and fails Vite 6 with a `crypto.getRandomValues` error): `source ~/.nvm/nvm.sh && nvm use 20` before running `npm run dev` or `npm run lint`.
- Supabase project ID for MCP tools: `awdhqlgxnjwymwgxltlw`.

---

### Task 1: Seed module B2 + extend the `Level` type

**Files:**
- Create: `supabase/migrations/20260714000007_seed_module_b2.sql`
- Modify: `src/lib/appTypes.ts:1`

**Interfaces:**
- Produces: DB row `modules.id = 'm-b2-1'` (level `B2`). `Level` type now includes `"B2"`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260714000007_seed_module_b2.sql`:

```sql
-- =============================================================================
-- DeutschPath — seed the missing B2 module (modules are fixed 1:1 with a level)
-- =============================================================================

INSERT INTO modules (id, level, title, title_vi, description, order_index)
VALUES ('m-b2-1', 'B2', 'Vertiefung & Diskussion', 'Nâng cao & Tranh biện', 'Tranh biện học thuật, viết luận, giao tiếp chuyên sâu', 4)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration and verify**

Apply via the Supabase MCP tool `apply_migration` (project_id `awdhqlgxnjwymwgxltlw`, name `seed_module_b2`, using the SQL above), then verify:

```sql
select id, level, order_index from modules order by order_index;
```

Expected: 4 rows — `m-a1-1` (A1, 1), `m-a2-1` (A2, 2), `m-b1-1` (B1, 3), `m-b2-1` (B2, 4).

- [ ] **Step 3: Extend the `Level` type**

In `src/lib/appTypes.ts`, find:

```ts
export type Level = "A1" | "A2" | "B1";
```

Replace with:

```ts
export type Level = "A1" | "A2" | "B1" | "B2";
```

- [ ] **Step 4: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260714000007_seed_module_b2.sql src/lib/appTypes.ts
git commit -m "feat: seed B2 module and extend Level type to include B2"
```

---

### Task 2: `profiles.unlocked_levels` + backfill + `UserStats.unlockedLevels`

**Files:**
- Create: `supabase/migrations/20260714000008_profiles_unlocked_levels.sql`
- Modify: `src/lib/appTypes.ts` (the `UserStats` interface)
- Modify: `src/lib/hooks/useUserStats.ts`

**Interfaces:**
- Consumes: `Level` type from Task 1.
- Produces: DB column `profiles.unlocked_levels text[] NOT NULL DEFAULT ARRAY['A1']`. `UserStats.unlockedLevels: Level[]`, populated by `useUserStats`. `useUserStats`'s return shape (`{ stats, statsLoading, setStats }`) is unchanged — only `stats.unlockedLevels` is new.

- [ ] **Step 1: Write the migration with backfill**

Create `supabase/migrations/20260714000008_profiles_unlocked_levels.sql`:

```sql
-- =============================================================================
-- DeutschPath — per-user level access (which of A1/A2/B1/B2 a learner can see)
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlocked_levels TEXT[] NOT NULL DEFAULT ARRAY['A1']::text[];

-- Backfill: a user who has already completed lessons in a level keeps access
-- to it — without this, the DEFAULT above would silently re-lock levels
-- existing users had already unlocked by progressing through them.
UPDATE profiles p
SET unlocked_levels = (
  SELECT array_agg(DISTINCT l.level)
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id = p.id
) || ARRAY['A1']::text[]
WHERE EXISTS (
  SELECT 1 FROM lesson_progress lp WHERE lp.user_id = p.id
);
```

- [ ] **Step 2: Apply the migration and verify**

Apply via Supabase MCP `apply_migration` (name `profiles_unlocked_levels`), then verify the column exists and defaults correctly:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'profiles' and column_name = 'unlocked_levels';
```

Expected: 1 row, `data_type = 'ARRAY'`, `is_nullable = 'NO'`.

Then verify no existing user got locked out of a level they'd already progressed into:

```sql
select p.id, p.unlocked_levels, array_agg(distinct l.level) as levels_with_progress
from profiles p
join lesson_progress lp on lp.user_id = p.id
join lessons l on l.id = lp.lesson_id
group by p.id, p.unlocked_levels;
```

Expected: for every row, every level in `levels_with_progress` is also present in `unlocked_levels`. If this returns zero rows, there was no existing `lesson_progress` data to backfill from — also correct.

- [ ] **Step 3: Add `unlockedLevels` to `UserStats`**

In `src/lib/appTypes.ts`, find:

```ts
export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[];
  quizScores: Record<string, number>;
}
```

Replace with:

```ts
export interface UserStats {
  xp: number;
  streak: number;
  lastPlayedDate?: string;
  completedLessons: string[];
  quizScores: Record<string, number>;
  unlockedLevels: Level[];
}
```

- [ ] **Step 4: Fetch `unlocked_levels` in `useUserStats.ts`**

Replace the entire contents of `src/lib/hooks/useUserStats.ts` with:

```ts
import { useState, useEffect, useCallback, Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import { UserStats, Level } from "../appTypes";

const EMPTY_STATS: UserStats = {
  xp: 0,
  streak: 0,
  completedLessons: [],
  quizScores: {},
  unlockedLevels: [],
};

export function useUserStats(userId: string | null): {
  stats: UserStats;
  statsLoading: boolean;
  setStats: Dispatch<SetStateAction<UserStats>>;
} {
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!userId) {
      setStats(EMPTY_STATS);
      return;
    }

    setStatsLoading(true);

    const [statsRes, progressRes, profileRes] = await Promise.all([
      supabase
        .from("user_stats")
        .select("xp, streak")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("lesson_progress")
        .select("lesson_id, quiz_score")
        .eq("user_id", userId),
      supabase
        .from("profiles")
        .select("unlocked_levels")
        .eq("id", userId)
        .single(),
    ]);

    setStats({
      xp: statsRes.data?.xp ?? 0,
      streak: statsRes.data?.streak ?? 0,
      completedLessons: (progressRes.data ?? []).map((p) => p.lesson_id as string),
      quizScores: Object.fromEntries(
        (progressRes.data ?? [])
          .filter((p) => p.quiz_score !== null)
          .map((p) => [p.lesson_id as string, p.quiz_score as number]),
      ),
      unlockedLevels: (profileRes.data?.unlocked_levels ?? []) as Level[],
    });

    setStatsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, statsLoading, setStats };
}
```

- [ ] **Step 5: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors. (Task 3, 4, 5 will produce their own `tsc` errors referencing `stats.unlockedLevels` until they're done — that's expected mid-plan; this step only confirms Task 2's own files compile.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260714000008_profiles_unlocked_levels.sql src/lib/appTypes.ts src/lib/hooks/useUserStats.ts
git commit -m "feat: add per-user unlocked_levels with safe backfill for existing progress"
```

---

### Task 3: Admin UI — per-user level checkboxes in "Người dùng"

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Consumes: `profiles.unlocked_levels` (Task 2).
- Produces: no new exports; leaf UI change.

- [ ] **Step 1: Add `unlockedLevels` to the `AdminUser` interface and fetch it**

In `src/pages/admin/AdminUsersSection.tsx`, find:

```ts
interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
  role: string;
}
```

Replace with:

```ts
interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
  role: string;
  unlockedLevels: string[];
}
```

Find the `fetchUsers` function body:

```ts
  const fetchUsers = () => {
    supabase
      .from("profiles")
      .select("id, email, full_name, created_at, role, user_stats(xp, streak)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setUsers(
          (data ?? []).map((p) => {
            const stats = p.user_stats as unknown as { xp: number; streak: number } | null;
            return {
              id: p.id,
              email: p.email ?? "",
              full_name: p.full_name,
              created_at: p.created_at,
              xp: stats?.xp ?? 0,
              streak: stats?.streak ?? 0,
              role: (p as unknown as { role?: string }).role ?? "user",
            };
          }),
        );
        setLoading(false);
      });
  };
```

Replace with:

```ts
  const fetchUsers = () => {
    supabase
      .from("profiles")
      .select("id, email, full_name, created_at, role, unlocked_levels, user_stats(xp, streak)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setUsers(
          (data ?? []).map((p) => {
            const stats = p.user_stats as unknown as { xp: number; streak: number } | null;
            return {
              id: p.id,
              email: p.email ?? "",
              full_name: p.full_name,
              created_at: p.created_at,
              xp: stats?.xp ?? 0,
              streak: stats?.streak ?? 0,
              role: (p as unknown as { role?: string }).role ?? "user",
              unlockedLevels: (p as unknown as { unlocked_levels?: string[] }).unlocked_levels ?? [],
            };
          }),
        );
        setLoading(false);
      });
  };
```

- [ ] **Step 2: Add the toggle handler**

Below `handleDelete`, add:

```ts
  const handleToggleLevel = async (user: AdminUser, level: string) => {
    const previousLevels = user.unlockedLevels;
    const newLevels = previousLevels.includes(level)
      ? previousLevels.filter((l) => l !== level)
      : [...previousLevels, level];

    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, unlockedLevels: newLevels } : u)));

    const { error } = await supabase.from("profiles").update({ unlocked_levels: newLevels }).eq("id", user.id);

    if (error) {
      showToast("Cập nhật cấp độ thất bại: " + error.message, "warning");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, unlockedLevels: previousLevels } : u)));
    }
  };
```

- [ ] **Step 3: Add the table column**

Find the header row:

```tsx
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">XP</th>
```

Replace with:

```tsx
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Cấp độ mở</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">XP</th>
```

Find the empty-state row's `colSpan`:

```tsx
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Không tìm thấy người dùng.</td>
```

Replace with:

```tsx
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Không tìm thấy người dùng.</td>
```

Find the `<td>` for Role in the body (right after it closes, before the XP `<td>`):

```tsx
                <td className="px-4 py-3 text-right font-bold text-blue-600">{u.xp}</td>
```

Insert a new `<td>` immediately before that line (i.e., right after the Role `</td>` closes and before the XP `<td>`):

```tsx
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    {(["A1", "A2", "B1", "B2"] as const).map((level) => (
                      <label key={level} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={u.unlockedLevels.includes(level)}
                          onChange={() => handleToggleLevel(u, level)}
                          className="w-3.5 h-3.5 accent-orange-600 cursor-pointer"
                        />
                        {level}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-blue-600">{u.xp}</td>
```

- [ ] **Step 4: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: add per-user level-unlock checkboxes to admin Users page"
```

---

### Task 4: Admin UI — drop module title editing, add/delete lessons

**Files:**
- Modify: `src/pages/admin/AdminContentSection.tsx`

**Interfaces:**
- Consumes: `LessonEditable` type from `AdminLessonEditor.tsx` (unchanged).
- Produces: no new exports; leaf UI change.

- [ ] **Step 1: Replace the entire file**

Replace the entire contents of `src/pages/admin/AdminContentSection.tsx` with:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";
import { showToast } from "../../lib/toast";

interface AdminLesson extends LessonEditable {
  order_index: number;
}

interface AdminModule {
  id: string;
  title: string;
  title_vi: string;
  level: string;
  order_index: number;
  lessons: AdminLesson[];
}

const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index`;

export const AdminContentSection: React.FC = () => {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AdminLesson | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminLesson | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchModules = () => {
    supabase
      .from("modules")
      .select(`id, title, title_vi, level, order_index, lessons(${LESSON_SELECT})`)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules((data ?? []) as unknown as AdminModule[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchModules(); }, []);

  const emptyVocabGrammar = (row: unknown): Pick<AdminLesson, "vocabulary" | "grammar"> => ({
    vocabulary: Array.isArray((row as AdminLesson).vocabulary) ? (row as AdminLesson).vocabulary : [],
    grammar: (row as AdminLesson).grammar && typeof (row as AdminLesson).grammar === "object"
      ? (row as AdminLesson).grammar
      : { title: "", rule: "", examples: [] },
  });

  const handleAddLesson = async (mod: AdminModule) => {
    setAdding(true);
    const levelLower = mod.level.toLowerCase();
    const n = mod.lessons.length + 1;
    const id = `${levelLower}-l${n}`;

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

    setAdding(false);

    if (error || !data) {
      showToast("Tạo bài học thất bại: " + (error?.message ?? "unknown error"), "warning");
      return;
    }

    setEditing({ ...(data as unknown as AdminLesson), ...emptyVocabGrammar(data) });
  };

  const handleDeleteLesson = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    await supabase.from("lessons").update({ next_lesson_id: null }).eq("next_lesson_id", deleteTarget.id);
    const { error } = await supabase.from("lessons").delete().eq("id", deleteTarget.id);

    setDeleting(false);

    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa bài học.", "success");
      setDeleteTarget(null);
      fetchModules();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  // Full-page lesson editor — replaces module list
  if (editing) {
    return (
      <AdminLessonEditor
        lesson={editing}
        onBack={() => { setEditing(null); fetchModules(); }}
        onSaved={() => { setEditing(null); fetchModules(); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý Nội dung</h1>

      <div className="space-y-3">
        {modules.map((mod) => (
          <div key={mod.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[mod.id]
                ? <ChevronDown className="w-4 h-4 text-slate-400" />
                : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-black text-slate-900 text-sm">{mod.level}</p>
                <p className="text-xs text-slate-400">{mod.lessons.length} bài học</p>
              </div>
            </button>

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
                  <button
                    onClick={() => handleAddLesson(mod)}
                    disabled={adding}
                    className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 px-3 py-1.5 rounded-xl hover:bg-orange-50 border border-orange-200 transition-colors disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Thêm bài học
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">Xóa bài học?</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Xóa bài học <span className="font-bold">{deleteTarget.title_vi}</span>? Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-display font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteLesson}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

Notes on what changed vs. the original file:
- Module header now shows only `{mod.level}` (e.g. "A1") instead of `{mod.title_vi}` / `{mod.title}` — no more module title editing anywhere.
- `emptyVocabGrammar` factors out the repeated vocabulary/grammar normalization that previously lived inline in the edit-button `onClick` — used by both the "edit" and "add" paths now that there are two places that open the editor.
- `handleAddLesson` inserts a new lesson with a generated id (`{level}-l{n}`, `n` = current lesson count in that module + 1), then opens the editor immediately.
- `handleDeleteLesson` nulls out any `next_lesson_id` pointing at the deleted lesson before deleting it (required — `lessons.next_lesson_id → lessons.id` is `ON DELETE NO ACTION`, so deleting first would fail with a foreign key violation).
- `onBack` now also calls `fetchModules()` (previously it didn't) — necessary because opening the editor via "Add lesson" already persisted a real row in the DB before the admin edits anything; going back without refetching would show a stale list missing the just-created lesson's real content.

- [ ] **Step 2: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminContentSection.tsx
git commit -m "feat: add/delete lessons in admin content, drop module title editing"
```

---

### Task 5: Roadmap — flat lesson list filtered by unlocked levels

**Files:**
- Modify: `src/pages/RoadmapPage.tsx`

**Interfaces:**
- Consumes: `stats.unlockedLevels` (Task 2), `modules` prop (`Module[]`, already passed in by the parent — unchanged).
- Produces: no new exports; leaf UI change. `RoadmapPageProps` is unchanged (`stats`, `modules`, `onSelectLesson`).

- [ ] **Step 1: Replace the entire file**

Replace the entire contents of `src/pages/RoadmapPage.tsx` with:

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

  const totalLessons = allLessons.length;
  const completedTotal = stats.completedLessons.length;
  const overAllProgress = totalLessons > 0 ? Math.round((completedTotal / totalLessons) * 100) : 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-300">

      {/* Top Banner section */}
      <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="space-y-2">
          <span className="text-xs font-display font-black text-orange-700 bg-orange-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Sơ đồ tiến trình học
          </span>
          <h1 className="text-2xl sm:text-3.5xl font-display font-black text-slate-900 tracking-tight font-sans">
            Lộ trình Chinh phục Tiếng Đức
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm font-sans max-w-xl leading-relaxed">
            Học theo cấu trúc hình búp măng của DeutschPath. Mỗi mốc nối tiếp nhau logic, mở khóa bài học tiếp theo sau khi vượt qua bài kiểm tra mini!
          </p>
        </div>

        {/* Global progress tracker */}
        <div className="bg-slate-50/50 border border-slate-200/60 p-5 rounded-2xl min-w-[200px] w-full md:w-auto shrink-0 select-none">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-display font-bold text-slate-400">Tổng tiến trình</span>
            <span className="text-xs font-display font-extrabold text-slate-800">{completedTotal} / {totalLessons} Bài học</span>
          </div>
          <ProgressBar value={overAllProgress} className="text-xs" />
          <p className="text-[10px] text-slate-400 mt-2 font-sans text-center">Hoàn thành bài học trước để mở bài tiếp theo!</p>
        </div>
      </div>

      {/* Visual Roadmap - flat lesson trail (no level/module grouping shown) */}
      <div className="relative">
        {/* Draw a subtle central connecting vertical line in background for timeline layout */}
        <div className="absolute left-6 md:left-[50px] top-4 bottom-4 w-1 bg-slate-200 rounded pointer-events-none z-0 hidden sm:block" />

        {totalLessons === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Chưa có level nào được mở, liên hệ quản trị viên.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 pl-0 sm:pl-11 relative z-10">
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
                  {/* Top section indicators */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                          Bài {indexInAll + 1}
                        </span>
                        {status === "current" && (
                          <span className="bg-orange-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            Đang học
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-display font-bold text-slate-900 group-hover:text-orange-600 duration-150 transition font-sans">
                        {lesson.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-sans leading-relaxed">
                        {lesson.titleVi}
                      </p>
                    </div>

                    {/* Status Icon badge */}
                    <div className="shrink-0 pt-0.5 select-none">
                      {status === "completed" && (
                        <div className="w-7 h-7 rounded-lg bg-green-50 text-green-700 flex items-center justify-center border border-green-100" title="Bài học hoàn thành">
                          <Check className="w-4 h-4 text-green-600 font-extrabold" />
                        </div>
                      )}
                      {status === "current" && (
                        <div className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-md animate-pulse">
                          <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />
                        </div>
                      )}
                      {status === "locked" && (
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200" title="Khóa học chưa được mở">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content summary preview */}
                  <p className="text-[11px] text-slate-400 font-sans line-clamp-2 leading-relaxed my-3">
                    {lesson.objective}
                  </p>

                  {/* Bottom action trigger block */}
                  <div className="pt-3 border-t border-slate-100 mt-1 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-slate-400">⏱ Video: {lesson.duration}</span>
                    {status !== "locked" ? (
                      <button
                        id={`btn-road-start-${lesson.id}`}
                        onClick={() => onSelectLesson(lesson.id)}
                        className="bg-slate-50 border border-slate-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition flex items-center gap-1 cursor-pointer select-none"
                      >
                        <span>{status === "completed" ? "Ôn tập lại" : "Khám phá ngay"}</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-display font-semibold flex items-center gap-1 select-none">
                        <LockKeyhole className="w-3 h-3 text-slate-300" /> Bị khóa bởi bài trước
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
```

Notes on what changed vs. the original file:
- Dropped the `levels` array (level titles/colors/descriptions) and the outer `levels.map(...)` loop that rendered one "Level Group Header Card" per level — that entire visual grouping is gone.
- `allLessons` is now built from `unlockedModules` (filtered by `stats.unlockedLevels`) instead of every module — this is the only change to the unlock logic itself; `getLessonStatus` is otherwise byte-for-byte identical to before.
- Dropped `moduleTitleVi` from the `allLessons` entries — it was assembled but never actually read anywhere in the render (confirmed by reading the full original file), so removing it is not a behavior change.
- Dropped the `Bài {N} • {lesson.moduleTitle}` label's `• {lesson.moduleTitle}` part — this was leaking the module's German title (e.g. "Einführung & Begrüßung") on every card; now it's just `Bài {N}`.
- Removed the previously-unused imports (`Award`, `BookOpen`, `TrendingUp`, `MapPin`, `LevelBadge`, `Button`, `Level`) that existed in the original file but were never referenced anywhere in it — confirmed by reading the full 256-line original file before this rewrite. Removing them here is an incidental consequence of rewriting the whole file, not a separate cleanup pass.
- `overAllProgress` now guards against division by zero (`totalLessons > 0 ? ... : 0`) for the case where a user has zero unlocked levels — the original code had no user-facing way to reach `totalLessons === 0`, so this guard didn't exist before.
- Added an empty state (`totalLessons === 0`) for the same zero-unlocked-levels case, plus the banner's "Hoàn thành A1 để mở khóa bứt tốc A2!" hint was reworded to "Hoàn thành bài học trước để mở bài tiếp theo!" (no longer names a specific level, since a user might not start with A1 at all).

- [ ] **Step 2: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/RoadmapPage.tsx
git commit -m "feat: flatten Roadmap into one lesson list filtered by unlocked levels"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only; fix forward into whichever file is wrong if something's broken, per Step 5).

**Interfaces:** none — this task exercises Tasks 1-5 together in a real browser.

- [ ] **Step 1: Start the dev server on Node 20**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run dev -- --port 5173
```

- [ ] **Step 2: Verify admin content management**

Log in as admin, go to "Quản lý Nội dung". Confirm:
- Exactly 4 groups shown, labeled only "A1", "A2", "B1", "B2" (no German/Vietnamese title text anywhere on the module header).
- Expand a module, click "+ Thêm bài học" — a new lesson appears immediately and the full lesson editor opens for it; its id follows the `{level}-l{n}` pattern (check via the editor's displayed lesson id or by re-querying the DB).
- Go back without changing anything — the new lesson is still present in the list on return (confirms `fetchModules()` re-runs on `onBack`).
- Delete a lesson that another lesson's "next lesson" pointed to (or create this situation by setting one up) — confirm no error, and re-query `lessons` to confirm the pointing lesson's `next_lesson_id` is now `null`.

- [ ] **Step 3: Verify per-user level unlocking**

Go to "Người dùng". Confirm:
- A new "Cấp độ mở" column with 4 checkboxes (A1/A2/B1/B2) per user.
- A freshly created user has only A1 checked (matches the migration's default).
- Tick "A2" for a test user (leave A1 unchecked or checked, try both), re-query `profiles.unlocked_levels` for that user to confirm it persisted.
- Untick a level, confirm the checkbox updates immediately and the DB row reflects it.

- [ ] **Step 4: Verify the learner Roadmap**

Log in as (or impersonate via test data for) a user with only `["A2"]` unlocked. Open "Lộ trình". Confirm:
- The list starts directly at `a2-l1`, marked "current" (playable), not "locked".
- No level/module labels ("A1", "A2", "Cấp độ...", or any German module title) appear anywhere on the page.
- Completing `a2-l1` (mark it complete via the existing flow) unlocks `a2-l2` next, and so on — sequential unlock still works.
- For a user with zero unlocked levels (if you can arrange one, e.g. by unticking all 4 for a test user), confirm the empty state renders instead of a crash.

If anything in Steps 2-4 doesn't match, read the relevant file (`AdminContentSection.tsx`, `AdminUsersSection.tsx`, `RoadmapPage.tsx`, `useUserStats.ts`), fix it, and re-test from the step that failed.

- [ ] **Step 5: Final full verification**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit any fixes**

Only if Steps 2-4 required a code fix:

```bash
git add <fixed files>
git commit -m "fix: correct issues found in manual admin/roadmap end-to-end check"
```

If no fixes were needed, skip this step — there is nothing to commit.
