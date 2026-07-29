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
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
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
