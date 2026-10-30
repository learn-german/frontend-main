import assert from "node:assert/strict";
import test from "node:test";
import { listeningGroupLayoutClass } from "./listeningExerciseTypes";

test("listeningGroupLayoutClass: richtig_falsch và classification là 1 cột", () => {
  assert.equal(listeningGroupLayoutClass("richtig_falsch"), "grid grid-cols-1 gap-3");
  assert.equal(listeningGroupLayoutClass("classification"), "grid grid-cols-1 gap-3");
});

test("listeningGroupLayoutClass: trắc nghiệm giữ lưới 3 cột", () => {
  assert.equal(
    listeningGroupLayoutClass("multiple_choice"),
    "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
  );
});
