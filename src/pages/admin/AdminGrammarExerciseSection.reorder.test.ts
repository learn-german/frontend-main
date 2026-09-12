import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AdminGrammarExerciseSection.tsx"),
  "utf8",
);

test("handleReorderGroups syncs exercise_sets.order_index via orderedUniqueSetIds", () => {
  assert.match(source, /const handleReorderGroups = async/);
  assert.match(source, /orderedUniqueSetIds\(reorderedGroups\)/);
  assert.match(
    source,
    /from\("exercise_sets"\)\.update\(\{\s*order_index:\s*orderIndex\s*\}\)/,
  );
});
