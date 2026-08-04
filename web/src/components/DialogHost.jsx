// 扩展 UI 弹窗:confirm / input / select / editor / notify / open_url。
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { IconAlert, IconX } from "../icons";

// 在桌面版(Tauri)里用系统浏览器打开;网页版退回 window.open。
async function openExternal(url) {
  try {
    if (window.__TAURI_INTERNALS__?.invoke) {
      await window.__TAURI_INTERNALS__.invoke("open_external", { url });
      return;
    }
  } catch {}
  window.open(url, "_blank", "noopener");
}

export function DialogHost() {
  const { state, actions } = useApp();
  const { t } = useLang();
  const dlg = state.dialog;
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (dlg && ["input", "editor"].includes(dlg.method)) {
      setValue(dlg.defaultValue ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    setCopied(false);
  }, [dlg?.id]);

  if (!dlg) return null;

  const close = (payload) => {
    // open_url 是 omp 的"提示去打开授权页"通知,不期待响应,无需回 ui_response
    if (dlg.method !== "open_url") {
      actions.uiResponse(dlg.id, payload).catch(() => {});
    }
    actions.dispatch({ type: "dialog_close" });
  };

  const cancel = () => close({ cancelled: true });

  const confirm = () => {
    if (dlg.method === "input" || dlg.method === "editor") close({ value });
    else close({ confirmed: true });
  };

  const copyUrl = async () => {
    if (!dlg.url) return;
    try {
      await navigator.clipboard.writeText(dlg.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="w-[460px] max-w-[92vw] card bg-card shadow-2xl animate-slide-up">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {dlg.method === "notify" && <IconAlert size={14} className="text-warning" />}
          {dlg.method === "open_url" && <IconAlert size={14} className="text-accent" />}
          <span className="flex-1 text-[13.5px] font-semibold truncate">{dlg.title || (dlg.method === "open_url" ? t("需要登录授权") : t("omp 请求"))}</span>
          {dlg.timeout && <span className="text-[10.5px] text-secondary font-mono">{Math.round(dlg.timeout / 1000)}s 超时</span>}
          <button className="btn btn-icon" onClick={cancel}><IconX size={13} /></button>
        </div>
        <div className="px-4 py-3.5">
          {dlg.message && (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap mb-3 text-primary">{dlg.message}</div>
          )}

          {dlg.method === "open_url" && (
            <div className="space-y-3">
              {dlg.instructions && (
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-primary">{dlg.instructions}</div>
              )}
              {dlg.url && (
                <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2" style={{ background: 'var(--color-bg-elevated)' }}>
                  <span className="flex-1 text-[12px] font-mono break-all text-accent select-all">{dlg.url}</span>
                  <button className="btn h-6 text-[11px] shrink-0" onClick={copyUrl}>
                    {copied ? t("已复制") : t("复制链接")}
                  </button>
                </div>
              )}
            </div>
          )}

          {dlg.method === "input" && (
            <input
              ref={inputRef}
              className="input h-8"
              placeholder={dlg.placeholder ?? ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
            />
          )}

          {dlg.method === "editor" && (
            <textarea
              ref={inputRef}
              className="input h-40 resize-y font-mono text-[12px]"
              placeholder={dlg.placeholder ?? ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}

          {dlg.method === "select" && (
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {(dlg.options ?? []).map((opt, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 rounded-md border border-border   text-[12.5px] transition-colors duration-100"
                  onClick={() => close({ value: opt })}
                >
                  {opt}
                </button>
              ))}
              {!(dlg.options ?? []).length && <div className="text-[12px] text-secondary">{t("无选项")}</div>}
            </div>
          )}
        </div>
        {(dlg.method === "confirm" || dlg.method === "input" || dlg.method === "editor") && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
            <button className="btn" onClick={cancel}>{t("取消")}</button>
            <button className="btn btn-primary" onClick={confirm}>
              {dlg.method === "confirm" ? t("确认") : t("确定")}
            </button>
          </div>
        )}
        {dlg.method === "open_url" && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
            <button className="btn" onClick={cancel}>{t("知道了")}</button>
            {dlg.url && (
              <button className="btn btn-primary" onClick={() => openExternal(dlg.url)}>{t("打开授权页")}</button>
            )}
          </div>
        )}
        {dlg.method === "notify" && (
          <div className="flex justify-end px-4 py-3 border-t border-border">
            <button className="btn btn-primary" onClick={confirm}>{t("知道了")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
