// 左侧 Sidebar:导航、搜索、会话历史、底部用户/provider/model 信息。
import { useMemo, useState } from "react";
import { useApp, VIEWS } from "../store";
import { fmtTokens } from "../format";
import { useLang } from "../i18n";
import {
  IconPlus, IconSearch, IconHistory, IconBook, IconFolder, IconPlug, IconBot, IconPuzzle,
  IconCpu, IconSettings, IconChevronLeft, IconMenu, IconUser, IconZap, IconWrench,
} from "../icons";
import { NewSessionDialog } from "./NewSessionDialog";

const NAV = [
  { id: "sessions", label: "聊天记录", icon: IconHistory },
  { id: "prompts", label: "Prompt 库", icon: IconBook },
  { id: "skills", label: "Skills", icon: IconWrench },
  { id: "marketplace", label: "Marketplace", icon: IconPlug },
  { id: "workspaces", label: "工作区", icon: IconFolder },
  { id: "mcp", label: "MCP 服务器", icon: IconPlug },
  { id: "agents", label: "Agents", icon: IconBot },
  { id: "plugins", label: "插件", icon: IconPuzzle },
  { id: "models", label: "模型", icon: IconCpu },
  { id: "settings", label: "设置", icon: IconSettings },
];

export function Sidebar() {
  const { state, actions } = useApp();
  const { view, sidebarOpen, state: st } = state;
  const [q, setQ] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const { t } = useLang();

  const model = st?.model;
  const cu = st?.contextUsage;

  const filtered = useMemo(() => {
    const items = NAV;
    if (!q.trim()) return items;
    return items.filter((n) => t(n.label).toLowerCase().includes(q.trim().toLowerCase()));
  }, [q, t]);

  return (
    <>
      {/* 折叠态按钮(窄屏或折叠时) */}
      <div className={`${sidebarOpen ? "hidden" : "flex"} items-center justify-center w-9 border-r border-border bg-sidebar flex-col gap-1`}>
        <button className="btn btn-icon" title={t("展开侧栏")} onClick={() => actions.dispatch({ type: "sidebar", open: true })}>
          <IconMenu size={16} />
        </button>
      </div>

      <aside className={`${sidebarOpen ? "flex" : "hidden"} flex-col w-60 shrink-0 bg-sidebar border-r border-border`}>
        {/* Logo + New Chat */}
        <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white font-bold text-[13px] font-mono shrink-0">o</div>
            <span className="font-semibold text-[14px] tracking-wide whitespace-nowrap">omp web</span>
          </div>
          <button
            className="btn btn-icon"
            title={t("新会话") + " (Ctrl+N)"}
            onClick={() => setShowNewDialog(true)}
          >
            <IconPlus size={15} />
          </button>
          <button className="btn btn-icon" title={t("折叠侧栏")} onClick={() => actions.dispatch({ type: "sidebar", open: false })}>
            <IconChevronLeft size={15} />
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-3 pt-2 shrink-0">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
            <input
              className="input pl-7"
              placeholder={t("搜索导航…")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-px">
          {/* 新对话：文字入口，替代顶部 + 号 */}
          <button
            className="nav-item text-accent"
            onClick={() => setShowNewDialog(true)}
            title={t("新建对话") + " (Ctrl+N)"}
          >
            <IconPlus size={15} />
            <span>{t("新对话")}</span>
          </button>
          {/* 当前对话 */}
          <button
            className={`nav-item ${view === "chat" ? "active" : ""}`}
            onClick={() => actions.dispatch({ type: "view", view: "chat" })}
          >
            <IconZap size={15} />
            <span>{t("当前对话")}</span>
          </button>
          {filtered.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => actions.dispatch({ type: "view", view: n.id })}
            >
              <n.icon size={15} />
              <span>{t(n.label)}</span>
            </button>
          ))}
        </nav>

        {/* 底部:用户 / provider / model / token */}
        <div className="border-t border-border px-3 py-2.5 space-y-1.5 shrink-0">
          <div className="flex items-center gap-2 text-[12px] text-secondary">
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--color-bg-elevated)' }}>
              <IconUser size={11} />
            </div>
            <span className="truncate flex-1">{t("本地用户")}</span>
            <span className="text-[10.5px] font-mono text-secondary/70 truncate max-w-[80px]">{st?.sessionId?.slice(0, 8) ?? ""}</span>
          </div>
          <div className="space-y-1 text-[11.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-secondary shrink-0">Provider</span>
              <span className="font-mono truncate text-right">{model?.provider ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-secondary shrink-0">Model</span>
              <span className="font-mono truncate text-right" title={model?.id ?? ""}>{model?.name ?? model?.id ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-secondary shrink-0">Context</span>
              <span className="font-mono truncate text-right">
                {cu ? `${fmtTokens(cu.tokens)} / ${fmtTokens(cu.contextWindow)}` : "—"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {showNewDialog && (
        <NewSessionDialog
          onClose={() => setShowNewDialog(false)}
          onCreated={() => {
            setShowNewDialog(false);
            actions.dispatch({ type: "view", view: "chat" });
          }}
        />
      )}
    </>
  );
}
