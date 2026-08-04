// 新建对话弹窗组件：名称（可选）+ 工作文件夹（可选，系统原生文件夹选择器）。
import { useState } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { api } from "../api";
import { IconFolder, IconX } from "../icons";

export function NewSessionDialog({ onClose, onCreated }) {
  const { state, actions } = useApp();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  // 调系统原生文件夹选择对话框（文件管理器风格，可新建文件夹）
  // 120s 超时兜底：若对话框进程异常挂起，恢复按钮并提示，避免永久“选择中…”
  const handleBrowse = async () => {
    setPicking(true);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120000);
    try {
      const r = await api.pickFolder(cwd || undefined, ac.signal);
      if (r?.ok && r.dir) setCwd(r.dir);
      else if (r && !r.ok) actions.toast(String(r.error ?? t("加载失败")), "bad");
    } catch (e) {
      if (e?.name === "AbortError") actions.toast(t("文件夹选择超时，请重试"), "bad");
      else actions.toast(String(e), "bad");
    } finally {
      clearTimeout(timer);
      setPicking(false);
    }
  };

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
        actions.toast(`${t("创建失败: ")}${r?.error ?? "未知错误"}`, "bad");
      }
    } finally {
      setLoading(false);
    }
  };

  const defaultDir = state.state?.cwd ?? state.state?.sessionFile?.split(/[\\/]/).slice(0, -1).join("/") ?? "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="w-[520px] max-w-[92vw] card shadow-2xl animate-slide-up" style={{ background: 'var(--color-card)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-[15px] font-semibold">{t("新建对话")}</h2>
          <button className="btn btn-icon" onClick={onClose}>
            <IconX size={13} />
          </button>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* 对话名称 */}
          <div>
            <label className="text-[12.5px] text-secondary block mb-1.5">
              {t("对话名称")} <span className="text-secondary/60">({t("可选")})</span>
            </label>
            <input
              className="input h-8"
              placeholder={t("例如：重构 server.mjs")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <p className="text-[11px] text-secondary mt-1">
              {t("设置后显示在会话标题和聊天记录中。")}
            </p>
          </div>

          {/* 工作文件夹 */}
          <div>
            <label className="text-[12.5px] text-secondary block mb-1.5">
              {t("工作文件夹")} <span className="text-secondary/60">({t("可选")})</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="input h-8 pl-8"
                  placeholder={defaultDir || t("默认工作区")}
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  readOnly={!cwd}
                />
                <IconFolder size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary" />
              </div>
              <button className="btn h-8" onClick={handleBrowse} disabled={picking} title={t("浏览选择文件夹")}>
                <IconFolder size={13} /> {picking ? t("选择中…") : t("浏览")}
              </button>
              {cwd && (
                <button className="btn btn-ghost h-8" onClick={() => setCwd("")} title={t("清除")}>
                  <IconX size={13} />
                </button>
              )}
            </div>
            <p className="text-[11px] text-secondary mt-1.5">
              {t("不填写则使用当前默认工作区。选择后该对话的模型将在所选文件夹中工作。")}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button className="btn" onClick={onClose} disabled={loading}>
            {t("取消")}
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? t("创建中…") : t("创建对话")}
          </button>
        </div>
      </div>
    </div>
  );
}
