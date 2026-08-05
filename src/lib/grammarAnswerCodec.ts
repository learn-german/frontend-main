import { GrammarExercise } from "./appTypes";
import { countBlankMarkers } from "./grammarFillInBlank";

/**
 * The wire format for one exercise answer, shared by the submit path and the
 * hydrate path. An empty string always means "not answered yet" — the page
 * uses that to gate the submit button, and the Edge Function grades it as wrong.
 */
export type ParsedAnswer =
  | { kind: "text"; value: string }
  | { kind: "blanks"; values: string[] }
  | { kind: "choice"; index: number | undefined }
  | { kind: "groups"; values: Record<string, string> };

export function emptyAnswer(exercise: GrammarExercise): ParsedAnswer {
  if (exercise.type === "fill_in_the_blank") {
    return { kind: "blanks", values: Array(countBlankMarkers(exercise.promptText ?? "")).fill("") };
  }
  if (exercise.type === "multiple_choice") return { kind: "choice", index: undefined };
  if (exercise.type === "classification") return { kind: "groups", values: {} };
  return { kind: "text", value: "" };
}

export function serializeAnswer(exercise: GrammarExercise, answer: ParsedAnswer): string {
  if (exercise.type === "fill_in_the_blank") {
    if (answer.kind !== "blanks") return "";
    const blankCount = countBlankMarkers(exercise.promptText ?? "");
    if (blankCount === 0 || answer.values.length !== blankCount) return "";
    if (answer.values.some((value) => !value.trim())) return "";
    return JSON.stringify(answer.values);
  }

  if (exercise.type === "multiple_choice") {
    if (answer.kind !== "choice" || answer.index === undefined) return "";
    return String(answer.index);
  }

  if (exercise.type === "classification") {
    if (answer.kind !== "groups") return "";
    const items = exercise.classificationItems ?? [];
    if (items.length === 0 || items.some((item) => !answer.values[item])) return "";
    return items.map((item) => `${item}:${answer.values[item]}`).join("|");
  }

  if (answer.kind !== "text") return "";
  // word_reorder is already a space-joined sentence; trimming it would not
  // change grading, but keeping it verbatim makes the round-trip exact.
  return exercise.type === "word_reorder" ? answer.value : answer.value.trim();
}

export function parseAnswer(exercise: GrammarExercise, raw: string): ParsedAnswer {
  if (exercise.type === "fill_in_the_blank") {
    const blankCount = countBlankMarkers(exercise.promptText ?? "");
    const fallback: ParsedAnswer = { kind: "blanks", values: Array(blankCount).fill("") };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fallback;
    }
    if (
      !Array.isArray(parsed)
      || parsed.length !== blankCount
      || !parsed.every((value) => typeof value === "string")
    ) {
      return fallback;
    }
    return { kind: "blanks", values: parsed as string[] };
  }

  if (exercise.type === "multiple_choice") {
    if (!/^\d+$/.test(raw)) return { kind: "choice", index: undefined };
    return { kind: "choice", index: Number(raw) };
  }

  if (exercise.type === "classification") {
    const values: Record<string, string> = {};
    for (const pair of raw.split("|")) {
      const separator = pair.indexOf(":");
      if (separator <= 0) continue;
      const item = pair.slice(0, separator).trim();
      const group = pair.slice(separator + 1).trim();
      if (item && group) values[item] = group;
    }
    return { kind: "groups", values };
  }

  return { kind: "text", value: raw };
}

/**
 * Ngược lại phần word_reorder của serializeAnswer: từ câu đã lưu (token text
 * nối bằng dấu cách, đúng thứ tự học viên đã chọn) và token pool gốc của câu
 * hỏi, tìm lại token nào ứng với đoạn nào để phục hồi selectedTokensByExercise
 * (khoá "${tokenIdx}:${token}") — cần để hydrate draft vào lại UI chọn từ,
 * nếu không học viên mở lại bài đang làm dở sẽ thấy mọi ô chọn đều trống dù
 * đã lưu. Khớp dài nhất trước để token chứa khoảng trắng nội bộ (vd "Mein
 * Name") không bị token ngắn hơn ("Mein") nuốt nhầm. Không đoán bừa khi
 * không khớp được (token pool đã đổi từ lúc lưu draft) — trả mảng rỗng.
 */
export function reconstructWordReorderTokens(tokens: string[], answer: string): string[] {
  const used = new Set<number>();
  const result: string[] = [];
  let remaining = answer;

  while (remaining.length > 0) {
    const candidates = tokens
      .map((token, idx) => ({ token, idx }))
      .filter(({ idx }) => !used.has(idx))
      .filter(({ token }) => remaining === token || remaining.startsWith(`${token} `))
      .sort((a, b) => b.token.length - a.token.length);

    const match = candidates[0];
    if (!match) return [];

    used.add(match.idx);
    result.push(`${match.idx}:${match.token}`);
    remaining = remaining === match.token ? "" : remaining.slice(match.token.length + 1);
  }

  return result;
}

export interface ParsedFormState {
  textAnswers: Record<string, string>;
  blankAnswers: Record<string, string[]>;
  itemGroups: Record<string, Record<string, string>>;
  choices: Record<string, number>;
  selectedTokens: Record<string, string[]>;
}

/**
 * Phân rã 1 object answers (wire format, key theo exercise id) thành 5 state
 * riêng theo loại câu — dùng chung cho hydrate từ attempt đã nộp lẫn hydrate
 * từ draft chưa nộp, tránh lặp lại đúng vòng lặp này ở 2 nơi.
 */
export function parseAnswersIntoFormState(
  exercises: GrammarExercise[],
  answers: Record<string, string>,
): ParsedFormState {
  const textAnswers: Record<string, string> = {};
  const blankAnswers: Record<string, string[]> = {};
  const itemGroups: Record<string, Record<string, string>> = {};
  const choices: Record<string, number> = {};
  const selectedTokens: Record<string, string[]> = {};

  for (const exercise of exercises) {
    const raw = answers[exercise.id];
    const parsed: ParsedAnswer = raw === undefined ? emptyAnswer(exercise) : parseAnswer(exercise, raw);
    if (parsed.kind === "text") {
      textAnswers[exercise.id] = parsed.value;
      if (exercise.type === "word_reorder") {
        selectedTokens[exercise.id] = reconstructWordReorderTokens(exercise.tokens ?? [], parsed.value);
      }
    } else if (parsed.kind === "blanks") blankAnswers[exercise.id] = parsed.values;
    else if (parsed.kind === "groups") itemGroups[exercise.id] = parsed.values;
    else if (parsed.index !== undefined) choices[exercise.id] = parsed.index;
  }

  return { textAnswers, blankAnswers, itemGroups, choices, selectedTokens };
}
