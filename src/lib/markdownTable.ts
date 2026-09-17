import React from "react";

export function mergeMultilineTableRows(content: string): string {
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

// react-markdown (without rehype-raw) renders literal "<br/>" text as an
// escaped string rather than a line break. Table cells with content merged
// from multiple physical lines rely on that literal marker, so split it back
// into a real <br /> here at render time.
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
  if (Array.isArray(node)) {
    return node.map((child, i) => splitBrText(child, `${keyPrefix}-${i}`));
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return React.cloneElement(node, {
      children: splitBrText(props.children, keyPrefix),
    } as React.Attributes);
  }
  return node;
}
