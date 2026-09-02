import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListeningPayload,
  validateListeningExercise,
  type ListeningExerciseForm,
} from "./listeningExerciseForm.ts";
import {
  LISTENING_QUESTION_TYPES,
  LISTENING_TYPE_LABELS,
  type ListeningQuestionType,
} from "./listeningExerciseTypes.ts";

const baseForm = (overrides: Partial<ListeningExerciseForm> = {}): ListeningExerciseForm => ({
  type: "richtig_falsch",
  promptText: "",
  correctAnswer: null,
  correctOptionIndex: -1,
  options: [],
  blanks: [],
  ...overrides,
});

describe("listeningExerciseTypes", () => {
  it("exports three listening question types with Vietnamese labels", () => {
    assert.deepEqual(LISTENING_QUESTION_TYPES, [
      "fill_in_the_blank",
      "multiple_choice",
      "richtig_falsch",
    ]);
    const types: ListeningQuestionType[] = [...LISTENING_QUESTION_TYPES];
    assert.equal(types.length, 3);
    assert.equal(LISTENING_TYPE_LABELS.fill_in_the_blank, "Điền vào ô trống");
    assert.equal(LISTENING_TYPE_LABELS.multiple_choice, "Trắc nghiệm");
    assert.equal(LISTENING_TYPE_LABELS.richtig_falsch, "Richtig / Falsch");
  });
});

describe("listeningExerciseForm", () => {
  it("richtig_falsch requires prompt and answer", () => {
    const err = validateListeningExercise(baseForm());
    assert.match(err ?? "", /không được để trống/);
  });

  it("richtig_falsch rejects invalid answer", () => {
    const err = validateListeningExercise(
      baseForm({ promptText: "Lisa ist 20.", correctAnswer: null }),
    );
    assert.match(err ?? "", /Richtig hoặc Falsch/);
  });

  it("richtig_falsch accepts valid form", () => {
    const err = validateListeningExercise(
      baseForm({ promptText: "Lisa ist 20.", correctAnswer: "falsch" }),
    );
    assert.equal(err, null);
  });

  it("buildListeningPayload stores richtig/falsch answer", () => {
    const payload = buildListeningPayload(
      baseForm({
        promptText: "Lisa ist 20.",
        correctAnswer: "falsch",
      }),
    );
    assert.equal(payload.correct_answer, "falsch");
    assert.equal(payload.prompt_text, "Lisa ist 20.");
    assert.equal(payload.type, "richtig_falsch");
    assert.equal(payload.options, null);
    assert.equal(payload.blanks, null);
  });

  it("fill_in_the_blank delegates validation to grammarExerciseForm", () => {
    const err = validateListeningExercise(
      baseForm({
        type: "fill_in_the_blank",
        promptText: "Ich ___ nach Hause.",
        blanks: [{ acceptedAnswers: ["gehe"] }],
      }),
    );
    assert.equal(err, null);
  });

  it("fill_in_the_blank rejects missing blank answers", () => {
    const err = validateListeningExercise(
      baseForm({
        type: "fill_in_the_blank",
        promptText: "Ich ___ nach Hause.",
        blanks: [{ acceptedAnswers: [] }],
      }),
    );
    assert.match(err ?? "", /đáp án hợp lệ/);
  });

  it("buildListeningPayload delegates fill_in_the_blank to grammarExerciseForm", () => {
    const payload = buildListeningPayload(
      baseForm({
        type: "fill_in_the_blank",
        promptText: "Ich ___ nach Hause.",
        blanks: [{ acceptedAnswers: ["gehe"] }],
      }),
    );
    assert.equal(payload.type, "fill_in_the_blank");
    assert.equal(payload.prompt_text, "Ich ___ nach Hause.");
    assert.equal(payload.correct_answer, null);
    assert.deepEqual(payload.blanks, [{ acceptedAnswers: ["gehe"] }]);
  });

  it("multiple_choice delegates validation to grammarExerciseForm", () => {
    const err = validateListeningExercise(
      baseForm({
        type: "multiple_choice",
        promptText: "Was ist das?",
        options: ["A", "B", "C"],
        correctOptionIndex: 1,
      }),
    );
    assert.equal(err, null);
  });

  it("buildListeningPayload delegates multiple_choice to grammarExerciseForm", () => {
    const payload = buildListeningPayload(
      baseForm({
        type: "multiple_choice",
        promptText: "Was ist das?",
        options: ["A", "B", "C"],
        correctOptionIndex: 1,
      }),
    );
    assert.equal(payload.type, "multiple_choice");
    assert.equal(payload.prompt_text, "Was ist das?");
    assert.equal(payload.correct_answer, "1");
    assert.deepEqual(payload.options, ["A", "B", "C"]);
  });
});
