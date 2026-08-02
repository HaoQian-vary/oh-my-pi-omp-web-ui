// 消息列表:渲染用户/助手消息卡片,工具卡片,thinking 折叠,diff,todo 树。
import { useEffect, useMemo, useRef } from "react";
import { useApp } from "../store";
import { useChunks, splitByHeadings, DiffView } from "../md";
import { fmtClock, fmtCost, fmtTokens, costOf, tokensOf } from "../format";
import { IconTerminal, IconChevronRight, IconChevronDown, IconCopy, IconCheck, IconBot, IconUser, IconAlert, IconBrain, IconLayers, IconPaperclip, IconImage } from "../icons";
import { useLang } from "../i18n";
import { useState } from "react";
import { Component } from "react";

// 单条消息错误边界：某条消息崩溃不影响其他消息，并显示具体错误
class MsgBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[消息渲染出错]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card p-3 text-[12px] text-error">
          <div className="font-medium mb-1">该消息渲染出错</div>
          <pre className="whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MessageList() {
  const { state, actions } = useApp();
  const { t } = useLang();
  const { msgs, scrollTarget } = state;
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);
  const [showDown, setShowDown] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // 历史抽屉点击 → 定位到对应消息 + 短暂高亮
  useEffect(() => {
    if (!scrollTarget?.msgId) return;
    const el = document.getElementById(`msg-${scrollTarget.msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("msg-flash");
      void el.offsetWidth; // 重启动画
      el.classList.add("msg-flash");
      const timer = setTimeout(() => el.classList.remove("msg-flash"), 2200);
      return () => clearTimeout(timer);
    }
  }, [scrollTarget]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    pinnedRef.current = atBottom;
    setShowDown(!atBottom);
  };

  // 回到最底部
  const goBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    pinnedRef.current = true;
    setShowDown(false);
  };

  if (!msgs.length) {
    return (
      <div className="flex-1 overflow-y-auto" ref={scrollRef} onScroll={onScroll}>
        <Welcome />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div className="h-full overflow-y-auto" ref={scrollRef} onScroll={onScroll}>
        <div className="max-w-[860px] mx-auto px-4 py-3 space-y-2.5">
          {msgs.map((m, i) => (
            <div key={m.msgId ?? i} id={`msg-${m.msgId ?? i}`} className="rounded-lg">
              <MsgBoundary>
                <MessageCard msg={m} streaming={m.status === "streaming"} isLast={i === msgs.length - 1} />
              </MsgBoundary>
            </div>
          ))}
        </div>
      </div>
      {/* 回到底部按钮：向上滚动后出现，点击平滑回到最底部 */}
      {showDown && (
        <button
          className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full border shadow-lg transition-transform duration-100 hover:scale-105"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          onClick={goBottom}
          title={t("回到底部")}
        >
          <IconChevronDown size={15} />
        </button>
      )}
    </div>
  );
}

function Welcome() {  const { actions } = useApp();
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
            className="rounded-lg px-4 py-3 text-left text-[12.5px] text-secondary hover:text-primary transition-all duration-150"
            style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'var(--shadow-sm, none)' }}
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
  const { t } = useLang();
  // 过程块（思考/工具/结果）与结果块（文本）分离，完成时过程折叠
  const blocks = msg.blocks ?? [];
  const processBlocks = blocks.filter((b) => b.type !== "text");
  const textBlocks = blocks.filter((b) => b.type === "text");
  if (msg.role === "user") {
    const text = msg.blocks?.map((b) => b.text ?? "").join("") ?? "";
    const hasMedia = msg.images?.length || msg.attachments?.length;
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] flex gap-2.5 items-end">
          <div className="rounded-xl rounded-br-sm px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ background: 'var(--color-user-bubble)', border: '1px solid var(--color-user-border)' }}>
            {text && <div>{text}</div>}
            {/* 发送的图片缩略图 */}
            {msg.images?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-1">
                {msg.images.map((img, i) => (
                  <img key={i} src={img.dataUrl} alt={img.name ?? ""} className="max-w-[160px] max-h-[120px] rounded-md border border-border object-cover" />
                ))}
              </div>
            )}
            {/* 发送的文件路径引用 */}
            {msg.attachments?.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {msg.attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <IconPaperclip size={11} className="shrink-0" />
                    <span className="font-medium truncate max-w-[120px]">{a.name}</span>
                    <span className="font-mono text-[10.5px] truncate max-w-[180px]">{a.path}</span>
                  </div>
                ))}
              </div>
            )}
            {!text && !hasMedia && <span>&nbsp;</span>}
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
          {msg.status === "streaming" || msg.status === "analyzing" ? (
            // 流式中：过程块按现有方式逐个显示（实时看进度）
            msg.blocks?.map((b, i) => (
              <Block key={i} block={b} streaming={streaming && isLast && i === msg.blocks.length - 1} />
            ))
          ) : msg.blocks?.length ? (
            // 完成：过程（思考/工具/流程）单独一张卡折叠，最终文本单独一张卡
            <div className="space-y-2">
              {/* 卡1：过程 + 流程 合并一张卡（略深背景区别于回答卡）；纯文本消息也渲染（含流程兜底） */}
              {(processBlocks.length > 0 || (msg.flow ?? computeMsgFlow(msg)) || textBlocks.length > 0) && (
                <div className="card overflow-hidden" style={{ background: 'var(--color-bg-secondary)' }}>
                  {processBlocks.length > 0 && <ProcessCollapse blocks={processBlocks} />}
                  <FlowCard msg={msg} />
                </div>
              )}
              {/* 卡2：最终回答 */}
              {textBlocks.length > 0 && (
                <div className="card overflow-hidden">
                  {textBlocks.map((b, i) => (
                    <Block key={`t${i}`} block={b} streaming={false} />
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {!msg.blocks?.length && streaming && (
            <div className="px-3.5 py-3 text-[13px] text-secondary">
              <span className="cursor-blink" />
            </div>
          )}
          {msg.status === "analyzing" && (
            <div className="px-3.5 py-3 flex items-center gap-2 text-[12.5px] text-secondary">
              <IconImage size={13} className="text-accent shrink-0" />
              <span>{t("图片分析中…")}</span>
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

// 过程折叠框：思考/工具/结果合并成一个默认折叠的容器（最终回答只显示文本）
function ProcessCollapse({ blocks }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const thinkCount = blocks.filter((b) => b.type === "thinking").length;
  const toolCount = blocks.filter((b) => b.type === "toolCall").length;
  const lines = blocks.reduce((n, b) => n + (b.thinking || b.text || "").split("\n").length, 0);
  return (
    <div className="border-b border-border">
      <button
        className="w-full flex items-center gap-1.5 px-3.5 py-2 text-left border-l-[3px] transition-colors duration-100"
        style={{ background: 'transparent', borderLeftColor: 'var(--color-accent)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
      >
        {open ? <IconChevronDown size={12} className="text-accent shrink-0" /> : <IconChevronRight size={12} className="text-accent shrink-0" />}
        <IconBrain size={12} className="text-accent shrink-0" />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--color-accent)' }}>{t("过程")}</span>
        <span className="text-[11px] text-secondary">({thinkCount ? `${t("思考")} ${thinkCount} · ` : ""}{toolCount ? `${t("工具")} ${toolCount} · ` : ""}{lines} {t("行")})</span>
        <span className="flex-1" />
        <span className="text-[11px] text-secondary">{open ? t("收起") : t("展开")}</span>
      </button>
      {open && (
        <div>
          {blocks.map((b, i) => {
            if (b.type === "thinking") return <ThinkingBlock key={i} block={b} defaultOpen streaming={false} />;
            if (b.type === "toolCall") return <ToolCallBlock key={i} block={b} />;
            return <ToolResultBlock key={i} block={b} />;
          })}
        </div>
      )}
    </div>
  );
}

// ---------- 文本块(markdown + diff + 标题分节折叠) ----------
function TextBlock({ text, streaming }) {
  const sections = useMemo(() => splitByHeadings(text), [text]);
  const hasHeadings = sections.some((s) => s.title);
  if (!hasHeadings) return <PlainText text={text} streaming={streaming} />;
  return (
    <div className={`px-3.5 py-1.5 ${streaming ? "cursor-blink" : ""}`}>
      {sections.map((sec, i) => (
        <Section key={i} sec={sec} streaming={streaming && i === sections.length - 1} />
      ))}
    </div>
  );
}

// 无标题的普通文本（原渲染路径）
function PlainText({ text, streaming }) {
  const chunks = useChunks(text);
  if (!chunks.length) {
    return <div className={`px-3.5 py-2 text-[13.5px] leading-relaxed ${streaming ? "cursor-blink" : ""}`} />;
  }
  return (
    <div className={`px-3.5 py-2 ${streaming ? "cursor-blink" : ""}`}>
      {renderChunks(chunks)}
    </div>
  );
}

// 标题节：折叠头（标题）+ 内容（Codex 风格默认展开、连续阅读；点击可折叠）
function Section({ sec, streaming }) {
  const [open, setOpen] = useState(true);
  const chunks = useChunks(sec.body ?? "");
  const pad = Math.min(sec.level - 1, 3) * 10;
  return (
    <div className="rounded-md mb-1 overflow-hidden" style={{ background: sec.level <= 2 ? 'var(--color-bg-elevated)' : 'transparent' }}>
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
        title={open ? "收起" : "展开"}
      >
        {open ? <IconChevronDown size={11} className="text-secondary shrink-0" /> : <IconChevronRight size={11} className="text-secondary shrink-0" />}
        <span
          className={`truncate ${sec.level <= 2 ? "text-[12.5px] font-semibold" : "text-[12px] font-medium"}`}
          style={{ color: 'var(--color-text-primary)', paddingLeft: pad }}
        >
          {sec.title}
        </span>
        {sec.subs > 0 && <span className="text-[10.5px] text-secondary shrink-0">+{sec.subs}</span>}
        {streaming && <span className="cursor-blink text-[12px]" />}
        <span className="flex-1" />
        <span className="text-[10.5px] text-secondary shrink-0">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-2 pb-1.5">
          {renderChunks(chunks)}
        </div>
      )}
    </div>
  );
}

// 渲染 chunks（md / diff / mermaid 统一处理）
function renderChunks(chunks) {
  return chunks.map((c, i) => {
    if (c.kind === "diff") return <DiffView key={i} hunks={c.hunks} />;
    if (c.kind === "mermaid") return <MermaidBlock key={i} code={c.code} />;
    return <div key={i} className="md" dangerouslySetInnerHTML={{ __html: c.html }} />;
  });
}

// mermaid 流程图：默认折叠为一行，点击展开看源码（避免大段英文占空间）
function MermaidBlock({ code }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  return (
    <div className="rounded-md mb-1 overflow-hidden border border-border">
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors duration-100"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
      >
        {open ? <IconChevronDown size={11} className="text-secondary shrink-0" /> : <IconChevronRight size={11} className="text-secondary shrink-0" />}
        <IconLayers size={11} className="text-accent shrink-0" />
        <span className="text-[11.5px] text-secondary">{t("流程图")}</span>
        <span className="flex-1" />
        <span className="text-[10.5px] text-secondary shrink-0">{open ? t("收起") : t("展开")}</span>
      </button>
      {open && (
        <pre className="term px-3 pb-2 pt-1 text-[11px] overflow-x-auto">{code}</pre>
      )}
    </div>
  );
}

// ---------- Thinking 折叠 ----------
function ThinkingBlock({ block, streaming, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
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

// 单条消息的流程（刷新/回放时无 turn 聚合 flow 的兜底）：文本节标题 + 工具调用
function computeMsgFlow(msg) {
  const steps = [];
  for (const b of msg.blocks ?? []) {
    if (b.type === "toolCall") {
      steps.push({ kind: "tool", name: b.name ?? "tool", intent: b.intent ?? "" });
    } else if (b.type === "text" && b.text) {
      for (const sec of splitByHeadings(b.text)) {
        if (sec.title) steps.push({ kind: "text", title: sec.title });
      }
    }
  }
  return steps.length ? { steps } : null;
}

// ---------- 流程总结卡 ----------
// 聚合本 turn 的步骤（文本节标题 + 工具调用）。可选：模型生成总结（设置开关）。
function FlowCard({ msg }) {
  const { state } = useApp();
  const { t } = useLang();
  const flowMode = state.flowMode; // steps | ai | both
  const showAI = flowMode === "ai" || flowMode === "both";
  const showSteps = flowMode === "steps" || flowMode === "both";
  // 流程：实时 turn 聚合(msg.flow) > 单条分步(computeMsgFlow) > 纯文本兜底
  const hasText = (msg.blocks ?? []).some((b) => b.type === "text" && b.text);
  const flow = msg.flow ?? computeMsgFlow(msg) ?? (hasText ? { steps: [{ kind: "text", title: t("回答") }] } : null);
  // 流式/分析中不显示流程卡（回答未完成）
  if (msg.status === "streaming" || msg.status === "analyzing") return null;
  const [open, setOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // AI 总结的输入：本消息所有文本
  const turnText = useMemo(
    () => (msg.blocks ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n"),
    [msg]
  );

  // 模式为 ai/both 且 turn 结束后，调模型生成一次总结（失败静默回退；30s 超时兜底）
  useEffect(() => {
    if (!showAI || aiSummary || aiLoading || !msg.turnDone || !turnText.trim()) return;
    let alive = true;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    setAiLoading(true);
    fetch("/api/summarize_turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: turnText.slice(0, 30000) }),
      signal: ac.signal,
    })
      .then((r) => r.json())
      .then((j) => { if (alive && j?.ok && j.summary) setAiSummary(j.summary); })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); if (alive) setAiLoading(false); });
    return () => { alive = false; clearTimeout(timer); ac.abort(); };
  }, [showAI, msg.turnDone, turnText, aiSummary]);

  if (!flow?.steps?.length && !aiSummary) return null;
  return (
    <div className="border-t border-border" style={{ borderColor: 'var(--color-border)' }}>
      <button
        className="w-full flex items-center gap-1.5 px-3.5 py-2 text-left border-l-[3px] transition-colors duration-100"
        style={{ background: 'transparent', borderLeftColor: 'var(--color-success)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => setOpen(!open)}
      >
        {open ? <IconChevronDown size={12} style={{ color: 'var(--color-success)' }} className="shrink-0" /> : <IconChevronRight size={12} style={{ color: 'var(--color-success)' }} className="shrink-0" />}
        <IconLayers size={12} style={{ color: 'var(--color-success)' }} className="shrink-0" />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--color-success)' }}>{t("流程")}</span>
        {showSteps && flow?.steps?.length > 0 && <span className="text-[11px] text-secondary">{flow.steps.length} {t("步")}</span>}
        <span className="flex-1" />
        {aiLoading && <span className="text-[11px] text-secondary">{t("AI 总结中…")}</span>}
        {!aiLoading && <span className="text-[11px] text-secondary">{open ? t("收起") : t("展开")}</span>}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 space-y-1">
          {showAI && aiSummary && (
            <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--color-text-primary)' }}>
              <span className="text-[11px] text-secondary font-medium mr-1.5">{t("AI 总结")}:</span>
              {aiSummary}
            </div>
          )}
          {showSteps && flow?.steps?.length > 0 && (
            <ol className="space-y-0.5">
              {flow.steps.map((st, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] leading-snug">
                  <span className="text-[10px] text-secondary font-mono w-4 shrink-0 text-right">{i + 1}.</span>
                  {st.kind === "tool" ? (
                    <>
                      <IconTerminal size={11} className="text-accent shrink-0" />
                      <span className="font-mono text-accent shrink-0">{st.name}</span>
                      {st.intent && <span className="text-secondary truncate">{st.intent}</span>}
                    </>
                  ) : (
                    <span className="truncate">{st.title}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
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
