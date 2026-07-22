import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GrammarExerciseHint } from "./GrammarExerciseHint";

test("renders nothing when the grouped exercise has no meaningful hint", () => {
  assert.equal(renderToStaticMarkup(<GrammarExerciseHint hint={"  \n "} groupKey="group-1" />), "");
});

test("renders a collapsed accessible control by default", () => {
  const html = renderToStaticMarkup(
    <GrammarExerciseHint hint={'Dòng một\n<script>alert("x")</script>'} groupKey="group-1" />,
  );

  assert.match(html, /aria-expanded="false"/);
  assert.match(html, />Xem gợi ý</);
  assert.doesNotMatch(html, /alert/);
});
