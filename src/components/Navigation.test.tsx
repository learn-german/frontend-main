import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Navigation.tsx pulls in the Supabase client, which needs Vite env vars, so
// assert on the source the way ExercisePageHeader.test.tsx does.
const sidebarClasses = () => {
  const source = readFileSync(new URL("./Navigation.tsx", import.meta.url), "utf8");
  const match = source.match(/<aside className="([^"]*)"/);
  assert.ok(match, "Sidebar should render an <aside>");
  return match[1];
};

test("sidebar sticks flush to the viewport top when the page scrolls", () => {
  const classes = sidebarClasses();

  assert.match(classes, /\bsticky\b/);
  assert.match(classes, /\btop-0\b/);
  // A header-height reserve inside the sticky column keeps showing as empty
  // space once the header has scrolled away — the -mt-[73px] pt-[73px] bug.
  assert.doesNotMatch(classes, /(^|\s)-?[mp]t-\[/);
});
