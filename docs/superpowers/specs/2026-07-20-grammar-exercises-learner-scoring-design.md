# Trang học viên + chấm điểm cho 6 dạng bài tập ngữ pháp mới

## Bối cảnh

Sub-project tiếp theo sau khi đã (a) xây xong Admin CRUD cho `grammar_exercises` (PR #50) và (b) gộp tab "Ngữ pháp" trong Admin để quản lý 6 dạng bài mới thay cho `quiz_questions` category nguphap (spec `2026-07-20-merge-grammar-exercises-into-quiz-tab-design.md`).

Yêu cầu: category `nguphap` phía **học viên** cũng phải chuyển hẳn sang dùng `grammar_exercises` — có trang làm bài thật cho cả 6 dạng, chấm điểm, ngưỡng hoàn thành **>80%** giống hệ thống quiz cũ (`quiz-submit`).

## Quyết định thiết kế đã chốt

- **Trang riêng, không nhồi vào `QuizPage.tsx`**: tạo `GrammarExercisePage.tsx` mới. Trong `App.tsx`, khi `activeExerciseCategory === "nguphap"` render trang này; `"nghe"`/`"doc"` vẫn render `QuizPage` như cũ (không đổi).
- **View public mới** `grammar_exercises_public`: ẩn `correct_answer` và group đúng của từng item trong `classification_items` (chỉ lộ tên item, không lộ nhóm đúng) — mirror `quiz_questions_public`.
- **Chấm điểm**: Edge Function mới `grammar-submit`, mirror gần như y hệt `quiz-submit` (đọc bảng gốc `grammar_exercises` bằng service_role, tính điểm, `PASS_THRESHOLD = 80`, `XP_REWARD = 30`, upsert `lesson_progress` với `category: "nguphap"` — **tái dùng đúng category cũ**, chỉ đổi nguồn dữ liệu).
- **Độ chặt so khớp**: chuẩn hóa cả 2 bên (lowercase, bỏ `.,!?`, trim) trước khi so — dùng lại đúng hàm `normalizeWord` đã có ở Admin (`AdminGrammarExerciseSection.tsx`), viết lại bản Deno tương đương trong Edge Function (không thể import trực tiếp giữa 2 runtime).
- **classification chấm theo từng item** (partial credit), không phải cả câu đúng/sai toàn phần — mirror đúng cách `computeQuizScore` hiện có chấm multi-blank fill-blank (1 đơn vị điểm / 1 blank). Mỗi item đúng nhóm = 1 đơn vị đúng; tổng số đơn vị của 1 câu classification = số item.
- **word_reorder chấm bằng so chuỗi**: học viên click chọn token theo thứ tự → ghép thành 1 chuỗi bằng khoảng trắng → chuẩn hóa rồi so với `correct_answer` đã chuẩn hóa. Không cần thêm cột DB nào.
- **Định dạng answer gửi lên cho classification**: dùng chuỗi `"item1:group1|item2:group2"` (dấu `:` nối item-group, dấu `|` nối các cặp) — nhất quán với quy ước dùng `|` làm delimiter đã có sẵn trong codebase (multi-blank fill-blank, matching pairs).

## Thiết kế chi tiết

### 1. Migration `supabase/migrations/<timestamp>_grammar_exercises_public_view.sql`

```sql
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

Lưu ý: `classification_items` trong view này có **shape khác** bảng gốc — là `string[]` (chỉ tên item, vd `["Tisch","Lampe","Buch"]`), không phải `{item,group}[]`. Không lộ group đúng.

Áp dụng qua Supabase MCP (`apply_migration`) vào project "Deutsch", sau đó `generate_typescript_types` để cập nhật `database.types.ts` (view mới).

### 2. `src/lib/appTypes.ts` — thêm type mới

```ts
export interface GrammarExercise {
  id: string;
  lessonId: string;
  type: "word_reorder" | "error_correction" | "translation" | "sentence_transformation" | "guided_sentence_writing" | "classification";
  promptText?: string;
  transformationHint?: string;
  tokens?: string[];
  classificationGroups?: string[];
  classificationItems?: string[]; // tên item, KHÔNG có group đúng
  explanation: string;
}
```

### 3. `src/lib/hooks/useGrammarExercises.ts` (file mới, mirror `useQuizQuestions.ts`)

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

### 4. `supabase/functions/grammar-submit/` (Edge Function mới, mirror `quiz-submit/`)

`scoring.ts`:

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

`index.ts` — copy cấu trúc `quiz-submit/index.ts` gần như nguyên văn, đổi:
- Bảng đọc: `grammar_exercises` thay vì `quiz_questions`, cột select: `id, type, correct_answer, classification_items`.
- Bỏ tham số `category` trong request body (không cần — `grammar_exercises` không có cột category).
- `computeGrammarScore` thay cho `computeQuizScore`.
- Upsert `lesson_progress` cố định `category: "nguphap"`.
- Giữ nguyên `PASS_THRESHOLD = 80`, `XP_REWARD = 30`, idempotency check theo `(user_id, lesson_id, category)`.

Cần deploy Edge Function này qua Supabase MCP (`deploy_edge_function`) vì sandbox không có Docker/CLI để deploy local.

### 5. `src/pages/GrammarExercisePage.tsx` (file mới)

Props tương tự `QuizPage`:
```ts
interface GrammarExercisePageProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}
```

Luồng UI (mirror cấu trúc bước-qua-từng-câu của `QuizPage.tsx`):
- Dùng `useGrammarExercises(lesson.id)`.
- State: `currentIdx`, `answers: Record<string,string>`.
- Render theo `type` của câu hiện tại:
  - **word_reorder**: hiện `tokens` dạng chip theo đúng thứ tự đã cho; học viên bấm từng chip theo thứ tự muốn ghép (chip đã chọn chuyển sang khu vực "câu đang ghép", bấm lại để bỏ chọn); nút "Xóa hết" reset. Giá trị answer = các token đã chọn nối bằng khoảng trắng.
  - **error_correction / translation / sentence_transformation / guided_sentence_writing**: hiện `promptText` (+ `transformationHint` dạng badge nếu có) phía trên, 1 ô input text tự do bên dưới.
  - **classification**: hiện danh sách `classificationItems`, mỗi item có 1 dropdown chọn 1 trong `classificationGroups`. Answer = ghép `"item:group"` từng item bằng `|` (bỏ qua item chưa chọn nhóm — coi như sai khi chấm vì group rỗng không khớp bất kỳ nhóm nào).
- Nút "Tiếp theo" lưu answer hiện tại vào `answers`, sang câu kế; câu cuối đổi thành "Nộp bài" → gọi Edge Function `grammar-submit` (`supabase.functions.invoke("grammar-submit", { body: { lesson_id, answers } })`), hiện màn hình kết quả (điểm/pass/XP) — mirror màn hình kết quả hiện có của `QuizPage`.
- Loading/error state mirror `QuizPage` (dùng `useGrammarExercises`'s `loading`/`error`).

### 6. `src/App.tsx`

Đổi khối render trang "quiz" (khoảng dòng 298):

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
+                (activeExerciseCategory === "nguphap" ? (
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
+                ))
               )}
```

Thêm import `GrammarExercisePage`.

## Ngoài phạm vi

- Không sửa `QuizPage.tsx` nội bộ (chỉ dùng cho nghe/đọc từ giờ, không còn nhận category nguphap trong thực tế — nhưng vẫn giữ khả năng nhận prop này để không phá kiểu dữ liệu hiện có).
- Không đổi cách tính XP/streak tổng thể (`user_stats`) — dùng chung cơ chế `increment_xp` RPC đã có.
- Không thêm tính năng resume/lưu tạm câu trả lời giữa các lần vào lại trang (giữ hành vi y hệt `QuizPage` hiện tại — mất tiến trình nếu thoát giữa chừng).
- Không hiển thị đáp án đúng khi làm sai (chỉ hiện điểm số cuối cùng) — mirror hành vi `QuizPage` hiện tại.

## Testing / verification

- `npm run lint` pass.
- Không có test framework — verify qua code review kỹ (do sandbox không chạy được dev server thật, đã xác nhận ở nhánh trước).
- Review kỹ đặc biệt: `computeGrammarScore` cho cả 6 loại (đối chiếu với 6 dòng seed đã tạo ở sub-project A), và view `grammar_exercises_public` không lộ `correct_answer`/group đúng của classification qua bất kỳ trường nào.
- Bạn cần tự QA thủ công luồng làm bài + nộp bài cho cả 6 loại trên môi trường có thể chạy dev server, trước khi merge.
