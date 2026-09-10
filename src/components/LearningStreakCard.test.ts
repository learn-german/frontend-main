import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () =>
  readFileSync(new URL("./LearningStreakCard.tsx", import.meta.url), "utf8");

test("LearningStreakCard includes Vietnamese title and day labels", () => {
  const s = source();
  assert.match(s, /CHUỖI HỌC LIÊN TỤC/);
  for (const label of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]) {
    assert.match(s, new RegExp(`"${label}"`));
  }
  assert.match(s, /Hãy học hôm nay để bắt đầu chuỗi!/);
  assert.match(s, /Bạn đang duy trì thói quen học rất tốt!/);
});
