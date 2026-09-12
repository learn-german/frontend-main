import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mergeMultilineTableRows, splitBrText } from "./markdownTable.ts";

function renderSplitBr(text: string, keyPrefix = "td"): string {
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null, splitBrText(text, keyPrefix)),
  );
}

test("mergeMultilineTableRows joins continued table rows with <br/>", () => {
  const input = [
    "| Col A | Col B |",
    "| --- | --- |",
    "| line one",
    "continued | still open",
    "more |",
    "| done | ok |",
  ].join("\n");

  const result = mergeMultilineTableRows(input);

  assert.match(result, /\| line one<br\/>continued \| still open<br\/>more \|/);
  assert.match(result, /\| done \| ok \|/);
});

test("mergeMultilineTableRows leaves well-formed table rows unchanged", () => {
  const table = [
    "| A | B |",
    "| --- | --- |",
    "| one | two |",
  ].join("\n");

  assert.equal(mergeMultilineTableRows(table), table);
});

test("mergeMultilineTableRows leaves prose lines unchanged", () => {
  const input = "Paragraph one\nStill prose";
  assert.equal(mergeMultilineTableRows(input), input);
});

test("mergeMultilineTableRows merges pipe-prefixed lines missing trailing |", () => {
  const input = "| incomplete\ncontinuation";
  assert.equal(mergeMultilineTableRows(input), "| incomplete<br/>continuation");
});

test("splitBrText turns <br/> into multiple parts with line breaks", () => {
  const html = renderSplitBr("line1<br/>line2");

  assert.match(html, /line1/);
  assert.match(html, /<br\/?>/);
  assert.match(html, /line2/);
});

test("splitBrText preserves text without br", () => {
  assert.equal(renderSplitBr("plain text"), "plain text");
});

test("splitBrText splits multiple <br/> markers", () => {
  const html = renderSplitBr("a<br/>b<br/>c");
  assert.equal((html.match(/<br\/?>/g) ?? []).length, 2);
  assert.match(html, /a/);
  assert.match(html, /b/);
  assert.match(html, /c/);
});
