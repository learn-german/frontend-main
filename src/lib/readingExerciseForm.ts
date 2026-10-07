import type { ChoiceForm } from "./grammarMultipleChoice";
import { buildMultipleChoicePayload, validateChoiceForm } from "./grammarMultipleChoice";
import {
  countBlankMarkers,
  normalizeBlankDefinitions,
  syncBlankDefinitions,
  type BlankDefinition,
} from "./grammarFillInBlank";

export interface StatementForm {
  id: string;
  text: string;
  correctAnswer: "richtig" | "falsch" | null;
  explanation: string;
}

export interface SubQuestionForm {
  id: string;
  textSnippet: string;
  imageKey: string | null;
  question: string;
  options: string[];
  correctIndex: number;
  blanks: BlankDefinition[];
  explanation: string;
}

export interface ReadingQuestionGroupForm {
  passageId: string;
  title: string;
  questionIntro: string;
  questionType: "richtig_falsch" | "multiple_choice" | "fill_in_the_blank";
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

const explanationOrOmit = (explanation: string): { explanation: string } | Record<string, never> => {
  const text = explanation.trim();
  return text ? { explanation: text } : {};
};

export const addStatement = (form: ReadingQuestionGroupForm): ReadingQuestionGroupForm => ({
  ...form,
  statements: [...form.statements, { id: newId(), text: "", correctAnswer: null, explanation: "" }],
});

export const removeStatement = (form: ReadingQuestionGroupForm, id: string): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.filter((s) => s.id !== id),
});

export const setStatementText = (form: ReadingQuestionGroupForm, id: string, text: string): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.map((s) => (s.id === id ? { ...s, text } : s)),
});

export const setStatementExplanation = (
  form: ReadingQuestionGroupForm,
  id: string,
  explanation: string,
): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.map((s) => (s.id === id ? { ...s, explanation } : s)),
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
    { id: newId(), textSnippet: "", imageKey: null, question: "", options: ["", "", ""], correctIndex: -1, blanks: [], explanation: "" },
  ],
});

export const removeSubQuestion = (form: ReadingQuestionGroupForm, id: string): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.filter((q) => q.id !== id),
});

export const setSubQuestionField = <K extends "textSnippet" | "imageKey" | "question" | "explanation">(
  form: ReadingQuestionGroupForm,
  id: string,
  field: K,
  value: SubQuestionForm[K],
): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.map((q) => {
    if (q.id !== id) return q;
    if (field === "question") {
      const question = value as string;
      return {
        ...q,
        question,
        blanks: syncBlankDefinitions(question, q.blanks).map((blank) => ({
          acceptedAnswers: blank.acceptedAnswers.length > 0 ? blank.acceptedAnswers : [""],
        })),
      };
    }
    return { ...q, [field]: value };
  }),
});

export const setSubQuestionBlanks = (
  form: ReadingQuestionGroupForm,
  id: string,
  blanks: BlankDefinition[],
): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.map((q) => (q.id === id ? { ...q, blanks } : q)),
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

  if (form.questionType === "fill_in_the_blank") {
    if (form.subQuestions.length === 0) return "Cần ít nhất 1 câu hỏi.";
    for (const q of form.subQuestions) {
      const blankCount = countBlankMarkers(q.question);
      if (blankCount < 1) return "Mỗi câu cần ít nhất 1 marker ___.";
      if (q.blanks.length !== blankCount) return "Số editor đáp án phải khớp số marker ___.";
      if (!normalizeBlankDefinitions(q.blanks)) return "Mỗi ô trống cần ít nhất 1 đáp án hợp lệ.";
    }
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
  question_type: "richtig_falsch" | "multiple_choice" | "fill_in_the_blank";
  statements: { text: string; correct_answer: "richtig" | "falsch"; explanation?: string }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string; explanation?: string }[]
    | { question: string; blanks: { acceptedAnswers: string[] }[]; explanation?: string }[]
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
      ? form.statements.map((s) => ({
          text: s.text,
          correct_answer: s.correctAnswer as "richtig" | "falsch",
          ...explanationOrOmit(s.explanation),
        }))
      : null,
  sub_questions:
    form.questionType === "fill_in_the_blank"
      ? form.subQuestions.map((q) => ({
          question: q.question.trim(),
          blanks: (normalizeBlankDefinitions(q.blanks) ?? []).map((blank) => ({
            acceptedAnswers: blank.acceptedAnswers,
          })),
          ...explanationOrOmit(q.explanation),
        }))
      : form.questionType === "multiple_choice"
        ? form.subQuestions.map((q) => {
            const choicePayload = buildMultipleChoicePayload({ options: q.options, correctIndex: q.correctIndex });
            return {
              text_snippet: q.textSnippet.trim() || null,
              image_key: q.imageKey,
              question: q.question,
              options: choicePayload.options ?? q.options,
              correct_option_id: choicePayload.correct_answer,
              ...explanationOrOmit(q.explanation),
            };
          })
        : null,
  explanation: form.explanation,
});

export interface ReadingQuestionGroupRow {
  passage_id: string;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice" | "fill_in_the_blank";
  statements: { text: string; correct_answer: "richtig" | "falsch"; explanation?: string }[] | null;
  sub_questions:
    | {
        text_snippet?: string | null;
        image_key?: string | null;
        question: string;
        options?: string[];
        correct_option_id?: string;
        accepted_answers?: string[];
        blanks?: { acceptedAnswers?: string[]; accepted_answers?: string[] }[];
        explanation?: string;
      }[]
    | null;
  explanation: string | null;
}

function parseBlanksFromRow(
  question: string,
  blanks: { acceptedAnswers?: string[]; accepted_answers?: string[] }[] | undefined,
  acceptedAnswers: string[] | undefined,
): BlankDefinition[] {
  if (blanks && blanks.length > 0) {
    return syncBlankDefinitions(
      question,
      blanks.map((blank) => ({
        acceptedAnswers: blank.acceptedAnswers ?? blank.accepted_answers ?? [],
      })),
    );
  }
  if (acceptedAnswers && acceptedAnswers.length > 0) {
    return syncBlankDefinitions(question.includes("___") ? question : `${question} ___`, [
      { acceptedAnswers },
    ]);
  }
  return syncBlankDefinitions(question, []);
}

export const parseReadingRow = (row: ReadingQuestionGroupRow): ReadingQuestionGroupForm => ({
  passageId: row.passage_id,
  title: row.title ?? "",
  questionIntro: row.question_intro ?? "",
  questionType: row.question_type,
  statements: (row.statements ?? []).map((s) => ({
    id: newId(),
    text: s.text,
    correctAnswer: s.correct_answer,
    explanation: s.explanation ?? "",
  })),
  subQuestions: (row.sub_questions ?? []).map((q) => {
    const options = q.options ?? [];
    const question = q.question;
    return {
      id: newId(),
      textSnippet: q.text_snippet ?? "",
      imageKey: q.image_key ?? null,
      question,
      options,
      correctIndex: options.findIndex((_, i) => String(i) === q.correct_option_id),
      blanks: parseBlanksFromRow(question, q.blanks, q.accepted_answers),
      explanation: q.explanation ?? "",
    };
  }),
  explanation: row.explanation ?? "",
});
