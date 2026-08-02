// 顶层布局:三栏 = Sidebar | Workspace | Inspector。
import { Component } from "react";
import { useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import { Inspector } from "./components/Inspector";
import { DialogHost } from "./components/DialogHost";
import { Toasts } from "./components/Toasts";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { ThemeProvider } from "./ThemeProvider";
import { IconChevronRight, IconChevronLeft } from "./icons";

// 全局错误边界：渲染崩溃时显示错误信息而非黑屏
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[UI 崩溃]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: 'var(--color-bg)', color: 'var(--color-text-primary)', minHeight: '100vh' }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>界面出错了（已阻止黑屏）</h2>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--color-terminal-bg)', padding: 12, borderRadius: 8 }}>{String(this.state.error?.stack ?? this.state.error)}</pre>
          <button className="btn btn-primary mt-3" onClick={() => this.setState({ error: null })}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };

export function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function AppContent() {
  const { state, actions } = useApp();
  const { sidebarOpen, inspector, view, historyDrawer } = state;

  return (
    <div className="flex h-full w-full overflow-hidden relative" style={{ background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <Sidebar />

      {/* 历史问题抽屉触发按钮：关闭态显示在导航栏右边缘；打开后由抽屉内居中按钮接管 */}
      {!historyDrawer && (
        <button
          className="absolute z-20 flex items-center justify-center w-4 h-9 rounded-r-md transition-colors duration-100"
          style={{
            left: sidebarOpen ? 240 : 36,
            top: "41vh",
            transform: "translateY(-50%)",
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderLeft: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
          onClick={() => actions.dispatch({ type: "history_drawer", open: true })}
          title="历史问题"
        >
          <IconChevronRight size={11} />
        </button>
      )}

      {historyDrawer && <HistoryDrawer />}

      <Workspace />
      {view === "chat" && inspector && <Inspector />}
      <DialogHost />
      <Toasts />
    </div>
  );
}
