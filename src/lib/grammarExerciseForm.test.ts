import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FORM, validateForm, buildPayload, type EditForm } from "./grammarExerciseForm";

const textFillBlankForm = (overrides: Partial<EditForm> = {}): EditForm => ({
  ...EMPTY_FORM,
  type: "text_fill_blank",
  prompt_text: "Ich {{bin|Bin}} Student.",
  ...overrides,
});

const matchingForm = (overrides: Partial<EditForm> = {}): EditForm => ({
  ...EMPTY_FORM,
  type: "matching",
  prompt_text: "Ghép từ với nghĩa.",
  matching_pairs: [{ de: "der Tisch", vi: "cái bàn" }],
  ...overrides,
});

test("validateForm: text_fill_blank thiếu {{...}} thì báo lỗi", () => {
  assert.equal(
    validateForm(textFillBlankForm({ prompt_text: "Không có ô trống." })),
    "Cần ít nhất 1 ô trống {{...}}.",
  );
});

test("validateForm: text_fill_blank thiếu prompt_text thì báo lỗi", () => {
  assert.equal(
    validateForm(textFillBlankForm({ prompt_text: "" })),
    "Nội dung câu hỏi không được để trống.",
  );
});

test("validateForm: text_fill_blank có {{...}} thì hợp lệ", () => {
  assert.equal(validateForm(textFillBlankForm()), null);
});

test("validateForm: matching thiếu cặp hợp lệ thì báo lỗi", () => {
  assert.equal(
    validateForm(matchingForm({ matching_pairs: [{ de: "", vi: "" }] })),
    "Cần ít nhất 1 cặp ghép hợp lệ.",
  );
});

test("validateForm: matching có ít nhất 1 cặp hợp lệ thì hợp lệ", () => {
  assert.equal(validateForm(matchingForm()), null);
});

test("buildPayload: text_fill_blank lưu prompt_text, correct_answer null", () => {
  const payload = buildPayload(textFillBlankForm());
  assert.equal(payload.prompt_text, "Ich {{bin|Bin}} Student.");
  assert.equal(payload.correct_answer, null);
});

test("buildPayload: matching serialize matching_pairs vào correct_answer, bỏ cặp rỗng", () => {
  const payload = buildPayload(matchingForm({
    matching_pairs: [{ de: "der Tisch", vi: "cái bàn" }, { de: "", vi: "" }],
  }));
  assert.equal(payload.correct_answer, "der Tisch:cái bàn");
  assert.deepEqual(payload.matching_pairs, [{ de: "der Tisch", vi: "cái bàn" }]);
});
