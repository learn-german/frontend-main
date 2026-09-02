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
