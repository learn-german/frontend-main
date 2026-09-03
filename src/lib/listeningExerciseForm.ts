import {
  countBlankMarkers,
  normalizeBlankDefinitions,
  type BlankDefinition,
} from "./grammarFillInBlank.ts";
import { buildMultipleChoicePayload, validateChoiceForm } from "./grammarMultipleChoice.ts";
import type { ListeningQuestionType } from "./listeningExerciseTypes.ts";

export interface ListeningExerciseForm {
  type: ListeningQuestionType;
  promptText: string;
  correctAnswer: "richtig" | "falsch" | null;
  correctOptionIndex: number;
  options: string[];
  blanks: BlankDefinition[];
}

export function validateListeningExercise(form: ListeningExerciseForm): string | null {
  if (form.type === "richtig_falsch") {
    if (!form.promptText.trim()) return "Nhận định không được để trống.";
    if (form.correctAnswer !== "richtig" && form.correctAnswer !== "falsch") {
      return "Chọn đáp án Richtig hoặc Falsch.";
    }
    return null;
  }

  if (form.type === "multiple_choice") {
    return validateChoiceForm(form.promptText, {
      options: form.options,
      correctIndex: form.correctOptionIndex,
    });
  }

  const blankCount = countBlankMarkers(form.promptText);
  if (blankCount < 1) return "Cần ít nhất 1 marker ___.";
  if (form.blanks.length !== blankCount) return "Số editor đáp án phải khớp số marker ___.";
  if (!normalizeBlankDefinitions(form.blanks)) return "Mỗi ô trống cần ít nhất 1 đáp án hợp lệ.";
  return null;
}

export function buildListeningPayload(form: ListeningExerciseForm) {
  if (form.type === "richtig_falsch") {
    return {
      type: "richtig_falsch" as const,
      prompt_text: form.promptText.trim(),
      correct_answer: form.correctAnswer,
      options: null,
      blanks: null,
    };
  }

  if (form.type === "multiple_choice") {
    const choicePayload = buildMultipleChoicePayload({
      options: form.options,
      correctIndex: form.correctOptionIndex,
    });
    return {
      type: "multiple_choice" as const,
      prompt_text: form.promptText,
      correct_answer: choicePayload.correct_answer,
      options: choicePayload.options,
      blanks: null,
    };
  }

  return {
    type: "fill_in_the_blank" as const,
    prompt_text: form.promptText,
    correct_answer: null,
    options: null,
    blanks: normalizeBlankDefinitions(form.blanks),
  };
}
