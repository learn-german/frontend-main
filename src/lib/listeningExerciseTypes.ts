export const LISTENING_QUESTION_TYPES = [
  "fill_in_the_blank",
  "multiple_choice",
  "richtig_falsch",
] as const;

export type ListeningQuestionType = (typeof LISTENING_QUESTION_TYPES)[number];

export const LISTENING_TYPE_LABELS: Record<ListeningQuestionType, string> = {
  fill_in_the_blank: "Điền vào ô trống",
  multiple_choice: "Trắc nghiệm",
  richtig_falsch: "Richtig / Falsch",
};

/** Richtig/Falsch và phân loại là 1 cột. Trắc nghiệm giữ lưới 3 cột. */
export function listeningGroupLayoutClass(type: string): string {
  if (type === "richtig_falsch" || type === "classification") return "grid grid-cols-1 gap-3";
  return "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
}
