// Markdown 渲染(marked) + GitHub 风格 diff 渲染 + 代码语法高亮(highlight.js)。
import { marked } from "marked";
import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import markdown from "highlight.js/lib/languages/markdown";

// 注册常用语言（含常见别名）
const LANGS = { javascript, typescript, python, bash, json, yaml, css, xml, sql, go, rust, java, cpp, c, markdown };
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("py", python);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("htm", xml);
hljs.registerLanguage("c++", cpp);
hljs.registerLanguage("md", markdown);

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

// 代码块：按语言语法高亮，带语言标签头部（VSCode/Codex 风格）
marked.use({
  renderer: {
    code(code, infostring) {
      const lang = (infostring || "").split(/\s+/)[0];
      let html;
      if (lang && hljs.getLanguage(lang)) {
        try {
          html = hljs.highlight(code, { language: lang }).value;
        } catch {
          html = escapeHtml(code);
        }
      } else {
        html = escapeHtml(code);
      }
      const label = lang || "";
      return `<div class="code-block">${label ? `<div class="code-block-head">${escapeHtml(label)}</div>` : ""}<pre><code class="hljs${lang ? ` language-${lang}` : ""}">${html}</code></pre></div>`;
    },
  },
});

// 按 markdown 标题(# ~ ####)把文本切成节。code fence 内的 # 行不算标题。
// 返回 [{ level, title, body }]，无标题时返回单节且 title 为 null。
// 合并策略：level>=3 的子标题并入最近的 level<=2 父块（减少折叠块数量，避免太碎）
export function splitByHeadings(text) {
  if (!text) return [{ level: 0, title: null, body: "" }];
  const lines = String(text).split("\n");
  const sections = [];
  let cur = null;
  let inFence = false;
  const flush = () => { if (cur) { cur.body = cur.body.replace(/\n+$/, ""); sections.push(cur); } };
  for (const line of lines) {
    const fence = line.match(/^\s*```/);
    if (fence) {
      inFence = !inFence;
      if (cur) cur.body += line + "\n";
      continue;
    }
    if (!inFence) {
      const m = line.match(/^(#{1,4})\s+(.+)$/);
      if (m) {
        flush();
        cur = { level: m[1].length, title: stripInline(m[2]), body: "" };
        continue;
      }
    }
    if (!cur) cur = { level: 0, title: null, body: "" };
    cur.body += line + "\n";
  }
  flush();
  if (!sections.length) return [{ level: 0, title: null, body: text }];
  // 合并子标题（level>=3）到最近的父级（level<=2）块：子标题作为父块内容的一部分
  const merged = [];
  let parent = null;
  for (const sec of sections) {
    if (sec.level <= 2) {
      merged.push(sec);
      parent = sec;
    } else if (parent) {
      // 追加为父块内容：保留标题行让父块展开时可见
      parent.body += (parent.body ? "\n" : "") + `${"#".repeat(sec.level)} ${sec.title}\n${sec.body}`;
      parent.subs = (parent.subs ?? 0) + 1;
    } else {
      merged.push(sec); // 没有父级时保留为独立块
    }
  }
  return merged;
}

// 去掉标题里的 markdown 内联符号，保留纯文本（用于折叠头显示）
function stripInline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.+?)\]\([^)]*\)/g, "$1")
    .trim();
}

// ---------- 控制台命令自动识别 ----------
// AI 回答里经常出现没包在 ``` 代码块里的裸命令行（如 `npm install ...`）。
// 这些行渲染成普通段落，视觉上不像命令。这里在 marked 渲染前把它们自动
// 包成代码块，复用 .code-block 样式，让命令一眼可辨。
// 判定规则（尽量保守，避免误伤正文句子）：
//   1. 以提示符开头（$ > PS> C:\ D:\ ~$）→ 必是命令
//   2. 以常见命令词开头，且后面带子命令/选项/路径特征 → 是命令
//   3. 含中文、句尾标点、常见 markdown 结构（标题/列表/引用/表格/HTML）→ 排除

const PROMPT_RE = /^\s*(?:\$|PS>|C:\\|D:\\|~[/\\]?\$)/;
const CMD_RE = /^(?:npm|npx|yarn|pnpm|pip|pip3|pipx|python|python3|py|node|bun|deno|git|cd|ls|dir|pwd|mkdir|rmdir|rm|cp|mv|touch|cat|echo|curl|wget|docker|docker-compose|kubectl|helm|brew|apt|apt-get|sudo|chmod|chown|grep|find|sed|awk|tar|unzip|zip|java|javac|mvn|gradle|dotnet|code|cmd|powershell|pwsh|taskkill|tasklist|netstat|ping|where|which|ssh|scp|rsync|systemctl|service|kill|ps|top|htop|tail|head|less|more|nslookup|tracert|ipconfig|reg|setx|start|copy|move|del|type|tree|attrib|xcopy|mysql|psql|redis-cli)\b/i;
const SUB_CMD_RE = /^(?:install|uninstall|remove|rm|add|run|exec|start|stop|build|dev|test|init|push|pull|clone|commit|config|set|get|update|upgrade|login|logout|list|ls|show|plugin|marketplace|use|enable|disable|status|restart|version|help)\b/i;
const OPT_RE = /^[-/]/;
const PATH_RE = /[\\/]|:\/\/|@[\w.-]+|\.[\w]{1,8}\b/;

function isCommandLine(line) {
  const s = line.trim();
  if (!s || s.length > 300) return false;
  // 排除 markdown 结构
  if (/^#{1,6}\s/.test(s)) return false; // 标题
  if (/^[-*+]\s/.test(s)) return false; // 无序列表
  if (/^\d+[.)]\s/.test(s)) return false; // 有序列表
  if (/^>\s?/.test(s)) return false; // 引用
  if (/^\|/.test(s)) return false; // 表格
  if (/^`{3}/.test(s)) return false; // fence
  if (/^[-=*_]{3,}\s*$/.test(s)) return false; // 分割线
  if (/^<\/?[a-z]/i.test(s)) return false; // HTML
  if (PROMPT_RE.test(s)) return true;
  // 含中文 / 句尾标点 → 大概率是正文句子
  if (/[\u4e00-\u9fff]/.test(s)) return false;
  if (/[.!?。！？]$/.test(s)) return false;
  const m = s.match(/^([A-Za-z][\w.-]*)/);
  if (!m || !CMD_RE.test(s)) return false;
  const rest = s.slice(m[0].length).trim();
  if (!rest) return false; // 裸命令词（如单独一行 npm）不算
  return OPT_RE.test(rest) || SUB_CMD_RE.test(rest) || PATH_RE.test(rest);
}

// 把文本中连续的裸命令行包装成 ```shell 代码块（fence 内部跳过）。
function wrapCommandLines(text) {
  const lines = String(text).split("\n");
  const out = [];
  let inFence = false;
  let buf = [];
  const flush = () => {
    if (buf.length) {
      out.push("```shell\n" + buf.join("\n") + "\n```");
      buf = [];
    }
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flush();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (isCommandLine(line)) {
      buf.push(line.trim());
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out.join("\n");
}

// 从 markdown 文本中提取 ```diff / ```mermaid 块单独渲染,其余交给 marked。
// 返回 [{ kind: "md", html } | { kind: "diff", hunks } | { kind: "mermaid", code }]
export function useChunks(text) {
  return useMemo(() => {
    if (!text) return [];
    const wrapped = wrapCommandLines(text);
    const re = /```(diff|mermaid)\s*\n([\s\S]*?)```/g;
    const chunks = [];
    let last = 0;
    let m;
    while ((m = re.exec(wrapped)) !== null) {
      if (m.index > last) chunks.push({ kind: "md", html: marked.parse(wrapped.slice(last, m.index)) });
      if (m[1] === "diff") chunks.push({ kind: "diff", hunks: parseDiff(m[2]) });
      else chunks.push({ kind: "mermaid", code: m[2] });
      last = m.index + m[0].length;
    }
    if (last < wrapped.length) chunks.push({ kind: "md", html: marked.parse(wrapped.slice(last)) });
    if (!chunks.length && wrapped) chunks.push({ kind: "md", html: marked.parse(wrapped) });
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
