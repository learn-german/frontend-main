# Phase 4 (UI học viên) — QuizSetListPage cho Nghe/Đọc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang học viên mới `QuizSetListPage` (dùng chung cho Nghe/Đọc, tham số `category`) thay thế hoàn toàn `QuizPage.tsx`, đọc dữ liệu từ `grammar_exercises_public`, nộp bài qua `grammar-submit` — accordion set y hệt Ngữ pháp, không wizard từng câu.

**Architecture:** 1 file mới `src/pages/QuizSetListPage.tsx` (set-list wrapper + exercise body + matching sub-component, gói gọn trong 1 file như `GrammarSetListPage`+`GrammarExercisePage` đã làm mẫu). Logic parse/serialize đáp án `text_fill_blank`/`matching` tách thành module thuần `src/lib/quizAnswerCodec.ts` có test. `appTypes.ts`/`useGrammarExercises.ts` mở rộng thêm field mới (không đổi hành vi Grammar).

**Tech Stack:** React 19 + TypeScript, Tailwind v4 — không thay đổi tech stack.

## Global Constraints

- **Không sửa** `GrammarSetListPage.tsx`/`GrammarExercisePage.tsx` — chỉ tham khảo làm mẫu.
- **Không sửa** `grammar-submit`, `exercise_sets`/`exercise_set_attempts`/`exercise_set_drafts`, `useExerciseSets`/`useExerciseSetAttempt(s)`/`useExerciseSetDraft` — tái dùng nguyên.
- Plan này **chỉ làm UI học viên**. Admin UI (viết lại `AdminQuizSection.tsx`) là plan riêng kế tiếp — tới lúc plan này xong, admin chưa có set/câu hỏi Nghe/Đọc thật để test tay; xác nhận bằng lint/test/build, test tay dời sau khi có admin UI.

---

### Task 1: `src/lib/quizAnswerCodec.ts` — parse/serialize đáp án (TDD)

**Files:**
- Create: `src/lib/quizAnswerCodec.ts`
- Create: `src/lib/quizAnswerCodec.test.ts`

**Interfaces:**
- Produces: `joinBlankAnswers(values: string[]): string`, `splitBlankAnswers(raw: string, count: number): string[]`, `serializeMatching(pairs: Record<string,string>): string`, `parseMatching(raw: string): Record<string,string>` — Task 3 (QuizSetListPage) import cả 4 hàm này.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/quizAnswerCodec.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching } from "./quizAnswerCodec";

test("joinBlankAnswers: ghép và trim từng ô", () => {
  assert.equal(joinBlankAnswers([" bin ", "Bin"]), "bin|Bin");
});

test("splitBlankAnswers: tách đúng số ô, thiếu thì điền rỗng", () => {
  assert.deepEqual(splitBlankAnswers("bin|falsch", 2), ["bin", "falsch"]);
  assert.deepEqual(splitBlankAnswers("bin", 2), ["bin", ""]);
  assert.deepEqual(splitBlankAnswers("", 2), ["", ""]);
});

test("serializeMatching: sort theo de để ổn định", () => {
  assert.equal(
    serializeMatching({ "die Lampe": "cái đèn", "der Tisch": "cái bàn" }),
    "der Tisch:cái bàn|die Lampe:cái đèn",
  );
});

test("parseMatching: tách map de->vi, bỏ qua cặp hỏng", () => {
  assert.deepEqual(parseMatching("der Tisch:cái bàn|die Lampe:cái đèn"), {
    "der Tisch": "cái bàn",
    "die Lampe": "cái đèn",
  });
  assert.deepEqual(parseMatching(""), {});
  assert.deepEqual(parseMatching("hỏng"), {});
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

```bash
npx tsx --test src/lib/quizAnswerCodec.test.ts
```
Kỳ vọng: FAIL (`quizAnswerCodec.ts` chưa tồn tại).

- [ ] **Step 3: Cài đặt**

Tạo `src/lib/quizAnswerCodec.ts`:

```ts
/** Ghép các ô trống text_fill_blank thành 1 chuỗi gửi lên server, theo thứ tự. */
export function joinBlankAnswers(values: string[]): string {
  return values.map((v) => v.trim()).join("|");
}

/** Tách chuỗi đáp án đã lưu (draft/attempt) thành mảng theo đúng số ô trống. */
export function splitBlankAnswers(raw: string, count: number): string[] {
  if (!raw) return Array(count).fill("");
  const parts = raw.split("|");
  return Array.from({ length: count }, (_, i) => parts[i] ?? "");
}

/** Ghép các cặp đã ghép đúng thành chuỗi gửi lên server — sort theo "de" để ổn định (khớp normalizeMatching phía grammar-submit dù thứ tự có khác cũng vẫn chấm đúng, sort chỉ để debug dễ đọc). */
export function serializeMatching(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([de, vi]) => `${de}:${vi}`)
    .join("|");
}

/** Tách chuỗi đáp án matching đã lưu thành map de -> vi. */
export function parseMatching(raw: string): Record<string, string> {
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const pair of raw.split("|")) {
    const [de, vi] = pair.split(":");
    if (de && vi) result[de] = vi;
  }
  return result;
}
```

- [ ] **Step 4: Chạy lại test, xác nhận pass**

```bash
npx tsx --test src/lib/quizAnswerCodec.test.ts
```
Kỳ vọng: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quizAnswerCodec.ts src/lib/quizAnswerCodec.test.ts
git commit -m "feat(quiz): quizAnswerCodec — parse/serialize đáp án text_fill_blank + matching"
```

---

### Task 2: Mở rộng `appTypes.ts` + `useGrammarExercises.ts`

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useGrammarExercises.ts`

**Interfaces:**
- Produces: `GrammarExercise.type` thêm `"text_fill_blank" | "matching"`; thêm field `audioClipId?: string`, `readingPassageId?: string`, `matchingPairs?: { de: string; vi: string }[]`. `useGrammarExercises` trả về các field này (populate từ view).

- [ ] **Step 1: Sửa `GrammarExercise` interface**

Tìm trong `src/lib/appTypes.ts`:

```ts
export interface GrammarExercise {
  id: string;
  lessonId: string;
  orderIndex: number;
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank"
    | "multiple_choice";
  groupId?: string;
  hint?: string;
  promptText?: string;
  transformationHint?: string;
  tokens?: string[];
  classificationGroups?: string[];
  classificationItems?: string[];
  wordBank?: { words: string[]; mode: "single_use" | "multiple_use" };
  options?: string[];
  explanation: string;
}
```

Thay bằng:

```ts
export interface GrammarExercise {
  id: string;
  lessonId: string;
  orderIndex: number;
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank"
    | "multiple_choice"
    | "text_fill_blank"
    | "matching";
  groupId?: string;
  hint?: string;
  promptText?: string;
  transformationHint?: string;
  tokens?: string[];
  classificationGroups?: string[];
  classificationItems?: string[];
  wordBank?: { words: string[]; mode: "single_use" | "multiple_use" };
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  audioClipId?: string;
  readingPassageId?: string;
  explanation: string;
}
```

- [ ] **Step 2: Sửa `useGrammarExercises.ts` — select thêm cột, map thêm field**

Tìm:

```ts
    supabase
      .from("grammar_exercises_public")
      .select("id, lesson_id, type, group_id, hint, prompt_text, transformation_hint, tokens, classification_groups, classification_items, word_bank, options, order_index")
      .eq("set_id", setId)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setExercises(
            (data ?? []).map((e) => ({
              id: e.id as string,
              lessonId: e.lesson_id as string,
              orderIndex: e.order_index as number,
              type: e.type as GrammarExercise["type"],
              groupId: (e.group_id as string | null) ?? undefined,
              hint: (e.hint as string | null) ?? undefined,
              promptText: (e.prompt_text as string | null) ?? undefined,
              transformationHint: (e.transformation_hint as string | null) ?? undefined,
              tokens: (e.tokens as string[] | null) ?? undefined,
              classificationGroups: (e.classification_groups as string[] | null) ?? undefined,
              classificationItems: (e.classification_items as string[] | null) ?? undefined,
              wordBank: (e.word_bank as GrammarExercise["wordBank"] | null) ?? undefined,
              options: normalizeOptionsFromDb(e.options),
              explanation: "",
            })),
          );
        }
        setLoading(false);
      });
```

Thay bằng:

```ts
    supabase
      .from("grammar_exercises_public")
      .select("id, lesson_id, type, group_id, hint, prompt_text, transformation_hint, tokens, classification_groups, classification_items, word_bank, options, matching_pairs, audio_clip_id, reading_passage_id, order_index")
      .eq("set_id", setId)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setExercises(
            (data ?? []).map((e) => ({
              id: e.id as string,
              lessonId: e.lesson_id as string,
              orderIndex: e.order_index as number,
              type: e.type as GrammarExercise["type"],
              groupId: (e.group_id as string | null) ?? undefined,
              hint: (e.hint as string | null) ?? undefined,
              promptText: (e.prompt_text as string | null) ?? undefined,
              transformationHint: (e.transformation_hint as string | null) ?? undefined,
              tokens: (e.tokens as string[] | null) ?? undefined,
              classificationGroups: (e.classification_groups as string[] | null) ?? undefined,
              classificationItems: (e.classification_items as string[] | null) ?? undefined,
              wordBank: (e.word_bank as GrammarExercise["wordBank"] | null) ?? undefined,
              options: normalizeOptionsFromDb(e.options),
              matchingPairs: (e.matching_pairs as { de: string; vi: string }[] | null) ?? undefined,
              audioClipId: (e.audio_clip_id as string | null) ?? undefined,
              readingPassageId: (e.reading_passage_id as string | null) ?? undefined,
              explanation: "",
            })),
          );
        }
        setLoading(false);
      });
```

- [ ] **Step 3: `npm run lint`**

Kỳ vọng: sạch (thêm field optional không phá code hiện có; `GrammarExercisePage.tsx` không tham chiếu 2 type mới nên không bị ảnh hưởng).

- [ ] **Step 4: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useGrammarExercises.ts
git commit -m "feat(quiz): mở rộng GrammarExercise + useGrammarExercises cho text_fill_blank/matching"
```

---

### Task 3: `src/pages/QuizSetListPage.tsx` — trang học viên Nghe/Đọc

**Files:**
- Create: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: `useExerciseSets`, `useExerciseSetAttempt(s)`, `useExerciseSetDraft`, `useGrammarExercises`, `useMediaPlaybackUrl`, `MultipleChoiceOptions`, `quizAnswerCodec` (Task 1), `GrammarExercise`/`Lesson` (Task 2).
- Produces: `export const QuizSetListPage: React.FC<{ lesson: Lesson; category: "nghe" | "doc"; onBackToLesson: () => void; onSetFinished: (lessonQuizScore: number, xpEarned: number) => void; }>` — Task 4 (`App.tsx`) dùng đúng props này.

- [ ] **Step 1: Tạo file**

```tsx
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, RotateCcw, Headphones } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { MultipleChoiceOptions } from "../components/MultipleChoiceOptions";
import { GrammarExercise, Lesson } from "../lib/appTypes";
import { useExerciseSets, type ExerciseSet } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempt, useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { useExerciseSetDraft } from "../lib/hooks/useExerciseSetDraft";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";
import { pickHydrateSource } from "../lib/exerciseSetDraftLogic";
import { joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching } from "../lib/quizAnswerCodec";
import { supabase } from "../lib/supabase";

interface QuizSetListPageProps {
  lesson: Lesson;
  category: "nghe" | "doc";
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}

interface QuizResult {
  score: number;
  total: number;
  correct: number;
  isPassed: boolean;
  revealed: boolean;
  xpEarned: number;
  bestScore: number;
  attemptCount: number;
  lessonQuizScore: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  explanations?: Record<string, string>;
}

const QUIZ_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Trắc nghiệm",
  text_fill_blank: "Điền vào chỗ trống",
  matching: "Ghép cặp",
};

function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{blank\}\}/g) ?? []).length;
}

/** Click-để-ghép: chọn 1 từ Đức + 1 nghĩa Việt, khớp đúng thì khoá lại. Xáo trộn 1 lần khi mount (useMemo theo `pairs`, không đổi lại giữa các lần render). */
const MatchingExercise: React.FC<{
  pairs: { de: string; vi: string }[];
  matched: Record<string, string>;
  onMatch: (de: string, vi: string) => void;
}> = ({ pairs, matched, onMatch }) => {
  const [selectedDe, setSelectedDe] = useState("");
  const [selectedVi, setSelectedVi] = useState("");
  const shuffledDe = useMemo(() => [...pairs.map((p) => p.de)].sort(() => Math.random() - 0.5), [pairs]);
  const shuffledVi = useMemo(() => [...pairs.map((p) => p.vi)].sort(() => Math.random() - 0.5), [pairs]);

  React.useEffect(() => {
    if (!selectedDe || !selectedVi) return;
    onMatch(selectedDe, selectedVi);
    setSelectedDe("");
    setSelectedVi("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDe, selectedVi]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        {shuffledDe.map((de) => {
          const isMatched = !!matched[de];
          return (
            <button
              key={de}
              type="button"
              disabled={isMatched}
              onClick={() => setSelectedDe(de)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-bold text-center transition-colors ${
                isMatched
                  ? "bg-green-50 border-green-200 text-green-700 opacity-60 cursor-not-allowed"
                  : selectedDe === de
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {de}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {shuffledVi.map((vi) => {
          const isMatched = Object.values(matched).includes(vi);
          return (
            <button
              key={vi}
              type="button"
              disabled={isMatched}
              onClick={() => setSelectedVi(vi)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold text-center transition-colors ${
                isMatched
                  ? "bg-green-50 border-green-200 text-green-700 opacity-60 cursor-not-allowed"
                  : selectedVi === vi
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {vi}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const QuizExerciseSetBody: React.FC<{
  lesson: Lesson;
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
}> = ({ lesson, set, onSetFinished, onCollapse }) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(set.id);
  const { attempt, loading: attemptLoading } = useExerciseSetAttempt(set.id);
  const { draft, loading: draftLoading, saveDraft, deleteDraft } = useExerciseSetDraft(set.id);

  const [choiceByExercise, setChoiceByExercise] = useState<Record<string, number>>({});
  const [blankValuesByExercise, setBlankValuesByExercise] = useState<Record<string, string[]>>({});
  const [matchedPairsByExercise, setMatchedPairsByExercise] = useState<Record<string, Record<string, string>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  const submissionIdRef = React.useRef(crypto.randomUUID());

  const hydrateSource = pickHydrateSource(draft !== null, attempt !== null);

  const applyAnswers = (answers: Record<string, string>) => {
    const choices: Record<string, number> = {};
    const blanks: Record<string, string[]> = {};
    const matches: Record<string, Record<string, string>> = {};
    for (const exercise of exercises) {
      const raw = answers[exercise.id] ?? "";
      if (exercise.type === "multiple_choice") {
        if (/^\d+$/.test(raw)) choices[exercise.id] = Number(raw);
      } else if (exercise.type === "text_fill_blank") {
        blanks[exercise.id] = splitBlankAnswers(raw, countBlankTokens(exercise.promptText ?? ""));
      } else if (exercise.type === "matching") {
        matches[exercise.id] = parseMatching(raw);
      }
    }
    setChoiceByExercise(choices);
    setBlankValuesByExercise(blanks);
    setMatchedPairsByExercise(matches);
  };

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "attempt" || !attempt) return;
    setResult({
      score: attempt.score,
      total: attempt.total,
      correct: Math.round((attempt.score / 100) * attempt.total),
      isPassed: attempt.isPassed,
      revealed: attempt.revealed,
      xpEarned: 0,
      bestScore: attempt.bestScore,
      attemptCount: attempt.attemptCount,
      lessonQuizScore: 0,
      blankResults: attempt.blankResults,
      choiceResults: attempt.choiceResults,
      exerciseResults: attempt.exerciseResults,
    });
    applyAnswers(attempt.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, retrying, exercises, hydrateSource]);

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "draft" || !draft) return;
    applyAnswers(draft.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, retrying, exercises, hydrateSource]);

  const getAnswerStringFor = (exercise: GrammarExercise): string => {
    if (exercise.type === "multiple_choice") {
      const index = choiceByExercise[exercise.id];
      return index === undefined ? "" : String(index);
    }
    if (exercise.type === "text_fill_blank") {
      const count = countBlankTokens(exercise.promptText ?? "");
      const values = blankValuesByExercise[exercise.id] ?? Array(count).fill("");
      if (values.length === 0 || values.some((v) => !v.trim())) return "";
      return joinBlankAnswers(values);
    }
    if (exercise.type === "matching") {
      const pairs = matchedPairsByExercise[exercise.id] ?? {};
      const total = exercise.matchingPairs?.length ?? 0;
      if (total === 0 || Object.keys(pairs).length < total) return "";
      return serializeMatching(pairs);
    }
    return "";
  };

  const allAnswered = exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
  const collectAllAnswers = (): Record<string, string> =>
    Object.fromEntries(exercises.map((exercise) => [exercise.id, getAnswerStringFor(exercise)]));

  React.useEffect(() => {
    if (result !== null || exercises.length === 0) return;
    const timer = setTimeout(() => { saveDraft(collectAllAnswers()); }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceByExercise, blankValuesByExercise, matchedPairsByExercise, result]);

  const handleSubmit = async () => {
    const finalAnswers = collectAllAnswers();
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.functions.invoke("grammar-submit", {
      body: { set_id: set.id, submission_id: submissionIdRef.current, answers: finalAnswers },
    });
    setSubmitting(false);
    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }
    const res = data as QuizResult;
    setResult(res);
    deleteDraft();
    onSetFinished(res.lessonQuizScore, res.xpEarned);
  };

  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setChoiceByExercise({});
    setBlankValuesByExercise({});
    setMatchedPairsByExercise({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
  };

  const firstExercise = exercises[0];
  const clip = firstExercise?.audioClipId
    ? lesson.listeningClips.find((c) => c.id === firstExercise.audioClipId)
    : undefined;
  const passage = firstExercise?.readingPassageId
    ? lesson.readingPassages.find((p) => p.id === firstExercise.readingPassageId)
    : undefined;
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", clip?.r2Key, clip?.id);

  const awaitingHydration = hydrateSource === "attempt" && !retrying && exercises.length > 0 && result === null;

  if (exercisesLoading || attemptLoading || draftLoading || awaitingHydration) {
    return (
      <div className="flex items-center justify-center min-h-32">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (exercisesError || exercises.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">Bài tập cho phần này chưa được soạn.</p>
      </div>
    );
  }

  if (result) {
    const { score, total, correct, isPassed, revealed, xpEarned } = result;
    return (
      <div
        id="quiz-result-card"
        className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
      >
        <div className="space-y-2">
          {isPassed ? (
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="w-20 h-20 bg-rose-50 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">
              😟
            </div>
          )}
          <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight leading-normal">
            {isPassed ? "Xuất sắc! Bạn đã vượt qua!" : "Cố gắng chút nữa nhé!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-sans leading-normal">
            {isPassed
              ? "Tuyệt vời, bạn đã tiếp thu bài học cực tốt và sẵn sàng mở khóa các lớp thử thách tiếp theo!"
              : "Để hoàn thiện bài học, bạn cần đạt tối thiểu 80% điểm số. Đừng nản lòng nhé!"}
          </p>
        </div>

        <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 max-w-xs mx-auto">
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">
            KẾT QUẢ ĐẠT ĐƯỢC
          </span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${isPassed ? "text-green-600" : "text-rose-600"}`}>
              {score}%
            </span>
            <span className="text-sm font-bold text-slate-500">({correct}/{total} câu)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Điểm cao nhất: <b className="text-slate-700">{result.bestScore}%</b> · Đã làm{" "}
            <b className="text-slate-700">{result.attemptCount}</b> lần
          </p>
          {xpEarned > 0 && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-green-50 text-green-700">
              +{xpEarned} XP Tích lũy
            </span>
          )}
          {!isPassed && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-rose-50 text-rose-700">
              Chưa đạt chuẩn 80%
            </span>
          )}
        </div>

        {revealed && (
          <div className="text-left space-y-3 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
              Giải thích từng câu hỏi:
            </h4>
            <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
              {exercises.map((ex, index) => (
                <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                  <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                    Câu {index + 1} · {QUIZ_TYPE_LABELS[ex.type] ?? ex.type}
                  </p>
                  {ex.type === "multiple_choice" && (
                    <div className="mb-2">
                      <MultipleChoiceOptions
                        options={ex.options ?? []}
                        selectedIndex={choiceByExercise[ex.id]}
                        onSelect={() => {}}
                        exerciseId={ex.id}
                        result={result.choiceResults?.[ex.id]}
                      />
                    </div>
                  )}
                  {ex.type === "text_fill_blank" && (
                    <div className="mb-2 text-xs leading-9 text-slate-700">
                      {(ex.promptText ?? "").split("{{blank}}").map((segment, i, segments) => (
                        <React.Fragment key={`${i}:${segment}`}>
                          <span className="whitespace-pre-wrap">{segment}</span>
                          {i < segments.length - 1 && (
                            <span
                              className={`mx-1 inline-block min-w-20 rounded-md border px-2 py-1 text-center font-bold ${
                                result.blankResults?.[ex.id]?.[i]
                                  ? "border-green-300 bg-green-50 text-green-700"
                                  : "border-red-300 bg-red-50 text-red-700"
                              }`}
                            >
                              {(blankValuesByExercise[ex.id] ?? [])[i] || "—"}
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  {ex.type === "matching" && (
                    <div className="mb-2 space-y-1">
                      {(ex.matchingPairs ?? []).map((pair) => {
                        const userVi = matchedPairsByExercise[ex.id]?.[pair.de];
                        const isRight = userVi === pair.vi;
                        return (
                          <div key={pair.de} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-slate-700">{pair.de}</span>
                            <span
                              className={`rounded-md border px-2 py-1 font-bold ${
                                isRight
                                  ? "border-green-300 bg-green-50 text-green-700"
                                  : "border-red-300 bg-red-50 text-red-700"
                              }`}
                            >
                              {userVi ?? "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {result.explanations?.[ex.id] && (
                    <p className="text-slate-500 text-[11px] leading-relaxed">
                      <b>Giải thích:</b> {result.explanations[ex.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {isPassed && (
            <Button variant="primary" className="flex-1" onClick={onCollapse}>
              Tiếp tục
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {clip && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
          </div>
          {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
          {audioPlayback.url && (
            <audio controls src={audioPlayback.url} className="w-full rounded-xl">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
          {audioPlayback.error && (
            <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>
          )}
        </div>
      )}

      {passage && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">🇩🇪 Đoạn văn</span>
          <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{passage.textDe}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((exercise, index) => (
          <div key={exercise.id} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
            <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
              Câu {index + 1} · {QUIZ_TYPE_LABELS[exercise.type] ?? exercise.type}
            </span>
            {exercise.type === "multiple_choice" && (
              <MultipleChoiceOptions
                options={exercise.options ?? []}
                selectedIndex={choiceByExercise[exercise.id]}
                onSelect={(idx) => setChoiceByExercise((prev) => ({ ...prev, [exercise.id]: idx }))}
                exerciseId={exercise.id}
              />
            )}
            {exercise.type === "text_fill_blank" && (
              <p className="text-xs leading-9 text-slate-700">
                {(exercise.promptText ?? "").split("{{blank}}").map((segment, i, segments) => (
                  <React.Fragment key={`${i}:${segment}`}>
                    <span className="whitespace-pre-wrap">{segment}</span>
                    {i < segments.length - 1 && (
                      <input
                        type="text"
                        value={(blankValuesByExercise[exercise.id] ?? [])[i] ?? ""}
                        onChange={(e) => {
                          const count = countBlankTokens(exercise.promptText ?? "");
                          const current = blankValuesByExercise[exercise.id] ?? Array(count).fill("");
                          const next = [...current];
                          next[i] = e.target.value;
                          setBlankValuesByExercise((prev) => ({ ...prev, [exercise.id]: next }));
                        }}
                        className="mx-1 inline-block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      />
                    )}
                  </React.Fragment>
                ))}
              </p>
            )}
            {exercise.type === "matching" && (
              <MatchingExercise
                pairs={exercise.matchingPairs ?? []}
                matched={matchedPairsByExercise[exercise.id] ?? {}}
                onMatch={(de, vi) => {
                  const correct = (exercise.matchingPairs ?? []).find((p) => p.de === de && p.vi === vi);
                  if (!correct) return;
                  setMatchedPairsByExercise((prev) => ({
                    ...prev,
                    [exercise.id]: { ...(prev[exercise.id] ?? {}), [de]: vi },
                  }));
                }}
              />
            )}
          </div>
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => saveDraft(collectAllAnswers())}>
          Lưu
        </Button>
        <Button variant="primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nộp bài
        </Button>
      </div>
    </div>
  );
};

const SetRow: React.FC<{
  lesson: Lesson;
  set: ExerciseSet;
  orderNumber: number;
  isPassed: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}> = ({ lesson, set, orderNumber, isPassed, isExpanded, onToggle, onSetFinished }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50"
    >
      {isExpanded ? (
        <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
      ) : (
        <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
      )}
      <span className="flex-1 text-base font-display font-black text-slate-900">Bài {orderNumber}</span>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {isPassed && <CheckCircle2 className="h-5 w-5 text-green-600" />}
        <span
          className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${
            isPassed ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
          }`}
        >
          {isPassed ? "Đã đạt" : "Chưa làm"}
        </span>
      </span>
    </button>
    {isExpanded && (
      <div className="border-t border-slate-100 p-4">
        <QuizExerciseSetBody
          lesson={lesson}
          set={{ id: set.id, title: set.title }}
          onSetFinished={onSetFinished}
          onCollapse={onToggle}
        />
      </div>
    )}
  </section>
);

export const QuizSetListPage: React.FC<QuizSetListPageProps> = ({
  lesson,
  category,
  onBackToLesson,
  onSetFinished,
}) => {
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const lessonSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lesson.id && s.category === category && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lesson.id, category],
  );
  const setIds = useMemo(() => lessonSets.map((s) => s.id), [lessonSets]);
  const { attemptsBySetId, loading: attemptsLoading } = useExerciseSetAttempts(setIds);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const title = category === "nghe" ? "Bài tập nghe" : "Bài tập đọc";

  if (setsLoading || attemptsLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title={title} onBackToLesson={onBackToLesson} />
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (lessonSets.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title={title} onBackToLesson={onBackToLesson} />
        <div className="text-center py-12">
          <p className="text-slate-500">{title} cho bài học này chưa được soạn.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ExercisePageHeader title={title} onBackToLesson={onBackToLesson} />
      <div className="space-y-3">
        {lessonSets.map((set, index) => (
          <SetRow
            key={set.id}
            lesson={lesson}
            set={set}
            orderNumber={index + 1}
            isPassed={attemptsBySetId[set.id]?.isPassed ?? false}
            isExpanded={expandedSetId === set.id}
            onToggle={() => setExpandedSetId((prev) => (prev === set.id ? null : set.id))}
            onSetFinished={onSetFinished}
          />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: `npm run lint`**

Kỳ vọng: có thể có lỗi nhỏ do gõ tay (thiếu import, sai tên field) — sửa cho tới khi sạch. Chú ý: mọi hook (`useGrammarExercises`, `useExerciseSetAttempt`, `useExerciseSetDraft`, `useState` x3, `useMediaPlaybackUrl`) trong `QuizExerciseSetBody` đều gọi TRƯỚC mọi `return` sớm (rules of hooks) — đã sắp đúng thứ tự trong code trên, không di chuyển các dòng gọi hook xuống dưới các khối `if (...) return`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat(quiz): QuizSetListPage — trang học viên Nghe/Đọc dùng chung accordion set"
```

---

### Task 4: Wire `App.tsx`, xoá `QuizPage.tsx`/`useQuizQuestions.ts`

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/QuizPage.tsx`
- Delete: `src/lib/hooks/useQuizQuestions.ts`

- [ ] **Step 1: Đổi import + chỗ gọi trong `App.tsx`**

Tìm:

```tsx
import { QuizPage } from "./pages/QuizPage";
```

Thay bằng:

```tsx
import { QuizSetListPage } from "./pages/QuizSetListPage";
```

Tìm:

```tsx
                ) : (
                  <QuizPage
                    lesson={activeLessonObject}
                    category={activeExerciseCategory}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
                )
```

Thay bằng:

```tsx
                ) : (
                  <QuizSetListPage
                    lesson={activeLessonObject}
                    category={activeExerciseCategory as "nghe" | "doc"}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                    onSetFinished={handleQuizFinished}
                  />
                )
```

- [ ] **Step 2: Xoá 2 file cũ**

```bash
git rm src/pages/QuizPage.tsx src/lib/hooks/useQuizQuestions.ts
```

- [ ] **Step 3: Kiểm tra không còn tham chiếu**

```bash
grep -rn "QuizPage\b\|useQuizQuestions" src/ --include="*.ts" --include="*.tsx"
```
Kỳ vọng: không có kết quả nào (`QuizSetListPage`/`QuizExerciseSetBody` không trùng chuỗi `QuizPage` — kiểm tra kỹ nếu grep ra dòng lạ).

- [ ] **Step 4: `npm run lint`**

Kỳ vọng: sạch.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(quiz): App.tsx dùng QuizSetListPage, xoá QuizPage/useQuizQuestions cũ"
```

---

### Task 5: Regression toàn bộ

- [ ] **Step 1: Type check**

```bash
npm run lint
```

- [ ] **Step 2: Test suite**

```bash
npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts
```
Kỳ vọng: pass toàn bộ, gồm 4 test mới ở Task 1.

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Ghi chú bàn giao**

Không có set/câu hỏi Nghe/Đọc thật trong DB (admin UI cũ đã xoá, chưa có admin UI mới) — không test tay được luồng học viên đầy đủ ở bước này. Test tay dời sang sau khi Plan Admin UI xong và admin tạo được dữ liệu thật.
