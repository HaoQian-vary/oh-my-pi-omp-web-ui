// 聊天记录:列出历史会话,支持切换、分组、搜索、管理。
import { useEffect, useState, useMemo } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { PageShell } from "./PageShell";
import { fmtTime } from "../format";
import {
  IconRefresh, IconHistory, IconSearch, IconPin, IconPinOff,
  IconTrash, IconEdit, IconX, IconCheck, IconMore
} from "../icons";

const GROUPS = [
  { id: "pinned", label: "已置顶" },
  { id: "today", label: "今天" },
  { id: "yesterday", label: "昨天" },
  { id: "week", label: "最近7天" },
  { id: "earlier", label: "更早" },
];

export function SessionsView() {
  const { state, actions } = useApp();
  const { t, lang } = useLang();
  const [sessions, setSessions] = useState(null);
  const [err, setErr] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuSession, setMenuSession] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [sortMode, setSortMode] = useState("mtime"); // mtime | name

  const load = () => {
    setSessions(null);
    setErr(null);
    actions.loadSessions()
      .then((list) => setSessions(list))
      .catch((e) => setErr(String(e)));
  };
  useEffect(load, []);

  const open = async (s) => {
    setSwitching(s.path);
    try {
      const ok = await actions.switchSession(s.path);
      if (ok) {
        actions.toast(`已切换到 ${s.name || s.id.slice(0, 8)}`);
        actions.dispatch({ type: "view", view: "chat" });
      } else {
        actions.toast(t("切换失败"), "bad");
      }
    } finally {
      setSwitching(null);
    }
  };

  const handleRename = async (s) => {
    if (!renameValue.trim()) return;
    const ok = await actions.renameSession(s.path, renameValue.trim());
    if (ok) {
      actions.toast(t("已重命名"));
      load();
    } else {
      actions.toast(t("重命名失败"), "bad");
    }
    setRenaming(null);
    setMenuSession(null);
  };

  const handleDelete = async (s) => {
    const ok = await actions.deleteSession(s.path);
    if (ok) {
      actions.toast(t("已删除"));
      load();
    } else {
      actions.toast(t("删除失败"), "bad");
    }
    setDeleting(null);
    setMenuSession(null);
  };

  const handlePin = async (s, pinned) => {
    const ok = await actions.pinSession(s.path, pinned);
    if (ok) {
      actions.toast(pinned ? t("已置顶") : t("已取消置顶"));
      load();
    }
    setMenuSession(null);
  };

  // 按日期分组
  const grouped = useMemo(() => {
    if (!sessions) return {};
    const now = Date.now();
    const today = new Date(now).setHours(0, 0, 0, 0);
    const yesterday = today - 86400000;
    const week = today - 7 * 86400000;

    let filtered = sessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = sessions.filter((s) =>
        (s.name ?? "").toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.cwd ?? "").toLowerCase().includes(q)
      );
    }

    const groups = { pinned: [], today: [], yesterday: [], week: [], earlier: [] };
    for (const s of filtered) {
      if (s.pinned) {
        groups.pinned.push(s);
        continue;
      }
      const t = s.mtime;
      if (t >= today) groups.today.push(s);
      else if (t >= yesterday) groups.yesterday.push(s);
      else if (t >= week) groups.week.push(s);
      else groups.earlier.push(s);
    }

    // 排序
    const sortFn = sortMode === "name"
      ? (a, b) => (a.name ?? "").localeCompare(b.name ?? "")
      : (a, b) => b.mtime - a.mtime;
    for (const k of Object.keys(groups)) {
      groups[k].sort(sortFn);
    }
    return groups;
  }, [sessions, searchQuery, sortMode]);

  const hasSessions = sessions?.length > 0;

  return (
    <PageShell
      title={t("聊天记录")}
      desc={t("历史会话列表。点击打开恢复完整会话。")}
      actions={
        <div className="flex gap-2">
          <select
            className="select h-7 text-[12px]"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
          >
            <option value="mtime">{t("按时间")}</option>
            <option value="name">{t("按名称")}</option>
          </select>
          <button className="btn btn-ghost" onClick={load} title={t("刷新")}>
            <IconRefresh size={13} /> {t("刷新")}
          </button>
        </div>
      }
    >
      {/* 搜索 */}
      <div className="relative mb-4">
        <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
        <input
          className="input pl-8 h-8"
          placeholder={t("搜索会话…")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {err && <div className="text-[13px] text-error mb-3">{err}</div>}
      {!sessions && !err && <div className="text-secondary text-[13px] py-8 text-center">{t("加载中…")}</div>}
      {sessions && !hasSessions && (
        <div className="text-secondary text-[13px] py-12 text-center flex flex-col items-center gap-2">
          <IconHistory size={24} className="opacity-40" />
          {t("暂无历史会话")}
        </div>
      )}

      {/* 分组列表 */}
      {GROUPS.map((group) => {
        const items = grouped[group.id];
        if (!items?.length) return null;
        return (
          <div key={group.id} className="mb-4">
            <h3 className="text-[11px] uppercase tracking-wider text-secondary/70 font-semibold mb-2 px-1">
              {t(group.label)} ({items.length})
            </h3>
            <div className="space-y-1.5">
              {items.map((s) => (
                <SessionItem
                  key={s.path}
                  session={s}
                  switching={switching === s.path}
                  menuOpen={menuSession === s.path}
                  renaming={renaming === s.path}
                  renameValue={renameValue}
                  deleting={deleting === s.path}
                  onOpen={() => open(s)}
                  onMenuToggle={() => setMenuSession(menuSession === s.path ? null : s.path)}
                  onRenameStart={() => { setRenaming(s.path); setRenameValue(s.name ?? ""); setMenuSession(null); }}
                  onRenameChange={(v) => setRenameValue(v)}
                  onRenameSubmit={() => handleRename(s)}
                  onRenameCancel={() => setRenaming(null)}
                  onPin={() => handlePin(s, !s.pinned)}
                  onDelete={() => setDeleting(s.path)}
                  onDeleteConfirm={() => handleDelete(s)}
                  onDeleteCancel={() => setDeleting(null)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* 删除确认 */}
      {deleting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="card p-4 max-w-sm animate-slide-up">
            <h3 className="font-semibold mb-2">{t("确认删除")}</h3>
            <p className="text-[13px] text-secondary mb-4">
              {t("删除后无法恢复。确定要删除此会话吗？")}
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setDeleting(null)}>{t("取消")}</button>
              <button className="btn btn-danger" onClick={() => {
                const s = sessions.find(x => x.path === deleting);
                if (s) handleDelete(s);
              }}>{t("删除")}</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SessionItem({
  session: s, switching, menuOpen, renaming, renameValue, deleting,
  onOpen, onMenuToggle, onRenameStart, onRenameChange, onRenameSubmit, onRenameCancel,
  onPin, onDelete, onDeleteConfirm, onDeleteCancel
}) {
  const { t, lang } = useLang();
  return (
    <div className="card px-3.5 py-3 group relative  transition-colors duration-100">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <input
                className="input h-7 flex-1"
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameSubmit();
                  if (e.key === "Escape") onRenameCancel();
                }}
                autoFocus
              />
              <button className="btn btn-icon h-7 w-7" onClick={onRenameSubmit}>
                <IconCheck size={12} />
              </button>
              <button className="btn btn-icon h-7 w-7" onClick={onRenameCancel}>
                <IconX size={12} />
              </button>
            </div>
          ) : (
            <div className="text-[13.5px] font-medium truncate flex items-center gap-1.5">
              {s.pinned && <IconPin size={12} className="text-accent shrink-0" />}
              {s.name || t("未命名会话")}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-secondary font-mono">
            <span className="truncate">{s.file ?? s.path.split(/[\\/]/).pop()}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-secondary">
            <span>{s.messageCount ?? 0} {t("条消息")}</span>
            <span>{fmtTime(s.mtime, lang)}</span>
            {s.cwd && <span className="truncate max-w-[220px]">{s.cwd}</span>}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            className="btn h-7"
            onClick={onOpen}
            disabled={switching}
          >
            {switching ? t("切换中…") : t("打开")}
          </button>
          <div className="relative">
            <button className="btn btn-icon h-7 w-7" onClick={onMenuToggle}>
              <IconMore size={13} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 card bg-card shadow-xl z-50 animate-fade-in py-1">
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px]" onClick={onRenameStart}>
                  <IconEdit size={12} /> {t("重命名")}
                </button>
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px]" onClick={onPin}>
                  {s.pinned ? <IconPinOff size={12} /> : <IconPin size={12} />}
                  {s.pinned ? t("取消置顶") : t("置顶")}
                </button>
                <hr className="border-border my-1" />
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-error hover:bg-error/10" onClick={onDelete}>
                  <IconTrash size={12} /> {t("删除")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
