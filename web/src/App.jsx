// 顶层布局:三栏 = Sidebar | Workspace | Inspector。
import { useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import { Inspector } from "./components/Inspector";
import { DialogHost } from "./components/DialogHost";
import { Toasts } from "./components/Toasts";
import { ThemeProvider } from "./ThemeProvider";

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { state } = useApp();
  const { sidebarOpen, inspector, view } = state;

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      {/* 左侧 Sidebar */}
      <Sidebar />
      {/* 中间 Workspace */}
      <Workspace />
      {/* 右侧 Inspector(仅对话视图) */}
      {view === "chat" && inspector && <Inspector />}
      <DialogHost />
      <Toasts />
    </div>
  );
}
