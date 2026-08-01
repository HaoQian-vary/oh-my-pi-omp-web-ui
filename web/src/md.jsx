// Markdown 渲染(marked) + GitHub 风格 diff 渲染。
import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({
  gfm: true,
  breaks: false,
});

// 从 markdown 文本中提取 ```diff 块单独渲染,其余交给 marked。
// 返回 [{ kind: "md", html } | { kind: "diff", hunks }]
export function useChunks(text) {
  return useMemo(() => {
    if (!text) return [];
    const re = /```diff\s*\n([\s\S]*?)```/g;
    const chunks = [];
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) chunks.push({ kind: "md", html: marked.parse(text.slice(last, m.index)) });
      chunks.push({ kind: "diff", hunks: parseDiff(m[1]) });
      last = m.index + m[0].length;
    }
    if (last < text.length) chunks.push({ kind: "md", html: marked.parse(text.slice(last)) });
    if (!chunks.length && text) chunks.push({ kind: "md", html: marked.parse(text) });
    return chunks;
  }, [text]);
}

// 解析 diff 文本为行数组,每行 { type: "add"|"del"|"ctx"|"hunk"|"meta", text }
export function parseDiff(src) {
  const lines = String(src).split("\n");
  const out = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^@@/.test(line)) {
      out.push({ type: "hunk", text: line });
    } else if (/^\+/.test(line) && !/^\+\+\+/.test(line)) {
      out.push({ type: "add", text: line });
    } else if (/^-/.test(line) && !/^---/.test(line)) {
      out.push({ type: "del", text: line });
    } else if (/^(---|\+\+\+)/.test(line)) {
      out.push({ type: "meta", text: line });
    } else if (/^diff --git/.test(line) || /^index /.test(line)) {
      out.push({ type: "meta", text: line });
    } else {
      out.push({ type: "ctx", text: line });
    }
  }
  return out;
}

export function DiffView({ hunks }) {
  if (!hunks?.length) return null;
  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden" style={{ background: 'var(--color-terminal-bg)' }}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sidebar border-b border-border">
        <span className="font-mono text-[11px] text-secondary">diff</span>
        <span className="flex-1" />
        <span className="text-[11px] font-mono term-add">+{hunks.filter((h) => h.type === "add").length}</span>
        <span className="text-[11px] font-mono term-err">-{hunks.filter((h) => h.type === "del").length}</span>
      </div>
      <div className="overflow-x-auto py-1">
        {hunks.map((h, i) => {
          const line = h.text.replace(/^([+-])/, "$1 ");
          if (h.type === "hunk") {
            return (
              <div key={i} className="diff-line diff-hunk px-2">
                {h.text}
              </div>
            );
          }
          if (h.type === "add") {
            return (
              <div key={i} className="diff-line diff-add flex">
                <span className="w-8 shrink-0 text-right pr-2 select-none ">+</span>
                <span className="flex-1">{h.text.slice(1)}</span>
              </div>
            );
          }
          if (h.type === "del") {
            return (
              <div key={i} className="diff-line diff-del flex">
                <span className="w-8 shrink-0 text-right pr-2 select-none ">-</span>
                <span className="flex-1">{h.text.slice(1)}</span>
              </div>
            );
          }
          if (h.type === "meta") {
            return (
              <div key={i} className="diff-line px-2" style={{ color: 'var(--color-text-secondary)' }}>
                {line}
              </div>
            );
          }
          return (
            <div key={i} className="diff-line px-2 flex">
              <span className="w-8 shrink-0 text-right pr-2 select-none text-transparent"> </span>
              <span className="flex-1">{h.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
