# Gộp tab Ngữ pháp + Trang học viên/chấm điểm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Gộp Admin "Bài tập ngữ pháp" vào tab "Ngữ pháp" của "Quản lý bài tập", xóa dữ liệu `nguphap` cũ và seed dữ liệu mẫu mới. (B) Xây trang học viên làm 6 dạng bài tập ngữ pháp mới + Edge Function chấm điểm (ngưỡng pass 80%, category `nguphap` giữ nguyên).

**Architecture:** Admin: gộp UI bằng cách render `<AdminGrammarExerciseSection />` có sẵn bên trong tab "Ngữ pháp" của `AdminQuizSection.tsx` (không sửa nội bộ component đó), xóa nav riêng. Học viên: view public mới `grammar_exercises_public` (ẩn đáp án đúng) + hook `useGrammarExercises` + trang mới `GrammarExercisePage.tsx` (tách khỏi `QuizPage.tsx`) + Edge Function `grammar-submit` (mirror `quiz-submit`, chấm theo từng loại, upsert `lesson_progress` category `nguphap`).

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + PostgREST + RLS + Edge Functions/Deno), Tailwind CSS v4, lucide-react.

## Global Constraints

- Không thêm npm package mới.
- `npm run lint` (`tsc --noEmit`) phải pass sau mỗi task, không có lỗi mới so với baseline hiện tại (chạy `npm run lint` trước khi bắt đầu Task 1 để biết baseline chính xác tại thời điểm này — số lượng lỗi có thể đã đổi so với các phiên trước).
- Migration áp dụng qua Supabase MCP (`apply_migration`, project_id `awdhqlgxnjwymwgxltlw`) — sandbox không có Docker/CLI. **Viết SQL idempotent** (`DROP VIEW IF EXISTS ... CREATE VIEW`, `DELETE FROM` không cần biết số dòng hiện có) vì có thể đã có state cũ từ phiên làm việc trước — luôn `SELECT count(*)` trước khi `DELETE` để log lại, không giả định số liệu cố định.
- Trước khi bắt đầu Task 1: kiểm tra `.superpowers/sdd/progress.md` — đây là ledger của kế hoạch **trước** (5 task Admin CRUD, đã DONE). Thêm 1 dòng phân cách rõ ràng đánh dấu bắt đầu kế hoạch mới (không xóa lịch sử cũ, chỉ append) để tránh nhầm giữa 2 kế hoạch khi resume.
- Deploy Edge Function qua Supabase MCP (`deploy_edge_function`) — không có CLI local.
- Nội dung hiển thị học viên/admin: tiếng Việt. Tên biến/hàm/type: tiếng Anh.
- Không dùng `window.alert`/`window.confirm`.
- Không sửa `src/lib/database.types.ts` bằng tay — chỉ qua `generate_typescript_types` (MCP).
- Không có test framework — verify bằng `npm run lint` + review code kỹ (không có browser E2E khả dụng trong sandbox, đã xác nhận ở nhánh trước). Bạn (người dùng) cần tự QA thủ công trước khi merge.
- Tham chiếu spec đầy đủ: `docs/superpowers/specs/2026-07-20-merge-grammar-exercises-into-quiz-tab-design.md`, `docs/superpowers/specs/2026-07-20-grammar-exercises-learner-scoring-design.md`.

---

### Task 1: Xóa dữ liệu `nguphap` cũ + seed dữ liệu mẫu `grammar_exercises`

**Files:**
- Create: `supabase/migrations/20260720000022_cleanup_nguphap_quiz_data.sql`
- Create: `supabase/migrations/20260720000023_seed_grammar_exercises_samples.sql`

**Interfaces:**
- Produces: `grammar_exercises` có 6 dòng mẫu (1 dòng/loại) gắn `lesson_id = 'a1-l1'`, `status = 'published'` — Task 2 (verify) và Task 6 (learner page) sẽ dùng các dòng này để test.

- [ ] **Step 1: Kiểm tra số liệu hiện tại (không giả định, log lại để đối chiếu)**

Dùng Supabase MCP `execute_sql` trên project `awdhqlgxnjwymwgxltlw`:
```sql
SELECT
  (SELECT count(*) FROM quiz_questions WHERE category = 'nguphap') AS quiz_nguphap,
  (SELECT count(*) FROM lesson_progress WHERE category = 'nguphap') AS progress_nguphap,
  (SELECT count(*) FROM grammar_exercises) AS grammar_exercises_total;
```
Ghi lại kết quả vào report (số liệu có thể khác lần trước nếu đã có thay đổi).

- [ ] **Step 2: Viết migration xóa dữ liệu cũ**

Tạo `supabase/migrations/20260720000022_cleanup_nguphap_quiz_data.sql`:

```sql
-- =============================================================================
-- DeutschPath — dọn dữ liệu category 'nguphap' cũ trong quiz_questions/
-- lesson_progress. Category 'nguphap' được thay thế hoàn toàn bởi
-- grammar_exercises (6 dạng bài mới). Môi trường dev — không cần bảo toàn
-- điểm/tiến độ học viên cũ.
--
-- Lưu ý: lesson_progress.category='nguphap' cũng được 2 Edge Function
-- lesson-complete và leaderboard dùng làm dấu hiệu chung "đã hoàn thành bài
-- học" (không riêng gì điểm ngữ pháp) — xóa các dòng này reset trạng thái
-- đó cho các lesson tương ứng. Đây là hành vi được xác nhận chấp nhận.
-- =============================================================================

DELETE FROM quiz_questions WHERE category = 'nguphap';
DELETE FROM lesson_progress WHERE category = 'nguphap';
```

- [ ] **Step 3: Áp dụng migration qua Supabase MCP**

Gọi `apply_migration` với `project_id: "awdhqlgxnjwymwgxltlw"`, `name: "cleanup_nguphap_quiz_data"`, `query` = nội dung SQL ở Step 2 (đọc từ file, không gõ lại từ trí nhớ).

Expected: `{"success":true}`.

- [ ] **Step 4: Viết migration seed dữ liệu mẫu mới**

Tạo `supabase/migrations/20260720000023_seed_grammar_exercises_samples.sql`:

```sql
-- =============================================================================
-- DeutschPath — seed 6 dòng grammar_exercises mẫu (1 dòng/loại) cho lesson
-- a1-l1, dùng làm dữ liệu demo cho Admin + trang học viên mới.
-- =============================================================================

INSERT INTO grammar_exercises (lesson_id, type, status, prompt_text, transformation_hint, correct_answer, tokens, classification_groups, classification_items, explanation, order_index) VALUES
('a1-l1', 'word_reorder', 'published', NULL, NULL, 'Ich höre am Abend Musik.',
  '["am Abend", "ich", "Musik", "höre"]'::jsonb, NULL, NULL,
  'Động từ chia ở vị trí thứ 2, trạng ngữ thời gian "am Abend" có thể đứng đầu hoặc sau động từ.', 1),
('a1-l1', 'error_correction', 'published', 'Ich stehe auf um 7 Uhr.', NULL, 'Ich stehe um 7 Uhr auf.',
  NULL, NULL, NULL,
  'Động từ tách "aufstehen" — phần "auf" phải đứng cuối câu, không đứng ngay sau "stehe".', 1),
('a1-l1', 'translation', 'published', 'Tôi học tiếng Đức.', NULL, 'Ich lerne Deutsch.',
  NULL, NULL, NULL,
  'Chủ ngữ "ich" + động từ chia ngôi 1 số ít "lerne" + tân ngữ.', 1),
('a1-l1', 'sentence_transformation', 'published', 'Du kommst heute.', 'Ja/Nein-Frage', 'Kommst du heute?',
  NULL, NULL, NULL,
  'Câu hỏi Ja/Nein đảo động từ lên đầu câu.', 1),
('a1-l1', 'guided_sentence_writing', 'published', 'Ich bin müde. Ich arbeite. + aber', NULL, 'Ich bin müde, aber ich arbeite.',
  NULL, NULL, NULL,
  'Liên từ "aber" nối 2 mệnh đề độc lập, có dấu phẩy trước "aber".', 1),
('a1-l1', 'classification', 'published', NULL, NULL, NULL,
  NULL, '["der", "die", "das"]'::jsonb,
  '[{"item":"Tisch","group":"der"},{"item":"Lampe","group":"die"},{"item":"Buch","group":"das"}]'::jsonb,
  'Giống đực (der), giống cái (die), giống trung (das) trong tiếng Đức phải học thuộc theo từng danh từ.', 1);
```

- [ ] **Step 5: Áp dụng migration seed qua Supabase MCP**

Gọi `apply_migration` với `name: "seed_grammar_exercises_samples"`, `query` = nội dung SQL ở Step 4.

Expected: `{"success":true}`.

- [ ] **Step 6: Verify kết quả cuối**

```sql
SELECT count(*) FROM quiz_questions WHERE category = 'nguphap'; -- expect 0
SELECT count(*) FROM lesson_progress WHERE category = 'nguphap'; -- expect 0
SELECT type, status, lesson_id FROM grammar_exercises WHERE lesson_id = 'a1-l1' ORDER BY type; -- expect 6 dòng
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260720000022_cleanup_nguphap_quiz_data.sql supabase/migrations/20260720000023_seed_grammar_exercises_samples.sql
git commit -m "feat: remove old nguphap quiz data and seed grammar_exercises samples"
```

---

### Task 2: Gộp `AdminGrammarExerciseSection` vào tab "Ngữ pháp", bỏ nav riêng

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`
- Modify: `src/pages/admin/AdminPage.tsx`

**Interfaces:**
- Consumes: `AdminGrammarExerciseSection` (export sẵn có, không đổi).

- [ ] **Step 1: Import `AdminGrammarExerciseSection` vào `AdminQuizSection.tsx`**

Modify — thêm sau import cuối cùng:

```diff
 import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";
+import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
```

- [ ] **Step 2: Ẩn khối tiêu đề + search khi tab Ngữ pháp active**

Modify — bọc khối title+search (component đã có, tìm đúng đoạn này qua nội dung, không phải số dòng — nội dung là nguồn sự thật):

```diff
   return (
     <div className="space-y-5">
+      {activeTab !== "nguphap" && (
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
+      )}
```

- [ ] **Step 3: Thay danh sách bài học (quiz_questions) bằng `AdminGrammarExerciseSection` khi tab Ngữ pháp active**

Modify — ngay sau khối tab bar (`<div className="flex gap-2 border-b border-slate-200/60">...</div>`), tìm dòng mở `<div className="space-y-3">` (bắt đầu danh sách `filteredGroups.map`) và dòng đóng tương ứng (`</div>` ngay trước `{/* Edit / Create modal */}`):

```diff
+      {activeTab === "nguphap" ? (
+        <AdminGrammarExerciseSection />
+      ) : (
       <div className="space-y-3">
         {filteredGroups.map((group) => {
           const filteredQuestions = group.questions.filter((q) => q.category === activeTab);
           return (
           <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
```

... (giữ nguyên toàn bộ nội dung bên trong, không đổi gì) ...

```diff
         {filteredGroups.length === 0 && (
           <div className="text-center py-10 text-slate-400 text-sm">
             Không tìm thấy bài học nào khớp với "{search}".
           </div>
         )}
       </div>
+      )}

       {/* Edit / Create modal */}
```

**Quan trọng:** đây là 1 cặp mở/đóng bao quanh TOÀN BỘ khối `filteredGroups.map(...)` hiện có (không sửa bất kỳ dòng nào bên trong khối đó) — chỉ thêm điều kiện `activeTab === "nguphap" ? <AdminGrammarExerciseSection /> : ( ...toàn bộ code cũ... )`. Đọc file hiện tại để xác định chính xác điểm mở/đóng bằng nội dung (không dùng số dòng cố định vì Task 1 không đổi file này nhưng để chắc chắn).

- [ ] **Step 4: Bỏ nav "Bài tập ngữ pháp" khỏi `AdminPage.tsx`**

Modify `src/pages/admin/AdminPage.tsx`:

```diff
 import {
   LayoutDashboard,
   Users,
   BookOpen,
   HelpCircle,
   LogOut,
   ChevronRight,
   AlertTriangle,
   PenLine,
-  ListChecks,
 } from "lucide-react";
 import { supabase } from "../../lib/supabase";
 import { Button } from "../../components/DesignSystem";
 import { AdminDashboardSection } from "./AdminDashboardSection";
 import { AdminUsersSection } from "./AdminUsersSection";
 import { AdminContentSection } from "./AdminContentSection";
 import { AdminQuizSection } from "./AdminQuizSection";
 import { AdminWritingSection } from "./AdminWritingSection";
-import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";

-type AdminSection = "dashboard" | "users" | "content" | "quiz" | "writing" | "grammar-exercises";
+type AdminSection = "dashboard" | "users" | "content" | "quiz" | "writing";
```

```diff
   { id: "writing", label: "Chấm bài viết", Icon: PenLine },
-  { id: "grammar-exercises", label: "Bài tập ngữ pháp", Icon: ListChecks },
 ];
```

```diff
         {section === "writing" && <AdminWritingSection />}
-        {section === "grammar-exercises" && <AdminGrammarExerciseSection />}
       </main>
```

- [ ] **Step 5: Typecheck**

Run: `npm run lint`

Expected: không có lỗi mới so với baseline đã ghi ở đầu phiên làm việc.

- [ ] **Step 6: Review code kỹ thay cho browser test**

Đọc lại toàn bộ `AdminQuizSection.tsx` sau khi sửa — xác nhận:
- Tab "Nghe"/"Đọc" không bị đổi bất kỳ dòng nào (so sánh với bản trước khi sửa).
- Khi `activeTab === "nguphap"`, JSX chỉ render `<AdminGrammarExerciseSection />`, không còn render `filteredQuestions`/nút "+ Thêm câu hỏi" của quiz_questions.
- `AdminPage.tsx` không còn import/dùng `AdminGrammarExerciseSection`/`ListChecks` ở đâu khác trong file (grep để chắc chắn trước khi coi là xong).

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx src/pages/admin/AdminPage.tsx
git commit -m "feat: merge grammar exercises admin into quiz management's Ngữ pháp tab"
```

---

### Task 3: Migration view `grammar_exercises_public` + regenerate types

**Files:**
- Create: `supabase/migrations/20260720000024_grammar_exercises_public_view.sql`
- Modify: `src/lib/database.types.ts` (auto-generated)

**Interfaces:**
- Produces: view `grammar_exercises_public` với cột `id, lesson_id, type, prompt_text, transformation_hint, tokens, classification_groups, classification_items, explanation, order_index` — `classification_items` ở đây là `string[]` (chỉ tên item, KHÔNG có group đúng), khác shape bảng gốc. Task 4 (hook) dùng đúng các cột này.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/20260720000024_grammar_exercises_public_view.sql`:

```sql
-- =============================================================================
-- DeutschPath — grammar_exercises_public: view cho phía học viên, ẩn
-- correct_answer và group đúng trong classification_items (chỉ lộ tên item).
-- Mirror quiz_questions_public.
-- =============================================================================

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.type,
    g.prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.explanation,
    g.order_index
  FROM grammar_exercises g
  JOIN lessons l ON l.id = g.lesson_id
  WHERE g.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
```

- [ ] **Step 2: Áp dụng migration qua Supabase MCP**

`apply_migration` với `project_id: "awdhqlgxnjwymwgxltlw"`, `name: "grammar_exercises_public_view"`, `query` = SQL ở Step 1.

Expected: `{"success":true}`.

- [ ] **Step 3: Verify view trả đúng dữ liệu, không lộ đáp án**

```sql
SELECT * FROM grammar_exercises_public WHERE lesson_id = 'a1-l1' ORDER BY type;
```

Expected: 6 dòng (từ Task 1), KHÔNG có cột `correct_answer` nào trong kết quả, dòng `classification` có `classification_items` = `["Tisch","Lampe","Buch"]` (mảng string, không có group).

- [ ] **Step 4: Regenerate TypeScript types**

Gọi MCP `generate_typescript_types` với `project_id: "awdhqlgxnjwymwgxltlw"`. Ghi output vào `src/lib/database.types.ts` bằng Write tool (đây là output máy sinh ra, không phải sửa tay).

- [ ] **Step 5: Kiểm tra type + lint**

Run: `grep -n "grammar_exercises_public" src/lib/database.types.ts` — expect có kết quả.
Run: `npm run lint` — expect không có lỗi mới so với baseline.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260720000024_grammar_exercises_public_view.sql src/lib/database.types.ts
git commit -m "feat: add grammar_exercises_public view for learner-facing access"
```

---

### Task 4: `appTypes.ts` + hook `useGrammarExercises`

**Files:**
- Modify: `src/lib/appTypes.ts`
- Create: `src/lib/hooks/useGrammarExercises.ts`

**Interfaces:**
- Produces: `GrammarExercise` interface (appTypes.ts), `useGrammarExercises(lessonId: string): { exercises: GrammarExercise[]; loading: boolean; error: string | null }` — Task 6 (GrammarExercisePage) dùng cả 2.

- [ ] **Step 1: Thêm `GrammarExercise` interface vào `appTypes.ts`**

Modify `src/lib/appTypes.ts` — thêm ngay sau interface `QuizQuestion` (dòng có `export interface QuizQuestion { ... }`):

```diff
 export interface QuizQuestion {
   id: string;
   type: "multiple-choice" | "fill-blank" | "matching" | "listening";
   category?: "nguphap" | "nghe" | "doc";
   questionText: string;
   answerText?: string;
   audioText?: string;
   audioClipId?: string;
   readingPassageId?: string;
   options?: string[];
   matchingPairs?: { de: string; vi: string }[];
   explanation: string;
   correctAnswer?: string;
 }
+
+export interface GrammarExercise {
+  id: string;
+  lessonId: string;
+  type:
+    | "word_reorder"
+    | "error_correction"
+    | "translation"
+    | "sentence_transformation"
+    | "guided_sentence_writing"
+    | "classification";
+  promptText?: string;
+  transformationHint?: string;
+  tokens?: string[];
+  classificationGroups?: string[];
+  classificationItems?: string[];
+  explanation: string;
+}
```

- [ ] **Step 2: Tạo hook `useGrammarExercises.ts`**

Tạo `src/lib/hooks/useGrammarExercises.ts`:

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { GrammarExercise } from "../appTypes";

export function useGrammarExercises(lessonId: string) {
  const [exercises, setExercises] = useState<GrammarExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    supabase
      .from("grammar_exercises_public")
      .select("id, lesson_id, type, prompt_text, transformation_hint, tokens, classification_groups, classification_items, explanation, order_index")
      .eq("lesson_id", lessonId)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setExercises(
            (data ?? []).map((e) => ({
              id: e.id as string,
              lessonId: e.lesson_id as string,
              type: e.type as GrammarExercise["type"],
              promptText: (e.prompt_text as string | null) ?? undefined,
              transformationHint: (e.transformation_hint as string | null) ?? undefined,
              tokens: (e.tokens as string[] | null) ?? undefined,
              classificationGroups: (e.classification_groups as string[] | null) ?? undefined,
              classificationItems: (e.classification_items as string[] | null) ?? undefined,
              explanation: (e.explanation as string | null) ?? "",
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId]);

  return { exercises, loading, error };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run lint` — expect không có lỗi mới so với baseline (yêu cầu `grammar_exercises_public` đã có trong `database.types.ts` từ Task 3, nếu Task 3 chưa merge/commit thì đảm bảo đang làm việc trên state đã có Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useGrammarExercises.ts
git commit -m "feat: add GrammarExercise type and useGrammarExercises hook"
```

---

### Task 5: Edge Function `grammar-submit` (chấm điểm)

**Files:**
- Create: `supabase/functions/grammar-submit/scoring.ts`
- Create: `supabase/functions/grammar-submit/index.ts`

**Interfaces:**
- Produces: Edge Function `grammar-submit` nhận `{ lesson_id: string; answers: Record<string,string> }`, trả `{ score: number; total: number; passed: boolean; xp_earned: number }` — Task 6 (GrammarExercisePage) gọi function này qua `supabase.functions.invoke("grammar-submit", ...)`.

- [ ] **Step 1: Viết `scoring.ts`**

Tạo `supabase/functions/grammar-submit/scoring.ts`:

```ts
export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  classification_items: { item: string; group: string }[] | null;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
}

function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, "").trim();
}

export function computeGrammarScore(
  exercises: ScorableGrammarExercise[],
  answers: Record<string, string>,
): ScoreResult {
  let correct = 0;
  let total = 0;

  for (const ex of exercises) {
    if (ex.type === "classification") {
      const items = ex.classification_items ?? [];
      total += items.length;
      const userPairs = (answers[ex.id] ?? "")
        .split("|")
        .map((pair) => pair.split(":").map((s) => s.trim()));
      const userMap = new Map(userPairs.map(([item, group]) => [item, group ?? ""]));
      for (const it of items) {
        if (normalizeWord(userMap.get(it.item) ?? "") === normalizeWord(it.group)) correct++;
      }
      continue;
    }

    total += 1;
    const userAnswer = normalizeWord(answers[ex.id] ?? "");
    const correctAnswer = normalizeWord(ex.correct_answer ?? "");
    if (userAnswer === correctAnswer) correct++;
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score };
}
```

- [ ] **Step 2: Viết `index.ts`**

Đọc file `supabase/functions/quiz-submit/index.ts` trước để dùng làm mẫu cấu trúc chính xác (CORS headers, xác thực JWT, error handling). Tạo `supabase/functions/grammar-submit/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeGrammarScore } from "./scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const XP_REWARD = 30;
const PASS_THRESHOLD = 80; // percent

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const lesson_id: string = body.lesson_id;
    const answers: Record<string, string> = body.answers;

    if (!lesson_id || !answers) {
      return new Response(JSON.stringify({ error: "lesson_id and answers required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: exercises, error: exErr } = await supabase
      .from("grammar_exercises")
      .select("id, type, correct_answer, classification_items")
      .eq("lesson_id", lesson_id)
      .eq("status", "published");

    if (exErr || !exercises) {
      return new Response(JSON.stringify({ error: "Failed to load exercises" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { correct, total, score } = computeGrammarScore(exercises, answers);
    const passed = score >= PASS_THRESHOLD;

    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson_id)
      .eq("category", "nguphap")
      .maybeSingle();

    let xp_earned = 0;

    if (passed && !existing) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: XP_REWARD });
      xp_earned = XP_REWARD;
    }

    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id, category: "nguphap", quiz_score: score },
      { onConflict: "user_id,lesson_id,category" },
    );

    return new Response(
      JSON.stringify({ score, total, passed, xp_earned }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 3: Deploy qua Supabase MCP**

Gọi MCP `deploy_edge_function` với `project_id: "awdhqlgxnjwymwgxltlw"`, `name: "grammar-submit"`, nội dung 2 file trên (kiểm tra schema tool chính xác trước khi gọi — có thể cần format `files: [{name, content}]` hoặc tương đương, xem mô tả tool).

Expected: deploy thành công, không lỗi.

- [ ] **Step 4: Verify thủ công qua `execute_sql`/gọi thử (nếu tool cho phép invoke trực tiếp) hoặc review code kỹ**

Vì không có browser để test thật, trace tay `computeGrammarScore` với 6 dòng seed đã tạo ở Task 1 + các bộ answers mẫu:
- word_reorder (`am Abend / ich / Musik / höre` → đúng): answers = `"Ich höre am Abend Musik."` → chuẩn hóa khớp `correct_answer` đã chuẩn hóa → correct.
- classification: answers = `"Tisch:der|Lampe:die|Buch:das"` → cả 3 item đúng nhóm → correct 3/3.
- Thử 1 case sai (vd dịch sai) để xác nhận không tính correct.

Ghi rõ kết quả trace trong report.

- [ ] **Step 5: Typecheck các file khác không bị ảnh hưởng**

Run: `npm run lint` (Edge Functions nằm ngoài phạm vi `tsc --noEmit` của frontend — `tsconfig.json` exclude `supabase/functions`, xác nhận lại bằng cách kiểm tra `tsconfig.json` nếu cần — không bắt buộc phải pass tsc cho code Deno).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/grammar-submit/
git commit -m "feat: add grammar-submit edge function for scoring grammar exercises"
```

---

### Task 6: `GrammarExercisePage.tsx` (trang học viên)

**Files:**
- Create: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: `useGrammarExercises` (Task 4), Edge Function `grammar-submit` (Task 5), `GrammarExercise` type (Task 4).
- Produces: `GrammarExercisePage: React.FC<{ lesson: Lesson; onQuizFinished: (score: number, xp: number) => void; onNavigateHome: () => void; onNextLesson: () => void; onBackToLesson: () => void; }>` — Task 7 (App.tsx) render component này.

- [ ] **Step 1: Đọc `src/pages/QuizPage.tsx` trước khi viết**

Đọc toàn bộ file để nắm đúng style/pattern (progress bar, màn hình kết quả, `Button`/`ProgressBar` từ DesignSystem) — component mới phải mirror phong cách này, không phải viết lại từ đầu.

- [ ] **Step 2: Tạo `GrammarExercisePage.tsx`**

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { Button, ProgressBar } from "../components/DesignSystem";
import { Lesson } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { supabase } from "../lib/supabase";

interface GrammarExercisePageProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}

interface GrammarResult {
  score: number;
  total: number;
  passed: boolean;
  xp_earned: number;
}

export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [itemGroups, setItemGroups] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarResult | null>(null);

  const activeExercise = exercises[currentIdx];
  const isLastExercise = currentIdx === exercises.length - 1;

  useEffect(() => {
    setSelectedTokens([]);
    setTextAnswer("");
    setItemGroups({});
  }, [currentIdx, exercises]);

  const toggleToken = (token: string, tokenIdx: number) => {
    const key = `${tokenIdx}:${token}`;
    setSelectedTokens((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  };

  const getCurrentAnswerString = (): string => {
    if (!activeExercise) return "";
    if (activeExercise.type === "word_reorder") {
      return selectedTokens.map((t) => t.split(":").slice(1).join(":")).join(" ");
    }
    if (activeExercise.type === "classification") {
      const items = activeExercise.classificationItems ?? [];
      if (items.length === 0 || items.some((item) => !itemGroups[item])) return "";
      return items.map((item) => `${item}:${itemGroups[item]}`).join("|");
    }
    return textAnswer.trim();
  };

  const hasAnsweredCurrent = (): boolean => getCurrentAnswerString() !== "";

  const handleNext = () => {
    const answer = getCurrentAnswerString();
    setAnswers((prev) => ({ ...prev, [activeExercise.id]: answer }));
    if (!isLastExercise) {
      setCurrentIdx((i) => i + 1);
    }
  };

  const handleSubmit = async () => {
    const answer = getCurrentAnswerString();
    const finalAnswers = { ...answers, [activeExercise.id]: answer };
    setAnswers(finalAnswers);

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke("grammar-submit", {
      body: { lesson_id: lesson.id, answers: finalAnswers },
    });

    setSubmitting(false);

    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }

    const res = data as GrammarResult;
    setResult(res);
    onQuizFinished(res.score, res.xp_earned);
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswers({});
    setSelectedTokens([]);
    setTextAnswer("");
    setItemGroups({});
    setResult(null);
    setSubmitError(null);
  };

  if (exercisesLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (exercisesError || exercises.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        <Button variant="secondary" onClick={onNavigateHome}>Quay về Lộ trình</Button>
      </div>
    );
  }

  if (result) {
    const { score, total, passed, xp_earned } = result;
    const correctCount = Math.round((score / 100) * total);

    return (
      <div
        id="grammar-result-card"
        className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
      >
        <div className="space-y-2">
          {passed ? (
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="w-20 h-20 bg-rose-50 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">
              😟
            </div>
          )}
          <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight leading-normal">
            {passed ? "Xuất sắc! Bạn đã vượt qua!" : "Cố gắng chút nữa nhé!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-sans leading-normal">
            {passed
              ? "Tuyệt vời, bạn đã tiếp thu bài học cực tốt và sẵn sàng mở khóa các lớp thử thách tiếp theo!"
              : "Để hoàn thiện bài học, bạn cần đạt tối thiểu 80% điểm số. Đừng nản lòng nhé!"}
          </p>
        </div>

        <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 max-w-xs mx-auto">
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">
            KẾT QUẢ ĐẠT ĐƯỢC
          </span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${passed ? "text-green-600" : "text-rose-600"}`}>
              {score}%
            </span>
            <span className="text-sm font-bold text-slate-500">({correctCount}/{total} câu)</span>
          </div>
          {xp_earned > 0 && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-green-50 text-green-700">
              +{xp_earned} XP Tích lũy
            </span>
          )}
          {!passed && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-rose-50 text-rose-700">
              Chưa đạt chuẩn 80%
            </span>
          )}
        </div>

        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            Giải thích từng câu hỏi:
          </h4>
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
            {exercises.map((ex, idx) => (
              <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                  Câu {idx + 1}: {ex.promptText ?? "Phân loại"}
                </p>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  <b>Giải thích:</b> {ex.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {passed ? (
            <Button variant="primary" className="flex-1" onClick={onNextLesson}>
              Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1 text-slate-500" onClick={onNavigateHome}>
              Quay về Lộ trình
            </Button>
          )}
        </div>
      </div>
    );
  }

  const progressPercent = Math.round((currentIdx / exercises.length) * 100);
  const canProceed = hasAnsweredCurrent();

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu hỏi {currentIdx + 1} / {exercises.length}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        {activeExercise.type === "word_reorder" && (
          <>
            <p className="text-sm text-slate-500">Sắp xếp các từ sau thành câu đúng:</p>
            <div className="flex flex-wrap gap-2">
              {(activeExercise.tokens ?? []).map((token, i) => {
                const key = `${i}:${token}`;
                const selected = selectedTokens.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleToken(token, i)}
                    className={`px-3 py-2 rounded-xl text-sm font-mono border transition-colors ${
                      selected
                        ? "bg-orange-50 border-orange-300 text-orange-700"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {token}
                  </button>
                );
              })}
            </div>
            <div className="min-h-[3rem] p-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-sm font-medium text-slate-800">
              {selectedTokens.length > 0
                ? selectedTokens.map((t) => t.split(":").slice(1).join(":")).join(" ")
                : "Câu của bạn sẽ hiện ở đây..."}
            </div>
            {selectedTokens.length > 0 && (
              <button onClick={() => setSelectedTokens([])} className="text-xs font-bold text-slate-400 hover:text-slate-600">
                Xóa hết
              </button>
            )}
          </>
        )}

        {activeExercise.type === "error_correction" && (
          <>
            <p className="text-sm text-slate-700">Sửa câu sau cho đúng:</p>
            <p className="text-sm bg-red-50 text-red-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Nhập câu đúng..."
            />
          </>
        )}

        {activeExercise.type === "translation" && (
          <>
            <p className="text-sm text-slate-700">Dịch câu sau sang tiếng Đức:</p>
            <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Nhập câu tiếng Đức..."
            />
          </>
        )}

        {activeExercise.type === "sentence_transformation" && (
          <>
            <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            {activeExercise.transformationHint && (
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
                Yêu cầu: {activeExercise.transformationHint}
              </span>
            )}
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Nhập câu sau khi biến đổi..."
            />
          </>
        )}

        {activeExercise.type === "guided_sentence_writing" && (
          <>
            <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Viết câu hoàn chỉnh..."
            />
          </>
        )}

        {activeExercise.type === "classification" && (
          <>
            <p className="text-sm text-slate-500">Phân loại các item sau vào đúng nhóm:</p>
            <div className="space-y-2">
              {(activeExercise.classificationItems ?? []).map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-800 flex-1">{item}</span>
                  <select
                    value={itemGroups[item] ?? ""}
                    onChange={(e) => setItemGroups((prev) => ({ ...prev, [item]: e.target.value }))}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="">-- Chọn nhóm --</option>
                    {(activeExercise.classificationGroups ?? []).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!canProceed || submitting} onClick={isLastExercise ? handleSubmit : handleNext}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : !isLastExercise && <ArrowRight className="w-4 h-4 ml-2" />}
          {isLastExercise ? "Nộp bài" : "Câu tiếp theo"}
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run lint` — expect không có lỗi mới so với baseline. Chú ý: `onBackToLesson` prop được khai báo trong interface nhưng không dùng trong component — nếu tsconfig không bật `noUnusedParameters` thì không sao (đã xác nhận ở nhánh trước là không bật); nếu build vẫn OK, không cần xử lý gì thêm.

- [ ] **Step 4: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "feat: add GrammarExercisePage for learner practice on 6 exercise types"
```

---

### Task 7: Wire `GrammarExercisePage` vào `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `GrammarExercisePage` (Task 6).

- [ ] **Step 1: Import `GrammarExercisePage`**

Modify `src/App.tsx` — thêm sau import `QuizPage`:

```diff
 import { QuizPage } from "./pages/QuizPage";
+import { GrammarExercisePage } from "./pages/GrammarExercisePage";
```

- [ ] **Step 2: Đổi khối render trang "quiz" để route theo category**

Modify — tìm đúng khối JSX hiện tại (nội dung là nguồn sự thật, không phải số dòng):

```diff
               {currentPage === "quiz" && user && activeLessonObject && (
-                <QuizPage
-                  lesson={activeLessonObject}
-                  category={activeExerciseCategory}
-                  onQuizFinished={handleQuizFinished}
-                  onNavigateHome={() => handleNavigate("roadmap")}
-                  onNextLesson={handleNextLesson}
-                  onBackToLesson={() => setCurrentPage("lesson-detail")}
-                />
+                activeExerciseCategory === "nguphap" ? (
+                  <GrammarExercisePage
+                    lesson={activeLessonObject}
+                    onQuizFinished={handleQuizFinished}
+                    onNavigateHome={() => handleNavigate("roadmap")}
+                    onNextLesson={handleNextLesson}
+                    onBackToLesson={() => setCurrentPage("lesson-detail")}
+                  />
+                ) : (
+                  <QuizPage
+                    lesson={activeLessonObject}
+                    category={activeExerciseCategory}
+                    onQuizFinished={handleQuizFinished}
+                    onNavigateHome={() => handleNavigate("roadmap")}
+                    onNextLesson={handleNextLesson}
+                    onBackToLesson={() => setCurrentPage("lesson-detail")}
+                  />
+                )
               )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run lint` — expect không có lỗi mới so với baseline.

- [ ] **Step 4: Review code kỹ thay cho browser test**

Đọc lại toàn bộ đoạn thay đổi — xác nhận `activeExerciseCategory === "nghe"` và `"doc"` vẫn render `<QuizPage category={activeExerciseCategory} .../>` y hệt trước, không bị ảnh hưởng.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route nguphap category to GrammarExercisePage in App.tsx"
```
