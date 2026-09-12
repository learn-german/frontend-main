import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "ExerciseAnswerInput.tsx"),
  "utf8",
);

test("classification bank uses shuffledClassificationItems, not raw admin order", () => {
  assert.match(source, /const shuffledClassificationItems = useMemo\(/);
  assert.match(source, /shuffleCopy\(exercise\.classificationItems/);
  assert.match(
    source,
    /shuffledClassificationItems\s*\n\s*\.filter\(\(item\) => !itemGroups\[item\]\)/,
  );
});
