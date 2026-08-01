// 右侧 Inspector:Tabs = Context / Files / Logs / Tasks / Memory / Tools / MCP / Variables。
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { fmtTokens, fmtBytes, fmtCost } from "../format";
import { IconPanelRight, IconX, IconFileText, IconLogs, IconCheckSquare, IconBrain, IconWrench, IconGlobe, IconCpu, IconLayers, IconTerminal, IconChevronRight, IconChevronDown } from "../icons";

const TABS = [
  { id: "context", label: "Context", icon: IconCpu },
  { id: "files", label: "Files", icon: IconFileText },
  { id: "logs", label: "Logs", icon: IconLogs },
  { id: "tasks", label: "Tasks", icon: IconCheckSquare },
  { id: "memory", label: "Memory", icon: IconBrain },
  { id: "tools", label: "Tools", icon: IconWrench },
  { id: "mcp", label: "MCP", icon: IconGlobe },
  { id: "variables", label: "Variables", icon: IconLayers },
];

export function Inspector() {
  const { state, actions } = useApp();
  const { inspectorTab } = state;

  return (
    <aside className="w-72 shrink-0 bg-sidebar border-l border-border flex flex-col min-h-0">
      {/* tabs */}
      <div className="flex items-center border-b border-border shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-item flex items-center gap-1 whitespace-nowrap ${inspectorTab === t.id ? "active" : ""}`}
            onClick={() => actions.dispatch({ type: "inspector_tab", tab: t.id })}
          >
            <t.icon size={11} />
            {t.label}
          </button>
        ))}
        <span className="flex-1" />
        <button className="btn btn-icon mr-1" title="关闭 Inspector (Ctrl+I)" onClick={() => actions.dispatch({ type: "inspector", open: false })}>
          <IconX size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {inspectorTab === "context" && <ContextTab />}
        {inspectorTab === "files" && <FilesTab />}
        {inspectorTab === "logs" && <LogsTab />}
        {inspectorTab === "tasks" && <TasksTab />}
        {inspectorTab === "memory" && <MemoryTab />}
        {inspectorTab === "tools" && <ToolsTab />}
        {inspectorTab === "mcp" && <McpTab />}
        {inspectorTab === "variables" && <VariablesTab />}
      </div>
    </aside>
  );
}

// ---------- Context ----------
function ContextTab() {
  const { state } = useApp();
  const { t } = useLang();
  const st = state.state;
  const cu = st?.contextUsage;
  const pct = cu?.percent ?? 0;
  return (
    <div className="p-3 space-y-3">
      <Section title={t("上下文占用")}>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-elevated)' }}>
          <div
            className={`h-full rounded-full ${pct > 80 ? "bg-error" : pct > 60 ? "bg-warning" : "bg-accent"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-secondary mt-1">
          <span className="font-mono">{fmtTokens(cu?.tokens)}</span>
          <span className="font-mono">{fmtTokens(cu?.contextWindow)}</span>
        </div>
        <div className="text-[11.5px] text-secondary mt-1">
          使用率 <span className={`font-mono ${pct > 80 ? "text-error" : "text-primary"}`}>{pct.toFixed(1)}%</span>
        </div>
      </Section>
      <Section title={t("会话")}>
        <KV k="ID" v={<span className="font-mono text-[10.5px] break-all">{st?.sessionId ?? "—"}</span>} />
        <KV k={t("消息数")} v={st?.messageCount ?? 0} />
        <KV k={t("队列")} v={st?.queuedMessageCount ?? 0} />
        <KV k={t("自动压缩")} v={st?.autoCompactionEnabled ? "开" : "关"} />
        <KV k="Fast Mode" v={st?.fastModeActive ? "激活" : st?.fastModeEnabled ? "启用" : "关"} />
      </Section>
      <Section title={t("模型")}>
        <KV k="Provider" v={<span className="font-mono">{st?.model?.provider ?? "—"}</span>} />
        <KV k="Model" v={<span className="font-mono">{st?.model?.id ?? "—"}</span>} />
        <KV k="Base URL" v={<span className="font-mono text-[10.5px] break-all">{st?.model?.baseUrl ?? "—"}</span>} />
        <KV k="上下文窗口" v={<span className="font-mono">{fmtTokens(st?.model?.contextWindow)}</span>} />
        <KV k="Max Tokens" v={<span className="font-mono">{fmtTokens(st?.model?.maxTokens)}</span>} />
        <KV k="Reasoning" v={st?.model?.reasoning ? "支持" : "不支持"} />
      </Section>
      <Section title={t("队列模式")}>
        <KV k="Steering" v={st?.steeringMode ?? "—"} />
        <KV k="Follow-up" v={st?.followUpMode ?? "—"} />
        <KV k="Interrupt" v={st?.interruptMode ?? "—"} />
      </Section>
    </div>
  );
}

// ---------- Files(工作区文件,来自 /api/files) ----------
function FilesTab() {
  const { t } = useLang();
  const [files, setFiles] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    fetch("/api/files")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setFiles(j.files);
        else setErr(j.error);
      })
      .catch((e) => setErr(String(e)));
  }, []);
  return (
    <div className="p-3">
      <Section title={t("工作区文件")}>
        {err && <div className="text-[11.5px] text-error">{err}</div>}
        {!files && !err && <div className="text-[11.5px] text-secondary">{t("加载中…")}</div>}
        {files && (
          <div className="space-y-px max-h-[480px] overflow-y-auto">
            {files.map((f) => (
              <div key={f.path} className="flex items-center gap-2 text-[11.5px]  rounded px-1.5 py-1">
                <span className={`${f.isDir ? "text-accent" : "text-secondary"}`}>{f.isDir ? "📁" : "📄"}</span>
                <span className="flex-1 truncate font-mono text-[11px]">{f.path}</span>
                {!f.isDir && <span className="text-[10px] text-secondary font-mono">{fmtBytes(f.size)}</span>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------- Logs ----------
function LogsTab() {
  const { state } = useApp();
  const { t } = useLang();
  const logs = state.childLog;
  return (
    <div className="p-3">
      <Section title="omp stderr">
        {!logs.length && <div className="text-[11.5px] text-secondary">{t("暂无日志")}</div>}
        <pre className="term term-dim text-[11px] max-h-[560px] overflow-y-auto whitespace-pre-wrap break-all">
          {logs.map((l) => l.text).join("\n")}
        </pre>
      </Section>
    </div>
  );
}

// ---------- Tasks(todo 树) ----------
function TasksTab() {
  const { state } = useApp();
  const { t } = useLang();
  const st = state.state;
  const phases = st?.todoPhases ?? [];
  const [open, setOpen] = useState(true);
  return (
    <div className="p-3">
      <Section title={`${t("任务")} (${phases.reduce((n, p) => n + p.tasks.length, 0)})`}>
        {!phases.length && <div className="text-[11.5px] text-secondary">{t("暂无任务")}</div>}
        <div className="space-y-2">
          {phases.map((p) => (
            <div key={p.id}>
              <div className="flex items-center gap-1.5 text-[11.5px] text-secondary font-medium mb-1">
                <button onClick={() => setOpen(!open)} className="hover:text-primary">
                  {open ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
                </button>
                {p.name}
              </div>
              {open && (
                <div className="space-y-0.5 pl-4">
                  {p.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-1.5 text-[11.5px]">
                      <span className={`${t.status === "completed" ? "text-success" : t.status === "in_progress" ? "text-warning" : "text-secondary/60"}`}>
                        {t.status === "completed" ? "✓" : t.status === "in_progress" ? "◐" : "○"}
                      </span>
                      <span className={`flex-1 ${t.status === "completed" ? "line-through text-secondary/60" : ""}`}>{t.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---------- Memory(占位,由 omp 管理) ----------
function MemoryTab() {
  return <Placeholder text="记忆由 omp 的 memory 后端管理(如 Mnemosyne)。当前 RPC 会话未暴露记忆内容。" />;
}

// ---------- Tools(会话内工具) ----------
function ToolsTab() {
  const { state } = useApp();
  const { t } = useLang();
  const st = state.state;
  const tools = st?.dumpTools ?? [];
  const active = [...state.tools.values()];
  return (
    <div className="p-3 space-y-3">
      {active.length > 0 && (
        <Section title={`${t("本轮工具")} (${active.length})`}>
          <div className="space-y-1">
            {active.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[11.5px]">
                <span className={`w-1.5 h-1.5 rounded-full ${t.status === "running" ? "bg-warning" : t.status === "error" ? "bg-error" : "bg-success"}`} />
                <span className="font-mono text-accent">{t.toolName}</span>
                <span className="flex-1 truncate text-secondary">{t.intent}</span>
                <span className="text-[10px] text-secondary">{t.status}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title={`${t("可用工具")} (${tools.length})`}>
        {!tools.length && <div className="text-[11.5px] text-secondary">{t("暂无工具信息")}</div>}
        <div className="space-y-px">
          {tools.map((t) => (
            <div key={t.name} className="flex items-start gap-2 py-1 text-[11.5px]">
              <IconTerminal size={11} className="text-accent mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-mono">{t.name}</div>
                <div className="text-secondary text-[10.5px] line-clamp-2">{t.description}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---------- MCP(占位) ----------
function McpTab() {
  return <Placeholder text="MCP 服务器由 omp 的 mcp 配置管理。当前 RPC 协议未暴露 MCP 连接状态。" />;
}

// ---------- Variables(占位) ----------
function VariablesTab() {
  return <Placeholder text="会话变量与扩展注入的状态。当前会话无可见变量。" />;
}

function Placeholder({ text }) {
  return (
    <div className="p-4 text-[12px] text-secondary leading-relaxed">
      {text}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-secondary/70 font-semibold mb-1.5">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11.5px]">
      <span className="text-secondary shrink-0">{k}</span>
      <span className="text-primary text-right break-all">{v}</span>
    </div>
  );
}
