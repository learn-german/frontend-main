import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  markdownTableEnter,
  mergeMultilineTableRows,
  splitBrText,
} from "./markdownTable.ts";

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

const ROW = "| ich bin | wir sind |";
const ICH_COL = ROW.indexOf("ich") + "ich".length;

test("markdownTableEnter inserts <br/> inside a table cell", () => {
  const result = markdownTableEnter(ROW, ICH_COL, ICH_COL);
  assert.ok(result);
  assert.equal(result.value, "| ich<br/> bin | wir sind |");
  assert.equal(result.cursor, ICH_COL + "<br/>".length);
});

test("markdownTableEnter replaces a selection with <br/>", () => {
  const start = ROW.indexOf("bin");
  const result = markdownTableEnter(ROW, start, start + 3);
  assert.ok(result);
  assert.equal(result.value, "| ich <br/> | wir sind |");
});

test("markdownTableEnter returns null at end of table row", () => {
  assert.equal(markdownTableEnter(ROW, ROW.length, ROW.length), null);
});

test("markdownTableEnter returns null on prose", () => {
  assert.equal(markdownTableEnter("hello world", 5, 5), null);
});

test("markdownTableEnter returns null on separator row", () => {
  const sep = "| --- | ---: | :--- |";
  assert.equal(markdownTableEnter(sep, 4, 4), null);
});

test("markdownTableEnter returns null for a multi-line selection", () => {
  const value = "| a | b |\n| c | d |";
  assert.equal(markdownTableEnter(value, 2, value.length - 2), null);
});

test("splitBrText turns <br> and <br /> into line breaks", () => {
  assert.match(renderSplitBr("line1<br>line2"), /<br\/?>/);
  assert.match(renderSplitBr("line1<br />line2"), /<br\/?>/);
  assert.match(renderSplitBr("line1<BR/>line2"), /<br\/?>/);
});
