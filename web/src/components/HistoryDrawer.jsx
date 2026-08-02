// 左侧历史问题抽屉：只列出用户问过的问题（截断显示），点击定位到对应消息。
import { useMemo } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { IconHistory, IconX, IconUser, IconChevronLeft } from "../icons";

// 取用户消息文本（去掉换行，压缩空白）
function questionText(msg) {
  const t = (msg.blocks ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

export function HistoryDrawer() {
  const { state, actions } = useApp();
  const { t } = useLang();
  const { msgs, historyDrawer, sidebarOpen } = state;
  const drawerLeft = sidebarOpen ? 240 : 36;

  const questions = useMemo(() => {
    const out = [];
    for (const m of msgs) {
      if (m.role !== "user") continue;
      const text = questionText(m);
      if (!text) continue;
      out.push({ msgId: m.msgId, text });
    }
    return out;
  }, [msgs]);

  const jump = (msgId) => {
    actions.dispatch({ type: "scroll_to", msgId });
  };

  if (!historyDrawer) return null;

  return (
    <div
      className="fixed z-30 flex flex-col overflow-hidden animate-drawer-in"
      style={{
        top: "12vh",
        height: "58vh",
        left: drawerLeft + 8,
        width: 240,
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "6px 10px 28px rgba(0,0,0,0.35)",
      }}
    >
      {/* 关闭按钮：卡片左边缘垂直居中 */}
      <button
        className="absolute flex items-center justify-center w-4 h-9 rounded-l-md transition-colors duration-100"
        style={{
          left: -4,
          top: "50%",
          transform: "translateY(-50%)",
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderLeft: "none",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-primary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
        onClick={() => actions.dispatch({ type: "history_drawer", open: false })}
        title={t("收起")}
      >
        <IconChevronLeft size={11} />
      </button>
      <div className="flex items-center gap-2 px-3 h-10 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <IconHistory size={14} className="text-accent shrink-0" />
        <span className="text-[12.5px] font-semibold flex-1 truncate">{t("历史问题")}</span>
        <span className="text-[11px] text-secondary shrink-0">{questions.length}</span>
        <button
          className="btn btn-icon"
          onClick={() => actions.dispatch({ type: "history_drawer", open: false })}
          title={t("收起")}
        >
          <IconX size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {!questions.length && (
          <div className="px-2 py-4 text-[12px] text-secondary text-center">{t("暂无历史问题")}</div>
        )}
        {questions.map((q, i) => (
          <button
            key={q.msgId}
            className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors duration-100"
            style={{ background: "transparent", color: "var(--color-text-primary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-elevated)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            onClick={() => jump(q.msgId)}
            title={q.text}
          >
            <span className="text-[10px] text-secondary font-mono shrink-0 pt-0.5">{i + 1}.</span>
            <IconUser size={11} className="text-secondary shrink-0 mt-0.5" />
            <span className="text-[12px] leading-snug truncate">{q.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
