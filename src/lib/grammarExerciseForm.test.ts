import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_FORM,
  validateForm,
  buildPayload,
  addWordToGroup,
  removeGroupFromForm,
  type EditForm,
} from "./grammarExerciseForm";

const matchingForm = (overrides: Partial<EditForm> = {}): EditForm => ({
  ...EMPTY_FORM,
  type: "matching",
  prompt_text: "Ghép từ với nghĩa.",
  matching_pairs: [{ de: "der Tisch", vi: "cái bàn" }],
  ...overrides,
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

test("buildPayload: matching serialize matching_pairs vào correct_answer, bỏ cặp rỗng", () => {
  const payload = buildPayload(matchingForm({
    matching_pairs: [{ de: "der Tisch", vi: "cái bàn" }, { de: "", vi: "" }],
  }));
  assert.equal(payload.correct_answer, "der Tisch:cái bàn");
  assert.deepEqual(payload.matching_pairs, [{ de: "der Tisch", vi: "cái bàn" }]);
});

test("addWordToGroup thêm 1 item rỗng vào đúng nhóm", () => {
  const f: EditForm = {
    ...EMPTY_FORM,
    classification_groups: ["der", "die"],
    classification_items: [{ item: "Vater", group: "der" }],
  };
  const result = addWordToGroup(f, "die");
  assert.deepEqual(result.classification_items, [
    { item: "Vater", group: "der" },
    { item: "", group: "die" },
  ]);
});

test("removeGroupFromForm xoá nhóm và xoá luôn các item thuộc nhóm đó", () => {
  const f: EditForm = {
    ...EMPTY_FORM,
    classification_groups: ["der", "die"],
    classification_items: [
      { item: "Vater", group: "der" },
      { item: "Mutter", group: "die" },
      { item: "Kind", group: "der" },
    ],
  };
  const result = removeGroupFromForm(f, 0);
  assert.deepEqual(result.classification_groups, ["die"]);
  assert.deepEqual(result.classification_items, [{ item: "Mutter", group: "die" }]);
});
