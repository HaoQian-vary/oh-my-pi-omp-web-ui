// 输入区:prompt 输入、slash 命令、autocomplete、图片上传、快捷键。
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { IconSend, IconStop, IconPaperclip, IconImage, IconX, IconSparkle } from "../icons";

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
  const isStreaming = st?.isStreaming ?? false;
  const [text, setText] = useState("");
  const [images, setImages] = useState([]); // {dataUrl, name}
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef(null);
  const fileRef = useRef(null);
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

  // 自动调整高度
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(220, ta.scrollHeight) + "px";
  }, [text]);

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
    const t = text.trim();
    if (!t) return;
    setText("");
    setImages([]);
    if (isStreaming) {
      // 运行中：作为插话（steer）发送，暂停当前输出插入新指令
      const ok = await actions.steer(t);
      if (!ok) actions.toast("插话失败", "bad");
      return;
    }
    if (t.startsWith("/")) {
      // slash 命令作为普通 prompt 发送(后端 omp 会解析)
    }
    await actions.sendPrompt(t, images.length ? images : undefined);
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

  const pickFiles = (files) => {
    const list = [...(files ?? [])];
    for (const f of list) {
      if (!f.type.startsWith("image/")) {
        actions.toast(`仅支持图片: ${f.name}`, "warn");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setImages((arr) => [...arr, { dataUrl: reader.result, name: f.name }].slice(-4));
      };
      reader.readAsDataURL(f);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickFiles(e.dataTransfer.files);
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
            <div className="px-3 py-1.5 text-[10.5px] border-b" style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }}>Slash 命令</div>
            {slashMatch.map((c, i) => (
              <button
                key={c.cmd}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-[12.5px]"
                style={{ background: i === slashIdx ? 'var(--color-bg-elevated)' : 'transparent' }}
                onMouseEnter={() => setSlashIdx(i)}
                onClick={() => applySlash(c)}
              >
                <span className="font-mono text-accent w-20 shrink-0">{c.cmd}</span>
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.desc}</span>
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

        {/* 输入行 */}
        <div className="card overflow-hidden" style={{ background: 'var(--color-input-bg)' }}>
          <textarea
            ref={taRef}
            className="w-full bg-transparent border-0 outline-none resize-none px-3 pt-2.5 pb-1 text-[13.5px] leading-relaxed"
            style={{ color: 'var(--color-text-primary)' }}
            placeholder={isStreaming ? "运行中… 输入内容并按 Enter 插话，或点停止终止" : "输入消息 — Enter 发送,Shift+Enter 换行,Ctrl+Enter 发送,输入 / 查看命令"}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <button className="btn btn-icon" title="上传图片（可随插话发送）" onClick={() => fileRef.current?.click()}>
              <IconImage size={14} />
            </button>
            <button className="btn btn-icon" title="拖拽图片到此处" onClick={() => fileRef.current?.click()}>
              <IconPaperclip size={14} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
            <span className="flex-1" />
            <span className="hidden sm:inline text-[10.5px] text-secondary mr-1">
              {isStreaming ? "输入后 Enter 插话" : "Enter 发送"}
            </span>
            {isStreaming ? (
              <>
                <button className="btn h-8 px-3" onClick={send} disabled={!text.trim()} title="暂停当前输出，插入这句话">
                  <IconSend size={13} /> 插话
                </button>
                <button className="btn btn-danger h-8 px-3" onClick={() => actions.abort()} title="终止当前回复（Esc）">
                  <IconStop size={13} /> 停止
                </button>
              </>
            ) : (
              <button className="btn btn-primary h-8 px-3.5" onClick={send} disabled={!text.trim()}>
                <IconSend size={13} /> 发送
              </button>
            )}
          </div>
        </div>

        {/* 状态提示 */}
        <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-secondary">
          <IconSparkle size={10} className="text-accent" />
          <span>omp {st?.model?.id ?? ""} · {st?.thinkingLevel ?? ""} thinking</span>
          <span className="flex-1" />
          <span>Shift+Enter 换行 · Esc 停止</span>
        </div>
      </div>
    </div>
  );
}
