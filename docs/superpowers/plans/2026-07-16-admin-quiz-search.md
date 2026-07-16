# Admin Quiz Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search box to the admin "Quản lý bài tập" page that filters the visible lesson groups by lesson or module title.

**Architecture:** Single new `search` state string in `AdminQuizSection.tsx`, filtered client-side (no new fetch) against the already-loaded `groups` array before rendering.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (existing patterns only, no new dependencies).

## Global Constraints

- Search matches `lesson_title` OR `module_title`, case-insensitive substring match (same `.includes()` pattern already used in `AdminUsersSection.tsx`'s search box).
- Filters only the list of lesson groups shown — does not touch question content, does not affect the `activeTab` category filter.
- No new API calls — filtering happens client-side against already-fetched `groups` state.
- No debounce, no new npm dependencies, no new routes/migrations.

---

### Task 1: Add search box to AdminQuizSection

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:** None — self-contained UI change in a single file, no props/exports affected.

- [ ] **Step 1: Add the `Search` icon import**

Find in `src/pages/admin/AdminQuizSection.tsx`:

```tsx
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, GripVertical } from "lucide-react";
```

Replace with:

```tsx
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, GripVertical, Search } from "lucide-react";
```

- [ ] **Step 2: Add `search` state**

Find:

```tsx
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
```

Replace with:

```tsx
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
  const [search, setSearch] = useState("");
```

- [ ] **Step 3: Compute the filtered group list**

Find:

```tsx
  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";
```

Replace with:

```tsx
  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";

  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );
```

- [ ] **Step 4: Render the search box and switch the list to `filteredGroups`**

Find:

```tsx
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý bài tập</h1>

      <div className="flex gap-2 border-b border-slate-200/60">
```

Replace with:

```tsx
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
```

Find:

```tsx
      <div className="space-y-3">
        {groups.map((group) => {
```

Replace with:

```tsx
      <div className="space-y-3">
        {filteredGroups.map((group) => {
```

Find (the closing of the groups list, right after the `.map()` callback's closing brace and before the edit/create modal comment):

```tsx
          );
        })}
      </div>

      {/* Edit / Create modal */}
```

Replace with (adds an empty-state message when the search matches nothing):

```tsx
          );
        })}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>

      {/* Edit / Create modal */}
```

- [ ] **Step 5: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

Build a throwaway harness `dbgtest.html` + `dbgtest.tsx` at repo root rendering `AdminQuizSection` directly (it takes no props, does its own Supabase fetch — since this sandbox has no admin session, either module-stub `fetchQuestions`/the Supabase call the way earlier tasks in this session stubbed hooks, OR — simpler — temporarily hardcode a few mock `LessonGroup` objects directly into the component's `useState` initial value in a COPY of the file used only by the harness, never committed). Verify via `read_page`/`get_page_text`/`computer`:
1. With at least 3 mock lesson groups across 2 different module titles, typing a substring of one lesson's title into the search box leaves only that lesson group visible.
2. Typing a substring of a module title (not matching any lesson title directly) shows all lessons belonging to that module.
3. Clearing the search box restores the full list.
4. Typing a string matching nothing shows the "Không tìm thấy bài học nào khớp với ..." message, not an empty blank area.
5. Switching the category tab (`activeTab`) while a search term is active does not clear the search term or fight with the filtering.

Delete `dbgtest.html`/`dbgtest.tsx` (and any stub copy of `AdminQuizSection.tsx` created only for the harness) before committing — they must never be committed. Paste literal tool output into the task report as evidence.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: add lesson/module search to admin quiz management page"
```

---

## Final Notes

This is a single-task plan — the whole feature lands in Task 1's commit. After task review passes, proceed straight to `superpowers:finishing-a-development-branch` (no separate final whole-branch review needed for a single-task plan, though the controller may still choose to run one at their discretion given this is being appended to an already-large branch).
