# Notion-style Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled markdown parser in `src/components/MarkdownBlock.tsx` with `react-markdown` + `remark-gfm` so admin-authored grammar content pasted from Notion (nested lists, checkboxes, multi-line code blocks, callouts, tables) renders correctly instead of showing raw markdown syntax.

**Architecture:** Two pure preprocessing functions massage the raw string (merge table rows that got split across lines, wrap bare callout-icon lines into blockquotes) before handing it to `<ReactMarkdown remarkPlugins={[remarkGfm]}>`. A `components` map supplies Tailwind styling matching the app's existing design so the output looks identical to the current renderer for content that already worked, and adds new rendering for the previously-unsupported constructs.

**Tech Stack:** React 19, TypeScript 5.8, `react-markdown` 10.x, `remark-gfm` 4.x, `lucide-react` (already a dependency, used for checkbox icons).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-notion-style-markdown-design.md` — read it before starting.
- Do not use `any` anywhere (project rule, CLAUDE.md).
- Do not add any npm package beyond `react-markdown` and `remark-gfm` — those two are pre-approved by the user for this plan; anything else needs a fresh ask.
- Only touch `src/components/MarkdownBlock.tsx`, `src/pages/admin/AdminLessonEditor.tsx` (hint text only), and `package.json`/`package-lock.json` (dependency install). Do not modify `LessonDetailPage.tsx` or any other caller — `MarkdownBlock`'s public props (`{ content: string; className?: string }`) do not change.
- This repo has no automated test runner configured (no `test` script, no Jest/Vitest/Playwright config in use despite `playwright` being listed as a devDependency). Verification in this plan uses throwaway scripts run via `npx tsx` (already a devDependency) against `/tmp/markdown-block-verify/`, plus `npm run lint` (`tsc --noEmit`), plus a temporary browser harness (`mdtest.html`/`mdtest.tsx` at the repo root, deleted before the final commit). This mirrors how the preceding table-rendering bug fix in this same file was verified — follow the same pattern.
- Dev server needs Node 20 in this environment (Node 16 is default via nvm and fails Vite 6 with a `crypto.getRandomValues` error): `source ~/.nvm/nvm.sh && nvm use 20` before running `npm run dev` or `npm run lint`.
- Run every command in this plan (including `npx tsx /tmp/...`) with the shell's working directory at the repo root (`/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519`), even though the scripts themselves live in `/tmp`. `npx` resolves the local `tsx` devDependency from the current working directory, not from the script's location — running from elsewhere may silently fall back to a different `tsx` or fail to resolve it.

---

### Task 1: Preprocessing helpers (table-row merge + callout wrapping)

**Files:**
- Modify: `src/components/MarkdownBlock.tsx` (add new functions; do not remove any existing code yet — the old hand-rolled parser still renders the component's export until Task 2)

**Interfaces:**
- Produces: `preprocessMarkdown(content: string): string` — exported from the file for the standalone test script to import; Task 2 will call this from inside the `MarkdownBlock` component and can keep or drop the `export` keyword once integrated (keep it — no reason to hide it, and it makes the function independently testable long-term).
- Produces: `mergeMultilineTableRows(content: string): string` and `wrapCalloutLines(content: string): string` (internal helpers composed by `preprocessMarkdown`; do not export these two, only `preprocessMarkdown`).

- [ ] **Step 1: Write the failing verification script**

Create `/tmp/markdown-block-verify/task1.mts`:

```ts
import assert from "node:assert/strict";
import { preprocessMarkdown } from "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/src/components/MarkdownBlock";

// Real production content from lessons.grammar_md (id = 'a1-l1') — the table
// whose cells got split across physical lines by whatever pasted it in.
const alphabetTable =
  "| **A, a**\n[A] | **B, b**\n[Be] |\n" +
  "| --- | --- |\n" +
  "| **K, k**\n[Ka] | **L, l**\n[El] |";

const mergedTable = preprocessMarkdown(alphabetTable);
assert.equal(mergedTable.split("\n").length, 3, "each logical row must collapse to exactly one physical line");
assert.ok(mergedTable.includes("**A, a**<br/>[A]"), "cell content must be joined with <br/>, not left as a raw newline");
assert.ok(!mergedTable.includes("**A, a**\n"), "no bare newline should remain inside a merged row");
console.log("table merge: OK");

// A well-formed single-line table must pass through unchanged (no regression
// for tables that were never split across lines).
const simpleTable = "| A | B |\n| --- | --- |\n| 1 | 2 |";
assert.equal(preprocessMarkdown(simpleTable), simpleTable, "already well-formed tables must not be altered");
console.log("simple table passthrough: OK");

// A bare callout line (no leading '>') must be wrapped into a blockquote.
const callout = preprocessMarkdown("💡 Nhớ chia động từ theo ngôi");
assert.equal(callout, "> 💡 Nhớ chia động từ theo ngôi", "bare callout icon line must be wrapped with '> '");
console.log("callout wrap: OK");

// A callout icon inside a fenced code block must NOT be wrapped.
const fenced = "```\n💡 not a callout, just example text\n```";
assert.equal(preprocessMarkdown(fenced), fenced, "content inside a code fence must be left untouched");
console.log("fenced code guard: OK");

// A callout icon that is already a list item or already quoted must not be double-wrapped.
const alreadyList = "- 💡 already a list item";
assert.equal(preprocessMarkdown(alreadyList), alreadyList, "existing list/blockquote/table lines must not be re-wrapped");
console.log("no double-wrap: OK");

console.log("ALL PASS");
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx /tmp/markdown-block-verify/task1.mts
```

Expected: fails with a TypeScript/import error — `preprocessMarkdown` does not exist yet in `MarkdownBlock.tsx` (`SyntaxError` or `TypeError: preprocessMarkdown is not a function` or a module-resolution error, depending on tsx's error surface). Any failure here is correct — the function doesn't exist yet.

- [ ] **Step 3: Implement the preprocessing functions**

In `src/components/MarkdownBlock.tsx`, add these three functions. Place them after the existing `isSeparatorRow` line (line 44) and before the `MarkdownBlock` component (line 46) — leave everything else in the file untouched for now:

```ts
const CALLOUT_ICONS = ["💡", "⚠️", "❗", "✅", "ℹ️"];

function mergeMultilineTableRows(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("|")) {
      let buffer = line;
      let j = i;
      while (!buffer.trim().endsWith("|") && j + 1 < lines.length) {
        j++;
        buffer += "<br/>" + lines[j];
      }
      out.push(buffer);
      i = j + 1;
    } else {
      out.push(line);
      i++;
    }
  }
  return out.join("\n");
}

function wrapCalloutLines(content: string): string {
  let inFence = false;
  return content
    .split("\n")
    .map(line => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const trimmed = line.trim();
      const startsWithCallout = CALLOUT_ICONS.some(icon => trimmed.startsWith(icon));
      const alreadyBlock = /^[-*>|]|^\d+\./.test(trimmed);
      if (startsWithCallout && !alreadyBlock) return `> ${trimmed}`;
      return line;
    })
    .join("\n");
}

export function preprocessMarkdown(content: string): string {
  return wrapCalloutLines(mergeMultilineTableRows(content));
}
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx tsx /tmp/markdown-block-verify/task1.mts
```

Expected output:
```
table merge: OK
simple table passthrough: OK
callout wrap: OK
fenced code guard: OK
no double-wrap: OK
ALL PASS
```

If `simple table passthrough` fails: check that `mergeMultilineTableRows` only appends `"<br/>" + lines[j]` when the buffer does NOT already end with `|` — a well-formed row ends with `|` on its very first line, so the `while` loop body never runs and `buffer` is pushed unchanged.

- [ ] **Step 5: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors (the file still exports the same `MarkdownBlock` component with its old implementation; we only added new, unused-by-the-component-yet functions — `preprocessMarkdown` is exported so it won't trigger an unused-export warning, and `mergeMultilineTableRows`/`wrapCalloutLines`/`CALLOUT_ICONS` are used by `preprocessMarkdown` so they aren't unused either).

- [ ] **Step 6: Commit**

```bash
git add src/components/MarkdownBlock.tsx
git commit -m "feat: add markdown preprocessing for multi-line table cells and bare callouts"
```

---

### Task 2: Swap the renderer to react-markdown + remark-gfm

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Modify: `src/components/MarkdownBlock.tsx` — delete the entire old hand-rolled parser (`renderInline`, `renderCell`, `readTableRow`, `isSeparatorRow`, and the whole body of the `MarkdownBlock` component) and replace with the `react-markdown` based implementation. Keep the three functions added in Task 1 (`CALLOUT_ICONS`, `mergeMultilineTableRows`, `wrapCalloutLines`, `preprocessMarkdown`) unchanged.

**Interfaces:**
- Consumes: `preprocessMarkdown(content: string): string` from Task 1 (same file, no import needed).
- Produces: `MarkdownBlock: React.FC<{ content: string; className?: string }>` — same public signature as before; [LessonDetailPage.tsx:132](../../../src/pages/LessonDetailPage.tsx) and [AdminLessonEditor.tsx:197](../../../src/pages/admin/AdminLessonEditor.tsx) call it unchanged.

- [ ] **Step 1: Install the dependencies**

```bash
npm install react-markdown remark-gfm
```

Expected: `package.json` `dependencies` gains `"react-markdown": "^10.1.0"` and `"remark-gfm": "^4.0.1"` (or whatever the resolved caret ranges are — exact patch versions may differ slightly).

- [ ] **Step 2: Write the failing verification script**

Create `/tmp/markdown-block-verify/task2.tsx`. This uses `react-dom/server`'s `renderToStaticMarkup` (no new test-framework dependency needed) to render `MarkdownBlock` with content covering every construct from the spec, and asserts the output HTML contains what's expected:

```tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownBlock } from "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/src/components/MarkdownBlock";

// 1. Regression: the real alphabet table from lesson a1-l1 (multi-line cells)
// must still render as a table, not raw pipes.
const alphabetTable =
  "## Alphabet\n" +
  "| **A, a**\n[A] | **B, b**\n[Be] |\n" +
  "| --- | --- |\n" +
  "| **K, k**\n[Ka] | **L, l**\n[El] |";
const tableHtml = renderToStaticMarkup(<MarkdownBlock content={alphabetTable} />);
assert.ok(tableHtml.includes("<table"), "table markup missing");
assert.ok(tableHtml.includes("<th"), "table header missing");
assert.ok(!tableHtml.includes("| **A"), "raw pipe/asterisk leaked into output — table not parsed");
console.log("1. alphabet table regression: OK");

// 2. Nested list (2 levels).
const nested = "- Cấp 1\n  - Cấp 2\n- Cấp 1 lại";
const nestedHtml = renderToStaticMarkup(<MarkdownBlock content={nested} />);
const ulCount = (nestedHtml.match(/<ul/g) || []).length;
assert.ok(ulCount >= 2, `expected at least 2 nested <ul>, got ${ulCount}`);
console.log("2. nested list: OK");

// 3. Checkbox / task list.
const tasks = "- [ ] Chưa học\n- [x] Đã học";
const tasksHtml = renderToStaticMarkup(<MarkdownBlock content={tasks} />);
assert.ok(tasksHtml.includes("<svg"), "expected a lucide checkbox icon (svg) in task list output");
assert.ok(!tasksHtml.includes("[ ]") && !tasksHtml.includes("[x]"), "raw checkbox brackets leaked into output");
console.log("3. checkbox task list: OK");

// 4. Fenced code block (multi-line).
const code = "```\nline one\nline two\n```";
const codeHtml = renderToStaticMarkup(<MarkdownBlock content={code} />);
assert.ok(codeHtml.includes("<pre"), "expected a <pre> block for fenced code");
assert.ok(codeHtml.includes("line one") && codeHtml.includes("line two"), "code block content missing");
console.log("4. fenced code block: OK");

// 5. Callout with each of the 5 icons — must get a colored box, not a plain blockquote.
for (const icon of ["💡", "⚠️", "❗", "✅", "ℹ️"]) {
  const html = renderToStaticMarkup(<MarkdownBlock content={`${icon} Ghi chú quan trọng`} />);
  assert.ok(!html.includes("<blockquote"), `icon ${icon} should render as a callout div, not a <blockquote>`);
  assert.ok(html.includes(icon), `icon ${icon} missing from callout output`);
}
console.log("5. callouts (5 icons): OK");

// 6. Plain blockquote (no icon) keeps the old blockquote style.
const plainQuote = "> Trích dẫn không có icon";
const plainQuoteHtml = renderToStaticMarkup(<MarkdownBlock content={plainQuote} />);
assert.ok(plainQuoteHtml.includes("<blockquote"), "plain blockquote (no callout icon) must still render as <blockquote>");
console.log("6. plain blockquote: OK");

// 7. Heading levels 1–6 all render (h4-h6 reuse h3 styling per spec).
const headings = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
const headingsHtml = renderToStaticMarkup(<MarkdownBlock content={headings} />);
for (const tag of ["h1", "h2", "h3"]) {
  assert.ok(headingsHtml.includes(`<${tag}`), `missing <${tag}>`);
}
assert.ok(!headingsHtml.includes("####"), "raw #### leaked into output");
console.log("7. headings h1-h6: OK");

console.log("ALL PASS");
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npx tsx /tmp/markdown-block-verify/task2.tsx
```

Expected: fails on assertion 1 (`raw pipe/asterisk leaked into output`) or similar — the component still uses the old hand-rolled parser, which doesn't produce `<svg>` checkboxes, doesn't wrap callouts in colored divs, etc. Any failure confirms the test is exercising real behavior, not a typo.

- [ ] **Step 4: Replace the component implementation**

Replace the entire contents of `src/components/MarkdownBlock.tsx` with:

```tsx
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckSquare, Square } from "lucide-react";

const CALLOUT_ICONS = ["💡", "⚠️", "❗", "✅", "ℹ️"];

const CALLOUT_STYLES: Record<string, string> = {
  "💡": "bg-amber-50 border-amber-400 text-amber-800",
  "ℹ️": "bg-blue-50 border-blue-400 text-blue-800",
  "⚠️": "bg-orange-50 border-orange-400 text-orange-800",
  "❗": "bg-rose-50 border-rose-400 text-rose-800",
  "✅": "bg-green-50 border-green-400 text-green-800",
};

function mergeMultilineTableRows(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("|")) {
      let buffer = line;
      let j = i;
      while (!buffer.trim().endsWith("|") && j + 1 < lines.length) {
        j++;
        buffer += "<br/>" + lines[j];
      }
      out.push(buffer);
      i = j + 1;
    } else {
      out.push(line);
      i++;
    }
  }
  return out.join("\n");
}

function wrapCalloutLines(content: string): string {
  let inFence = false;
  return content
    .split("\n")
    .map(line => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const trimmed = line.trim();
      const startsWithCallout = CALLOUT_ICONS.some(icon => trimmed.startsWith(icon));
      const alreadyBlock = /^[-*>|]|^\d+\./.test(trimmed);
      if (startsWithCallout && !alreadyBlock) return `> ${trimmed}`;
      return line;
    })
    .join("\n");
}

export function preprocessMarkdown(content: string): string {
  return wrapCalloutLines(mergeMultilineTableRows(content));
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

function Blockquote({ children }: { children?: React.ReactNode }) {
  const text = extractText(children).trim();
  const icon = Object.keys(CALLOUT_STYLES).find(ic => text.startsWith(ic));
  if (icon) {
    return (
      <div className={`border-l-4 rounded-r-lg px-3 py-2 text-xs my-2 ${CALLOUT_STYLES[icon]}`}>
        {children}
      </div>
    );
  }
  return (
    <blockquote className="border-l-2 border-orange-400 pl-3 text-xs text-slate-600 italic my-1">
      {children}
    </blockquote>
  );
}

function ListItem({ children, className }: { children?: React.ReactNode; className?: string }) {
  const isTask = className?.includes("task-list-item");
  return (
    <li
      className={
        isTask
          ? "list-none -ml-4 flex items-start gap-1.5 text-xs text-slate-600 leading-relaxed"
          : "text-xs text-slate-600 leading-relaxed"
      }
    >
      {children}
    </li>
  );
}

function TaskCheckbox({ checked }: { checked?: boolean }) {
  return checked ? (
    <CheckSquare className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
  ) : (
    <Square className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
  );
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
  if (isBlock) {
    return <code className="font-mono text-[11px] leading-relaxed">{children}</code>;
  }
  return (
    <code className="bg-slate-100 text-orange-700 font-mono text-[90%] px-1 py-0.5 rounded">
      {children}
    </code>
  );
}

const components: Components = {
  h1: ({ children }) => <h1 className="text-base font-display font-black text-slate-900 mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-display font-bold text-slate-800 mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5">{children}</h3>,
  h4: ({ children }) => <h3 className="text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5">{children}</h3>,
  h5: ({ children }) => <h3 className="text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5">{children}</h3>,
  h6: ({ children }) => <h3 className="text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5">{children}</h3>,
  p: ({ children }) => <p className="text-xs text-slate-600 leading-relaxed my-1">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
  code: CodeBlock,
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-50 rounded-xl p-3 my-2 overflow-x-auto">{children}</pre>
  ),
  ul: ({ children }) => <ul className="list-disc list-outside ml-4 space-y-0.5 my-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-4 space-y-0.5 my-1">{children}</ol>,
  li: ListItem,
  input: TaskCheckbox,
  blockquote: Blockquote,
  hr: () => <hr className="border-slate-200 my-2" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 underline hover:text-orange-700">
      {children}
    </a>
  ),
  img: ({ src, alt }) => <img src={src} alt={alt} className="rounded-lg max-w-full my-1" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left font-display font-bold text-slate-700">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-slate-200 px-2 py-1 text-slate-600">{children}</td>,
};

export const MarkdownBlock: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {preprocessMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
};
```

- [ ] **Step 5: Run the verification script again**

```bash
npx tsx /tmp/markdown-block-verify/task2.tsx
```

Expected output:
```
1. alphabet table regression: OK
2. nested list: OK
3. checkbox task list: OK
4. fenced code block: OK
5. callouts (5 icons): OK
6. plain blockquote: OK
7. headings h1-h6: OK
ALL PASS
```

If assertion 3 (`<svg>` in task list output) fails: `lucide-react` icons render as inline `<svg>` — check that `TaskCheckbox` is wired to the `input` key in `components`, not `checkbox` or another key. `react-markdown`/`mdast-util-to-hast` injects the GFM task checkbox as a real `<input type="checkbox">` node, so overriding `input` is correct.

If assertion 5 fails with a type error at build time about `Components` not having a matching shape: run `npm run lint` and read the exact TypeScript error — `Components` is generated from the actual installed `react-markdown` version's HAST element types, so the precise prop names (`checked` on `input`, `href`/`src` on `a`/`img`) must match what TypeScript reports. Adjust the destructured prop names in `components` to match, not the other way around.

- [ ] **Step 6: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/MarkdownBlock.tsx
git commit -m "feat: render grammar markdown with react-markdown + remark-gfm for Notion-style content"
```

---

### Task 3: Update the admin editor's markdown hint text

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx:185`

**Interfaces:**
- Consumes: nothing new — this is a copy-only change.

- [ ] **Step 1: Read the current line**

The current hint (line 185) reads:

```tsx
<p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách</p>
```

- [ ] **Step 2: Update the copy to mention the newly supported constructs**

```tsx
<p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️</p>
```

- [ ] **Step 3: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx
git commit -m "docs: mention new markdown constructs in admin grammar editor hint"
```

---

### Task 4: Manual browser regression check + cleanup

**Files:**
- Create (temporary, deleted at the end of this task): `mdtest.html`, `mdtest.tsx` at the repo root.

**Interfaces:**
- Consumes: `MarkdownBlock` from Task 2 (final version).

This task visually confirms the component renders correctly in an actual browser (JSDOM/SSR string assertions in Task 2 don't catch CSS/layout mistakes). It reuses the exact harness pattern from the table-rendering bug fix earlier in this file's history.

- [ ] **Step 1: Start the dev server on Node 20**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && nohup npm run dev -- --port 5173 > /tmp/markdown-block-verify/dev.log 2>&1 &
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

Expected: `200`. If it fails with a `crypto.getRandomValues` error in the log, confirm `node --version` reports `v20.x` in the shell that launched it — the `nvm use 20` must be in the same command chain as `npm run dev`.

- [ ] **Step 2: Create the test harness**

Create `mdtest.html`:

```html
<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/mdtest.tsx"></script>
  </body>
</html>
```

Create `mdtest.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { MarkdownBlock } from "./src/components/MarkdownBlock";

const content = `## Alphabet (bảng bị Notion tách dòng)
| **A, a**
[A] | **B, b**
[Be] |
| --- | --- |
| **K, k**
[Ka] | **L, l**
[El] |

#### Danh sách lồng nhau
- Cấp 1
  - Cấp 2
    - Cấp 3
- Cấp 1 lại

#### Checkbox
- [ ] Chưa học xong
- [x] Đã học xong

#### Code block
\`\`\`
der Mann (nam)
die Frau (nữ)
das Kind (trung)
\`\`\`

#### Callout
💡 Tip: nhớ chia động từ theo ngôi
⚠️ Warning: đừng nhầm der/die/das
❗ Danger: lỗi thường gặp
✅ Success: đã đúng
ℹ️ Note: ghi chú thêm

> Blockquote thường, không có icon

---

Đoạn văn thường với **đậm**, *nghiêng*, và \`code inline\`. Xem [link](https://example.com).
`;

createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
    <MarkdownBlock content={content} />
  </div>
);
```

- [ ] **Step 3: Load it in the browser and screenshot**

Navigate to `http://localhost:5173/mdtest.html` and take a screenshot. Confirm visually:
- The alphabet table renders as an actual `<table>` (letters + phonetics stacked per cell), not raw `|`/`**`.
- Three levels of nested bullets are visibly indented.
- Two checkboxes render as icons (empty square, filled/checked square), not `[ ]`/`[x]` text.
- The code block renders as a dark monospace box with the 3 lines.
- All 5 callouts render as distinctly colored boxes (amber/orange/rose/green/blue), each keeping its icon.
- The plain blockquote (no icon) keeps the old thin-orange-border italic style, not a colored box.
- The horizontal rule, bold/italic/inline-code paragraph, and link all render normally.

- [ ] **Step 4: Fix anything that looks wrong**

If a specific construct doesn't render as expected, re-read the relevant part of `src/components/MarkdownBlock.tsx`, fix it, and reload the browser tab (Vite HMR will pick it up — no server restart needed). Re-check step 3's checklist after any fix.

- [ ] **Step 5: Clean up the harness and stop the dev server**

```bash
rm -f mdtest.html mdtest.tsx
pkill -f "vite --port"
git status --short
```

Expected: `git status --short` shows no `mdtest.*` files (they were never committed) and no other unexpected changes.

- [ ] **Step 6: Final full verification**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
npx tsx /tmp/markdown-block-verify/task1.mts
npx tsx /tmp/markdown-block-verify/task2.tsx
```

Expected: `npm run lint` prints nothing (success); both scripts print their `ALL PASS` line.

- [ ] **Step 7: Commit if step 4 produced any fixes**

Only run this if Step 4 changed `MarkdownBlock.tsx`:

```bash
git add src/components/MarkdownBlock.tsx
git commit -m "fix: correct rendering issues found in manual Notion-content regression check"
```

If no fixes were needed, skip this step — there is nothing to commit.
