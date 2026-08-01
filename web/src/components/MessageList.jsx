// 消息列表:渲染用户/助手消息卡片,工具卡片,thinking 折叠,diff,todo 树。
import { useEffect, useMemo, useRef } from "react";
import { useApp } from "../store";
import { useChunks, DiffView } from "../md";
import { fmtClock, fmtCost, fmtTokens, costOf, tokensOf } from "../format";
import { IconTerminal, IconChevronRight, IconChevronDown, IconCopy, IconCheck, IconBot, IconUser, IconAlert, IconBrain } from "../icons";
import { useLang } from "../i18n";
import { useState } from "react";

export function MessageList() {
  const { state } = useApp();
  const { t } = useLang();
  const { msgs } = state;
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  if (!msgs.length) {
    return (
      <div className="flex-1 overflow-y-auto" ref={scrollRef} onScroll={onScroll}>
        <Welcome />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" ref={scrollRef} onScroll={onScroll}>
      <div className="max-w-[860px] mx-auto px-4 py-4 space-y-4">
        {msgs.map((m, i) => (
          <MessageCard key={m.msgId ?? i} msg={m} streaming={m.status === "streaming"} isLast={i === msgs.length - 1} />
        ))}
      </div>
    </div>
  );
}

function Welcome() {
  const { actions } = useApp();
  const { t } = useLang();
  const suggestions = [
    "解释这个项目的架构",
    "帮我重构 server.mjs",
    "写一个单元测试",
    "总结当前工作区文件",
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-4">
        <IconBot size={26} />
      </div>
      <h1 className="text-[20px] font-semibold mb-1">omp web</h1>
      <p className="text-secondary text-[13px] mb-8 max-w-md text-center leading-relaxed">
        {t("本地 AI Agent 工作台,驱动")} <span className="font-mono text-primary">omp --mode rpc</span>。
        <br />{t("输入消息或点击下方建议开始。")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {suggestions.map((s) => (
          <button
            key={s}
            className="card px-3 py-2.5 text-left text-[12.5px] text-secondary hover:text-primary transition-colors duration-150"
            onClick={() => actions.sendPrompt(s)}
          >
            {t(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- 消息卡片 ----------
function MessageCard({ msg, streaming, isLast }) {
  if (msg.role === "user") {
    const text = msg.blocks?.map((b) => b.text ?? "").join("") ?? "";
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] flex gap-2.5 items-end">
          <div className="rounded-xl rounded-br-sm px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ background: 'var(--color-user-bubble)', border: '1px solid var(--color-user-border)' }}>
            {text}
          </div>
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'var(--color-bg-elevated)' }}>
            <IconUser size={13} className="text-secondary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0 mt-0.5">
        <IconBot size={13} />
      </div>
      <div className="flex-1 min-w-0 max-w-[calc(100%-38px)]">
        <div className="card overflow-hidden">
          {msg.blocks?.map((b, i) => (
            <Block key={i} block={b} streaming={streaming && isLast && i === msg.blocks.length - 1} />
          ))}
          {!msg.blocks?.length && streaming && (
            <div className="px-3.5 py-3 text-[13px] text-secondary">
              <span className="cursor-blink" />
            </div>
          )}
          {msg.error && (
            <div className="px-3.5 py-2.5 flex items-center gap-2 text-[12.5px] text-error border-t border-error/30 bg-error/5">
              <IconAlert size={13} />
              <span className="flex-1">{msg.error}</span>
            </div>
          )}
          <MessageMeta msg={msg} />
        </div>
      </div>
    </div>
  );
}

function Block({ block, streaming }) {
  switch (block.type) {
    case "thinking":
      return <ThinkingBlock block={block} streaming={streaming} />;
    case "toolCall":
      return <ToolCallBlock block={block} />;
    case "toolResult":
      return <ToolResultBlock block={block} />;
    case "text":
    default: {
      const text = block.text ?? "";
      return <TextBlock text={text} streaming={streaming} />;
    }
  }
}

// ---------- 文本块(markdown + diff) ----------
function TextBlock({ text, streaming }) {
  const chunks = useChunks(text);
  if (!chunks.length) {
    return <div className={`px-3.5 py-2 text-[13.5px] leading-relaxed ${streaming ? "cursor-blink" : ""}`} />;
  }
  return (
    <div className={`px-3.5 py-2 ${streaming ? "cursor-blink" : ""}`}>
      {chunks.map((c, i) =>
        c.kind === "diff" ? <DiffView key={i} hunks={c.hunks} /> : <div key={i} className="md" dangerouslySetInnerHTML={{ __html: c.html }} />
      )}
    </div>
  );
}

// ---------- Thinking 折叠 ----------
function ThinkingBlock({ block, streaming }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const text = block.thinking ?? block.text ?? "";
  const lines = text.trim().split("\n").length;
  return (
    <div className="border-b border-border bg-sidebar/50">
      <button
        className="w-full flex items-center gap-1.5 px-3.5 py-2 text-left transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
      >
        {open ? <IconChevronDown size={12} className="text-secondary" /> : <IconChevronRight size={12} className="text-secondary" />}
        <IconBrain size={13} className="text-warning" />
        <span className="text-[12px] text-warning font-medium">{t("思考")}</span>
        <span className="text-[11px] text-secondary">{lines} {t("行")}</span>
        {streaming && <span className="cursor-blink text-[12px] text-warning" />}
        <span className="flex-1" />
        <span className="text-[11px] text-secondary">{open ? t("收起") : t("展开")}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 term term-dim text-[12.5px] border-t pt-2 max-h-[360px] overflow-y-auto" style={{ background: 'var(--color-terminal-bg)', borderColor: 'var(--color-border)' }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ---------- 工具调用块 ----------
function ToolCallBlock({ block }) {
  const { state } = useApp();
  const { t } = useLang();
  const tool = state.tools.get(block.id);
  const [open, setOpen] = useState(false);
  const name = block.name ?? tool?.toolName ?? "tool";
  const args = useMemo(() => {
    try {
      const raw = block.arguments ?? (block.partialArgs ? JSON.parse(block.partialArgs) : null);
      if (raw && typeof raw === "object") {
        // 压缩显示:command/i/path 等核心字段
        const picked = {};
        for (const k of ["command", "i", "path", "pattern", "message", "url", "question", "text", "name", "task"]) {
          if (raw[k] != null) picked[k] = raw[k];
        }
        if (!Object.keys(picked).length) return JSON.stringify(raw).slice(0, 200);
        return Object.entries(picked).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n");
      }
      return String(raw ?? "");
    } catch {
      return "";
    }
  }, [block]);

  const status = tool?.status ?? "running";
  const output = tool?.output ?? "";
  const hasOutput = output.length > 0;
  const autoOpen = status === "running" && hasOutput;

  return (
    <div className="border-b border-border bg-sidebar/30">
      <button
        className="w-full flex items-center gap-2 px-3.5 py-2 text-left transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
      >
        {open ? <IconChevronDown size={12} className="text-secondary" /> : <IconChevronRight size={12} className="text-secondary" />}
        <IconTerminal size={13} className="text-accent shrink-0" />
        <span className="font-mono text-[12px] text-accent font-semibold whitespace-nowrap">{name}</span>
        {tool?.intent && <span className="text-[11.5px] text-secondary truncate flex-1">{tool.intent}</span>}
        <span className="flex-1" />
        {status === "running" && <span className="text-[11px] text-warning flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse inline-block" />{t("运行中")}</span>}
        {status === "success" && <span className="text-[11px] text-success">✓ {t("完成")}</span>}
        {status === "error" && <span className="text-[11px] text-error">✗ {t("失败")}</span>}
      </button>
      {(open || autoOpen) && (
        <div className="px-4 pb-3">
          {args && (
            <pre className="term term-dim text-[11.5px] mb-1.5 rounded-md px-2.5 py-1.5" style={{ background: 'var(--color-terminal-bg)' }}>{args}</pre>
          )}
          {hasOutput && (
            <pre className={`term ${tool?.status === "error" ? "term-err" : ""} max-h-[280px] overflow-y-auto`}>{output}</pre>
          )}
          {status === "running" && !hasOutput && <div className="term term-dim text-[11.5px]">{t("执行中…")}</div>}
        </div>
      )}
    </div>
  );
}

// ---------- 工具结果块 ----------
function ToolResultBlock({ block }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const text = useMemo(() => {
    const c = block.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map((x) => x?.text ?? "").join("\n");
    return "";
  }, [block]);
  const isErr = block.isError;
  const title = `${block.toolName ?? "tool"} ${t("结果")}`;
  if (!text.trim() && !isErr) return null;
  return (
    <div className="border-b border-border">
      <button
        className="w-full flex items-center gap-2 px-3.5 py-1.5 text-left transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
      >
        {open ? <IconChevronDown size={12} className="text-secondary" /> : <IconChevronRight size={12} className="text-secondary" />}
        <span className={`text-[11.5px] ${isErr ? "text-error" : "text-secondary"}`}>
          {isErr ? "✗" : "✓"} {title}
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-secondary">{open ? t("收起") : `${text.length} ${t("字符")}`}</span>
      </button>
      {open && (
        <pre className={`term px-4 pb-3 pt-1 max-h-[300px] overflow-y-auto ${isErr ? "term-err" : ""}`}>{text}</pre>
      )}
    </div>
  );
}

// ---------- 消息元信息(tokens / 费用) ----------
function MessageMeta({ msg }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const usage = msg.meta?.usage;
  const cost = costOf(usage);
  const tokens = tokensOf(usage);
  const model = msg.meta?.model;
  const provider = msg.meta?.provider;
  if (!usage && !model) return null;
  const copy = async () => {
    const text = msg.blocks?.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div className="flex items-center gap-3 px-3.5 py-1.5 bg-sidebar/50 border-t border-border text-[10.5px] text-secondary">
      {provider && <span className="font-mono">{provider}</span>}
      {model && <span className="font-mono truncate max-w-[160px]">{model}</span>}
      {tokens != null && <span className="font-mono">{fmtTokens(tokens)} tok</span>}
      {cost != null && <span className="font-mono">{fmtCost(cost)}</span>}
      <span className="flex-1" />
      <button className="hover:text-primary transition-colors duration-100" onClick={copy} title="复制文本">
        {copied ? <IconCheck size={11} className="text-success" /> : <IconCopy size={11} />}
      </button>
    </div>
  );
}
