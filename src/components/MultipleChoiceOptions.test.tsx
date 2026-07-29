import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MultipleChoiceOptions } from "./MultipleChoiceOptions";

const noop = () => {};

test("render đủ số phương án với nhãn A/B theo thứ tự", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={undefined} onSelect={noop} exerciseId="e1" />,
  );
  assert.match(html, />A</);
  assert.match(html, />B</);
  assert.doesNotMatch(html, />C</);
  assert.match(html, />der</);
  assert.match(html, />die</);
});

test("render 4 phương án thì có nhãn tới D", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["a", "b", "c", "d"]} selectedIndex={undefined} onSelect={noop} exerciseId="e1" />,
  );
  assert.match(html, />D</);
});

test("chỉ phương án đang chọn được đánh dấu aria-checked", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die", "das"]} selectedIndex={1} onSelect={noop} exerciseId="e1" />,
  );
  assert.equal(html.match(/aria-checked="true"/g)?.length, 1);
  assert.equal(html.match(/aria-checked="false"/g)?.length, 2);
});

test("sau khi nộp, đáp án đã chọn được tô xanh khi đúng và đỏ khi sai", () => {
  const correct = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={0} onSelect={noop} exerciseId="e1" result={true} />,
  );
  assert.match(correct, /border-green-400/);
  const wrong = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={0} onSelect={noop} exerciseId="e1" result={false} />,
  );
  assert.match(wrong, /border-red-400/);
  assert.doesNotMatch(wrong, /border-green-400/);
});

test("không tiết lộ đáp án đúng: phương án không được chọn giữ style trung tính", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={0} onSelect={noop} exerciseId="e1" result={false} />,
  );
  assert.equal(html.match(/border-red-400/g)?.length, 1);
});
