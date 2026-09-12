import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "useModules.ts"), "utf8");

test("useModules selects lesson status and filters to published only", () => {
  assert.match(source, /filterPublishedLessons/);
  assert.match(source, /video_r2_key, status/);
  assert.match(source, /filterPublishedLessons\(m\.lessons \?\? \[\]\)/);
});
