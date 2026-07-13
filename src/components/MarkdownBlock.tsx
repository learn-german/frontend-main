import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="bg-slate-100 text-orange-700 font-mono text-[90%] px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderCell(text: string, i: number): React.ReactNode {
  const cellLines = text.split("\n");
  return (
    <React.Fragment key={i}>
      {cellLines.map((l, j) => (
        <React.Fragment key={j}>
          {j > 0 && <br />}
          {renderInline(l.trim())}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}

// A table row's cells may be split across multiple source lines (content
// pasted with a line break inside a cell), so buffer lines until one ends
// with a closing "|".
function readTableRow(lines: string[], start: number): { cells: string[]; next: number } {
  let buffer = lines[start];
  let end = start;
  while (!buffer.trim().endsWith("|") && end + 1 < lines.length) {
    end++;
    buffer += "\n" + lines[end];
  }
  const trimmed = buffer.trim().replace(/^\|/, "").replace(/\|$/, "");
  return { cells: trimmed.split("|").map(c => c.trim()), next: end + 1 };
}

const isSeparatorRow = (cells: string[]) => cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));

export const MarkdownBlock: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length) {
      nodes.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5 my-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("|")) {
      const rows: string[][] = [];
      let next = i;
      do {
        const row = readTableRow(lines, next);
        rows.push(row.cells);
        next = row.next;
      } while (next < lines.length && lines[next].trimStart().startsWith("|"));

      flushList();
      const hasHeader = rows.length > 1 && isSeparatorRow(rows[1]);
      const headerRow = hasHeader ? rows[0] : null;
      const bodyRows = hasHeader ? rows.slice(2) : rows;

      nodes.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="w-full text-xs border-collapse">
            {headerRow && (
              <thead>
                <tr>
                  {headerRow.map((cell, ci) => (
                    <th key={ci} className="border border-slate-200 bg-slate-100 px-2 py-1 text-left font-display font-bold text-slate-700">
                      {renderCell(cell, ci)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-slate-200 px-2 py-1 text-slate-600">
                      {renderCell(cell, ci)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      i = next;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)/);
    const li = line.match(/^[-*]\s+(.+)/);
    const bq = line.match(/^>\s+(.+)/);
    const hr = line.match(/^---+$/);

    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      if (level === 1) nodes.push(<h1 key={key++} className="text-base font-display font-black text-slate-900 mt-3 mb-1">{text}</h1>);
      else if (level === 2) nodes.push(<h2 key={key++} className="text-sm font-display font-bold text-slate-800 mt-3 mb-1">{text}</h2>);
      else nodes.push(<h3 key={key++} className="text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5">{text}</h3>);
    }
    else if (li) { listItems.push(<li key={key++} className="text-xs text-slate-600 leading-relaxed">{renderInline(li[1])}</li>); }
    else if (bq) { flushList(); nodes.push(<blockquote key={key++} className="border-l-2 border-orange-400 pl-3 text-xs text-slate-600 italic my-1">{renderInline(bq[1])}</blockquote>); }
    else if (hr) { flushList(); nodes.push(<hr key={key++} className="border-slate-200 my-2" />); }
    else if (line.trim() === "") { flushList(); nodes.push(<div key={key++} className="h-1.5" />); }
    else { flushList(); nodes.push(<p key={key++} className="text-xs text-slate-600 leading-relaxed">{renderInline(line)}</p>); }

    i++;
  }
  flushList();

  return <div className={`space-y-0.5 ${className ?? ""}`}>{nodes}</div>;
};
