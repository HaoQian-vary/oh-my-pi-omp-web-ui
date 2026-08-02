// 输入区:prompt 输入、slash 命令、autocomplete、图片上传、快捷键。
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { api } from "../api";
import { IconSend, IconStop, IconPaperclip, IconX, IconSparkle } from "../icons";
import { useLang } from "../i18n";

const SLASH_COMMANDS = [
  { cmd: "/resume", desc: "恢复历史会话" },
  { cmd: "/fork", desc: "从当前会话派生新会话" },
  { cmd: "/compact", desc: "压缩上下文" },
  { cmd: "/handoff", desc: "生成交接说明" },
  { cmd: "/export", desc: "导出会话为 HTML" },
  { cmd: "/fresh", desc: "重置 provider 流状态" },
];

export function Composer() {
  const { state, actions } = useApp();
  const { state: st } = state;
  const isStreaming = state.isStreaming ?? false;
  const { t } = useLang();
  const [text, setText] = useState("");
  const [images, setImages] = useState([]); // {dataUrl, name} 图片(截图/文件)真正读取
  const [attachments, setAttachments] = useState([]); // {path, name} 本地文件路径引用(不读取内容,省内存)
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef(null);
  const dropRef = useRef(null);

  // slash 命令匹配
  const slashMatch = useMemo(() => {
    const m = text.match(/^\/(\w*)$/);
    if (!m) return null;
    const q = m[1].toLowerCase();
    const list = SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(q) || !q);
    return list.length ? list : null;
  }, [text]);

  useEffect(() => {
    setSlashOpen(!!slashMatch);
    setSlashIdx(0);
  }, [slashMatch]);

  // 输入框高度（固定，不随输入变化；拖上边缘调节）
  const [taHeight, setTaHeight] = useState(64);
  const resizeStartRef = useRef(null);

  // 拖拽上边缘调高度
  const onResizeStart = (e) => {
    e.preventDefault();
    resizeStartRef.current = { y: e.clientY, h: taHeight };
    const onMove = (ev) => {
      if (!resizeStartRef.current) return;
      const delta = resizeStartRef.current.y - ev.clientY; // 向上拖 => 变大
      const h = Math.max(48, Math.min(320, resizeStartRef.current.h + delta));
      setTaHeight(h);
    };
    const onUp = () => {
      resizeStartRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  // Prompt 库“一键使用”填充
  useEffect(() => {
    const onFill = (e) => {
      setText(e.detail ?? "");
      taRef.current?.focus();
    };
    window.addEventListener("omp:fill-prompt", onFill);
    return () => window.removeEventListener("omp:fill-prompt", onFill);
  }, []);

  const send = async () => {
    let msg = text.trim();
    if (!msg && !attachments.length && !images.length) return;
    // 只发图片/附件无文本时给默认占位文本（omp prompt 要求 message 非空）
    if (!msg && (images.length || attachments.length)) msg = "[图片/文件]";
    // 文件路径引用注入消息文本：agent 可通过 read 工具直接访问
    if (attachments.length) {
      const paths = attachments.map((a, i) => `${i + 1}. ${a.path}`).join("\n");
      msg = `${msg ? msg + "\n\n" : ""}[${t("附加文件路径，可用 read 工具直接访问")}]\n${paths}`;
    }
    setText("");
    setImages([]);
    setAttachments([]);
    if (isStreaming) {
      // 运行中：作为插话（steer）发送，暂停当前输出插入新指令
      const ok = await actions.steer(msg);
      if (ok) {
        // 插话也显示在对话里（含图片/文件路径）
        actions.dispatch({ type: "user_msg", text: msg, images: images.length ? images : undefined, attachments: attachments.length ? attachments : undefined });
      } else {
        actions.toast(t("插话失败"), "bad");
      }
      return;
    }
    if (msg.startsWith("/")) {
      // slash 命令作为普通 prompt 发送(后端 omp 会解析)
    }
    await actions.sendPrompt(msg, images.length ? images : undefined, attachments.length ? attachments : undefined);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && slashOpen) {
      e.preventDefault();
      applySlash(slashMatch[slashIdx]);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      // 单 Enter 发送(中文输入法组合态不发送)
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "ArrowDown" && slashOpen) {
      e.preventDefault();
      setSlashIdx((i) => (i + 1) % slashMatch.length);
      return;
    }
    if (e.key === "ArrowUp" && slashOpen) {
      e.preventDefault();
      setSlashIdx((i) => (i - 1 + slashMatch.length) % slashMatch.length);
      return;
    }
    if (e.key === "Escape") {
      setSlashOpen(false);
      if (isStreaming) actions.abort();
    }
  };

  const applySlash = (cmd) => {
    setText((t) => t.replace(/^\/\w*/, cmd.cmd + " "));
    setSlashOpen(false);
    taRef.current?.focus();
  };

  // 统一处理添加文件：图片读取为 dataUrl（截图粘贴无本地路径）；
  // 非图片本地文件只记录路径（agent 可访问电脑，无需真正上传内容，省内存）
  const addFiles = (files) => {
    for (const f of [...(files ?? [])]) {
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          const url = reader.result;
          // 统一转 png（webp/gif 等 → png），保证后台 mimo 分析一定能读取
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = img.width;
              canvas.height = img.height;
              canvas.getContext("2d").drawImage(img, 0, 0);
              const png = canvas.toDataURL("image/png");
              setImages((arr) => [...arr, { dataUrl: png, name: f.name }].slice(-4));
              actions.toast(`${t("已添加图片: ")}${f.name}`);
            } catch {
              setImages((arr) => [...arr, { dataUrl: url, name: f.name }].slice(-4));
              actions.toast(`${t("已添加图片: ")}${f.name}`);
            }
          };
          img.onerror = () => {
            setImages((arr) => [...arr, { dataUrl: url, name: f.name }].slice(-4));
            actions.toast(`${t("已添加图片: ")}${f.name}`);
          };
          img.src = url;
        };
        reader.readAsDataURL(f);
      } else {
        // 现代浏览器出于安全限制拿不到 File.path，这里保留兼容分支（个别环境有）
        const p = f.path;
        if (p) {
          setAttachments((arr) => [...arr, { path: p, name: f.name }].slice(-8));
          actions.toast(`${t("已添加文件（路径引用）: ")}${f.name}`);
        } else {
          actions.toast(`${t("无法从浏览器获取该文件路径，请点左侧回形针按钮选择文件")}`, "warn");
        }
      }
    }
  };

  // 原生文件选择对话框：返回真实路径列表（绕开浏览器无法读本地路径的限制）
  const pickNativeFiles = async () => {
    try {
      const r = await api.pickFiles();
      if (r?.ok && r.paths?.length) {
        const list = r.paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop() || p }));
        setAttachments((arr) => [...arr, ...list].slice(-8));
        actions.toast(`${t("已添加文件（路径引用）")}: ${list.length}`);
      } else if (r && !r.ok) {
        actions.toast(`${t("失败")}: ${r.error ?? ""}`, "bad");
      } else {
        actions.toast(t("已取消选择"), "warn");
      }
    } catch (e) {
      actions.toast(String(e), "bad");
    }
  };

  // 粘贴处理：文件/图片粘贴直接加入，纯文本粘贴不拦截
  const onPaste = (e) => {
    const files = e.clipboardData?.files;
    if (!files || !files.length) return;
    e.preventDefault(); // 阻止默认（避免把文件名/图片二进制插入文本）
    addFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    // 拖拽文件优先用 entry.fullPath 提取路径（Chromium 支持）
    const items = e.dataTransfer?.items;
    const entryPaths = [];
    if (items) {
      for (const it of items) {
        try {
          const entry = it.webkitGetAsEntry?.();
          if (entry && entry.isFile && entry.fullPath) entryPaths.push(entry.fullPath);
        } catch { /* 忽略 */ }
      }
    }
    if (entryPaths.length) {
      const list = entryPaths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop() || p }));
      setAttachments((arr) => [...arr, ...list].slice(-8));
      actions.toast(`${t("已添加文件（路径引用）")}: ${list.length}`);
      return;
    }
    addFiles(e.dataTransfer.files);
  };


  return (
    <div
      ref={dropRef}
      className={`shrink-0 border-t border-border bg-bg px-3 pt-2.5 pb-2 ${dragOver ? "ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="max-w-[860px] mx-auto relative">
        {/* slash 命令菜单 */}
        {slashOpen && slashMatch && (
          <div className="absolute bottom-full left-0 right-0 mb-1 card shadow-xl z-40 overflow-hidden animate-slide-up" style={{ background: 'var(--color-card)' }}>
            <div className="px-3 py-1.5 text-[10.5px] border-b" style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }}>{t("Slash 命令")}</div>
            {slashMatch.map((c, i) => (
              <button
                key={c.cmd}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-[12.5px]"
                style={{ background: i === slashIdx ? 'var(--color-bg-elevated)' : 'transparent' }}
                onMouseEnter={() => setSlashIdx(i)}
                onClick={() => applySlash(c)}
              >
                <span className="font-mono text-accent w-20 shrink-0">{c.cmd}</span>
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{t(c.desc)}</span>
              </button>
            ))}
          </div>
        )}

        {/* 图片预览 */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img.dataUrl} alt={img.name} className="w-14 h-14 rounded-md object-cover border border-border" />
                <button
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border text-secondary hover:text-primary flex items-center justify-center"
                  style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
                  onClick={() => setImages((arr) => arr.filter((_, j) => j !== i))}
                >
                  <IconX size={9} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 文件路径引用预览 */}
        {attachments.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-md border text-[11.5px]" style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                <IconPaperclip size={11} className="text-accent shrink-0" />
                <span className="max-w-[160px] truncate">{a.name}</span>
                <span className="text-[10px] text-secondary max-w-[180px] truncate font-mono">{a.path}</span>
                <button
                  className="btn btn-icon"
                  title={t("移除")}
                  onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                >
                  <IconX size={9} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 输入行 */}
        <div className="card overflow-hidden" style={{ background: 'var(--color-input-bg)', boxShadow: 'var(--shadow-input-inset, none)' }}>
          {/* 顶部拖拽条：拖上边缘调输入框高度 */}
          <div
            className="h-[3px] cursor-ns-resize hover:bg-accent/50 transition-colors duration-100"
            onMouseDown={onResizeStart}
            title={t("拖拽调整输入框高度")}
          />
          <textarea
            ref={taRef}
            className="w-full bg-transparent border-0 outline-none resize-none px-3 pt-2 text-[13.5px] leading-relaxed overflow-y-auto"
            style={{ color: 'var(--color-text-primary)', height: `${taHeight}px` }}
            placeholder={isStreaming ? t("运行中… 输入内容并按 Enter 插话，或点停止终止") : t("输入消息 — Enter 发送,Shift+Enter 换行,Ctrl+Enter 发送,输入 / 查看命令；可直接粘贴文件/截图")}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <button className="btn btn-icon" title={t("选择文件（获取真实路径）")} onClick={pickNativeFiles}>
              <IconPaperclip size={14} />
            </button>
            <span className="flex-1" />
            <span className="hidden sm:inline text-[10.5px] text-secondary mr-1">
              {isStreaming ? t("输入后 Enter 插话") : t("Enter 发送")}
            </span>
            {isStreaming ? (
              <>
                <button className="btn h-8 px-3" onClick={send} disabled={!text.trim()} title={t("暂停当前输出，插入这句话")}>
                  <IconSend size={13} /> {t("插话")}
                </button>
                <button className="btn btn-danger h-8 px-3" onClick={() => actions.abort()} title={`${t("终止当前回复")} (Esc)`}>
                  <IconStop size={13} /> {t("停止")}
                </button>
              </>
            ) : (
              <button className="btn btn-primary h-8 px-3.5" onClick={send} disabled={!text.trim() && !attachments.length && !images.length}>
                <IconSend size={13} /> {t("发送")}
              </button>
            )}
          </div>
        </div>

        {/* 状态提示 */}
        <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-secondary">
          <IconSparkle size={10} className="text-accent" />
          <span>omp {st?.model?.id ?? ""} · {st?.thinkingLevel ?? ""} thinking</span>
          <span className="flex-1" />
          <span>{t("Shift+Enter 换行 · Esc 停止")}</span>
        </div>
      </div>
    </div>
  );
}
