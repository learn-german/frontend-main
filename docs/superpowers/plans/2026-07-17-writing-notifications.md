# Schreiben (Writing) + In-App Notifications + Tab Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Schreiben" (Viết) writing exercise (admin-authored prompt, learner free-text submission, admin manual grading with comment), a from-scratch in-app-only notification system for submit/grade events, and reorder+relabel all 6 lesson tabs to German with hide-when-empty behavior.

**Architecture:** `writing_prompt_md` is a new scalar column on `lessons` (mirrors the existing `speaking_md` pattern exactly). A new `writing_submissions` table holds one row per `(lesson_id, user_id)`, overwritten on resubmit via upsert; RLS lets students write only their own `content` (never `score`/`comment`/`graded_at`) and lets admins write everything. Two `SECURITY DEFINER` Postgres triggers on `writing_submissions` are the *only* way `notifications` rows are ever created — this keeps notification creation entirely server-controlled (no client-side INSERT policy on `notifications` exists at all), so a student can never forge a notification. Writing exercises never enter `completion.ts`'s `QuizCategory`/`applicableCategories`, exactly mirroring how `noi` (Sprechen) is already excluded.

**Tech Stack:** React 19, TypeScript, Supabase (Postgres + RLS + Postgres triggers), Vite.

## Global Constraints

- Thang điểm bài viết: **0–100** integer, đồng nhất với `quiz_score` hiện có.
- Học viên được nộp lại bất cứ lúc nào — nộp lại reset `score`/`comment`/`graded_at` về `NULL` (bài quay về "chưa chấm").
- Bài viết **không** tính vào `QuizCategory`/`applicableCategories`/ngưỡng 80% hoàn thành — không sửa `src/lib/completion.ts` trong plan này.
- Thông báo **chỉ hiển thị trong web** — không email, không push, không SMS, không Supabase Realtime/websocket (fetch-on-load only, no polling loop).
- Thông báo nộp bài → broadcast cho TẤT CẢ admin (1 row, `for_admin=true`, `user_id=NULL`) — không tạo riêng theo từng admin.
- Thông báo chấm bài → đúng 1 học viên đã nộp (`user_id=<student>`, `for_admin=false`).
- Mọi row `notifications` chỉ được tạo bởi 2 trigger function `SECURITY DEFINER` trên `writing_submissions` — không có INSERT policy client-side nào trên bảng `notifications`.
- Nhãn 6 tab lesson đổi sang tiếng Đức, đúng thứ tự: **Wortschatz | Grammatikübungen | Lesen | Hören | Schreiben | Sprechen**.
- Tab nào không có nội dung khả dụng thì ẩn hẳn (không hiện tab + không hiện "Sắp có" nữa) — áp dụng cho cả 6 tab.
- Node version: `source ~/.nvm/nvm.sh && nvm use 20` trước mọi `npm run dev`/`lint`.
- Supabase project id: `awdhqlgxnjwymwgxltlw`.

---

### Task 1: DB — writing_prompt_md column, writing_submissions, notifications, triggers, RLS

**Files:**
- Create: `supabase/migrations/20260717000017_writing_and_notifications.sql`

**Interfaces:**
- Produces: `lessons.writing_prompt_md` (TEXT, nullable) — consumed by Task 2/3. `writing_submissions` table (columns below) — consumed by Task 5/6. `notifications` table — consumed by Task 7. Two triggers that auto-create `notifications` rows whenever `writing_submissions` is inserted/updated in the ways described below — no task ever needs to manually INSERT into `notifications`.

- [ ] **Step 1: Write the migration**

```sql
-- 1. Writing prompt column on lessons (mirrors grammar_md/speaking_md pattern).
ALTER TABLE lessons ADD COLUMN writing_prompt_md TEXT;

-- 2. writing_submissions: one submission per (lesson_id, user_id), overwritten
--    on resubmit. user_id references profiles(id) (not auth.users(id)
--    directly) so the admin grading UI can nested-select profiles(email,
--    full_name) in one query, matching the pattern AdminUsersSection.tsx
--    already uses for user_stats.
CREATE TABLE writing_submissions (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id    TEXT        NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  score        INTEGER,
  comment      TEXT,
  graded_at    TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);

ALTER TABLE writing_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "writing_submissions: own read"
  ON writing_submissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Students may only INSERT their own submission with score/comment/graded_at
-- left NULL — grading is admin-only, enforced by the WITH CHECK below.
CREATE POLICY "writing_submissions: own insert"
  ON writing_submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND score IS NULL AND comment IS NULL AND graded_at IS NULL);

-- Students may only UPDATE their own row (resubmit), and the new row must
-- again have score/comment/graded_at NULL — this is what makes "resubmit
-- resets grading" a server-enforced invariant, not just client behavior.
CREATE POLICY "writing_submissions: own resubmit"
  ON writing_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND score IS NULL AND comment IS NULL AND graded_at IS NULL);

CREATE POLICY "writing_submissions: admin all"
  ON writing_submissions FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 3. notifications: broadcast-to-admins (for_admin=true, user_id NULL) or
--    targeted-to-one-user (user_id set, for_admin=false). user_id here
--    references auth.users(id) directly (not profiles) since no admin UI
--    ever needs to join this table against profiles — it only displays
--    the pre-built `message` text.
CREATE TABLE notifications (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  for_admin  BOOLEAN     NOT NULL DEFAULT false,
  type       TEXT        NOT NULL,
  lesson_id  TEXT        REFERENCES lessons(id) ON DELETE CASCADE,
  message    TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ( (for_admin = true AND user_id IS NULL) OR (for_admin = false AND user_id IS NOT NULL) )
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: own read"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications: admin read broadcast"
  ON notifications FOR SELECT
  TO authenticated
  USING (for_admin = true AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "notifications: own update"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications: admin update broadcast"
  ON notifications FOR UPDATE
  TO authenticated
  USING (for_admin = true AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK (for_admin = true AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Deliberately NO INSERT policy on notifications at all — every row is
-- created exclusively by the two SECURITY DEFINER trigger functions below,
-- which bypass RLS by running with the function owner's elevated
-- privilege. A student can never forge a notification for another user or
-- a fake admin broadcast, because no role has direct INSERT access.

-- 4. Trigger: every INSERT or content-changing UPDATE on writing_submissions
--    creates one broadcast "writing_submitted" notification for admins.
CREATE OR REPLACE FUNCTION notify_writing_submitted()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (for_admin, type, lesson_id, message)
  VALUES (
    true,
    'writing_submitted',
    NEW.lesson_id,
    'Có bài viết mới cần chấm cho bài học ' || NEW.lesson_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_writing_submitted
  AFTER INSERT ON writing_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_writing_submitted();

CREATE TRIGGER trg_notify_writing_resubmitted
  AFTER UPDATE OF content ON writing_submissions
  FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content)
  EXECUTE FUNCTION notify_writing_submitted();

-- 5. Trigger: an UPDATE that sets score (grading) creates one
--    "writing_graded" notification for the submitting student.
CREATE OR REPLACE FUNCTION notify_writing_graded()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, for_admin, type, lesson_id, message)
  VALUES (
    NEW.user_id,
    false,
    'writing_graded',
    NEW.lesson_id,
    'Bài viết của bạn đã được chấm điểm: ' || NEW.score || '/100'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_writing_graded
  AFTER UPDATE OF score ON writing_submissions
  FOR EACH ROW
  WHEN (NEW.score IS NOT NULL AND OLD.score IS DISTINCT FROM NEW.score)
  EXECUTE FUNCTION notify_writing_graded();
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the Supabase MCP `apply_migration` tool (project id `awdhqlgxnjwymwgxltlw`) with the exact SQL above, name `writing_and_notifications`.

- [ ] **Step 3: Verify via `execute_sql`**

Find an existing real user id and lesson id to use for the test:
```sql
SELECT id FROM profiles LIMIT 1;
SELECT id FROM lessons LIMIT 1;
```

Using those ids (`<uid>`, `<lid>`), insert a test submission and confirm a submit notification appears:
```sql
INSERT INTO writing_submissions (lesson_id, user_id, content)
VALUES ('<lid>', '<uid>', 'Mein Test-Aufsatz.')
RETURNING id;
-- note the returned id as <subid>

SELECT for_admin, user_id, type, lesson_id, message FROM notifications
WHERE lesson_id = '<lid>' AND type = 'writing_submitted' ORDER BY created_at DESC LIMIT 1;
-- Expected: for_admin=true, user_id=NULL, type='writing_submitted'
```

Confirm a resubmit (content change) creates a second submit-type notification:
```sql
UPDATE writing_submissions SET content = 'Überarbeiteter Aufsatz.' WHERE id = '<subid>';

SELECT count(*) FROM notifications WHERE lesson_id = '<lid>' AND type = 'writing_submitted';
-- Expected: 2
```

Confirm grading creates a graded-type notification targeted at the student:
```sql
UPDATE writing_submissions SET score = 85, comment = 'Gut gemacht!', graded_at = now() WHERE id = '<subid>';

SELECT user_id, for_admin, type, message FROM notifications
WHERE lesson_id = '<lid>' AND type = 'writing_graded' ORDER BY created_at DESC LIMIT 1;
-- Expected: user_id = '<uid>', for_admin = false, message contains '85/100'
```

- [ ] **Step 4: Clean up all test data**

```sql
DELETE FROM notifications WHERE lesson_id = '<lid>' AND type IN ('writing_submitted', 'writing_graded');
DELETE FROM writing_submissions WHERE id = '<subid>';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000017_writing_and_notifications.sql
git commit -m "feat: add writing_submissions/notifications tables with trigger-based notification creation"
```

---

### Task 2: Types & data fetching — writingPromptMd + hasNguphapQuestions

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useModules.ts`

**Interfaces:**
- Consumes: Task 1's `lessons.writing_prompt_md` column, and `quiz_questions_public.category`/`lesson_id` (already existed before this plan).
- Produces: `Lesson.writingPromptMd?: string` and `Lesson.hasNguphapQuestions?: boolean` — both OPTIONAL fields (deliberately, so `src/data/mockData.ts` and the dead `src/hooks/useModules.ts` stub need zero changes, matching how `speakingMd`/`grammarMd` were added previously). Consumed by Task 3 (admin editor) and Task 4 (LessonDetailPage tab visibility).

- [ ] **Step 1: Add the two fields to `Lesson`**

In `src/lib/appTypes.ts`, find:

```ts
  grammarMd?: string;
  speakingMd?: string;
  videoR2Key?: string;
```

Replace with:

```ts
  grammarMd?: string;
  speakingMd?: string;
  writingPromptMd?: string;
  hasNguphapQuestions?: boolean;
  videoR2Key?: string;
```

- [ ] **Step 2: Add `writing_prompt_md` to `SupabaseLesson` and the select query**

In `src/lib/hooks/useModules.ts`, find:

```ts
  grammar_md: string | null;
  speaking_md: string | null;
  listening_url: string | null;
```

Replace with:

```ts
  grammar_md: string | null;
  speaking_md: string | null;
  writing_prompt_md: string | null;
  listening_url: string | null;
```

Find:

```
          grammar_md, speaking_md, video_r2_key,
```

Replace with:

```
          grammar_md, speaking_md, writing_prompt_md, video_r2_key,
```

- [ ] **Step 3: Thread `hasNguphapQuestions` through `transformModule` via a second parameter**

Find:

```ts
function transformModule(m: SupabaseModule): Module {
  return {
    id: m.id,
    level: m.level as Level,
    title: m.title,
    titleVi: m.title_vi,
    lessons: (m.lessons ?? []).map((l): Lesson => ({
      id: l.id,
      moduleId: m.id,
      moduleTitle: m.title_vi,
      level: l.level as Level,
      title: l.title,
      titleVi: l.title_vi,
      duration: l.duration,
      objective: l.objective ?? "",
      summary: l.summary ?? "",
      youtubeId: l.youtube_id ?? undefined,
      orderIndex: l.order_index,
      nextLessonId: l.next_lesson_id,
      vocabulary: (l.vocabulary as VocabularyItem[]) ?? [],
      grammar: (l.grammar as GrammarExplanation) ?? { title: "", rule: "", examples: [] },
      grammarMd: l.grammar_md ?? undefined,
      speakingMd: l.speaking_md ?? undefined,
      videoR2Key: l.video_r2_key ?? undefined,
```

Replace with:

```ts
function transformModule(m: SupabaseModule, nguphapLessonIds: Set<string>): Module {
  return {
    id: m.id,
    level: m.level as Level,
    title: m.title,
    titleVi: m.title_vi,
    lessons: (m.lessons ?? []).map((l): Lesson => ({
      id: l.id,
      moduleId: m.id,
      moduleTitle: m.title_vi,
      level: l.level as Level,
      title: l.title,
      titleVi: l.title_vi,
      duration: l.duration,
      objective: l.objective ?? "",
      summary: l.summary ?? "",
      youtubeId: l.youtube_id ?? undefined,
      orderIndex: l.order_index,
      nextLessonId: l.next_lesson_id,
      vocabulary: (l.vocabulary as VocabularyItem[]) ?? [],
      grammar: (l.grammar as GrammarExplanation) ?? { title: "", rule: "", examples: [] },
      grammarMd: l.grammar_md ?? undefined,
      speakingMd: l.speaking_md ?? undefined,
      writingPromptMd: l.writing_prompt_md ?? undefined,
      hasNguphapQuestions: nguphapLessonIds.has(l.id),
      videoR2Key: l.video_r2_key ?? undefined,
```

- [ ] **Step 4: Fetch the nguphap-question presence signal alongside the modules query, and pass it into `transformModule`**

Find:

```ts
    supabase
      .from("modules")
      .select(`
        id, level, title, title_vi, order_index,
        lessons (
          id, level, title, title_vi, objective, summary,
          youtube_id, duration, order_index, xp_reward,
          next_lesson_id, vocabulary, grammar,
          grammar_md, speaking_md, writing_prompt_md, video_r2_key,
          listening_clips (id, r2_key, order_index),
          reading_passages (id, text_de, order_index)
        )
      `)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
        } else {
          setModules((data ?? []).map(m => transformModule(m as SupabaseModule)));
        }
        setLoading(false);
      });
```

Replace with:

```ts
    Promise.all([
      supabase
        .from("modules")
        .select(`
          id, level, title, title_vi, order_index,
          lessons (
            id, level, title, title_vi, objective, summary,
            youtube_id, duration, order_index, xp_reward,
            next_lesson_id, vocabulary, grammar,
            grammar_md, speaking_md, writing_prompt_md, video_r2_key,
            listening_clips (id, r2_key, order_index),
            reading_passages (id, text_de, order_index)
          )
        `)
        .order("order_index")
        .order("order_index", { referencedTable: "lessons" }),
      supabase
        .from("quiz_questions_public")
        .select("lesson_id")
        .eq("category", "nguphap"),
    ]).then(([modulesRes, nguphapRes]) => {
      if (cancelled) return;
      if (modulesRes.error) {
        setError(modulesRes.error.message);
      } else {
        const nguphapLessonIds = new Set((nguphapRes.data ?? []).map((r) => r.lesson_id as string));
        setModules((modulesRes.data ?? []).map(m => transformModule(m as SupabaseModule, nguphapLessonIds)));
      }
      setLoading(false);
    });
```

- [ ] **Step 5: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors. (`src/pages/LessonDetailPage.tsx` will start referencing `hasNguphapQuestions`/`writingPromptMd` in Task 4, not this task — this task alone should be lint-clean on its own.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useModules.ts
git commit -m "feat: thread writingPromptMd and hasNguphapQuestions through Lesson type and data hook"
```

---

### Task 3: Admin — writing prompt editor

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx`
- Modify: `src/pages/admin/AdminContentSection.tsx`

**Interfaces:**
- Consumes: Task 1's `lessons.writing_prompt_md` column.
- Produces: nothing consumed by later tasks — admins can now author the writing prompt; this is independently verifiable via the live DB.

- [ ] **Step 1: Add `writing_prompt_md` to `LESSON_SELECT`**

In `src/pages/admin/AdminContentSection.tsx`, find:

```
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                video_r2_key, order_index, status`;
```

Replace with:

```
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                writing_prompt_md, video_r2_key, order_index, status`;
```

- [ ] **Step 2: Add `writing_prompt_md` to `LessonEditable`**

In `src/pages/admin/AdminLessonEditor.tsx`, find:

```ts
  grammar_md?: string | null;
  speaking_md?: string | null;
  video_r2_key?: string | null;
```

Replace with:

```ts
  grammar_md?: string | null;
  speaking_md?: string | null;
  writing_prompt_md?: string | null;
  video_r2_key?: string | null;
```

- [ ] **Step 3: Add `writingTab` state**

Find:

```ts
  const [speakingTab, setSpeakingTab] = useState<"edit" | "preview">("edit");
```

Replace with:

```ts
  const [speakingTab, setSpeakingTab] = useState<"edit" | "preview">("edit");
  const [writingTab, setWritingTab] = useState<"edit" | "preview">("edit");
```

- [ ] **Step 4: Add the Writing prompt editor block, right after the Nói block**

Find:

```tsx
            {speakingTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️</p>
                <textarea
                  rows={12}
                  value={data.speaking_md ?? ""}
                  onChange={e => upd({ speaking_md: e.target.value })}
                  placeholder={"## Luyện nói: Giới thiệu bản thân\n\nHãy tập nói to các câu sau:\n- \"Guten Tag! Ich heiße ...\"\n- \"Ich komme aus ...\""}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.speaking_md ? (
                  <MarkdownBlock content={data.speaking_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có nội dung luyện nói.</p>
                )}
              </div>
            )}
          </div>
```

Replace with:

```tsx
            {speakingTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️</p>
                <textarea
                  rows={12}
                  value={data.speaking_md ?? ""}
                  onChange={e => upd({ speaking_md: e.target.value })}
                  placeholder={"## Luyện nói: Giới thiệu bản thân\n\nHãy tập nói to các câu sau:\n- \"Guten Tag! Ich heiße ...\"\n- \"Ich komme aus ...\""}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.speaking_md ? (
                  <MarkdownBlock content={data.speaking_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có nội dung luyện nói.</p>
                )}
              </div>
            )}
          </div>

          {/* Viết — Markdown editor cho đề bài. Học viên viết bài + admin
              chấm điểm được quản lý ở trang "Chấm bài viết" riêng, không
              phải ở đây — trang này chỉ soạn đề bài. */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Viết
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setWritingTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${writingTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>

            {writingTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Đề bài viết cho học viên. Hỗ trợ Markdown giống ô Nói ở trên.</p>
                <textarea
                  rows={8}
                  value={data.writing_prompt_md ?? ""}
                  onChange={e => upd({ writing_prompt_md: e.target.value })}
                  placeholder={"## Đề bài: Viết đoạn văn giới thiệu bản thân\n\nViết khoảng 5-7 câu bằng tiếng Đức giới thiệu tên, quê quán, nghề nghiệp của bạn."}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.writing_prompt_md ? (
                  <MarkdownBlock content={data.writing_prompt_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có đề bài viết.</p>
                )}
              </div>
            )}
          </div>
```

- [ ] **Step 5: Add `writing_prompt_md` to both save payloads**

Find (appears twice, in `handleSave` and `handlePublish` — use `replace_all` or apply to both occurrences individually):

```ts
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
```

Replace with (both occurrences):

```ts
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      writing_prompt_md: data.writing_prompt_md || null,
      video_r2_key: data.video_r2_key || null,
```

- [ ] **Step 6: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors.

- [ ] **Step 7: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time. Do not repeat it — your report must contain literal pasted tool output.

This project has no admin login available in this sandbox. Use the established pattern: a throwaway `dbgtest.html`/`dbgtest.tsx` harness rendering `AdminLessonEditor` directly with a mocked `lesson` prop and a **module-mocked** `../../lib/supabase` (stub `.from("lessons").update(...)` to resolve `{ error: null }`). Verify via `read_page`/`get_page_text`/`computer`:
1. The new "Viết" editor block renders with Edit/Preview tabs, below the "Nói" block.
2. Typing into the writing textarea and switching to "Xem trước" renders the Markdown correctly (reuse the same `MarkdownBlock` verification approach already proven for the Nói block).

Delete `dbgtest.html`/`dbgtest.tsx` and any mock shim before committing.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx src/pages/admin/AdminContentSection.tsx
git commit -m "feat: add writing prompt Markdown editor to admin lesson editor"
```

---

### Task 4: LessonDetailPage — reorder/relabel tabs to German, hide when empty, read-only Schreiben prompt

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: Task 2's `Lesson.writingPromptMd`/`Lesson.hasNguphapQuestions`.
- Produces: a `bottomTab` value `"viet"` and a rendered (but read-only, no submission form yet) Viết panel — Task 5 replaces this panel's body with the full submission UI, reusing the same `bottomTab === "viet"` gate.

- [ ] **Step 1: Add `"viet"` to the `BottomTab` type**

Find:

```ts
type BottomTab = "quiz" | "nghe" | "doc" | "tuvung" | "noi";
```

Replace with:

```ts
type BottomTab = "quiz" | "nghe" | "doc" | "tuvung" | "noi" | "viet";
```

- [ ] **Step 2: Add the `PenLine` icon import**

Find:

```tsx
import {
  ArrowLeft,
  Volume2,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  Mic,
} from "lucide-react";
```

Replace with:

```tsx
import {
  ArrowLeft,
  Volume2,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  Mic,
  PenLine,
} from "lucide-react";
```

- [ ] **Step 3: Move `BOTTOM_TABS` above the `bottomTab` state, reorder/relabel to German, and add the hide-when-empty `visibleTabs` derivation**

Find:

```tsx
  const isCompleted = stats.completedLessons.includes(lesson.id);
  const [marked, setMarked] = useState(isCompleted);
  const [bottomTab, setBottomTab] = useState<BottomTab>("tuvung");

  const handlePronounce = (text: string) => {
```

Replace with:

```tsx
  const isCompleted = stats.completedLessons.includes(lesson.id);
  const [marked, setMarked] = useState(isCompleted);

  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Wortschatz", Icon: BookOpen },
    { id: "quiz", label: "Grammatikübungen", Icon: HelpCircle },
    { id: "doc", label: "Lesen", Icon: FileText },
    { id: "nghe", label: "Hören", Icon: Headphones },
    { id: "viet", label: "Schreiben", Icon: PenLine },
    { id: "noi", label: "Sprechen", Icon: Mic },
  ];

  // Any tab lacking available content for this lesson is hidden entirely
  // (no "Sắp có" placeholder tab shown anymore) — extends the content-gated
  // pattern already used for Nghe/Đọc's "Bắt đầu bài tập" buttons to every
  // tab. hasNguphapQuestions is optional/undefined for lessons not yet
  // fetched with the new signal (e.g. stale/mocked Lesson data) — treat
  // undefined as "has content" so Grammatikübungen is never hidden by
  // mistake.
  const visibleTabs = BOTTOM_TABS.filter(({ id }) => {
    if (id === "tuvung") return lesson.vocabulary.length > 0;
    if (id === "quiz") return lesson.hasNguphapQuestions !== false;
    if (id === "doc") return lesson.readingPassages.length > 0;
    if (id === "nghe") return lesson.listeningClips.length > 0;
    if (id === "viet") return !!lesson.writingPromptMd;
    if (id === "noi") return !!lesson.speakingMd;
    return true;
  });

  const [bottomTab, setBottomTab] = useState<BottomTab>(() => visibleTabs[0]?.id ?? "tuvung");

  const handlePronounce = (text: string) => {
```

- [ ] **Step 4: Remove the now-redundant old `BOTTOM_TABS` definition**

Find:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
    { id: "noi", label: "Nói", Icon: Mic },
    { id: "quiz", label: "Bài tập ngữ pháp", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
  ];

  return (
```

Replace with:

```tsx
  return (
```

- [ ] **Step 5: Render the tab bar from `visibleTabs` instead of `BOTTOM_TABS`**

Find:

```tsx
        <div className="flex border-b border-slate-200/60 bg-white">
          {BOTTOM_TABS.map(({ id, label, Icon }) => (
```

Replace with:

```tsx
        <div className="flex border-b border-slate-200/60 bg-white">
          {visibleTabs.map(({ id, label, Icon }) => (
```

- [ ] **Step 6: Simplify the Nghe tab panel — remove the now-unreachable "Sắp có" fallback**

Find:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.listeningClips.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  <div className="space-y-4">
                    {lesson.listeningClips.map((clip, idx) => (
                      <ListeningClipPlayer key={clip.id} lessonId={lesson.id} clip={clip} label={`File ${idx + 1}`} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài luyện nghe cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.listeningClips.length > 0 && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                    Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

Replace with:

```tsx
          {/* Nghe (Hören) tab — hidden entirely via visibleTabs when
              listeningClips is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "nghe" && lesson.listeningClips.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Headphones className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
              </div>
              <div className="space-y-4">
                {lesson.listeningClips.map((clip, idx) => (
                  <ListeningClipPlayer key={clip.id} lessonId={lesson.id} clip={clip} label={`File ${idx + 1}`} />
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                  Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
```

- [ ] **Step 7: Simplify the Đọc tab panel — remove the now-unreachable "Sắp có" fallback**

Find:

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

Replace with:

```tsx
          {/* Đọc (Lesen) tab — hidden entirely via visibleTabs when
              readingPassages is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "doc" && lesson.readingPassages.length > 0 && (
            <div className="space-y-4">
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
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                  Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
```

- [ ] **Step 8: Simplify the Nói tab panel (remove "Sắp có" fallback) and insert the new read-only Viết tab panel right before it**

Find:

```tsx
          {/* Nói tab */}
          {bottomTab === "noi" && (
            <div className="space-y-4">
              {lesson.speakingMd ? (
                <MarkdownBlock content={lesson.speakingMd} />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Mic className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Nội dung luyện nói cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
            </div>
          )}
```

Replace with:

```tsx
          {/* Viết (Schreiben) tab — read-only prompt display for now; a
              later task replaces this panel body with the full submission
              form, reusing this same bottomTab === "viet" gate. Hidden
              entirely via visibleTabs when writingPromptMd is empty. */}
          {bottomTab === "viet" && lesson.writingPromptMd && (
            <div className="space-y-4">
              <MarkdownBlock content={lesson.writingPromptMd} />
            </div>
          )}

          {/* Nói (Sprechen) tab — hidden entirely via visibleTabs when
              speakingMd is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "noi" && lesson.speakingMd && (
            <div className="space-y-4">
              <MarkdownBlock content={lesson.speakingMd} />
            </div>
          )}
```

- [ ] **Step 9: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors.

- [ ] **Step 10: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time. Do not repeat it — your report must contain literal pasted tool output.

Build a throwaway `dbgtest.html`/`dbgtest.tsx` harness rendering `LessonDetailPage` with mock `lesson`/`stats` props (this component takes plain props, no Supabase auth needed — no mocking required for this specific harness). Verify via `read_page`/`get_page_text`/`computer`, at least 2 scenarios:
1. A lesson with ALL 6 content fields populated (vocabulary non-empty, `hasNguphapQuestions: true`, readingPassages/listeningClips non-empty, `writingPromptMd` and `speakingMd` set) — confirm exactly 6 tabs render, in this exact order and with these exact labels: Wortschatz, Grammatikübungen, Lesen, Hören, Schreiben, Sprechen. Click the Schreiben tab, confirm the prompt Markdown renders.
2. A lesson with `writingPromptMd: undefined`, `speakingMd: undefined`, `readingPassages: []`, `listeningClips: []`, `hasNguphapQuestions: false`, but non-empty `vocabulary` — confirm only 1 tab renders (Wortschatz), and it's the initially-selected tab (no blank/broken state).

Delete `dbgtest.html`/`dbgtest.tsx` before committing.

- [ ] **Step 11: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: reorder lesson tabs to German labels, hide empty tabs, add read-only Schreiben prompt display"
```

---

### Task 5: Learner — writing submission form

**Files:**
- Create: `src/lib/hooks/useWritingSubmission.ts`
- Modify: `src/pages/LessonDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1's `writing_submissions` table (with its RLS resubmit-resets-grading invariant), Task 4's `bottomTab === "viet"` gate.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `useWritingSubmission.ts`**

```ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export interface WritingSubmission {
  id: string;
  content: string;
  score: number | null;
  comment: string | null;
  gradedAt: string | null;
  submittedAt: string;
}

export function useWritingSubmission(lessonId: string, userId: string | null) {
  const [submission, setSubmission] = useState<WritingSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmission = useCallback(() => {
    if (!userId) {
      setSubmission(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, content, score, comment, graded_at, submitted_at")
      .eq("lesson_id", lessonId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else if (data) {
          setSubmission({
            id: data.id as string,
            content: data.content as string,
            score: data.score as number | null,
            comment: data.comment as string | null,
            gradedAt: data.graded_at as string | null,
            submittedAt: data.submitted_at as string,
          });
        } else {
          setSubmission(null);
        }
        setLoading(false);
      });
  }, [lessonId, userId]);

  useEffect(() => { fetchSubmission(); }, [fetchSubmission]);

  const submit = async (content: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: "Chưa đăng nhập." };
    const { error: err } = await supabase.from("writing_submissions").upsert(
      {
        lesson_id: lessonId,
        user_id: userId,
        content,
        score: null,
        comment: null,
        graded_at: null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,user_id" },
    );
    if (err) return { error: err.message };
    fetchSubmission();
    return { error: null };
  };

  return { submission, loading, error, submit };
}
```

- [ ] **Step 2: Add `userId` prop to `LessonDetailPage`**

In `src/pages/LessonDetailPage.tsx`, find:

```tsx
interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string, category?: "nguphap" | "nghe" | "doc") => void;
}
```

Replace with:

```tsx
interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  userId: string;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string, category?: "nguphap" | "nghe" | "doc") => void;
}
```

Find:

```tsx
export const LessonDetailPage: React.FC<LessonDetailPageProps> = ({
  lesson,
  stats,
  onBack,
  onMarkComplete,
  onStartQuiz,
}) => {
```

Replace with:

```tsx
export const LessonDetailPage: React.FC<LessonDetailPageProps> = ({
  lesson,
  stats,
  userId,
  onBack,
  onMarkComplete,
  onStartQuiz,
}) => {
```

- [ ] **Step 3: Add `useEffect` and `Loader2` imports, and import the new hook**

Find:

```tsx
import React, { useState } from "react";
```

Replace with:

```tsx
import React, { useState, useEffect } from "react";
```

Find:

```tsx
  Mic,
  PenLine,
} from "lucide-react";
```

Replace with:

```tsx
  Mic,
  PenLine,
  Loader2,
} from "lucide-react";
```

Find:

```tsx
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";
```

Replace with:

```tsx
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";
import { useWritingSubmission } from "../lib/hooks/useWritingSubmission";
```

- [ ] **Step 4: Add the `WritingTabPanel` local component, right below the `LessonDetailPage` component's closing (i.e. as a new top-level component in this same file, after the main export)**

Find the very end of the file — the closing of the `LessonDetailPage` component. Locate this specific pattern (the file's last non-empty lines, closing out the component):

```tsx
    </div>
  );
};
```

This exact 3-line pattern also appears earlier in the file (e.g. closing other blocks) — to disambiguate, this is the FINAL occurrence in the file, i.e. append the new component AFTER it, at the very end of the file:

```tsx
    </div>
  );
};

const WritingTabPanel: React.FC<{ lessonId: string; userId: string; promptMd: string }> = ({ lessonId, userId, promptMd }) => {
  const { submission, loading, submit } = useWritingSubmission(lessonId, userId);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setContent(submission?.content ?? "");
  }, [submission?.id, submission?.content]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      showToast("Bài viết không được để trống.", "warning");
      return;
    }
    setSubmitting(true);
    const { error } = await submit(content.trim());
    setSubmitting(false);
    if (error) {
      showToast("Nộp bài thất bại: " + error, "warning");
    } else {
      showToast("Đã nộp bài viết.", "success");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MarkdownBlock content={promptMd} />

      {submission?.gradedAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
          <p className="text-xs font-display font-bold text-emerald-700">Đã chấm: {submission.score}/100</p>
          {submission.comment && (
            <p className="text-xs text-emerald-800 font-sans whitespace-pre-wrap">{submission.comment}</p>
          )}
        </div>
      )}
      {submission && !submission.gradedAt && (
        <p className="text-xs text-slate-400 font-sans">Đã nộp bài, đang chờ admin chấm điểm.</p>
      )}

      <textarea
        id="writing-submission-textarea"
        rows={10}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Viết bài của bạn ở đây..."
        className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150 resize-y"
      />
      <div className="flex justify-center">
        <Button id="btn-writing-submit" variant="primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
          {submission ? "Nộp lại" : "Nộp bài"}
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Replace the Task 4 read-only Viết panel with the full submission form**

Find:

```tsx
          {/* Viết (Schreiben) tab — read-only prompt display for now; a
              later task replaces this panel body with the full submission
              form, reusing this same bottomTab === "viet" gate. Hidden
              entirely via visibleTabs when writingPromptMd is empty. */}
          {bottomTab === "viet" && lesson.writingPromptMd && (
            <div className="space-y-4">
              <MarkdownBlock content={lesson.writingPromptMd} />
            </div>
          )}
```

Replace with:

```tsx
          {/* Viết (Schreiben) tab — hidden entirely via visibleTabs when
              writingPromptMd is empty. */}
          {bottomTab === "viet" && lesson.writingPromptMd && (
            <WritingTabPanel lessonId={lesson.id} userId={userId} promptMd={lesson.writingPromptMd} />
          )}
```

- [ ] **Step 6: Pass `userId` from `App.tsx`**

In `src/App.tsx`, find:

```tsx
{currentPage === "lesson-detail" && user && activeLessonObject && (
  <LessonDetailPage
    lesson={activeLessonObject}
    stats={stats}
    onBack={() => handleNavigate("roadmap")}
    onMarkComplete={handleMarkComplete}
    onStartQuiz={(lessonId, category = "nguphap") => {
      setSelectedLessonId(lessonId);
      setActiveExerciseCategory(category);
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
    userId={user.id}
    onBack={() => handleNavigate("roadmap")}
    onMarkComplete={handleMarkComplete}
    onStartQuiz={(lessonId, category = "nguphap") => {
      setSelectedLessonId(lessonId);
      setActiveExerciseCategory(category);
      setCurrentPage("quiz");
    }}
  />
)}
```

- [ ] **Step 7: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors.

- [ ] **Step 8: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time. Do not repeat it — your report must contain literal pasted tool output.

Build a throwaway `dbgtest.html`/`dbgtest.tsx` harness rendering `LessonDetailPage` with a mock `lesson` (with `writingPromptMd` set), mock `stats`, a fake `userId`, and a **module-mocked** `../lib/hooks/useWritingSubmission` (or mock the underlying `../lib/supabase` calls it makes) so no real Supabase session is required. Verify via `read_page`/`get_page_text`/`computer`, at least 2 scenarios:
1. No existing submission — the Schreiben tab shows the prompt, an empty textarea, and a "Nộp bài" button. Type text, click submit — confirm the mocked submit call fires with the typed content.
2. An existing GRADED submission (mock `submission: { content: "...", score: 85, comment: "Gut!", gradedAt: "...", ... }`) — confirm the score/comment box renders, the textarea is pre-filled with the existing content, and the button reads "Nộp lại" instead of "Nộp bài".

Delete `dbgtest.html`/`dbgtest.tsx` and any mock shim before committing.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hooks/useWritingSubmission.ts src/pages/LessonDetailPage.tsx src/App.tsx
git commit -m "feat: add learner writing submission form with resubmit support"
```

---

### Task 6: Admin — grading page

**Files:**
- Create: `src/pages/admin/AdminWritingSection.tsx`
- Modify: `src/pages/admin/AdminPage.tsx`

**Interfaces:**
- Consumes: Task 1's `writing_submissions` table (nested-joined against `lessons(title_vi)` and `profiles(email, full_name)`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `AdminWritingSection.tsx`**

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface WritingSubmissionRow {
  id: string;
  lesson_id: string;
  user_id: string;
  content: string;
  score: number | null;
  comment: string | null;
  graded_at: string | null;
  submitted_at: string;
  lessons: { title_vi: string } | null;
  profiles: { email: string; full_name: string | null } | null;
}

export const AdminWritingSection: React.FC = () => {
  const [rows, setRows] = useState<WritingSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<WritingSubmissionRow | null>(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = () => {
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, lesson_id, user_id, content, score, comment, graded_at, submitted_at, lessons(title_vi), profiles(email, full_name)")
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as unknown as WritingSubmissionRow[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchRows(); }, []);

  const openGrade = (row: WritingSubmissionRow) => {
    setGrading(row);
    setScore(row.score !== null ? String(row.score) : "");
    setComment(row.comment ?? "");
  };

  const handleSaveGrade = async () => {
    if (!grading) return;
    const parsedScore = parseInt(score, 10);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      showToast("Điểm phải là số từ 0 đến 100.", "warning");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("writing_submissions")
      .update({ score: parsedScore, comment: comment || null, graded_at: new Date().toISOString() })
      .eq("id", grading.id);
    setSaving(false);
    if (error) {
      showToast("Lưu điểm thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu điểm.", "success");
      setGrading(null);
      fetchRows();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-display font-extrabold text-slate-900">Chấm bài viết</h1>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-display font-bold text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2.5">Học viên</th>
              <th className="px-4 py-2.5">Bài học</th>
              <th className="px-4 py-2.5">Nộp lúc</th>
              <th className="px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-700">{row.profiles?.full_name || row.profiles?.email || row.user_id}</td>
                <td className="px-4 py-2.5 text-slate-700">{row.lessons?.title_vi ?? row.lesson_id}</td>
                <td className="px-4 py-2.5 text-slate-500">{new Date(row.submitted_at).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2.5">
                  {row.graded_at ? (
                    <span className="text-xs font-bold text-emerald-600">Đã chấm ({row.score}/100)</span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600">Chưa chấm</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => openGrade(row)} className="text-xs font-bold text-orange-600 hover:text-orange-700">
                    {row.graded_at ? "Sửa điểm" : "Chấm điểm"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">Chưa có bài viết nào được nộp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grading && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-extrabold text-slate-900">Chấm bài viết</h2>
              <button onClick={() => setGrading(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans">
              {grading.content}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Điểm (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhận xét</label>
              <textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                placeholder="Nhận xét cho học viên (không bắt buộc)..."
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setGrading(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveGrade} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Lưu điểm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Register the section in `AdminPage.tsx`**

Find:

```tsx
import { AdminDashboardSection } from "./AdminDashboardSection";
import { AdminUsersSection } from "./AdminUsersSection";
import { AdminContentSection } from "./AdminContentSection";
import { AdminQuizSection } from "./AdminQuizSection";

type AdminSection = "dashboard" | "users" | "content" | "quiz";
```

Replace with:

```tsx
import { AdminDashboardSection } from "./AdminDashboardSection";
import { AdminUsersSection } from "./AdminUsersSection";
import { AdminContentSection } from "./AdminContentSection";
import { AdminQuizSection } from "./AdminQuizSection";
import { AdminWritingSection } from "./AdminWritingSection";

type AdminSection = "dashboard" | "users" | "content" | "quiz" | "writing";
```

Find:

```tsx
import {
  LayoutDashboard,
  Users,
  BookOpen,
  HelpCircle,
  LogOut,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
```

Replace with:

```tsx
import {
  LayoutDashboard,
  Users,
  BookOpen,
  HelpCircle,
  LogOut,
  ChevronRight,
  AlertTriangle,
  PenLine,
} from "lucide-react";
```

Find:

```tsx
const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { id: "users", label: "Người dùng", Icon: Users },
  { id: "content", label: "Nội dung", Icon: BookOpen },
  { id: "quiz", label: "Bài tập", Icon: HelpCircle },
];
```

Replace with:

```tsx
const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { id: "users", label: "Người dùng", Icon: Users },
  { id: "content", label: "Nội dung", Icon: BookOpen },
  { id: "quiz", label: "Bài tập", Icon: HelpCircle },
  { id: "writing", label: "Chấm bài viết", Icon: PenLine },
];
```

Find:

```tsx
      <main className="flex-1 min-w-0">
        {section === "dashboard" && <AdminDashboardSection />}
        {section === "users" && <AdminUsersSection />}
        {section === "content" && <AdminContentSection />}
        {section === "quiz" && <AdminQuizSection />}
      </main>
```

Replace with:

```tsx
      <main className="flex-1 min-w-0">
        {section === "dashboard" && <AdminDashboardSection />}
        {section === "users" && <AdminUsersSection />}
        {section === "content" && <AdminContentSection />}
        {section === "quiz" && <AdminQuizSection />}
        {section === "writing" && <AdminWritingSection />}
      </main>
```

- [ ] **Step 3: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time. Do not repeat it — your report must contain literal pasted tool output.

Build a throwaway `dbgtest.html`/`dbgtest.tsx` harness rendering `AdminWritingSection` directly, with a **module-mocked** `../../lib/supabase` (`.from("writing_submissions").select(...)` resolves to 2-3 mock rows, one already graded, one not; `.update(...)` resolves `{ error: null }`). Verify via `read_page`/`get_page_text`/`computer`:
1. The table lists both mock rows with correct "Đã chấm"/"Chưa chấm" status.
2. Clicking "Chấm điểm" on the ungraded row opens the modal showing its full `content`, an empty score input, and an empty comment textarea.
3. Typing a score + comment and clicking "Lưu điểm" fires the mocked update call with the exact score/comment/graded_at values.

Delete `dbgtest.html`/`dbgtest.tsx` and any mock shim before committing.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminWritingSection.tsx src/pages/admin/AdminPage.tsx
git commit -m "feat: add admin writing submission grading page"
```

---

### Task 7: In-app notification bell — learner and admin

**Files:**
- Create: `src/lib/hooks/useNotifications.ts`
- Create: `src/components/NotificationBell.tsx`
- Modify: `src/components/Navigation.tsx`
- Modify: `src/pages/admin/AdminApp.tsx`

**Interfaces:**
- Consumes: Task 1's `notifications` table (RLS already scopes rows correctly per calling role — no client-side role filter needed).
- Produces: nothing consumed by later tasks. Final task of the plan.

- [ ] **Step 1: Write `useNotifications.ts`**

```ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export interface AppNotification {
  id: string;
  type: string;
  lessonId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    supabase
      .from("notifications")
      .select("id, type, lesson_id, message, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setNotifications(
          (data ?? []).map((n) => ({
            id: n.id as string,
            type: n.type as string,
            lessonId: n.lesson_id as string | null,
            message: n.message as string,
            readAt: n.read_at as string | null,
            createdAt: n.created_at as string,
          })),
        );
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, markRead };
}
```

- [ ] **Step 2: Write `NotificationBell.tsx`**

```tsx
import React, { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../lib/hooks/useNotifications";

export const NotificationBell: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        id="btn-notification-bell"
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2 rounded-xl transition ${dark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-lg z-50 py-2">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Chưa có thông báo nào.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-2.5 text-xs font-sans hover:bg-slate-50 transition ${n.readAt ? "text-slate-400" : "text-slate-800 font-semibold bg-orange-50/40"}`}
                >
                  {n.message}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Insert the bell into the learner `Navbar`**

In `src/components/Navigation.tsx`, find:

```tsx
import { ... } from "lucide-react";
```

(Locate the actual lucide-react import line at the top of this file and add the following import right after it — do not guess its exact current content, read the file first.)

Add, right after the lucide-react import line:

```tsx
import { NotificationBell } from "./NotificationBell";
```

Then find:

```tsx
            {/* XP Indicator */}
            <div 
              id="nav-xp"
              className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-200/50 rounded-full"
              title="Điểm kinh nghiệm"
            >
              <Award className="w-3.5 h-3.5" />
              <span className="text-xs font-display font-bold">{xp} XP</span>
            </div>

            <div className="h-4 w-[1px] bg-slate-200" />
```

Replace with:

```tsx
            {/* XP Indicator */}
            <div 
              id="nav-xp"
              className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-200/50 rounded-full"
              title="Điểm kinh nghiệm"
            >
              <Award className="w-3.5 h-3.5" />
              <span className="text-xs font-display font-bold">{xp} XP</span>
            </div>

            <NotificationBell />

            <div className="h-4 w-[1px] bg-slate-200" />
```

- [ ] **Step 4: Insert the bell into the admin topbar**

In `src/pages/admin/AdminApp.tsx`, find:

```tsx
import { AdminPage } from "./AdminPage";
```

Replace with:

```tsx
import { AdminPage } from "./AdminPage";
import { NotificationBell } from "../../components/NotificationBell";
```

Find:

```tsx
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
              <span>{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Đăng xuất
            </button>
          </div>
```

Replace with:

```tsx
          <div className="flex items-center gap-3">
            <NotificationBell dark />
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
              <span>{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Đăng xuất
            </button>
          </div>
```

- [ ] **Step 5: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors — this is the final task of the plan, so lint should be fully clean project-wide.

- [ ] **Step 6: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time. Do not repeat it — your report must contain literal pasted tool output.

Build a throwaway `dbgtest.html`/`dbgtest.tsx` harness rendering `NotificationBell` directly (both `dark={false}` and `dark={true}` variants side by side), with a **module-mocked** `../lib/hooks/useNotifications` returning a fixed list (2 unread, 1 read). Verify via `read_page`/`get_page_text`/`computer`:
1. The badge shows "2" (unread count).
2. Clicking the bell opens the dropdown showing all 3 messages, with the 2 unread ones visually distinct (bold/highlighted) from the 1 read one.
3. Clicking an unread notification calls the mocked `markRead` with the correct id, and the badge count decrements to 1.

Delete `dbgtest.html`/`dbgtest.tsx` and any mock shim before committing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hooks/useNotifications.ts src/components/NotificationBell.tsx src/components/Navigation.tsx src/pages/admin/AdminApp.tsx
git commit -m "feat: add in-app notification bell for learner and admin"
```

---

## Final Notes

After all 7 tasks pass individual review, run a final whole-feature review (mirroring the pattern used for every prior plan in this session) covering the full stack: DB triggers → learner submission → admin grading → notification delivery. Specifically re-verify, end to end against the live Supabase project:
- A real writing submission created via Task 5's UI (or directly via `execute_sql`) triggers exactly one `writing_submitted` broadcast notification, visible to the admin side via Task 7's bell.
- Grading that submission via Task 6's UI triggers exactly one `writing_graded` notification, visible to the correct student via Task 7's bell.
- Resubmitting after grading correctly resets `score`/`comment`/`graded_at` to `NULL` (re-verify the RLS `WITH CHECK` invariant from Task 1 still holds after all later tasks landed).
- All 6 lesson tabs render in the correct German-labeled order and hide correctly when content is absent, across a few different real lessons in the live DB (not just mocked harnesses).
- Writing scores do NOT affect `completion.ts`'s pass/fail calculation or the 80% threshold for any lesson.
