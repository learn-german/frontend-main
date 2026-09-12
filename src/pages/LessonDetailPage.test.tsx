import assert from "node:assert/strict";
import test from "node:test";
import { BOTTOM_TABS } from "./lessonBottomTabs";

test("labels grammar theory as Grammatik and keeps exercises distinct", () => {
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "nguphapthenchot")?.label, "Grammatik");
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "quiz")?.label, "Grammatikübungen");
});

test("BOTTOM_TABS entries include Vietnamese labelVi translations", () => {
  const expected: Record<string, string> = {
    nguphapthenchot: "Ngữ pháp",
    tuvung: "Từ vựng",
    quiz: "Bài tập ngữ pháp",
    doc: "Bài đọc",
    nghe: "Bài nghe",
    viet: "Bài viết",
    noi: "Bài nói",
  };
  for (const tab of BOTTOM_TABS) {
    assert.equal(tab.labelVi, expected[tab.id], `labelVi for ${tab.id}`);
  }
});
