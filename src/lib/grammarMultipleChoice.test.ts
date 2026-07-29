import assert from "node:assert/strict";
import test from "node:test";
import {
  addOption,
  buildMultipleChoicePayload,
  createEmptyChoiceForm,
  moveOption,
  normalizeOptions,
  optionLabel,
  parseCorrectIndex,
  removeOption,
  setOption,
  validateChoiceForm,
  type ChoiceForm,
} from "./grammarMultipleChoice";

const form = (options: string[], correctIndex: number): ChoiceForm => ({ options, correctIndex });

test("optionLabel sinh nhãn A/B/C/D theo index", () => {
  assert.equal(optionLabel(0), "A");
  assert.equal(optionLabel(1), "B");
  assert.equal(optionLabel(3), "D");
  assert.equal(optionLabel(25), "Z");
});

test("optionLabel vượt quá Z rơi về số thứ tự", () => {
  assert.equal(optionLabel(26), "27");
});

test("createEmptyChoiceForm tạo 3 phương án trống, chưa chọn đáp án đúng", () => {
  assert.deepEqual(createEmptyChoiceForm(), { options: ["", "", ""], correctIndex: -1 });
});

test("addOption thêm một phương án trống, giữ nguyên đáp án đúng", () => {
  assert.deepEqual(addOption(form(["der", "die"], 1)), { options: ["der", "die", ""], correctIndex: 1 });
});

test("setOption chỉ đổi nội dung phương án tại index", () => {
  assert.deepEqual(setOption(form(["der", "die"], 0), 1, "das"), { options: ["der", "das"], correctIndex: 0 });
});

test("removeOption phía trước đáp án đúng làm index dịch lên", () => {
  assert.deepEqual(removeOption(form(["der", "die", "das"], 2), 0), { options: ["die", "das"], correctIndex: 1 });
});

test("removeOption phía sau đáp án đúng giữ nguyên index", () => {
  assert.deepEqual(removeOption(form(["der", "die", "das"], 0), 2), { options: ["der", "die"], correctIndex: 0 });
});

test("removeOption chính đáp án đúng buộc chọn lại", () => {
  assert.deepEqual(removeOption(form(["der", "die", "das"], 1), 1), { options: ["der", "das"], correctIndex: -1 });
});

test("moveOption kéo thả giữ đáp án đúng bám đúng phương án", () => {
  assert.deepEqual(moveOption(form(["der", "die", "das"], 2), 2, 0), { options: ["das", "der", "die"], correctIndex: 0 });
  assert.deepEqual(moveOption(form(["der", "die", "das"], 0), 0, 2), { options: ["die", "das", "der"], correctIndex: 2 });
  assert.deepEqual(moveOption(form(["der", "die", "das"], 1), 0, 2), { options: ["die", "das", "der"], correctIndex: 0 });
});

test("moveOption với index ngoài biên trả về form không đổi", () => {
  const original = form(["der", "die"], 0);
  assert.deepEqual(moveOption(original, -1, 1), original);
  assert.deepEqual(moveOption(original, 0, 5), original);
});

test("normalizeOptions trim và trả null khi không hợp lệ", () => {
  assert.deepEqual(normalizeOptions([" der ", "die"]), ["der", "die"]);
  assert.equal(normalizeOptions(["der"]), null);
  assert.equal(normalizeOptions(["der", "   "]), null);
});

test("validateChoiceForm báo lỗi tiếng Việt cho từng trường hợp", () => {
  assert.equal(validateChoiceForm("Das ist ___ Computer.", form(["der", "die"], 0)), null);
  assert.equal(validateChoiceForm("   ", form(["der", "die"], 0)), "Nội dung câu hỏi không được để trống.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der"], 0)), "Cần ít nhất 2 phương án.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der", " "], 0)), "Cần ít nhất 2 phương án.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der", "die"], -1)), "Cần chọn đúng một đáp án đúng.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der", "die"], 5)), "Cần chọn đúng một đáp án đúng.");
});

test("parseCorrectIndex đọc index hợp lệ và loại bỏ giá trị hỏng", () => {
  assert.equal(parseCorrectIndex("2", 3), 2);
  assert.equal(parseCorrectIndex(" 1 ", 3), 1);
  assert.equal(parseCorrectIndex(null, 3), -1);
  assert.equal(parseCorrectIndex("", 3), -1);
  assert.equal(parseCorrectIndex("abc", 3), -1);
  assert.equal(parseCorrectIndex("-1", 3), -1);
  assert.equal(parseCorrectIndex("3", 3), -1);
  assert.equal(parseCorrectIndex("1.5", 3), -1);
});

test("buildMultipleChoicePayload trả options đã trim và correct_answer là index", () => {
  assert.deepEqual(buildMultipleChoicePayload(form([" der ", "die", "das"], 2)), {
    options: ["der", "die", "das"],
    correct_answer: "2",
  });
});

test("buildMultipleChoicePayload trả options null khi dữ liệu không hợp lệ", () => {
  assert.deepEqual(buildMultipleChoicePayload(form(["der"], 0)), { options: null, correct_answer: "0" });
  assert.deepEqual(buildMultipleChoicePayload(form(["der", " "], 0)), { options: null, correct_answer: "0" });
});
