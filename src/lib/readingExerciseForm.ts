import type { ChoiceForm } from "./grammarMultipleChoice";
import { buildMultipleChoicePayload, validateChoiceForm } from "./grammarMultipleChoice";

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

export const addSubQuestion = (form: ReadingQuestionGroupForm): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: [
    ...form.subQuestions,
    { id: newId(), textSnippet: "", imageKey: null, question: "", options: ["", "", ""], correctIndex: -1 },
  ],
});

export const removeSubQuestion = (form: ReadingQuestionGroupForm, id: string): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.filter((q) => q.id !== id),
});

export const setSubQuestionField = <K extends "textSnippet" | "imageKey" | "question">(
  form: ReadingQuestionGroupForm,
  id: string,
  field: K,
  value: SubQuestionForm[K],
): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
});

export const setSubQuestionOptions = (
  form: ReadingQuestionGroupForm,
  id: string,
  choiceForm: ChoiceForm,
): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.map((q) =>
    q.id === id ? { ...q, options: choiceForm.options, correctIndex: choiceForm.correctIndex } : q,
  ),
});

export const moveSubQuestion = (form: ReadingQuestionGroupForm, from: number, to: number): ReadingQuestionGroupForm => {
  if (from < 0 || to < 0 || from >= form.subQuestions.length || to >= form.subQuestions.length || from === to) return form;
  const next = [...form.subQuestions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...form, subQuestions: next };
};

export const validateReadingForm = (form: ReadingQuestionGroupForm): string | null => {
  if (!form.passageId) return "Chưa chọn văn bản.";

  if (form.questionType === "richtig_falsch") {
    if (form.statements.length === 0) return "Cần ít nhất 1 nhận định.";
    if (form.statements.some((s) => !s.text.trim())) return "Mỗi nhận định cần có nội dung.";
    if (form.statements.some((s) => s.correctAnswer === null)) return "Mỗi nhận định cần chọn Richtig hoặc Falsch.";
    return null;
  }

  if (form.subQuestions.length === 0) return "Cần ít nhất 1 câu hỏi.";
  for (const q of form.subQuestions) {
    if (!q.question.trim()) return "Mỗi câu hỏi cần có nội dung.";
    const err = validateChoiceForm(q.question, { options: q.options, correctIndex: q.correctIndex });
    if (err) return "Mỗi câu hỏi cần đủ phương án và đáp án đúng.";
  }
  return null;
};

export interface ReadingQuestionGroupPayload {
  passage_id: string;
  set_id: string;
  order_index: number;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: { text: string; correct_answer: "richtig" | "falsch" }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string }[]
    | null;
  explanation: string;
}

export const buildReadingPayload = (
  form: ReadingQuestionGroupForm,
  setId: string,
  orderIndex: number,
): ReadingQuestionGroupPayload => ({
  passage_id: form.passageId,
  set_id: setId,
  order_index: orderIndex,
  title: form.title.trim() || null,
  question_intro: form.questionIntro.trim() || null,
  question_type: form.questionType,
  statements:
    form.questionType === "richtig_falsch"
      ? form.statements.map((s) => ({ text: s.text, correct_answer: s.correctAnswer as "richtig" | "falsch" }))
      : null,
  sub_questions:
    form.questionType === "multiple_choice"
      ? form.subQuestions.map((q) => {
          const choicePayload = buildMultipleChoicePayload({ options: q.options, correctIndex: q.correctIndex });
          return {
            text_snippet: q.textSnippet.trim() || null,
            image_key: q.imageKey,
            question: q.question,
            options: choicePayload.options ?? q.options,
            correct_option_id: choicePayload.correct_answer,
          };
        })
      : null,
  explanation: form.explanation,
});

export interface ReadingQuestionGroupRow {
  passage_id: string;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: { text: string; correct_answer: "richtig" | "falsch" }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string }[]
    | null;
  explanation: string | null;
}

export const parseReadingRow = (row: ReadingQuestionGroupRow): ReadingQuestionGroupForm => ({
  passageId: row.passage_id,
  title: row.title ?? "",
  questionIntro: row.question_intro ?? "",
  questionType: row.question_type,
  statements: (row.statements ?? []).map((s) => ({ id: newId(), text: s.text, correctAnswer: s.correct_answer })),
  subQuestions: (row.sub_questions ?? []).map((q) => ({
    id: newId(),
    textSnippet: q.text_snippet ?? "",
    imageKey: q.image_key,
    question: q.question,
    options: q.options,
    correctIndex: q.options.findIndex((_, i) => String(i) === q.correct_option_id),
  })),
  explanation: row.explanation ?? "",
});
