import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyAnswer,
  parseAnswer,
  parseAnswersIntoFormState,
  reconstructWordReorderTokens,
  serializeAnswer,
} from "./grammarAnswerCodec";
import type { GrammarExercise } from "./appTypes";

const base = (over: Partial<GrammarExercise>): GrammarExercise => ({
  id: "e1",
  lessonId: "l1",
  orderIndex: 0,
  type: "translation",
  explanation: "",
  ...over,
});

test("translation: round-trip giữ nguyên chuỗi đã trim", () => {
  const ex = base({ type: "translation" });
  const raw = "Ich lerne Deutsch";
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("translation: serialize trim khoảng trắng thừa", () => {
  const ex = base({ type: "translation" });
  assert.equal(serializeAnswer(ex, { kind: "text", value: "  Ich lerne  " }), "Ich lerne");
});

test("word_reorder: round-trip không trim", () => {
  const ex = base({ type: "word_reorder", tokens: ["Ich", "lerne"] });
  const raw = "Ich lerne";
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("multiple_choice: round-trip index", () => {
  const ex = base({ type: "multiple_choice", options: ["a", "b", "c"] });
  assert.deepEqual(parseAnswer(ex, "2"), { kind: "choice", index: 2 });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, "2")), "2");
});

test("multiple_choice: chưa chọn thì serialize ra chuỗi rỗng", () => {
  const ex = base({ type: "multiple_choice", options: ["a", "b"] });
  assert.equal(serializeAnswer(ex, { kind: "choice", index: undefined }), "");
});

test("multiple_choice: giá trị hỏng parse ra undefined thay vì NaN", () => {
  const ex = base({ type: "multiple_choice", options: ["a", "b"] });
  assert.deepEqual(parseAnswer(ex, "abc"), { kind: "choice", index: undefined });
  assert.deepEqual(parseAnswer(ex, ""), { kind: "choice", index: undefined });
  assert.deepEqual(parseAnswer(ex, "-1"), { kind: "choice", index: undefined });
});

test("fill_in_the_blank: round-trip mảng đáp án", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  const raw = JSON.stringify(["ein", "eine"]);
  assert.deepEqual(parseAnswer(ex, raw), { kind: "blanks", values: ["ein", "eine"] });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("fill_in_the_blank: thiếu một blank thì serialize ra chuỗi rỗng", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.equal(serializeAnswer(ex, { kind: "blanks", values: ["ein", "  "] }), "");
});

test("fill_in_the_blank: partial=true giữ lại ô đã điền dở (draft autosave)", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.equal(
    serializeAnswer(ex, { kind: "blanks", values: ["ein", "  "] }, { partial: true }),
    JSON.stringify(["ein", "  "]),
  );
});

test("fill_in_the_blank: partial=true nhưng chưa điền gì thì vẫn trả rỗng", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.equal(serializeAnswer(ex, { kind: "blanks", values: ["", "  "] }, { partial: true }), "");
});

test("fill_in_the_blank: JSON hỏng parse ra mảng rỗng đúng số blank", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.deepEqual(parseAnswer(ex, "{not json"), { kind: "blanks", values: ["", ""] });
  assert.deepEqual(parseAnswer(ex, JSON.stringify([1, 2])), { kind: "blanks", values: ["", ""] });
});

test("fill_in_the_blank: mảng lệch số lượng blank parse ra mảng rỗng đúng số blank", () => {
  const ex = base({ type: "fill_in_the_blank", promptText: "Das ist ___ Tisch und ___ Lampe." });
  assert.deepEqual(parseAnswer(ex, JSON.stringify(["ein"])), { kind: "blanks", values: ["", ""] });
  assert.deepEqual(parseAnswer(ex, JSON.stringify(["ein", "eine", "extra"])), {
    kind: "blanks",
    values: ["", ""],
  });
});

test("classification: round-trip cặp item:group", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch", "die Lampe"],
    classificationGroups: ["maskulin", "feminin"],
  });
  const raw = "der Tisch:maskulin|die Lampe:feminin";
  assert.deepEqual(parseAnswer(ex, raw), {
    kind: "groups",
    values: { "der Tisch": "maskulin", "die Lampe": "feminin" },
  });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("classification: thiếu một item thì serialize ra chuỗi rỗng", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch", "die Lampe"],
    classificationGroups: ["maskulin", "feminin"],
  });
  assert.equal(serializeAnswer(ex, { kind: "groups", values: { "der Tisch": "maskulin" } }), "");
});

test("classification: partial=true giữ lại item đã xếp dở thay vì trả rỗng (draft autosave)", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch", "die Lampe"],
    classificationGroups: ["maskulin", "feminin"],
  });
  const serialized = serializeAnswer(
    ex,
    { kind: "groups", values: { "der Tisch": "maskulin" } },
    { partial: true },
  );
  assert.equal(serialized, "der Tisch:maskulin");
  // Round-trip: item xếp dở phải đọc lại được, không mất khi hydrate draft.
  assert.deepEqual(parseAnswer(ex, serialized), {
    kind: "groups",
    values: { "der Tisch": "maskulin" },
  });
});

test("classification: partial=true nhưng chưa xếp gì thì vẫn trả rỗng", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch", "die Lampe"],
    classificationGroups: ["maskulin", "feminin"],
  });
  assert.equal(serializeAnswer(ex, { kind: "groups", values: {} }, { partial: true }), "");
});

test("classification: chuỗi hỏng parse ra map rỗng thay vì crash", () => {
  const ex = base({
    type: "classification",
    classificationItems: ["der Tisch"],
    classificationGroups: ["maskulin"],
  });
  assert.deepEqual(parseAnswer(ex, "khong-co-dau-hai-cham"), { kind: "groups", values: {} });
});

test("emptyAnswer trả đúng kind cho từng loại", () => {
  assert.deepEqual(emptyAnswer(base({ type: "translation" })), { kind: "text", value: "" });
  assert.deepEqual(emptyAnswer(base({ type: "multiple_choice", options: ["a", "b"] })), {
    kind: "choice",
    index: undefined,
  });
  assert.deepEqual(
    emptyAnswer(base({ type: "fill_in_the_blank", promptText: "a ___ b ___" })),
    { kind: "blanks", values: ["", ""] },
  );
  assert.deepEqual(
    emptyAnswer(base({ type: "classification", classificationItems: ["x"] })),
    { kind: "groups", values: {} },
  );
});

test("mọi loại: serialize(emptyAnswer) là chuỗi rỗng", () => {
  const types: GrammarExercise["type"][] = [
    "word_reorder",
    "error_correction",
    "translation",
    "sentence_transformation",
    "guided_sentence_writing",
    "classification",
    "fill_in_the_blank",
    "multiple_choice",
  ];
  for (const type of types) {
    const ex = base({
      type,
      promptText: type === "fill_in_the_blank" ? "a ___ b" : "prompt",
      classificationItems: type === "classification" ? ["x"] : undefined,
      options: type === "multiple_choice" ? ["a", "b"] : undefined,
    });
    assert.equal(serializeAnswer(ex, emptyAnswer(ex)), "", `type ${type}`);
  }
});

test("parseAnswersIntoFormState: phân đúng loại đáp án theo từng exercise", () => {
  const exercises = [
    base({ id: "e1", type: "translation" }),
    base({ id: "e2", type: "multiple_choice", options: ["a", "b"] }),
  ];
  const result = parseAnswersIntoFormState(exercises, { e1: "Hallo", e2: "1" });
  assert.equal(result.textAnswers.e1, "Hallo");
  assert.equal(result.choices.e2, 1);
});

test("parseAnswersIntoFormState: exercise không có trong answers -> giá trị rỗng, không throw", () => {
  const exercises = [base({ id: "e1", type: "translation" })];
  const result = parseAnswersIntoFormState(exercises, {});
  assert.equal(result.textAnswers.e1, "");
});

test("reconstructWordReorderTokens: khớp đúng thứ tự học viên đã chọn, không phải thứ tự trong pool", () => {
  const tokens = ["heiße", "Ich", "Anna"];
  assert.deepEqual(reconstructWordReorderTokens(tokens, "Ich heiße Anna"), [
    "1:Ich",
    "0:heiße",
    "2:Anna",
  ]);
});

test("reconstructWordReorderTokens: token chứa khoảng trắng nội bộ không bị token ngắn hơn nuốt nhầm", () => {
  const tokens = ["Mein Name", "ist", "Tom"];
  assert.deepEqual(reconstructWordReorderTokens(tokens, "Mein Name ist Tom"), [
    "0:Mein Name",
    "1:ist",
    "2:Tom",
  ]);
});

test("reconstructWordReorderTokens: từ trùng nhau trong pool dùng đúng số lần xuất hiện", () => {
  const tokens = ["Ich", "Ich", "bin"];
  assert.deepEqual(reconstructWordReorderTokens(tokens, "Ich Ich bin"), [
    "0:Ich",
    "1:Ich",
    "2:bin",
  ]);
});

test("reconstructWordReorderTokens: đáp án rỗng trả mảng rỗng", () => {
  assert.deepEqual(reconstructWordReorderTokens(["Ich", "bin"], ""), []);
});

test("reconstructWordReorderTokens: đáp án không khớp token pool trả mảng rỗng thay vì đoán bừa", () => {
  assert.deepEqual(reconstructWordReorderTokens(["Ich", "bin"], "Ich war"), []);
});

test("parseAnswersIntoFormState: word_reorder phục hồi selectedTokens để hydrate lại UI chọn từ", () => {
  const exercises = [base({ id: "e1", type: "word_reorder", tokens: ["heiße", "Ich", "Anna"] })];
  const result = parseAnswersIntoFormState(exercises, { e1: "Ich heiße Anna" });
  assert.deepEqual(result.selectedTokens.e1, ["1:Ich", "0:heiße", "2:Anna"]);
});

const matching = (over: Partial<GrammarExercise> = {}): GrammarExercise =>
  base({
    id: "m1",
    type: "matching",
    matchingPairs: [{ de: "der Tisch", vi: "cái bàn" }, { de: "die Lampe", vi: "cái đèn" }],
    ...over,
  });

test("matching: round-trip qua serializeMatching/parseMatching", () => {
  const ex = matching();
  const raw = "der Tisch:cái bàn|die Lampe:cái đèn";
  assert.deepEqual(parseAnswer(ex, raw), {
    kind: "matching",
    values: { "der Tisch": "cái bàn", "die Lampe": "cái đèn" },
  });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("matching: chưa ghép hết cặp thì serialize ra chuỗi rỗng", () => {
  const ex = matching();
  assert.equal(serializeAnswer(ex, { kind: "matching", values: { "der Tisch": "cái bàn" } }), "");
});

test("matching: partial=true giữ lại cặp đã ghép dở (draft autosave)", () => {
  const ex = matching();
  const serialized = serializeAnswer(
    ex,
    { kind: "matching", values: { "der Tisch": "cái bàn" } },
    { partial: true },
  );
  assert.equal(serialized, "der Tisch:cái bàn");
});

test("matching: partial=true nhưng chưa ghép gì thì vẫn trả rỗng", () => {
  const ex = matching();
  assert.equal(serializeAnswer(ex, { kind: "matching", values: {} }, { partial: true }), "");
});

test("emptyAnswer: matching", () => {
  assert.deepEqual(emptyAnswer(matching()), { kind: "matching", values: {} });
});

test("parseAnswersIntoFormState: matching phục hồi vào matchedPairs", () => {
  const exercises = [matching()];
  const result = parseAnswersIntoFormState(exercises, { m1: "der Tisch:cái bàn|die Lampe:cái đèn" });
  assert.deepEqual(result.matchedPairs.m1, { "der Tisch": "cái bàn", "die Lampe": "cái đèn" });
});
