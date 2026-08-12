import {
  countBlankMarkers,
  normalizeBlankDefinitions,
  type BlankDefinition,
} from "./grammarFillInBlank";
import {
  buildMultipleChoicePayload,
  createEmptyChoiceForm,
  validateChoiceForm,
} from "./grammarMultipleChoice";
import { serializeMatching } from "./quizAnswerCodec";

export interface EditForm {
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank"
    | "multiple_choice"
    | "matching";
  prompt_text: string;
  transformation_hint: string;
  correct_answer: string;
  acceptable_answers: string[];
  tokens_input: string;
  classification_groups: string[];
  classification_items: { item: string; group: string }[];
  blanks: BlankDefinition[];
  options: string[];
  correct_option_index: number;
  matching_pairs: { de: string; vi: string }[];
  explanation: string;
  order_index: number;
}

export const EMPTY_FORM: EditForm = {
  type: "word_reorder",
  prompt_text: "",
  transformation_hint: "",
  correct_answer: "",
  acceptable_answers: [],
  tokens_input: "",
  classification_groups: [],
  classification_items: [],
  blanks: [],
  options: createEmptyChoiceForm().options,
  correct_option_index: -1,
  matching_pairs: [{ de: "", vi: "" }],
  explanation: "",
  order_index: 0,
};

const normalizeWord = (s: string): string => s.toLowerCase().replace(/[.,!?]/g, "").trim();

export const validateForm = (f: EditForm): string | null => {
  if (f.type === "word_reorder") {
    const tokens = f.tokens_input.split("/").map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) return "Cần ít nhất 2 từ.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    const answerWords = f.correct_answer.split(/\s+/).map(normalizeWord).filter(Boolean).sort();
    const tokenWords = tokens.flatMap((t) => t.split(/\s+/)).map(normalizeWord).filter(Boolean).sort();
    if (JSON.stringify(answerWords) !== JSON.stringify(tokenWords)) {
      return "Các từ cho sẵn không khớp với câu đúng — kiểm tra lại chính tả.";
    }
    return null;
  }
  if (f.type === "error_correction") {
    if (!f.prompt_text.trim()) return "Câu sai không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    if (f.prompt_text.trim() === f.correct_answer.trim()) return "Câu sai và câu đúng giống nhau — không có lỗi để sửa.";
    return null;
  }
  if (f.type === "translation") {
    if (!f.prompt_text.trim()) return "Câu tiếng Việt không được để trống.";
    if (!f.correct_answer.trim()) return "Câu tiếng Đức không được để trống.";
    return null;
  }
  if (f.type === "sentence_transformation") {
    if (!f.prompt_text.trim()) return "Câu gốc không được để trống.";
    if (!f.transformation_hint.trim()) return "Yêu cầu biến đổi không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng sau biến đổi không được để trống.";
    return null;
  }
  if (f.type === "guided_sentence_writing") {
    if (!f.prompt_text.trim()) return "Dữ liệu gợi ý không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    return null;
  }
  if (f.type === "multiple_choice") {
    return validateChoiceForm(f.prompt_text, { options: f.options, correctIndex: f.correct_option_index });
  }
  if (f.type === "fill_in_the_blank") {
    const blankCount = countBlankMarkers(f.prompt_text);
    if (blankCount < 1) return "Cần ít nhất 1 marker ___.";
    if (f.blanks.length !== blankCount) return "Số editor đáp án phải khớp số marker ___.";
    if (!normalizeBlankDefinitions(f.blanks)) return "Mỗi ô trống cần ít nhất 1 đáp án hợp lệ.";
    return null;
  }
  if (f.type === "matching") {
    if (!f.prompt_text.trim()) return "Nội dung câu hỏi không được để trống.";
    const validPairs = f.matching_pairs.filter((p) => p.de.trim() && p.vi.trim());
    if (validPairs.length === 0) return "Cần ít nhất 1 cặp ghép hợp lệ.";
    return null;
  }
  // classification
  const groups = f.classification_groups.map((g) => g.trim()).filter(Boolean);
  const uniqueGroups = new Set(groups.map((g) => g.toLowerCase()));
  if (groups.length < 2 || uniqueGroups.size !== groups.length) {
    return "Cần ít nhất 2 nhóm phân loại, không trùng tên.";
  }
  if (f.classification_items.length === 0 || f.classification_items.some((it) => !it.item.trim())) {
    return "Cần ít nhất 1 item để phân loại.";
  }
  if (f.classification_items.some((it) => !groups.includes(it.group))) {
    return "Mỗi item phải thuộc một nhóm hợp lệ.";
  }
  return null;
};

export const buildPayload = (form: EditForm) => {
  const choicePayload = buildMultipleChoicePayload({
    options: form.options,
    correctIndex: form.correct_option_index,
  });
  const validMatchingPairs = form.matching_pairs.filter((p) => p.de.trim() && p.vi.trim());
  return {
    type: form.type,
    prompt_text: form.type === "word_reorder" || form.type === "classification" ? null : form.prompt_text,
    transformation_hint: form.type === "sentence_transformation" ? form.transformation_hint : null,
    correct_answer:
      form.type === "classification" || form.type === "fill_in_the_blank"
        ? null
        : form.type === "multiple_choice"
          ? choicePayload.correct_answer
          : form.type === "matching"
            ? serializeMatching(Object.fromEntries(validMatchingPairs.map((p) => [p.de, p.vi])))
            : form.correct_answer,
    acceptable_answers:
      form.type === "translation"
        ? form.acceptable_answers.map((a) => a.trim()).filter(Boolean)
        : null,
    tokens:
      form.type === "word_reorder"
        ? form.tokens_input.split("/").map((t) => t.trim()).filter(Boolean)
        : null,
    classification_groups:
      form.type === "classification" ? form.classification_groups.map((g) => g.trim()).filter(Boolean) : null,
    classification_items:
      form.type === "classification" ? form.classification_items.filter((it) => it.item.trim()) : null,
    blanks: form.type === "fill_in_the_blank" ? normalizeBlankDefinitions(form.blanks) : null,
    options: form.type === "multiple_choice" ? choicePayload.options : null,
    matching_pairs: form.type === "matching" ? validMatchingPairs : null,
    explanation: form.explanation,
    order_index: form.order_index,
  };
};

export const addGroupToForm = (f: EditForm): EditForm => ({ ...f, classification_groups: [...f.classification_groups, ""] });

export const setGroupInForm = (f: EditForm, i: number, val: string): EditForm => {
  const groups = [...f.classification_groups];
  const oldVal = groups[i];
  groups[i] = val;
  return {
    ...f,
    classification_groups: groups,
    classification_items: f.classification_items.map((it) => (it.group === oldVal ? { ...it, group: val } : it)),
  };
};

export const removeGroupFromForm = (f: EditForm, i: number): EditForm => {
  const removed = f.classification_groups[i];
  return {
    ...f,
    classification_groups: f.classification_groups.filter((_, idx) => idx !== i),
    classification_items: f.classification_items.filter((it) => it.group !== removed),
  };
};

export const addWordToGroup = (f: EditForm, group: string): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group }],
});

export const addItemToForm = (f: EditForm): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group: f.classification_groups[0] ?? "" }],
});

export const setItemInForm = (f: EditForm, i: number, key: "item" | "group", val: string): EditForm => {
  const items = [...f.classification_items];
  items[i] = { ...items[i], [key]: val };
  return { ...f, classification_items: items };
};

export const removeItemFromForm = (f: EditForm, i: number): EditForm => ({
  ...f,
  classification_items: f.classification_items.filter((_, idx) => idx !== i),
});

export const addPairToForm = (f: EditForm): EditForm => ({
  ...f,
  matching_pairs: [...f.matching_pairs, { de: "", vi: "" }],
});

export const setPairInForm = (f: EditForm, i: number, key: "de" | "vi", val: string): EditForm => {
  const pairs = [...f.matching_pairs];
  pairs[i] = { ...pairs[i], [key]: val };
  return { ...f, matching_pairs: pairs };
};

export const removePairFromForm = (f: EditForm, i: number): EditForm => ({
  ...f,
  matching_pairs: f.matching_pairs.filter((_, idx) => idx !== i),
});
