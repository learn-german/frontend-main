import assert from "node:assert/strict";
import test from "node:test";
import { BOTTOM_TABS } from "./LessonDetailPage";

test("labels grammar theory as Grammatik and keeps exercises distinct", () => {
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "nguphapthenchot")?.label, "Grammatik");
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "quiz")?.label, "Grammatikübungen");
});
