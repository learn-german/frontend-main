# Admin Exercise Module Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two exercise-management admin tabs (Ngữ pháp, and Nghe/Đọc) group and order their lesson lists exactly like Content Management — nested Module (collapsible) → Lesson (collapsible, unchanged) — instead of a flat lesson list.

**Architecture:** A new read-only hook (`useModuleOrder`) fetches modules with their nested lesson ids, sorted the same two-level way Content Management already sorts (`modules.order_index` → `lessons.order_index`). A new tiny presentational component (`AdminModuleGroup`) renders the collapsible module header + body, matching Content Management's module row styling. Both `AdminQuizSection.tsx` and `AdminGrammarExerciseSection.tsx` bucket their existing per-lesson groups into modules using this hook's `lessonIds` order, and render each bucket through `AdminModuleGroup`, without changing any per-lesson row behavior.

**Tech Stack:** React 19, TypeScript 5.8, Supabase JS client, lucide-react icons, Tailwind CSS v4.

## Global Constraints

- Ngôn ngữ code: English (biến, hàm, type). Nội dung hiển thị cho user: Tiếng Việt.
- Không dùng `any` trong TypeScript.
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay.
- Không thêm kéo-thả hay bất kỳ thao tác đổi order_index nào trong 2 tab bài tập — thứ tự chỉ đọc từ Content Management.
- Không đổi hành vi/route của `QuizPage.tsx`, `GrammarExercisePage.tsx`, hay bất kỳ trang học viên nào.
- Verify mỗi task bằng `npm run lint` (tsc --noEmit); không có test runner trong repo này.

---

### Task 1: Add `useModuleOrder` hook and `AdminModuleGroup` component

**Files:**
- Create: `src/lib/hooks/useModuleOrder.ts`
- Create: `src/pages/admin/AdminModuleGroup.tsx`

**Interfaces:**
- Produces: `useModuleOrder(): { modules: ModuleOrder[]; loading: boolean }` where
  `ModuleOrder = { id: string; level: string; lessonIds: string[] }`, `lessonIds` is
  sorted by `lessons.order_index`, and `modules` array is sorted by `modules.order_index`.
- Produces: `AdminModuleGroup` component with props
  `{ title: string; subtitle: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }`.

- [ ] **Step 1: Create the `useModuleOrder` hook**

Create `src/lib/hooks/useModuleOrder.ts`:

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface ModuleOrder {
  id: string;
  level: string;
  lessonIds: string[];
}

interface ModuleRow {
  id: string;
  level: string;
  lessons: { id: string }[];
}

export function useModuleOrder() {
  const [modules, setModules] = useState<ModuleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("modules")
      .select("id, level, order_index, lessons(id, order_index)")
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules(
          ((data ?? []) as unknown as ModuleRow[]).map((m) => ({
            id: m.id,
            level: m.level,
            lessonIds: m.lessons.map((l) => l.id),
          })),
        );
        setLoading(false);
      });
  }, []);

  return { modules, loading };
}
```

- [ ] **Step 2: Create the `AdminModuleGroup` component**

Create `src/pages/admin/AdminModuleGroup.tsx`:

```tsx
import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AdminModuleGroupProps {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const AdminModuleGroup: React.FC<AdminModuleGroupProps> = ({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
    >
      {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      <div className="flex-1">
        <p className="font-display font-black text-slate-900 text-sm">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </button>
    {expanded && <div className="border-t border-slate-100 p-3 space-y-3">{children}</div>}
  </div>
);
```

- [ ] **Step 3: Verify with typecheck**

Run: `npm run lint`
Expected: no errors (these two new files are not imported anywhere yet, so this just
confirms they compile standalone).

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useModuleOrder.ts src/pages/admin/AdminModuleGroup.tsx
git commit -m "feat: add module ordering hook and module accordion component for admin"
```

---

### Task 2: Group `AdminQuizSection.tsx` (Nghe/Đọc tabs) by module

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: `useModuleOrder(): { modules: ModuleOrder[]; loading: boolean }` from
  `../../lib/hooks/useModuleOrder` (Task 1).
- Consumes: `AdminModuleGroup` from `./AdminModuleGroup` (Task 1), props
  `{ title, subtitle, expanded, onToggle, children }` (Task 1).

- [ ] **Step 1: Import the new hook and component**

In `src/pages/admin/AdminQuizSection.tsx`, find this import block near the top:

```tsx
import { uploadMedia } from "../../lib/uploadMedia";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
```

Replace it with:

```tsx
import { uploadMedia } from "../../lib/uploadMedia";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
import { AdminModuleGroup } from "./AdminModuleGroup";
```

- [ ] **Step 2: Add module-expand state and the hook call**

Find this line inside `AdminQuizSection`:

```tsx
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
```

Replace it with:

```tsx
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const { modules: moduleOrder } = useModuleOrder();
```

- [ ] **Step 3: Bucket `filteredGroups` into modules**

Find this block:

```tsx
  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );
```

Replace it with:

```tsx
  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  const moduleSections = moduleOrder
    .map((mod) => ({
      id: mod.id,
      level: mod.level,
      lessonGroups: mod.lessonIds
        .map((lid) => filteredGroups.find((g) => g.lesson_id === lid))
        .filter((g): g is LessonGroup => !!g),
    }))
    .filter((mod) => mod.lessonGroups.length > 0);
```

- [ ] **Step 4: Remove the module name from each lesson row's subtitle**

Find:

```tsx
                <p className="text-xs text-slate-400">
                  {group.module_title} · {filteredQuestions.length} câu hỏi
                  {activeTab === "nghe" && ` · ${group.clips.length} file mp3`}
                  {activeTab === "doc" && ` · ${group.passages.length} đoạn văn`}
                </p>
```

Replace it with:

```tsx
                <p className="text-xs text-slate-400">
                  {filteredQuestions.length} câu hỏi
                  {activeTab === "nghe" && ` · ${group.clips.length} file mp3`}
                  {activeTab === "doc" && ` · ${group.passages.length} đoạn văn`}
                </p>
```

- [ ] **Step 5: Wrap the lesson list in the module accordion**

Find this exact block (the outer `<div className="space-y-3">` that maps
`filteredGroups`, down through its closing `</div>` and the `)}` that closes the
`activeTab === "nguphap" ? ... : (...)` ternary):

```tsx
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
                  {filteredQuestions.length} câu hỏi
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
      )}
```

Replace it with:

```tsx
      <div className="space-y-3">
        {moduleSections.map((mod) => (
          <AdminModuleGroup
            key={mod.id}
            title={mod.level}
            subtitle={`${mod.lessonGroups.length} bài học`}
            expanded={!!moduleExpanded[mod.id]}
            onToggle={() => setModuleExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
          >
            {mod.lessonGroups.map((group) => {
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
                      {filteredQuestions.length} câu hỏi
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
          </AdminModuleGroup>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>
      )}
```

- [ ] **Step 6: Verify with typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual verification in browser**

Start the dev server (`npm run dev`) and open the admin panel's Quản lý bài tập
section. On the Nghe tab and the Đọc tab, confirm:
- Lessons now render nested under collapsible module headers (module title shown
  is the level, e.g. "A1", "A2"), in the same order as Quản lý Nội dung.
- Expanding/collapsing a module works; expanding/collapsing a lesson inside still
  works exactly as before.
- The search box still filters lessons (typing a lesson or module name narrows
  results; modules with no matches disappear).
- Existing question CRUD, mp3 upload, and passage management still function
  unchanged inside an expanded lesson.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: group Nghe/Đọc exercise management by module like Content Management"
```

---

### Task 3: Group `AdminGrammarExerciseSection.tsx` (Ngữ pháp tab) by module

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `useModuleOrder(): { modules: ModuleOrder[]; loading: boolean }` from
  `../../lib/hooks/useModuleOrder` (Task 1).
- Consumes: `AdminModuleGroup` from `./AdminModuleGroup` (Task 1).

- [ ] **Step 1: Import the new hook and component**

Find this import block near the top of `src/pages/admin/AdminGrammarExerciseSection.tsx`:

```tsx
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
```

Replace it with:

```tsx
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { AdminModuleGroup } from "./AdminModuleGroup";
```

- [ ] **Step 2: Add module-expand state and the hook call**

Find:

```tsx
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
```

Replace it with:

```tsx
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const { modules: moduleOrder } = useModuleOrder();
```

- [ ] **Step 3: Bucket `filteredGroups` into modules**

Find:

```tsx
  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );
```

Replace it with:

```tsx
  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  const moduleSections = moduleOrder
    .map((mod) => ({
      id: mod.id,
      level: mod.level,
      lessonGroups: mod.lessonIds
        .map((lid) => filteredGroups.find((g) => g.lesson_id === lid))
        .filter((g): g is LessonGroup => !!g),
    }))
    .filter((mod) => mod.lessonGroups.length > 0);
```

- [ ] **Step 4: Remove the module name from each lesson row's subtitle**

Find:

```tsx
                <p className="text-xs text-slate-400">
                  {group.module_title} · {group.exercises.length} bài tập
                </p>
```

Replace it with:

```tsx
                <p className="text-xs text-slate-400">
                  {group.exercises.length} bài tập
                </p>
```

- [ ] **Step 5: Wrap the lesson list in the module accordion**

Find this exact block:

```tsx
      <div className="space-y-3">
        {filteredGroups.map((group) => (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">
                  {group.exercises.length} bài tập
                </p>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  openCreate(group.lesson_id, group.exercises.length);
                }}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm bài tập
              </span>
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {group.exercises.length === 0 ? (
                  <p className="text-center py-6 text-slate-400 text-sm">Chưa có bài tập nào cho bài học này.</p>
                ) : (
                  <ExerciseTable exercises={group.exercises} onEdit={openEdit} onDelete={setDeleteTarget} onPreview={setPreviewTarget} />
                )}
              </div>
            )}
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>
```

Replace it with:

```tsx
      <div className="space-y-3">
        {moduleSections.map((mod) => (
          <AdminModuleGroup
            key={mod.id}
            title={mod.level}
            subtitle={`${mod.lessonGroups.length} bài học`}
            expanded={!!moduleExpanded[mod.id]}
            onToggle={() => setModuleExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
          >
            {mod.lessonGroups.map((group) => (
              <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  {expanded[group.lesson_id] ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <div className="flex-1">
                    <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                    <p className="text-xs text-slate-400">
                      {group.exercises.length} bài tập
                    </p>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreate(group.lesson_id, group.exercises.length);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm bài tập
                  </span>
                </button>

                {expanded[group.lesson_id] && (
                  <div className="border-t border-slate-100 p-4 space-y-3">
                    {group.exercises.length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-sm">Chưa có bài tập nào cho bài học này.</p>
                    ) : (
                      <ExerciseTable exercises={group.exercises} onEdit={openEdit} onDelete={setDeleteTarget} onPreview={setPreviewTarget} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </AdminModuleGroup>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>
```

- [ ] **Step 6: Verify with typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual verification in browser**

With the dev server running, open the admin panel's Quản lý bài tập → tab Ngữ pháp.
Confirm:
- Lessons render nested under collapsible module headers, same order as Quản lý
  Nội dung.
- Expand/collapse behavior for modules and lessons both work.
- Search still filters correctly.
- Existing grammar-exercise CRUD (create/edit/delete/preview/publish) still works
  unchanged inside an expanded lesson.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat: group grammar exercise management by module like Content Management"
```
