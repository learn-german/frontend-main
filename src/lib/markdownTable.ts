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

// react-markdown (without rehype-raw) renders literal "<br/>" text as an
// escaped string rather than a line break. Table cells with content merged
// from multiple physical lines rely on that literal marker, so split it back
// into a real <br /> here at render time.
export function splitBrText(node: React.ReactNode, keyPrefix: string): React.ReactNode {
  if (typeof node === "string") {
    if (!node.includes("<br/>")) return node;
    const parts = node.split("<br/>");
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
