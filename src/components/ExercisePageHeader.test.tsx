import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePageHeader } from "./ExercisePageHeader";

test("renders the exercise title and top return-to-lesson action", () => {
  const html = renderToStaticMarkup(
    <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={() => {}} />,
  );

  assert.match(html, />Bài tập ngữ pháp</);
  assert.match(html, />Trở về bài học</);
  assert.match(html, /id="btn-exercise-back-to-lesson"/);
});

test("passes the return callback to the button", () => {
  const onBackToLesson = () => {};
  const element = ExercisePageHeader({ title: "Quiz", onBackToLesson });
  const buttonElement = element.props.children[1];

  assert.equal(buttonElement.props.onClick, onBackToLesson);
});
