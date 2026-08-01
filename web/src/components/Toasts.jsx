// Toast 提示容器：每个 toast 挂载后 2.5s 自动消失。
import { useEffect } from "react";
import { useApp } from "../store";
import { IconX } from "../icons";

export function Toasts() {
  const { state, actions } = useApp();
  const { toasts } = state;
  return (
    <div className="fixed top-3 right-3 z-[110] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onClose={() => actions.rmToast(t.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onClose }) {
  // 挂载后 2.5s 自动消失
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`toast flex items-center gap-2 bg-card border ${toast.kind === "bad" ? "border-error/50" : toast.kind === "warn" ? "border-warning/50" : "border-border"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${toast.kind === "bad" ? "bg-error" : toast.kind === "warn" ? "bg-warning" : "bg-success"}`} />
      <span className="max-w-[320px] truncate">{toast.text}</span>
      <button className="text-secondary hover:text-primary ml-1" onClick={onClose}>
        <IconX size={11} />
      </button>
    </div>
  );
}
