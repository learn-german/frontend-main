import assert from "node:assert/strict";
import test from "node:test";
import { isAllSetsPassed } from "../lib/lessonSetSummary";
import { BOTTOM_TABS } from "./lessonBottomTabs";

const EXPECTED_BOTTOM_TAB_LABELS_VI: Record<string, string> = {
  nguphapthenchot: "Ngữ pháp",
  tuvung: "Từ vựng",
  quiz: "Bài tập ngữ pháp",
  doc: "Bài đọc",
  nghe: "Bài nghe",
  viet: "Bài viết",
  noi: "Bài nói",
};

test("BOTTOM_TABS defines all seven lesson tabs in display order", () => {
  assert.deepEqual(
    BOTTOM_TABS.map(({ id }) => id),
    ["nguphapthenchot", "tuvung", "quiz", "doc", "nghe", "viet", "noi"],
  );
});

test("labels grammar theory as Grammatik and keeps exercises distinct", () => {
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "nguphapthenchot")?.label, "Grammatik");
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "quiz")?.label, "Grammatikübungen");
});

test("every BOTTOM_TABS entry has a non-empty Vietnamese labelVi", () => {
  assert.equal(BOTTOM_TABS.length, Object.keys(EXPECTED_BOTTOM_TAB_LABELS_VI).length);
  for (const tab of BOTTOM_TABS) {
    assert.ok(tab.labelVi.trim().length > 0, `labelVi for ${tab.id} must be non-empty`);
    assert.equal(tab.labelVi, EXPECTED_BOTTOM_TAB_LABELS_VI[tab.id], `labelVi for ${tab.id}`);
  }
});

test("exercise CTA uses Luyện tập lại only when all sets passed", () => {
  const ctaLabel = (passed: boolean) => (passed ? "Luyện tập lại" : "Bắt đầu bài tập ngữ pháp");
  const showPassHint = (passed: boolean) => !passed;

  assert.equal(ctaLabel(isAllSetsPassed(null)), "Bắt đầu bài tập ngữ pháp");
  assert.equal(showPassHint(isAllSetsPassed(null)), true);

  assert.equal(ctaLabel(isAllSetsPassed({ passedCount: 1, totalCount: 3, latestScore: 90, latestSubmittedAt: "2026-01-01" })), "Bắt đầu bài tập ngữ pháp");
  assert.equal(showPassHint(isAllSetsPassed({ passedCount: 1, totalCount: 3, latestScore: 90, latestSubmittedAt: "2026-01-01" })), true);

  assert.equal(ctaLabel(isAllSetsPassed({ passedCount: 2, totalCount: 2, latestScore: 95, latestSubmittedAt: "2026-01-01" })), "Luyện tập lại");
  assert.equal(showPassHint(isAllSetsPassed({ passedCount: 2, totalCount: 2, latestScore: 95, latestSubmittedAt: "2026-01-01" })), false);
});
