import assert from "node:assert/strict";
import test from "node:test";
import {
  courseStatus,
  getActiveCourseId,
  isContinueLearningCta,
} from "./PackagesPage";

test("trial learner uses the trial course; paid learner uses A1 online", () => {
  assert.equal(getActiveCourseId(true), "trial");
  assert.equal(getActiveCourseId(false), "a1");
});

test("Đang sử dụng sits on the active course; A1 online stays Khuyên dùng otherwise", () => {
  assert.deepEqual(courseStatus("trial", undefined, "trial"), {
    label: "Đang sử dụng",
    tone: "current",
  });
  assert.deepEqual(courseStatus("a1", undefined, "trial"), {
    label: "Khuyên dùng",
    tone: "available",
  });
  assert.deepEqual(courseStatus("a1", undefined, "a1"), {
    label: "Đang sử dụng",
    tone: "current",
  });
  assert.equal(courseStatus("trial", undefined, "a1"), null);
  assert.deepEqual(courseStatus("a1-plus", true, "a1"), {
    label: "Đang triển khai",
    tone: "building",
  });
});

test("Tiếp tục học is always on trial and on the active paid course", () => {
  assert.equal(isContinueLearningCta("trial", "trial"), true);
  assert.equal(isContinueLearningCta("a1", "trial"), false);
  assert.equal(isContinueLearningCta("trial", "a1"), true);
  assert.equal(isContinueLearningCta("a1", "a1"), true);
  assert.equal(isContinueLearningCta("a1-plus", "a1"), false);
});
