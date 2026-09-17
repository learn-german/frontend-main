# Grammar Table Cell Line Break Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the grammar markdown editor, Enter inside a table cell inserts a line break in that cell; admin preview and the learner lesson page render it as a real break.

**Architecture:** Reuse the existing `<br/>` → `splitBrText` pipeline. Add `markdownTableEnter` in `src/lib/markdownTable.ts` so Enter between two `|` pipes replaces the selection with `"<br/>"` and keeps the GFM row on one physical line. Widen `splitBrText` to accept `<br>` / `<br />` / `<BR/>`. Wire `onKeyDown` only on the grammar textarea in `AdminLessonEditor.tsx`. Shift+Enter stays native.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, `react-markdown` + `remark-gfm` (already installed), node:test + tsx.

## Global Constraints

- Code (variables, functions, types, technical comments): **English**
- UI text: **Tiếng Việt**
- No `any` — use specific types or `unknown`
- Named exports only (except `App.tsx`)
- No new npm packages
- Do not hand-edit `src/lib/database.types.ts`
- Do not change DB schema, RLS, Edge Functions, or CSS `table-fixed` / wrap
- Do not intercept Enter on speaking / writing / vocab textareas
- Do not auto-insert a new table row `|  |  |`
- Do not add `rehype-raw`
- Run `npm run lint` after each task that edits `.tsx`
- Spec: `docs/superpowers/specs/2026-09-16-grammar-table-cell-line-break-design.md`
- Worktree: `.worktrees/fix-grammar-table-cell-line-break` on branch `fix/grammar-table-cell-line-break`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/markdownTable.ts` | Modify | `markdownTableEnter`, `isInsideMarkdownTableCell`, widen `splitBrText` |
| `src/lib/markdownTable.test.ts` | Modify | Unit tests for Enter helper + br variants |
| `src/pages/admin/AdminLessonEditor.tsx` | Modify | Grammar textarea `onKeyDown` + hint copy |
| `src/components/MarkdownBlock.tsx` | Unchanged | Already calls `splitBrText` on `th`/`td` |

**Blast radius:** `splitBrText` is only called from `MarkdownBlock` `th`/`td` (admin preview + learner grammar/vocab/speaking/writing/reading markdown). Widening the matcher is additive. `markdownTableEnter` is new; only the grammar textarea will call it.

---

### Task 1: Table Enter helper + br variants

**Files:**
- Modify: `src/lib/markdownTable.ts`
- Modify: `src/lib/markdownTable.test.ts`

**Interfaces:**
- Consumes: existing `splitBrText(node: React.ReactNode, keyPrefix: string): React.ReactNode`
- Produces:
  - `export function isInsideMarkdownTableCell(line: string, col: number): boolean`
  - `export function markdownTableEnter(value: string, selectionStart: number, selectionEnd: number): { value: string; cursor: number } | null`
  - `splitBrText` still same signature; splits `/<br\s*\/?>/i` instead of only `"<br/>"`

- [ ] **Step 1: Write the failing tests**

Add `markdownTableEnter` to the import in `src/lib/markdownTable.test.ts`. Append:

```ts
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
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `node --import tsx --test src/lib/markdownTable.test.ts`

Expected: FAIL — `markdownTableEnter` is not exported; `splitBrText` does not split `<br>` / `<br />`.

- [ ] **Step 3: Implement helpers**

In `src/lib/markdownTable.ts`, add above `splitBrText`:

```ts
function isTableSeparatorRow(line: string): boolean {
  const inner = line.trim();
  if (!inner.startsWith("|")) return false;
  const cells = inner.split("|").slice(1, inner.endsWith("|") ? -1 : undefined);
  return cells.length > 0 && cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell));
}

export function isInsideMarkdownTableCell(line: string, col: number): boolean {
  if (!line.trimStart().startsWith("|")) return false;
  if (isTableSeparatorRow(line)) return false;
  const before = line.slice(0, col);
  const after = line.slice(col);
  return (before.match(/\|/g) ?? []).length >= 1 && (after.match(/\|/g) ?? []).length >= 1;
}

export function markdownTableEnter(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; cursor: number } | null {
  if (selectionEnd < selectionStart) return null;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIdx = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  if (selectionEnd > lineEnd) return null;
  const line = value.slice(lineStart, lineEnd);
  const col = selectionStart - lineStart;
  if (!isInsideMarkdownTableCell(line, col)) return null;
  const next = `${value.slice(0, selectionStart)}<br/>${value.slice(selectionEnd)}`;
  return { value: next, cursor: selectionStart + "<br/>".length };
}
```

Replace the string-branch of `splitBrText` so it splits every br variant:

```ts
export function splitBrText(node: React.ReactNode, keyPrefix: string): React.ReactNode {
  if (typeof node === "string") {
    if (!/<br\s*\/?>/i.test(node)) return node;
    const parts = node.split(/<br\s*\/?>/i);
    return parts.flatMap((part, i) =>
      i === 0
        ? [part]
        : [React.createElement("br", { key: `${keyPrefix}-br-${i}` }), part]
    );
  }
  // ... keep array / element / default branches unchanged
}
```

Do not change `mergeMultilineTableRows` (still emits `"<br/>"`).

- [ ] **Step 4: Run tests and confirm they pass**

Run: `node --import tsx --test src/lib/markdownTable.test.ts`

Expected: PASS (all previous + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdownTable.ts src/lib/markdownTable.test.ts
git commit -m "$(cat <<'EOF'
fix: insert <br/> on Enter inside markdown table cells

EOF
)"
```

---

### Task 2: Grammar editor keydown + hint

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx` (import ~line 11, handler after `handleGrammarPaste` ~162, textarea ~377–387)
- Unchanged: `src/components/MarkdownBlock.tsx` (already renders `splitBrText` in cells)

**Interfaces:**
- Consumes: `markdownTableEnter(value, selectionStart, selectionEnd): { value: string; cursor: number } | null`
- Produces: grammar textarea intercepts Enter inside a cell; Shift+Enter / IME / outside cell unchanged

- [ ] **Step 1: Import and handle Enter**

Add import:

```ts
import { markdownTableEnter } from "../../lib/markdownTable";
```

Immediately after `handleGrammarPaste`, add:

```ts
const handleGrammarKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  const el = e.currentTarget;
  const result = markdownTableEnter(el.value, el.selectionStart, el.selectionEnd);
  if (!result) return;
  e.preventDefault();
  upd({ grammar_md: result.value });
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = result.cursor;
  });
};
```

On the grammar textarea (the one with `ref={grammarTextareaRef}`), add `onKeyDown={handleGrammarKeyDown}`. Do not add this to speaking / writing / vocab.

Replace the grammar hint paragraph with the same text plus this sentence at the end:

` Trong bảng, Enter xuống dòng trong ô; Shift+Enter xuống dòng markdown.`

Full hint string:

```tsx
<p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️. Bọc từ cần luyện phát âm trong <code className="bg-slate-100 text-orange-700 px-1 rounded">{"{{...}}"}</code>, ví dụ <code className="bg-slate-100 text-orange-700 px-1 rounded">{"{{heißen}}"}</code> — học viên click vào sẽ nghe phát âm. Trong bảng, Enter xuống dòng trong ô; Shift+Enter xuống dòng markdown.</p>
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`

Expected: no errors.

- [ ] **Step 3: Manual check**

In admin lesson editor → tab Ngữ pháp → Chỉnh sửa, paste:

```
| Person | Singular | Plural |
| --- | --- | --- |
| 1. | ich bin | wir sind |
```

Place the caret after `ich`, press Enter. The source must become `ich<br/> bin` on the same table row. Switch to **Xem trước**: two lines in that cell. Shift+Enter inside the cell must insert a real newline (markdown row split). Enter at the very end of the row must insert a normal newline.

Learner `LessonDetailPage` grammar tab uses the same `MarkdownBlock` — no extra code. If a lesson is available, confirm the saved `<br/>` shows as a line break.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx
git commit -m "$(cat <<'EOF'
fix(admin): Enter adds a line break inside grammar table cells

EOF
)"
```

---

## Self-review

| Spec item | Task |
|-----------|------|
| Enter in cell inserts `<br/>` | 1 + 2 |
| Shift+Enter native | 2 (`e.shiftKey` early return) |
| End of row / prose / separator unchanged | 1 tests + 2 |
| No auto new table row | 2 does not insert `\|  \|` |
| `splitBrText` accepts `<br>` / `<br />` | 1 |
| Grammar textarea only | 2 |
| No `table-fixed` / wrap CSS | no task |
| No `rehype-raw` / new packages | no task |
| IME `isComposing` | 2 |
| Caret after `<br/>` | 2 `requestAnimationFrame` |
| User view via `MarkdownBlock` | already wired; 1 widens matcher |
