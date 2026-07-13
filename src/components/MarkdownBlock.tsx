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
