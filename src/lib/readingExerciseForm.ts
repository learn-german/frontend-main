export interface StatementForm {
  id: string;
  text: string;
  correctAnswer: "richtig" | "falsch" | null;
}

export interface SubQuestionForm {
  id: string;
  textSnippet: string;
  imageKey: string | null;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface ReadingQuestionGroupForm {
  passageId: string;
  title: string;
  questionIntro: string;
  questionType: "richtig_falsch" | "multiple_choice";
  statements: StatementForm[];
  subQuestions: SubQuestionForm[];
  explanation: string;
}

export const createEmptyReadingForm = (): ReadingQuestionGroupForm => ({
  passageId: "",
  title: "",
  questionIntro: "",
  questionType: "richtig_falsch",
  statements: [],
  subQuestions: [],
  explanation: "",
});

const newId = (): string => crypto.randomUUID();

export const addStatement = (form: ReadingQuestionGroupForm): ReadingQuestionGroupForm => ({
  ...form,
  statements: [...form.statements, { id: newId(), text: "", correctAnswer: null }],
});

export const removeStatement = (form: ReadingQuestionGroupForm, id: string): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.filter((s) => s.id !== id),
});

export const setStatementText = (form: ReadingQuestionGroupForm, id: string, text: string): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.map((s) => (s.id === id ? { ...s, text } : s)),
});

export const setStatementAnswer = (
  form: ReadingQuestionGroupForm,
  id: string,
  correctAnswer: "richtig" | "falsch",
): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.map((s) => (s.id === id ? { ...s, correctAnswer } : s)),
});

export const moveStatement = (form: ReadingQuestionGroupForm, from: number, to: number): ReadingQuestionGroupForm => {
  if (from < 0 || to < 0 || from >= form.statements.length || to >= form.statements.length || from === to) return form;
  const next = [...form.statements];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...form, statements: next };
};
