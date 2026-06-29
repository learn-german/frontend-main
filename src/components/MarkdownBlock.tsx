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

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const li = line.match(/^[-*]\s+(.+)/);
    const bq = line.match(/^>\s+(.+)/);
    const hr = line.match(/^---+$/);

    if (h1) { flushList(); nodes.push(<h1 key={key++} className="text-base font-display font-black text-slate-900 mt-3 mb-1">{renderInline(h1[1])}</h1>); }
    else if (h2) { flushList(); nodes.push(<h2 key={key++} className="text-sm font-display font-bold text-slate-800 mt-3 mb-1">{renderInline(h2[1])}</h2>); }
    else if (h3) { flushList(); nodes.push(<h3 key={key++} className="text-xs font-display font-bold text-slate-600 uppercase tracking-wide mt-2 mb-0.5">{renderInline(h3[1])}</h3>); }
    else if (li) { listItems.push(<li key={key++} className="text-xs text-slate-600 leading-relaxed">{renderInline(li[1])}</li>); }
    else if (bq) { flushList(); nodes.push(<blockquote key={key++} className="border-l-2 border-orange-400 pl-3 text-xs text-slate-600 italic my-1">{renderInline(bq[1])}</blockquote>); }
    else if (hr) { flushList(); nodes.push(<hr key={key++} className="border-slate-200 my-2" />); }
    else if (line.trim() === "") { flushList(); nodes.push(<div key={key++} className="h-1.5" />); }
    else { flushList(); nodes.push(<p key={key++} className="text-xs text-slate-600 leading-relaxed">{renderInline(line)}</p>); }
  }
  flushList();

  return <div className={`space-y-0.5 ${className ?? ""}`}>{nodes}</div>;
};
