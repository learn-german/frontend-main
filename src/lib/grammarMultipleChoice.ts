export const MIN_MULTIPLE_CHOICE_OPTIONS = 2;
export const MAX_MULTIPLE_CHOICE_OPTIONS = 6;

export interface ChoiceForm {
  options: string[];
  correctIndex: number;
}

export const optionLabel = (index: number): string =>
  index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

export const createEmptyChoiceForm = (): ChoiceForm => ({ options: ["", "", ""], correctIndex: -1 });

export const addOption = (form: ChoiceForm): ChoiceForm => {
  if (form.options.length >= MAX_MULTIPLE_CHOICE_OPTIONS) return form;
  return { ...form, options: [...form.options, ""] };
};

export const setOption = (form: ChoiceForm, index: number, value: string): ChoiceForm => ({
  ...form,
  options: form.options.map((option, i) => (i === index ? value : option)),
});

export function removeOption(form: ChoiceForm, index: number): ChoiceForm {
  if (index < 0 || index >= form.options.length) return form;
  const correctIndex = form.correctIndex === index
    ? -1
    : form.correctIndex > index
      ? form.correctIndex - 1
      : form.correctIndex;
  return { options: form.options.filter((_, i) => i !== index), correctIndex };
}

export function moveOption(form: ChoiceForm, from: number, to: number): ChoiceForm {
  const { options, correctIndex } = form;
  if (from < 0 || to < 0 || from >= options.length || to >= options.length || from === to) return form;
  const next = [...options];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  let nextCorrect = correctIndex;
  if (correctIndex === from) nextCorrect = to;
  else if (correctIndex > from && correctIndex <= to) nextCorrect = correctIndex - 1;
  else if (correctIndex < from && correctIndex >= to) nextCorrect = correctIndex + 1;
  return { options: next, correctIndex: nextCorrect };
}

export function normalizeOptions(options: string[]): string[] | null {
  const normalized = options.map((option) => option.trim());
  if (normalized.length < MIN_MULTIPLE_CHOICE_OPTIONS) return null;
  if (normalized.some((option) => option.length === 0)) return null;
  return normalized;
}

export function validateChoiceForm(promptText: string, form: ChoiceForm): string | null {
  if (!promptText.trim()) return "Nội dung câu hỏi không được để trống.";
  const normalized = normalizeOptions(form.options);
  if (!normalized) return "Cần ít nhất 2 phương án.";
  if (form.correctIndex < 0 || form.correctIndex >= normalized.length) {
    return "Cần chọn đúng một đáp án đúng.";
  }
  return null;
}

export function parseCorrectIndex(correctAnswer: string | null, optionCount: number): number {
  const raw = (correctAnswer ?? "").trim();
  if (!/^\d+$/.test(raw)) return -1;
  const index = Number(raw);
  return index < optionCount ? index : -1;
}

export function buildMultipleChoicePayload(form: ChoiceForm): {
  options: string[] | null;
  correct_answer: string;
} {
  return { options: normalizeOptions(form.options), correct_answer: String(form.correctIndex) };
}

/**
 * Chuẩn hóa `options` đọc từ DB: chỉ giữ lại các phần tử là chuỗi.
 * Dữ liệu bất thường (không phải mảng, hoặc chứa phần tử không phải chuỗi)
 * sẽ bị lọc thay vì làm crash trang thay vì throw.
 */
export function normalizeOptionsFromDb(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((option): option is string => typeof option === "string");
  return strings.length > 0 ? strings : undefined;
}
