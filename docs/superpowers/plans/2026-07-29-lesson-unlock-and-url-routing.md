# Sửa Mở Khóa Bài Học & URL Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bài học mở khóa đúng theo "mục nào có câu hỏi thì mới bắt buộc pass", và mọi trang có URL riêng để refresh / chia sẻ link không bị văng về trang chủ.

**Architecture:** Phần A đổi `applicableCategories` từ xét *có nội dung* sang xét *có câu hỏi* (cờ mới lấy từ `quiz_questions_public` + `grammar_exercises_public`), rồi tách thứ tự Lộ trình ra module thuần `lessonOrder.ts` để draft không chặn chuỗi khóa và nút "Bài tiếp theo" đi đúng thứ tự. Phần B thêm `router.ts` (parse/serialize thuần) và đồng bộ hai chiều giữa 4 state sẵn có trong `App.tsx` với `window.location.pathname` bằng History API — không thêm thư viện routing.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Supabase JS v2, `node:test`-style assertion scripts chạy bằng `npx tsx`.

## Global Constraints

- Ngôn ngữ code (biến, hàm, type, comment kỹ thuật): **English**. Nội dung hiển thị cho user: **Tiếng Việt**.
- **Không** thêm npm package mới. **Không** thêm script vào `package.json`.
- **Không** dùng `any`. Dùng type cụ thể hoặc `unknown`.
- **Không** dùng `window.alert()` / `window.confirm()` — dùng `showToast()` từ `src/lib/toast.ts`.
- Named exports, không default export (trừ `App.tsx`).
- **Không** sửa tay `src/lib/database.types.ts`.
- Type check sau mỗi task: `npm run lint` (tức `tsc --noEmit`) phải sạch.
- Test là script assertion phẳng theo đúng kiểu `src/lib/grammarFillInBlank.test.ts` (`import assert from "node:assert/strict"`, gọi assert ở top level, **không** dùng `describe`/`it`). Chạy bằng `npx tsx <đường-dẫn-file>`; exit code 0 = pass.
- `PASS_THRESHOLD` = 80, giữ nguyên.
- Quy ước bắt buộc xuyên suốt: cờ `hasNguphapQuestions` / `hasNgheQuestions` / `hasDocQuestions` chỉ tính là "mục bắt buộc pass" khi **`=== true`**. `undefined` coi như *không có câu hỏi*.

---

## File Structure

**Tạo mới:**
- `src/lib/lessonOrder.ts` — dựng thứ tự hiển thị Lộ trình (lesson + draft) và danh sách chỉ-lesson dùng để tính khóa. Logic thuần, không React.
- `src/lib/lessonOrder.test.ts`
- `src/lib/router.ts` — `parseRoute` / `serializeRoute` / `isProtectedPage`. Logic thuần, không đụng `window`.
- `src/lib/router.test.ts`
- `src/lib/completion.test.ts`

**Sửa:**
- `src/lib/completion.ts` — `LessonContentFlags` → `LessonQuizFlags`, `applicableCategories` xét cờ câu hỏi.
- `src/lib/appTypes.ts` — thêm `hasNgheQuestions` / `hasDocQuestions` vào `Lesson`.
- `src/lib/hooks/useModules.ts` — query thứ ba lấy `(lesson_id, category)`, gắn cờ.
- `src/pages/admin/AdminUsersSection.tsx` — dùng cờ câu hỏi thay cho `listeningClips`/`readingPassages`.
- `src/pages/LessonDetailPage.tsx` — ẩn nút bài tập Nghe/Đọc khi mục chưa có câu hỏi; thêm `onTabChange`.
- `src/pages/RoadmapPage.tsx` — bỏ logic sort/khóa nội bộ, dùng `lessonOrder.ts` + `computeLessonStatuses`.
- `src/App.tsx` — `handleNextLesson` theo thứ tự Lộ trình; đồng bộ URL; bỏ ép về dashboard; gating theo `effectivePage`; chặn deep-link bài khóa; tab vào URL.
- `src/lib/auth.ts` — `signInWithGoogle` redirect về `window.location.href`.

---

## Task 1: `completion.ts` xét câu hỏi thay vì nội dung

**Files:**
- Modify: `src/lib/completion.ts:12-38`
- Test: `src/lib/completion.test.ts` (tạo mới)

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces:
  - `export interface LessonQuizFlags { id: string; hasNguphapQuestions?: boolean; hasNgheQuestions?: boolean; hasDocQuestions?: boolean; }`
  - `applicableCategories(lesson: LessonQuizFlags): QuizCategory[]`
  - `isLessonComplete(lesson: LessonQuizFlags, scoresByCategory: Partial<Record<QuizCategory, number>>): boolean`
  - `computeCompletedLessons(lessons: LessonQuizFlags[], progressRows: LessonProgressRow[]): string[]`
  - `LessonContentFlags` bị **xóa** — không còn ai được import.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/completion.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  applicableCategories,
  isLessonComplete,
  computeCompletedLessons,
  type LessonQuizFlags,
} from "./completion";

// Chỉ có câu hỏi ngữ pháp -> chỉ mục ngữ pháp bắt buộc
assert.deepEqual(
  applicableCategories({ id: "l1", hasNguphapQuestions: true }),
  ["nguphap"],
);

// Đủ cả ba mục
assert.deepEqual(
  applicableCategories({
    id: "l2",
    hasNguphapQuestions: true,
    hasNgheQuestions: true,
    hasDocQuestions: true,
  }),
  ["nguphap", "nghe", "doc"],
);

// Không có câu hỏi ở mục nào -> không mục nào bắt buộc
assert.deepEqual(applicableCategories({ id: "l3" }), []);

// Cờ undefined coi như không có câu hỏi (KHÔNG coi là "có")
assert.deepEqual(
  applicableCategories({ id: "l4", hasNguphapQuestions: undefined, hasNgheQuestions: true }),
  ["nghe"],
);

// Cờ false cũng là không có câu hỏi
assert.deepEqual(
  applicableCategories({ id: "l5", hasNguphapQuestions: false, hasDocQuestions: true }),
  ["doc"],
);

// Bài chỉ có ngữ pháp, đạt 80 -> hoàn thành
assert.equal(
  isLessonComplete({ id: "l1", hasNguphapQuestions: true }, { nguphap: 80 }),
  true,
);

// Đạt 79 -> chưa hoàn thành
assert.equal(
  isLessonComplete({ id: "l1", hasNguphapQuestions: true }, { nguphap: 79 }),
  false,
);

// Bài không có câu hỏi ở mục nào -> hoàn thành ngay
assert.equal(isLessonComplete({ id: "l3" }, {}), true);

// Có câu hỏi nghe nhưng chưa làm -> chưa hoàn thành
assert.equal(
  isLessonComplete(
    { id: "l2", hasNguphapQuestions: true, hasNgheQuestions: true },
    { nguphap: 100 },
  ),
  false,
);

// BUG ĐÃ BÁO: bài có file nghe nhưng KHÔNG có câu hỏi nghe.
// Cờ hasNgheQuestions là false -> mục nghe không bắt buộc -> xong ngữ pháp là hoàn thành.
const lessonWithClipButNoQuestions: LessonQuizFlags = {
  id: "l6",
  hasNguphapQuestions: true,
  hasNgheQuestions: false,
  hasDocQuestions: false,
};
assert.equal(isLessonComplete(lessonWithClipButNoQuestions, { nguphap: 90 }), true);

// computeCompletedLessons trên nhiều bài
assert.deepEqual(
  computeCompletedLessons(
    [
      { id: "l1", hasNguphapQuestions: true },
      { id: "l2", hasNguphapQuestions: true, hasNgheQuestions: true },
      { id: "l3" },
    ],
    [
      { lesson_id: "l1", category: "nguphap", quiz_score: 85 },
      { lesson_id: "l2", category: "nguphap", quiz_score: 85 },
    ],
  ),
  ["l1", "l3"],
);

// Row quiz_score null bị bỏ qua
assert.deepEqual(
  computeCompletedLessons(
    [{ id: "l1", hasNguphapQuestions: true }],
    [{ lesson_id: "l1", category: "nguphap", quiz_score: null }],
  ),
  [],
);

console.log("completion.test.ts OK");
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

```bash
npx tsx src/lib/completion.test.ts
```

Expected: FAIL — `LessonQuizFlags` chưa tồn tại (`has no exported member 'LessonQuizFlags'`).

- [ ] **Step 3: Sửa `src/lib/completion.ts`**

Thay khối `LessonContentFlags` + `applicableCategories` (dòng 12–38) bằng:

```ts
export interface LessonQuizFlags {
  id: string;
  hasNguphapQuestions?: boolean;
  hasNgheQuestions?: boolean;
  hasDocQuestions?: boolean;
}

/**
 * Which quiz categories a lesson must pass to count as complete. A category
 * only counts if the lesson actually has questions in it — a lesson can ship
 * with a listening clip or a reading passage whose questions have not been
 * authored yet, and such a category must never block progression.
 *
 * Only `=== true` counts. An undefined flag means "no questions", so Lesson
 * objects built outside useModules (mock data, tests) never lock the chain.
 */
export function applicableCategories(lesson: LessonQuizFlags): QuizCategory[] {
  const categories: QuizCategory[] = [];
  if (lesson.hasNguphapQuestions === true) categories.push("nguphap");
  if (lesson.hasNgheQuestions === true) categories.push("nghe");
  if (lesson.hasDocQuestions === true) categories.push("doc");
  return categories;
}

export function isLessonComplete(
  lesson: LessonQuizFlags,
  scoresByCategory: Partial<Record<QuizCategory, number>>,
): boolean {
  return applicableCategories(lesson).every(
    (cat) => (scoresByCategory[cat] ?? 0) >= PASS_THRESHOLD,
  );
}
```

Rồi đổi chữ ký `computeCompletedLessons` (dòng ~55) từ `lessons: LessonContentFlags[]` thành `lessons: LessonQuizFlags[]`. Thân hàm giữ nguyên.

- [ ] **Step 4: Chạy test để xác nhận pass**

```bash
npx tsx src/lib/completion.test.ts
```

Expected: PASS, in ra `completion.test.ts OK`.

- [ ] **Step 5: Chạy type check**

```bash
npm run lint
```

Expected: PASS. `useUserStats` và `AdminUsersSection` vẫn compile được vì `LessonQuizFlags` chỉ yêu cầu `id` (các cờ đều optional) — hành vi của chúng sẽ được sửa ở Task 2 và Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/lib/completion.ts src/lib/completion.test.ts
git commit -m "fix(completion): mục chỉ bắt buộc pass khi thực sự có câu hỏi"
```

---

## Task 2: `useModules` cung cấp cờ câu hỏi Nghe/Đọc

**Files:**
- Modify: `src/lib/appTypes.ts` (interface `Lesson`, sau dòng `hasNguphapQuestions?: boolean;`)
- Modify: `src/lib/hooks/useModules.ts:34-40` (chữ ký `transformModule`), `:92-118` (khối `Promise.all`)

**Interfaces:**
- Consumes: `LessonQuizFlags` từ Task 1 — `Lesson` phải thỏa cấu trúc này.
- Produces: mọi `Lesson` do `useModules` trả về đều có `hasNguphapQuestions`, `hasNgheQuestions`, `hasDocQuestions` là **boolean tường minh** (không bao giờ `undefined`).

- [ ] **Step 1: Thêm hai trường vào `Lesson`**

Trong `src/lib/appTypes.ts`, ngay dưới `hasNguphapQuestions?: boolean;`:

```ts
  hasNgheQuestions?: boolean;
  hasDocQuestions?: boolean;
```

- [ ] **Step 2: Đổi chữ ký `transformModule`**

Trong `src/lib/hooks/useModules.ts`, đổi:

```ts
function transformModule(m: SupabaseModule, nguphapLessonIds: Set<string>): Module {
```

thành:

```ts
function transformModule(
  m: SupabaseModule,
  nguphapLessonIds: Set<string>,
  quizCategoriesByLesson: Map<string, Set<string>>,
): Module {
```

- [ ] **Step 3: Gắn cờ trong phần map lesson**

Trong `transformModule`, đổi dòng `hasNguphapQuestions: nguphapLessonIds.has(l.id),` thành:

```ts
      hasNguphapQuestions: nguphapLessonIds.has(l.id),
      // Nghe/Đọc chỉ bắt buộc pass khi đã có câu hỏi được soạn — có file mp3
      // hay đoạn văn thôi thì chưa đủ, nếu không bài học sẽ khóa vĩnh viễn.
      hasNgheQuestions: quizCategoriesByLesson.get(l.id)?.has("nghe") ?? false,
      hasDocQuestions: quizCategoriesByLesson.get(l.id)?.has("doc") ?? false,
```

- [ ] **Step 4: Thêm truy vấn thứ ba**

Trong `useModules`, thêm vào mảng `Promise.all` (sau query `grammar_exercises_public`):

```ts
      supabase
        .from("quiz_questions_public")
        .select("lesson_id, category"),
```

Đổi destructure `.then(([modulesRes, nguphapRes]) => {` thành `.then(([modulesRes, nguphapRes, quizRes]) => {`, và trong nhánh `else` thay phần dựng `nguphapLessonIds` bằng:

```ts
        const nguphapLessonIds = new Set((nguphapRes.data ?? []).map((r) => r.lesson_id as string));
        const quizCategoriesByLesson = new Map<string, Set<string>>();
        for (const row of (quizRes.data ?? []) as { lesson_id: string; category: string }[]) {
          const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
          categories.add(row.category);
          quizCategoriesByLesson.set(row.lesson_id, categories);
        }
        setModules(
          (modulesRes.data ?? []).map((m) =>
            transformModule(m as SupabaseModule, nguphapLessonIds, quizCategoriesByLesson),
          ),
        );
```

- [ ] **Step 5: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Kiểm chứng thủ công trên dev server**

Chạy dev server bằng preview tool (KHÔNG dùng Bash), mở app, đăng nhập, vào Lộ trình. Mở DevTools → Network, xác nhận có request tới `quiz_questions_public` với `select=lesson_id%2Ccategory`. Vào một bài chỉ có bài tập ngữ pháp, làm đạt ≥80 điểm, quay lại Lộ trình: bài đó phải hiện "Đã xong" và bài kế tiếp phải mở.

- [ ] **Step 7: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useModules.ts
git commit -m "feat(modules): nạp cờ có-câu-hỏi cho mục Nghe và Đọc"
```

---

## Task 3: Màn hình admin dùng cùng quy tắc

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx:14-22` (interface `ProgressLesson`), `:84-108` (effect nạp lessons), `:515-517` (biến `hasNghe`/`hasDoc`)

**Interfaces:**
- Consumes: `applicableCategories(lesson: LessonQuizFlags): QuizCategory[]` từ Task 1.
- Produces: không có gì cho task sau.

Không sửa task này thì bảng tiến độ trong admin tính "hoàn thành" theo quy tắc cũ, lệch với app học viên.

- [ ] **Step 1: Đổi `ProgressLesson`**

Thay:

```ts
  listeningClips: { id: string }[];
  readingPassages: { id: string }[];
```

bằng:

```ts
  hasNguphapQuestions: boolean;
  hasNgheQuestions: boolean;
  hasDocQuestions: boolean;
```

- [ ] **Step 2: Thêm import**

Thêm `applicableCategories` vào khối import từ `"../../lib/completion"`.

- [ ] **Step 3: Nạp cờ câu hỏi trong effect**

Thay toàn bộ khối `supabase.from("modules")...setOrderedLessons(flat);` bằng:

```ts
    Promise.all([
      supabase
        .from("modules")
        .select(`
          id, order_index, title_vi, level,
          lessons (id, title, title_vi, order_index, status)
        `)
        .order("order_index")
        .order("order_index", { referencedTable: "lessons" }),
      supabase.from("grammar_exercises_public").select("lesson_id"),
      supabase.from("quiz_questions_public").select("lesson_id, category"),
    ]).then(([modulesRes, nguphapRes, quizRes]) => {
      const nguphapLessonIds = new Set((nguphapRes.data ?? []).map((r) => r.lesson_id as string));
      const quizCategoriesByLesson = new Map<string, Set<string>>();
      for (const row of (quizRes.data ?? []) as { lesson_id: string; category: string }[]) {
        const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
        categories.add(row.category);
        quizCategoriesByLesson.set(row.lesson_id, categories);
      }
      const flat: ProgressLesson[] = (modulesRes.data ?? []).flatMap((m) =>
        (m.lessons ?? [])
          .filter((l: { status: string }) => l.status === "published")
          .map((l: { id: string; title: string; title_vi: string }) => ({
            id: l.id,
            title: l.title,
            titleVi: l.title_vi,
            moduleTitle: m.title_vi,
            level: m.level,
            hasNguphapQuestions: nguphapLessonIds.has(l.id),
            hasNgheQuestions: quizCategoriesByLesson.get(l.id)?.has("nghe") ?? false,
            hasDocQuestions: quizCategoriesByLesson.get(l.id)?.has("doc") ?? false,
          })),
      );
      setOrderedLessons(flat);
    });
```

- [ ] **Step 4: Sửa cột điểm trong modal tiến độ**

Thay:

```ts
                      const hasNghe = l.listeningClips.length > 0;
                      const hasDoc = l.readingPassages.length > 0;
```

bằng:

```ts
                      const categories = applicableCategories(l);
                      const hasNguphap = categories.includes("nguphap");
                      const hasNghe = categories.includes("nghe");
                      const hasDoc = categories.includes("doc");
```

và đổi ô ngữ pháp từ `scoreCell(l.id, "nguphap", true)` thành `scoreCell(l.id, "nguphap", hasNguphap)`.

- [ ] **Step 5: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "fix(admin): bảng tiến độ dùng cùng quy tắc hoàn thành với app"
```

---

## Task 4: Ẩn nút bài tập khi mục chưa có câu hỏi

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:246-262` (tab Nghe), `:266-293` (tab Đọc)

**Interfaces:**
- Consumes: `lesson.hasNgheQuestions`, `lesson.hasDocQuestions` từ Task 2.
- Produces: không có gì cho task sau.

Tab Nghe/Đọc **vẫn hiển thị** theo có clip/đoạn văn (`visibleTabs` giữ nguyên) — người học vẫn xem được nội dung. Chỉ nút "Bắt đầu bài tập" mới ẩn, để không dẫn học viên vào bài tập rỗng.

- [ ] **Step 1: Tab Nghe**

Trong khối `{bottomTab === "nghe" && lesson.listeningClips.length > 0 && (...)}`, thay phần từ `<h3 ...>Sẵn sàng luyện nghe chưa?</h3>` đến hết `</div>` của khối nút bằng:

```tsx
              {lesson.hasNgheQuestions === true ? (
                <>
                  <h3 className="text-sm font-display font-extrabold text-slate-800">Sẵn sàng luyện nghe chưa?</h3>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                    Bấm bắt đầu để nghe file âm thanh và trả lời câu hỏi trắc nghiệm đi kèm.
                  </p>
                  <div className="flex justify-center pt-2">
                    <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                      Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                  Bài tập nghe đang được cập nhật. Mục này không ảnh hưởng tới việc hoàn thành bài học.
                </p>
              )}
```

- [ ] **Step 2: Tab Đọc**

Trong khối `{bottomTab === "doc" && lesson.readingPassages.length > 0 && (...)}`, giữ nguyên phần render `lesson.readingPassages.map(...)`, rồi thay khối `<div className="text-center space-y-2 pt-1">...` và khối nút ngay sau nó bằng:

```tsx
              {lesson.hasDocQuestions === true ? (
                <>
                  <div className="text-center space-y-2 pt-1">
                    <h3 className="text-sm font-display font-extrabold text-slate-800">Đã đọc kỹ đoạn văn bên trên chưa?</h3>
                    <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                      Trả lời câu hỏi trắc nghiệm để kiểm tra khả năng đọc hiểu của bạn.
                    </p>
                  </div>
                  <div className="flex justify-center pt-2">
                    <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                      Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 text-center font-sans leading-relaxed pt-1">
                  Bài tập đọc đang được cập nhật. Mục này không ảnh hưởng tới việc hoàn thành bài học.
                </p>
              )}
```

- [ ] **Step 3: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Kiểm chứng trên dev server**

Mở một bài có đoạn văn đọc nhưng chưa soạn câu hỏi đọc → tab Lesen vẫn hiện đoạn văn, không còn nút "Bắt đầu bài tập đọc", thay bằng dòng "đang được cập nhật". Mở một bài có câu hỏi đọc → nút vẫn còn.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "fix(lesson): ẩn nút bài tập Nghe/Đọc khi mục chưa có câu hỏi"
```

---

## Task 5: `lessonOrder.ts` — thứ tự Lộ trình dùng chung

**Files:**
- Create: `src/lib/lessonOrder.ts`
- Test: `src/lib/lessonOrder.test.ts`

**Interfaces:**
- Consumes: `Module`, `Lesson`, `LessonPosition`, `Level` từ `src/lib/appTypes.ts`.
- Produces:
  - `export type RoadmapItem = { kind: "lesson"; lesson: Lesson } | { kind: "draft"; id: string };`
  - `export function buildRoadmapItems(modules: Module[], positions: LessonPosition[], unlockedLevels: Level[]): { items: RoadmapItem[]; orderedLessons: Lesson[] }`

`items` dùng để render (giữ cả draft, đúng thứ tự hiển thị). `orderedLessons` **chỉ chứa lesson** và là thứ duy nhất được dùng để tính khóa — đó là cách draft thôi chặn chuỗi.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/lessonOrder.test.ts`:

```ts
import assert from "node:assert/strict";
import { buildRoadmapItems } from "./lessonOrder";
import { computeLessonStatuses } from "./completion";
import type { Lesson, Module, LessonPosition, Level } from "./appTypes";

function makeLesson(id: string, orderIndex: number, level: Level = "A1"): Lesson {
  return {
    id,
    moduleId: "m1",
    moduleTitle: "Modul 1",
    level,
    title: id,
    titleVi: id,
    duration: "5:00",
    objective: "",
    summary: "",
    orderIndex,
    grammar: { title: "", rule: "", examples: [] },
    listeningClips: [],
    readingPassages: [],
  };
}

const moduleA1: Module = {
  id: "m1",
  level: "A1",
  title: "Modul 1",
  titleVi: "Modul 1",
  lessons: [makeLesson("l1", 1), makeLesson("l3", 3)],
};

const moduleA2: Module = {
  id: "m2",
  level: "A2",
  title: "Modul 2",
  titleVi: "Modul 2",
  lessons: [makeLesson("l9", 1, "A2")],
};

const draftBetween: LessonPosition = { id: "d2", moduleId: "m1", orderIndex: 2, status: "draft" };

// Draft nằm giữa: items giữ đủ 3, orderedLessons chỉ có 2 bài
const between = buildRoadmapItems([moduleA1], [draftBetween], ["A1"]);
assert.deepEqual(between.items.map((i) => (i.kind === "lesson" ? i.lesson.id : i.id)), ["l1", "d2", "l3"]);
assert.deepEqual(between.orderedLessons.map((l) => l.id), ["l1", "l3"]);

// BUG ĐÃ BÁO: draft không được chặn bài phía sau.
// Học xong l1 -> l3 phải là "current", không phải "locked".
const statusesBetween = computeLessonStatuses(between.orderedLessons, ["l1"]);
assert.equal(statusesBetween["l1"], "completed");
assert.equal(statusesBetween["l3"], "current");

// Draft nằm đầu: bài lesson đầu tiên vẫn là "current" khi chưa học gì
const draftFirst: LessonPosition = { id: "d0", moduleId: "m1", orderIndex: 0, status: "draft" };
const first = buildRoadmapItems([moduleA1], [draftFirst], ["A1"]);
assert.deepEqual(first.items.map((i) => (i.kind === "lesson" ? i.lesson.id : i.id)), ["d0", "l1", "l3"]);
assert.equal(computeLessonStatuses(first.orderedLessons, [])["l1"], "current");
assert.equal(computeLessonStatuses(first.orderedLessons, [])["l3"], "locked");

// Level chưa unlock bị loại hoàn toàn
const onlyA1 = buildRoadmapItems([moduleA1, moduleA2], [], ["A1"]);
assert.deepEqual(onlyA1.orderedLessons.map((l) => l.id), ["l1", "l3"]);
const bothLevels = buildRoadmapItems([moduleA1, moduleA2], [], ["A1", "A2"]);
assert.deepEqual(bothLevels.orderedLessons.map((l) => l.id), ["l1", "l3", "l9"]);

// Draft thuộc module chưa unlock bị loại
const draftInA2: LessonPosition = { id: "d9", moduleId: "m2", orderIndex: 2, status: "draft" };
assert.deepEqual(
  buildRoadmapItems([moduleA1, moduleA2], [draftInA2], ["A1"]).items.map((i) =>
    i.kind === "lesson" ? i.lesson.id : i.id,
  ),
  ["l1", "l3"],
);

// Position status "published" không được coi là draft
const publishedPosition: LessonPosition = { id: "l1", moduleId: "m1", orderIndex: 1, status: "published" };
assert.deepEqual(
  buildRoadmapItems([moduleA1], [publishedPosition], ["A1"]).items.map((i) =>
    i.kind === "lesson" ? i.lesson.id : i.id,
  ),
  ["l1", "l3"],
);

console.log("lessonOrder.test.ts OK");
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx tsx src/lib/lessonOrder.test.ts
```

Expected: FAIL — `Cannot find module './lessonOrder'`.

- [ ] **Step 3: Viết `src/lib/lessonOrder.ts`**

```ts
import { Lesson, Level, LessonPosition, Module } from "./appTypes";

export type RoadmapItem =
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "draft"; id: string };

/**
 * Builds the roadmap's display order once, for every consumer.
 *
 * `items` keeps drafts so the roadmap can render an "Đang chỉnh sửa" card in
 * the right slot. `orderedLessons` drops them, and is the only list that may
 * feed computeLessonStatuses: a draft can never appear in completedLessons,
 * so leaving it in the chain would lock every lesson behind it forever.
 */
export function buildRoadmapItems(
  modules: Module[],
  positions: LessonPosition[],
  unlockedLevels: Level[],
): { items: RoadmapItem[]; orderedLessons: Lesson[] } {
  const unlockedModules = modules.filter((m) => unlockedLevels.includes(m.level));
  const unlockedModuleIds = new Set(unlockedModules.map((m) => m.id));
  const draftPositions = positions.filter(
    (p) => p.status === "draft" && unlockedModuleIds.has(p.moduleId),
  );

  const items: RoadmapItem[] = [];
  unlockedModules.forEach((m) => {
    const combined: { orderIndex: number; item: RoadmapItem }[] = [
      ...m.lessons.map((l) => ({
        orderIndex: l.orderIndex ?? 0,
        item: { kind: "lesson" as const, lesson: l },
      })),
      ...draftPositions
        .filter((p) => p.moduleId === m.id)
        .map((p) => ({ orderIndex: p.orderIndex, item: { kind: "draft" as const, id: p.id } })),
    ];
    combined.sort((a, b) => a.orderIndex - b.orderIndex);
    combined.forEach((c) => items.push(c.item));
  });

  const orderedLessons = items
    .filter((i): i is { kind: "lesson"; lesson: Lesson } => i.kind === "lesson")
    .map((i) => i.lesson);

  return { items, orderedLessons };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

```bash
npx tsx src/lib/lessonOrder.test.ts
```

Expected: PASS, in ra `lessonOrder.test.ts OK`.

- [ ] **Step 5: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lessonOrder.ts src/lib/lessonOrder.test.ts
git commit -m "feat(lessonOrder): tách thứ tự Lộ trình, draft không nằm trong chuỗi khóa"
```

---

## Task 6: `RoadmapPage` dùng `lessonOrder` + `computeLessonStatuses`

**Files:**
- Modify: `src/pages/RoadmapPage.tsx:19-75` (xóa type/logic nội bộ), `:120` (vòng render)

**Interfaces:**
- Consumes: `buildRoadmapItems`, `RoadmapItem` (Task 5); `computeLessonStatuses(orderedLessons, completedIds): Record<string, LessonStatus>` (đã có sẵn trong `completion.ts`).
- Produces: không có gì cho task sau.

- [ ] **Step 1: Thay phần đầu component**

Xóa `type RoadmapItem = ...` (dòng 19–22) khỏi file này, và thay toàn bộ khối từ `const unlockedModules = ...` đến hết `getLessonStatus` (dòng 29–62) bằng:

```tsx
  const { items, orderedLessons } = React.useMemo(
    () => buildRoadmapItems(modules, positions, stats.unlockedLevels),
    [modules, positions, stats.unlockedLevels],
  );

  const statuses = React.useMemo(
    () => computeLessonStatuses(orderedLessons, stats.completedLessons),
    [orderedLessons, stats.completedLessons],
  );
```

Thêm import ở đầu file:

```tsx
import { buildRoadmapItems } from "../lib/lessonOrder";
import { computeLessonStatuses } from "../lib/completion";
```

- [ ] **Step 2: Sửa effect cuộn tới bài đang học**

Thay effect `useEffect(() => { if (allLessons.length === 0) ... }, [allLessons.length])` bằng:

```tsx
  useEffect(() => {
    const current = items.find(
      (item) => item.kind === "lesson" && statuses[item.lesson.id] === "current",
    );
    if (!current || current.kind !== "lesson") return;
    document
      .getElementById(`roadmap-lesson-card-${current.lesson.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Chỉ chạy khi danh sách bài đổi (mount / mở khóa level), không chạy mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
```

- [ ] **Step 3: Sửa phần đếm và vòng render**

Thay:

```tsx
  const totalLessons = allLessons.length;
```

bằng:

```tsx
  const totalLessons = items.length;
```

(giữ nguyên `completedTotal` và `overAllProgress`).

Thay dòng mở vòng lặp `{allLessons.map(({ item, indexInAll }) => {` bằng:

```tsx
            {items.map((item, indexInAll) => {
```

Trong nhánh lesson, thay `const status = getLessonStatus(lesson.id, indexInAll);` bằng:

```tsx
              const status = statuses[lesson.id] ?? "locked";
```

Xóa cả hàm `idOf` và mảng `allLessons` nếu không còn tham chiếu nào.

- [ ] **Step 4: Type check**

```bash
npm run lint
```

Expected: PASS. Nếu báo `'idOf' is declared but never read` thì xóa nốt.

- [ ] **Step 5: Kiểm chứng trên dev server**

Trên Lộ trình có ít nhất một bài draft nằm giữa: bài ngay sau draft không được hiện ổ khóa nếu bài published trước draft đã xong. Thẻ draft vẫn hiện "Đang chỉnh sửa" đúng vị trí, số thứ tự "Bài N" không đổi so với trước.

- [ ] **Step 6: Commit**

```bash
git add src/pages/RoadmapPage.tsx
git commit -m "fix(roadmap): bài draft không còn khóa các bài phía sau"
```

---

## Task 7: "Bài tiếp theo" đi đúng thứ tự Lộ trình

**Files:**
- Modify: `src/App.tsx:36` (thêm memo), `:172-185` (`handleNextLesson`)

**Interfaces:**
- Consumes: `buildRoadmapItems` (Task 5).
- Produces: `orderedLessons` trong scope `App` — Task 11 sẽ dùng lại.

- [ ] **Step 1: Thêm `orderedLessons` vào App**

Ngay dưới dòng `const flatLessons = useMemo(...)`, thêm:

```tsx
  // Đúng thứ tự người học thấy trên Lộ trình: đã lọc level chưa mở khóa,
  // sort theo orderIndex, và bỏ các bài draft.
  const { orderedLessons } = useMemo(
    () => buildRoadmapItems(modules, positions, stats.unlockedLevels),
    [modules, positions, stats.unlockedLevels],
  );
```

Thêm import:

```tsx
import { buildRoadmapItems } from "./lib/lessonOrder";
```

Lưu ý thứ tự khai báo: `stats` được tạo bởi `useUserStats` ở dòng ngay trên, nên `useMemo` này phải đặt **sau** dòng đó.

- [ ] **Step 2: Sửa `handleNextLesson`**

Thay thân hàm bằng:

```tsx
  const handleNextLesson = () => {
    const activeIdx = orderedLessons.findIndex(l => l.id === selectedLessonId);

    if (activeIdx !== -1 && activeIdx + 1 < orderedLessons.length) {
      const nextLesson = orderedLessons[activeIdx + 1];
      setSelectedLessonId(nextLesson.id);
      setInitialLessonTab(undefined);
      setCurrentPage("lesson-detail");
    } else {
      showToast("Đỉnh quá! Bạn đã hoàn thành toàn bộ kho bài học của DeutschPath.", "success");
      setCurrentPage("dashboard");
    }
  };
```

(`setInitialLessonTab(undefined)` để bài mới mở ở tab mặc định, không kế thừa tab của bài trước.)

- [ ] **Step 3: Type check**

```bash
npm run lint
```

Expected: PASS. Nếu `flatLessons` vẫn được `useUserStats` dùng thì giữ lại; **không** xóa.

- [ ] **Step 4: Kiểm chứng trên dev server**

Làm xong bài tập của bài áp chót trong một level, bấm "Bài tiếp theo" → phải sang đúng bài kế tiếp trên Lộ trình, không nhảy sang level chưa mở khóa.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix(app): nút Bài tiếp theo đi theo đúng thứ tự Lộ trình"
```

---

## Task 8: `router.ts` — parse/serialize đường dẫn

**Files:**
- Create: `src/lib/router.ts`
- Test: `src/lib/router.test.ts`

**Interfaces:**
- Consumes: `BottomTab`, `BOTTOM_TABS` từ `src/pages/lessonBottomTabs.tsx`; `QuizCategory` từ `src/lib/completion.ts`.
- Produces:
  - `export type AppPage = "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" | "lesson-detail" | "quiz";`
  - `export type AppRoute = { page: "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" } | { page: "lesson-detail"; lessonId: string; tab?: BottomTab } | { page: "quiz"; lessonId: string; category: QuizCategory };`
  - `export function parseRoute(pathname: string): AppRoute`
  - `export function serializeRoute(route: AppRoute): string`
  - `export function isProtectedPage(page: AppPage): boolean`

`src/lib` import từ `src/pages` là ngoại lệ có chủ đích: `BottomTab` và `BOTTOM_TABS` đã sống ở `lessonBottomTabs.tsx`, file đó chỉ import React + lucide nên không tạo vòng lặp. Chép danh sách tab sang `lib` sẽ tạo hai nguồn sự thật.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/router.test.ts`:

```ts
import assert from "node:assert/strict";
import { parseRoute, serializeRoute, isProtectedPage, type AppRoute } from "./router";

// parse các trang đơn
assert.deepEqual(parseRoute("/"), { page: "landing" });
assert.deepEqual(parseRoute("/login"), { page: "login" });
assert.deepEqual(parseRoute("/dashboard"), { page: "dashboard" });
assert.deepEqual(parseRoute("/roadmap"), { page: "roadmap" });
assert.deepEqual(parseRoute("/leaderboard"), { page: "leaderboard" });

// bỏ qua dấu / thừa
assert.deepEqual(parseRoute("/dashboard/"), { page: "dashboard" });
assert.deepEqual(parseRoute(""), { page: "landing" });

// bài học có / không có tab
assert.deepEqual(parseRoute("/lesson/a1-l3"), { page: "lesson-detail", lessonId: "a1-l3" });
assert.deepEqual(parseRoute("/lesson/a1-l3/nghe"), {
  page: "lesson-detail",
  lessonId: "a1-l3",
  tab: "nghe",
});
// tab không hợp lệ bị bỏ, vẫn vào được bài
assert.deepEqual(parseRoute("/lesson/a1-l3/khongtontai"), {
  page: "lesson-detail",
  lessonId: "a1-l3",
});
// thiếu lessonId -> landing
assert.deepEqual(parseRoute("/lesson"), { page: "landing" });

// bài tập
assert.deepEqual(parseRoute("/quiz/a1-l3/nguphap"), {
  page: "quiz",
  lessonId: "a1-l3",
  category: "nguphap",
});
assert.deepEqual(parseRoute("/quiz/a1-l3/doc"), {
  page: "quiz",
  lessonId: "a1-l3",
  category: "doc",
});
// category không hợp lệ hoặc thiếu -> landing
assert.deepEqual(parseRoute("/quiz/a1-l3/xyz"), { page: "landing" });
assert.deepEqual(parseRoute("/quiz/a1-l3"), { page: "landing" });

// đường dẫn lạ -> landing
assert.deepEqual(parseRoute("/khong-ton-tai"), { page: "landing" });

// /reset-password giữ hành vi cũ: hiện màn hình đăng nhập
assert.deepEqual(parseRoute("/reset-password"), { page: "login" });

// serialize
assert.equal(serializeRoute({ page: "landing" }), "/");
assert.equal(serializeRoute({ page: "login" }), "/login");
assert.equal(serializeRoute({ page: "dashboard" }), "/dashboard");
assert.equal(serializeRoute({ page: "roadmap" }), "/roadmap");
assert.equal(serializeRoute({ page: "leaderboard" }), "/leaderboard");
assert.equal(serializeRoute({ page: "lesson-detail", lessonId: "a1-l3" }), "/lesson/a1-l3");
assert.equal(
  serializeRoute({ page: "lesson-detail", lessonId: "a1-l3", tab: "nghe" }),
  "/lesson/a1-l3/nghe",
);
assert.equal(
  serializeRoute({ page: "quiz", lessonId: "a1-l3", category: "nguphap" }),
  "/quiz/a1-l3/nguphap",
);

// round-trip: route -> path -> route giữ nguyên
const routes: AppRoute[] = [
  { page: "landing" },
  { page: "login" },
  { page: "dashboard" },
  { page: "roadmap" },
  { page: "leaderboard" },
  { page: "lesson-detail", lessonId: "a1-l3" },
  { page: "lesson-detail", lessonId: "a1-l3", tab: "tuvung" },
  { page: "quiz", lessonId: "a1-l3", category: "nghe" },
];
for (const route of routes) {
  assert.deepEqual(parseRoute(serializeRoute(route)), route);
}

// trang cần đăng nhập
assert.equal(isProtectedPage("dashboard"), true);
assert.equal(isProtectedPage("roadmap"), true);
assert.equal(isProtectedPage("leaderboard"), true);
assert.equal(isProtectedPage("lesson-detail"), true);
assert.equal(isProtectedPage("quiz"), true);
assert.equal(isProtectedPage("landing"), false);
assert.equal(isProtectedPage("login"), false);

console.log("router.test.ts OK");
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx tsx src/lib/router.test.ts
```

Expected: FAIL — `Cannot find module './router'`.

- [ ] **Step 3: Viết `src/lib/router.ts`**

```ts
import { BOTTOM_TABS, type BottomTab } from "../pages/lessonBottomTabs";
import type { QuizCategory } from "./completion";

export type AppPage =
  | "landing"
  | "login"
  | "dashboard"
  | "roadmap"
  | "leaderboard"
  | "lesson-detail"
  | "quiz";

export type AppRoute =
  | { page: "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" }
  | { page: "lesson-detail"; lessonId: string; tab?: BottomTab }
  | { page: "quiz"; lessonId: string; category: QuizCategory };

const PROTECTED_PAGES: AppPage[] = [
  "dashboard",
  "roadmap",
  "leaderboard",
  "lesson-detail",
  "quiz",
];

export function isProtectedPage(page: AppPage): boolean {
  return PROTECTED_PAGES.includes(page);
}

function toBottomTab(segment: string | undefined): BottomTab | undefined {
  return BOTTOM_TABS.find((t) => t.id === segment)?.id;
}

function toQuizCategory(segment: string | undefined): QuizCategory | undefined {
  return segment === "nguphap" || segment === "nghe" || segment === "doc" ? segment : undefined;
}

/** Anything unrecognised falls back to landing rather than throwing. */
export function parseRoute(pathname: string): AppRoute {
  const [first, second, third] = pathname.split("/").filter(Boolean);

  switch (first) {
    case undefined:
      return { page: "landing" };
    case "login":
      // Supabase's password-recovery link points here; no dedicated screen
      // exists yet, so keep the pre-router behaviour of showing login.
      return { page: "login" };
    case "reset-password":
      return { page: "login" };
    case "dashboard":
      return { page: "dashboard" };
    case "roadmap":
      return { page: "roadmap" };
    case "leaderboard":
      return { page: "leaderboard" };
    case "lesson": {
      if (!second) return { page: "landing" };
      const tab = toBottomTab(third);
      return tab
        ? { page: "lesson-detail", lessonId: second, tab }
        : { page: "lesson-detail", lessonId: second };
    }
    case "quiz": {
      const category = toQuizCategory(third);
      if (!second || !category) return { page: "landing" };
      return { page: "quiz", lessonId: second, category };
    }
    default:
      return { page: "landing" };
  }
}

export function serializeRoute(route: AppRoute): string {
  switch (route.page) {
    case "landing":
      return "/";
    case "lesson-detail":
      return route.tab ? `/lesson/${route.lessonId}/${route.tab}` : `/lesson/${route.lessonId}`;
    case "quiz":
      return `/quiz/${route.lessonId}/${route.category}`;
    default:
      return `/${route.page}`;
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

```bash
npx tsx src/lib/router.test.ts
```

Expected: PASS, in ra `router.test.ts OK`.

- [ ] **Step 5: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/router.ts src/lib/router.test.ts
git commit -m "feat(router): thêm parse/serialize đường dẫn cho toàn bộ trang"
```

---

## Task 9: Đồng bộ hai chiều URL ↔ state

**Files:**
- Modify: `src/App.tsx:39-43` (khởi tạo state), thêm effect mới sau đó

**Interfaces:**
- Consumes: `parseRoute`, `serializeRoute`, `AppRoute` (Task 8).
- Produces: `currentRoute: AppRoute` trong scope `App`.

4 state hiện có vẫn là source of truth; URL chỉ là hình chiếu của chúng.

- [ ] **Step 1: Khởi tạo state từ URL**

Thay khối "Router page state" bằng:

```tsx
  // URL là hình chiếu của 4 state dưới đây, không phải nguồn sự thật —
  // nhưng lần đầu load thì đọc ngược từ URL để refresh/deep-link giữ đúng trang.
  const initialRoute = useMemo(() => parseRoute(window.location.pathname), []);
  const [currentPage, setCurrentPage] = useState<AppState["currentPage"]>(initialRoute.page);
  const [selectedLessonId, setSelectedLessonId] = useState<string>(
    "lessonId" in initialRoute ? initialRoute.lessonId : "a1-l1",
  );
  const [initialLessonTab, setInitialLessonTab] = useState<BottomTab | undefined>(
    initialRoute.page === "lesson-detail" ? initialRoute.tab : undefined,
  );
  const [activeExerciseCategory, setActiveExerciseCategory] = useState<"nguphap" | "nghe" | "doc">(
    initialRoute.page === "quiz" ? initialRoute.category : "nguphap",
  );
```

Thêm import:

```tsx
import { parseRoute, serializeRoute, isProtectedPage, type AppRoute } from "./lib/router";
```

- [ ] **Step 2: Dựng `currentRoute` và đẩy lên URL**

Thêm ngay sau khối state trên:

```tsx
  const currentRoute: AppRoute = useMemo(() => {
    if (currentPage === "lesson-detail") {
      return { page: "lesson-detail", lessonId: selectedLessonId, tab: initialLessonTab };
    }
    if (currentPage === "quiz") {
      return { page: "quiz", lessonId: selectedLessonId, category: activeExerciseCategory };
    }
    return { page: currentPage as "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" };
  }, [currentPage, selectedLessonId, initialLessonTab, activeExerciseCategory]);

  // State -> URL. So sánh trước khi push để popstate không kích hoạt vòng lặp:
  // sau khi popstate set lại state, serializeRoute đã bằng đúng pathname.
  useEffect(() => {
    const path = serializeRoute(currentRoute);
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
    }
  }, [currentRoute]);

  // URL -> state, cho nút Back/Forward của trình duyệt.
  useEffect(() => {
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname);
      setCurrentPage(route.page);
      if ("lessonId" in route) setSelectedLessonId(route.lessonId);
      setInitialLessonTab(route.page === "lesson-detail" ? route.tab : undefined);
      if (route.page === "quiz") setActiveExerciseCategory(route.category);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
```

- [ ] **Step 3: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Kiểm chứng trên dev server**

Đăng nhập, đi Dashboard → Lộ trình → mở một bài → vào bài tập. Thanh địa chỉ phải lần lượt thành `/dashboard`, `/roadmap`, `/lesson/<id>`, `/quiz/<id>/nguphap`. Bấm Back nhiều lần phải lùi đúng từng bước, Forward tiến lại đúng. Kiểm tra console không có warning về update vòng lặp.

Lưu ý: refresh ở `/lesson/<id>` lúc này **vẫn** có thể văng về dashboard — Task 10 mới sửa. Chưa cần đạt ở bước này.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): đồng bộ hai chiều giữa trang hiện tại và URL"
```

---

## Task 10: Giữ nguyên trang khi refresh & deep-link lúc chưa đăng nhập

**Files:**
- Modify: `src/App.tsx:79-110` (auth effect), `:118-125` (`handleNavigate`), `:196-197` (`showNav`/`showSidebar`), toàn bộ điều kiện render `currentPage === "..."`
- Modify: `src/lib/auth.ts:15-20` (`signInWithGoogle`)

**Interfaces:**
- Consumes: `isProtectedPage(page: AppPage): boolean` (Task 8).
- Produces: `effectivePage` trong scope `App` — mọi điều kiện render dùng biến này thay cho `currentPage`.

URL chính là bộ nhớ deep-link: vào `/lesson/a1-l3` khi chưa đăng nhập thì **không đổi URL**, chỉ render màn hình đăng nhập. Đăng nhập xong (kể cả qua Google, vốn reload cả trang) URL vẫn là `/lesson/a1-l3` nên vào thẳng đúng bài — không cần lưu `redirectTo` ở đâu cả.

- [ ] **Step 1: Bỏ ép về dashboard khi khôi phục session**

Trong `supabase.auth.getSession().then(...)`, thay `setCurrentPage("dashboard");` bằng:

```tsx
        // Chỉ đưa về dashboard khi URL không trỏ tới trang cụ thể nào.
        // replaceState (không phải push) để nút Back không kẹt vòng lặp.
        const route = parseRoute(window.location.pathname);
        if (route.page === "landing" || route.page === "login") {
          setCurrentPage("dashboard");
          window.history.replaceState(null, "", "/dashboard");
        }
```

Nhánh `onAuthStateChange` đã đúng (`prev === "landing" || prev === "login"`) — **giữ nguyên**.

- [ ] **Step 2: Bỏ chặn điều hướng trong `handleNavigate`**

Thay:

```tsx
  const handleNavigate = (page: AppState["currentPage"]) => {
    if (!user && (page === "dashboard" || page === "roadmap" || page === "lesson-detail" || page === "quiz" || page === "leaderboard")) {
      setCurrentPage("login");
    } else {
      setCurrentPage(page);
    }
  };
```

bằng:

```tsx
  // Không ép sang "login" nữa: URL đích được giữ nguyên và effectivePage lo
  // việc render màn hình đăng nhập, nhờ đó đăng nhập xong là vào thẳng đích.
  const handleNavigate = (page: AppState["currentPage"]) => {
    setCurrentPage(page);
  };
```

- [ ] **Step 3: Thêm `effectivePage`**

Ngay trên `if (authLoading)`:

```tsx
  // Trang thực sự được render. Khi chưa đăng nhập mà URL trỏ tới trang cần
  // quyền, ta render màn hình đăng nhập nhưng KHÔNG đổi URL — URL chính là
  // nơi ghi nhớ đích đến, sống sót qua cả lần reload của OAuth.
  const effectivePage: AppState["currentPage"] =
    !user && isProtectedPage(currentPage) ? "login" : currentPage;
```

- [ ] **Step 4: Đổi mọi điều kiện render sang `effectivePage`**

Trong phần JSX, thay **tất cả** `currentPage === ` thành `effectivePage === `, gồm cả:

```tsx
  const showModulesLoader = user && modulesLoading && modules.length === 0 &&
    (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail");

  const showNav = effectivePage !== "login";
  const showSidebar = user && (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail");
```

và prop `currentPage` truyền vào `<Navbar>` / `<Sidebar>` đổi thành `currentPage={effectivePage}`.

Riêng `key` của `motion.div` cũng đổi:

```tsx
              key={effectivePage + (effectivePage === "lesson-detail" ? selectedLessonId : "")}
```

- [ ] **Step 5: Sửa redirect của đăng nhập Google**

Trong `src/lib/auth.ts`:

```ts
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    // href chứ không phải origin: OAuth reload cả trang, nên URL đích phải
    // được giữ lại thì deep-link mới quay về đúng chỗ sau khi đăng nhập.
    options: { redirectTo: window.location.href }
  })
}
```

- [ ] **Step 6: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Kiểm chứng trên dev server**

1. Đăng nhập, vào `/roadmap`, refresh → vẫn ở Lộ trình, **không** về trang chủ.
2. Vào một bài học, refresh → vẫn ở đúng bài, có spinner trong lúc chờ modules rồi hiện nội dung (không nháy thông báo "Bài học không khả dụng").
3. Đăng xuất, dán thẳng `/lesson/<id>` vào thanh địa chỉ → hiện màn hình đăng nhập, **URL vẫn là `/lesson/<id>`**.
4. Đăng nhập bằng email ở màn hình đó → vào thẳng đúng bài.
5. Mở `/` khi đang đăng nhập → chuyển sang `/dashboard`, bấm Back không bị kẹt vòng lặp.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/lib/auth.ts
git commit -m "fix(app): refresh giữ nguyên trang, deep-link chờ đăng nhập rồi vào đúng đích"
```

---

## Task 11: Chặn deep-link vào bài đang khóa

**Files:**
- Modify: `src/App.tsx` — thêm memo + effect sau `orderedLessons` (Task 7)

**Interfaces:**
- Consumes: `orderedLessons` (Task 7), `computeLessonStatuses` (`completion.ts`), `showToast` (đã import sẵn).
- Produces: không có gì cho task sau.

Không có bước này thì URL trở thành đường vòng qua toàn bộ cơ chế khóa mà Task 1–7 vừa sửa.

- [ ] **Step 1: Thêm bảng trạng thái và effect chặn**

Ngay dưới `const { orderedLessons } = useMemo(...)`:

```tsx
  const lessonStatuses = useMemo(
    () => computeLessonStatuses(orderedLessons, stats.completedLessons),
    [orderedLessons, stats.completedLessons],
  );

  // Deep-link vào bài chưa mở khóa thì đẩy về Lộ trình. Chỉ xét sau khi
  // modules đã tải xong, nếu không sẽ chặn nhầm lúc dữ liệu chưa về.
  useEffect(() => {
    if (!user || modulesLoading) return;
    if (currentPage !== "lesson-detail" && currentPage !== "quiz") return;
    if (lessonStatuses[selectedLessonId] !== "locked") return;
    showToast("Hãy hoàn thành bài học trước để mở bài này.", "warning");
    setCurrentPage("roadmap");
  }, [user, modulesLoading, currentPage, selectedLessonId, lessonStatuses]);
```

Thêm `computeLessonStatuses` vào import từ `./lib/completion` (nếu file chưa import gì từ đó thì thêm dòng import mới).

- [ ] **Step 2: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Kiểm chứng trên dev server**

1. Dán URL của một bài xa phía sau (chưa mở khóa) → hiện toast "Hãy hoàn thành bài học trước để mở bài này." và chuyển về `/roadmap`.
2. Dán URL của bài đang học hoặc bài đã xong → vào bình thường, **không** có toast.
3. Refresh ngay tại một bài hợp lệ → không bị đẩy đi trong lúc modules đang tải.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "fix(app): chặn deep-link vào bài học chưa mở khóa"
```

---

## Task 12: Đổi tab trong bài học cập nhật URL

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:22-29` (props), `:60-62` (state tab), thêm effect đồng bộ, sửa handler đổi tab
- Modify: `src/App.tsx` — truyền `onTabChange`

**Interfaces:**
- Consumes: `initialLessonTab` / `setInitialLessonTab` trong `App` (Task 9).
- Produces: `LessonDetailPageProps.onTabChange?: (tab: BottomTab) => void`

- [ ] **Step 1: Thêm prop**

Trong `interface LessonDetailPageProps`, thêm:

```ts
  onTabChange?: (tab: BottomTab) => void;
```

và thêm `onTabChange,` vào destructure props của component.

- [ ] **Step 2: Đồng bộ khi `initialTab` đổi từ bên ngoài**

Thêm ngay dưới khai báo `const [bottomTab, setBottomTab] = useState<BottomTab>(...)`:

```tsx
  // Nút Back/Forward của trình duyệt đổi initialTab từ bên ngoài — kéo tab
  // hiển thị theo. Không tạo vòng lặp: giá trị set vào bằng đúng giá trị vừa
  // báo lên qua onTabChange nên effect chạy lại cũng không đổi gì.
  React.useEffect(() => {
    if (initialTab && visibleTabs.some((t) => t.id === initialTab)) {
      setBottomTab(initialTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
```

Nếu file đang `import React, { useState } from "react";` thì đổi thành `import React, { useState, useEffect } from "react";` và dùng `useEffect(...)` cho nhất quán với phần còn lại của file.

- [ ] **Step 3: Báo lên khi người dùng đổi tab**

Khai báo handler chung, đặt trước phần `return` của component:

```tsx
  const handleSelectTab = (tab: BottomTab) => {
    setBottomTab(tab);
    onTabChange?.(tab);
  };
```

Rồi tại `src/pages/LessonDetailPage.tsx:161` (bên trong `visibleTabs.map(({ id, label, Icon }) => (`), đổi:

```tsx
              onClick={() => setBottomTab(id)}
```

thành:

```tsx
              onClick={() => handleSelectTab(id)}
```

- [ ] **Step 4: Nối dây ở `App.tsx`**

Trong `<LessonDetailPage ... />`, thêm:

```tsx
                  onTabChange={setInitialLessonTab}
```

- [ ] **Step 5: Type check**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Kiểm chứng trên dev server**

Mở một bài, bấm sang tab Hören → URL thành `/lesson/<id>/nghe`. Refresh → vẫn ở tab Hören. Bấm Back → quay lại tab trước đó và URL đổi theo.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LessonDetailPage.tsx src/App.tsx
git commit -m "feat(lesson): tab đang xem được phản ánh vào URL"
```

---

## Task 13: Chạy toàn bộ kiểm thử và rà lại

**Files:** không sửa file nào trừ khi phát hiện lỗi.

- [ ] **Step 1: Chạy tất cả test thuần**

```bash
for f in src/lib/*.test.ts; do echo "--- $f"; npx tsx "$f" || exit 1; done
```

Expected: mọi file in ra dòng OK của nó, exit code 0.

- [ ] **Step 2: Type check và build**

```bash
npm run lint && npm run build
```

Expected: cả hai PASS.

- [ ] **Step 3: Rà lại đường đi chính trên dev server**

Chạy qua danh sách sau, mỗi mục phải đạt:

1. Làm xong bài tập ngữ pháp của một bài chỉ có ngữ pháp → bài hiện "Đã xong", bài kế tiếp mở.
2. Bài có file nghe nhưng chưa soạn câu hỏi nghe → xong ngữ pháp là "Đã xong".
3. Bài draft nằm giữa Lộ trình → không khóa bài phía sau.
4. Nút "Bài tiếp theo" đi đúng bài kế tiếp trên Lộ trình.
5. Refresh ở `/dashboard`, `/roadmap`, `/lesson/<id>`, `/lesson/<id>/nghe`, `/quiz/<id>/nguphap`, `/leaderboard` → đều giữ nguyên trang.
6. Back/Forward của trình duyệt hoạt động đúng ở mọi bước.
7. Deep-link khi chưa đăng nhập → login xong vào đúng đích (thử cả email và Google).
8. Deep-link vào bài khóa → toast + về Lộ trình.
9. Console trình duyệt không có error hay warning mới.

- [ ] **Step 4: Commit nếu có sửa**

```bash
git add -A
git commit -m "fix: xử lý các vấn đề phát hiện khi rà cuối"
```

(Bỏ qua bước này nếu không có gì phải sửa.)

---

## Ngoài scope

- Dựng luồng đặt lại mật khẩu tại `/reset-password` (hiện map về màn hình đăng nhập, giữ đúng hành vi trước khi có router).
- Viết helper `safeStorage`.
- Thêm `react-router-dom`.
- Thêm script `test` vào `package.json`.
