import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePageHeader } from "./ExercisePageHeader";

test("renders the exercise title and top return-to-lesson action", () => {
  const html = renderToStaticMarkup(
    <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={() => {}} />,
  );

  assert.match(html, />Bài tập ngữ pháp</);
  assert.match(html, /Trở về bài học</);
  assert.match(html, /id="btn-exercise-back-to-lesson"/);
});

test("passes the return callback to the button", () => {
  const onBackToLesson = () => {};
  const element = ExercisePageHeader({ title: "Quiz", onBackToLesson });
  const actions = element.props.children[1];
  const buttonElement = actions.props.children[1];

  assert.equal(buttonElement.props.onClick, onBackToLesson);
});

test("renders level badge, lesson title, and progress when provided", () => {
  const html = renderToStaticMarkup(
    <ExercisePageHeader
      title="Bài tập nghe"
      levelBadge="A1"
      lessonTitle="Greetings"
      progress={{ current: 1, total: 3 }}
      onBackToLesson={() => {}}
    />,
  );

  assert.match(html, />A1</);
  assert.match(html, />Greetings</);
  assert.match(html, /Tiến độ bài học/);
  assert.match(html, />1\/3</);
});

test("both exercise set-list pages use the shared top header", () => {
  const grammarSource = readFileSync(new URL("../pages/GrammarSetListPage.tsx", import.meta.url), "utf8");
  const quizSource = readFileSync(new URL("../pages/QuizSetListPage.tsx", import.meta.url), "utf8");

  assert.match(grammarSource, /<ExercisePageHeader[\s\S]*onBackToLesson=\{onBackToLesson\}/);
  assert.match(quizSource, /ExercisePageHeader/);
  assert.match(quizSource, /onBackToLesson/);
  assert.match(quizSource, /<ExercisePageHeader \{\.\.\.headerProps\}/);
});
