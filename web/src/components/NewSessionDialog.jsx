// 新建对话弹窗组件：名称（可选）+ 工作文件夹（可选，带目录浏览选择器）。
import { useEffect, useState } from "react";
import { useApp } from "../store";
import { api } from "../api";
import { IconFolder, IconX, IconChevronRight, IconRefresh } from "../icons";

export function NewSessionDialog({ onClose, onCreated }) {
  const { state, actions } = useApp();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const payload = {};
      if (name.trim()) payload.name = name.trim();
      if (cwd.trim()) payload.cwd = cwd.trim();

      const r = await api.createSession(payload);
      if (r?.ok) {
        actions.dispatch({ type: "clear_msgs" });
        actions.toast("对话已创建");
        onCreated?.(r);
        onClose?.();
      } else {
        actions.toast(`创建失败: ${r?.error ?? "未知错误"}`, "bad");
      }
    } finally {
      setLoading(false);
    }
  };

  const defaultDir = state.state?.sessionFile?.split(/[\\/]/).slice(0, -1).join("/") ?? "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="w-[520px] max-w-[92vw] card shadow-2xl animate-slide-up" style={{ background: 'var(--color-card)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-[15px] font-semibold">新建对话</h2>
          <button className="btn btn-icon" onClick={onClose}>
            <IconX size={13} />
          </button>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* 对话名称 */}
          <div>
            <label className="text-[12.5px] text-secondary block mb-1.5">
              对话名称 <span className="text-secondary/60">(可选)</span>
            </label>
            <input
              className="input h-8"
              placeholder="例如：重构 server.mjs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <p className="text-[11px] text-secondary mt-1">
              设置后显示在会话标题和聊天记录中。
            </p>
          </div>

          {/* 工作文件夹 */}
          <div>
            <label className="text-[12.5px] text-secondary block mb-1.5">
              工作文件夹 <span className="text-secondary/60">(可选)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="input h-8 pl-8"
                  placeholder={defaultDir || "默认工作区"}
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  readOnly={!cwd}
                />
                <IconFolder size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary" />
              </div>
              <button className="btn h-8" onClick={() => setPickerOpen(true)} title="浏览选择文件夹">
                <IconFolder size={13} /> 浏览
              </button>
              {cwd && (
                <button className="btn btn-ghost h-8" onClick={() => setCwd("")} title="清除">
                  <IconX size={13} />
                </button>
              )}
            </div>
            <p className="text-[11px] text-secondary mt-1.5">
              不填写则使用当前默认工作区。选择后该对话的模型将在所选文件夹中工作。
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? "创建中…" : "创建对话"}
          </button>
        </div>

        {/* 文件夹选择弹窗 */}
        {pickerOpen && (
          <DirPicker
            onSelect={(path) => { setCwd(path); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// 目录浏览选择器
function DirPicker({ onSelect, onClose }) {
  const [path, setPath] = useState(null); // null = 盘符列表
  const [dirs, setDirs] = useState([]);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = async (p) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.listDirs(p);
      if (r?.ok) {
        setDirs(r.dirs ?? []);
        setParent(r.parent ?? null);
        setPath(p);
      } else {
        setErr(r?.error ?? "加载失败");
      }
    } catch (e) {
      setErr(String(e));
    }
    setLoading(false);
  };

  // 初始加载盘符
  useEffect(() => { load(null); }, []);

  const goUp = () => {
    if (path === null) return;
    load(parent);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="w-[480px] max-w-[92vw] card shadow-2xl animate-slide-up flex flex-col" style={{ background: 'var(--color-card)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <IconFolder size={14} className="text-accent shrink-0" />
          <span className="flex-1 text-[13.5px] font-semibold truncate">{path ?? "选择磁盘"}</span>
          {parent && (
            <button className="btn btn-ghost h-7 text-[12px]" onClick={goUp} title="上一级">
              <IconChevronRight size={12} className="rotate-180" /> 上一级
            </button>
          )}
          <button className="btn btn-icon" onClick={() => load(path)} title="刷新">
            <IconRefresh size={13} />
          </button>
          <button className="btn btn-icon" onClick={onClose}>
            <IconX size={13} />
          </button>
        </div>

        {err && <div className="px-4 py-2 text-[12px] text-error">{err}</div>}
        {loading && <div className="px-4 py-6 text-[12.5px] text-secondary text-center">加载中…</div>}

        {!loading && (
          <div className="flex-1 overflow-y-auto p-2 max-h-[360px]">
            {dirs.length === 0 && (
              <div className="py-6 text-center text-[12px] text-secondary">此文件夹下没有子目录</div>
            )}
            {dirs.map((d) => (
              <div
                key={d.path}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors duration-100"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => load(d.path)}
                title={d.path}
              >
                <IconFolder size={14} className="text-accent shrink-0" />
                <span className="flex-1 truncate text-[13px]">{d.name}</span>
                <IconChevronRight size={11} className="shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn" onClick={onClose}>取消</button>
          {path && (
            <button className="btn btn-primary" onClick={() => onSelect(path)}>
              选择此文件夹
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
