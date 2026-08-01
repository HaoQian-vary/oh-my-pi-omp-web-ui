// 中间 Workspace:Topbar + 消息列表 + Composer。非对话视图时显示对应页面。
import { useApp } from "../store";
import { Topbar } from "./Topbar";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { SessionsView } from "../views/SessionsView";
import { PromptsView } from "../views/PromptsView";
import { WorkspacesView } from "../views/WorkspacesView";
import { McpView } from "../views/McpView";
import { AgentsView } from "../views/AgentsView";
import { PluginsView } from "../views/PluginsView";
import { ModelsView } from "../views/ModelsView";
import { SettingsView } from "../views/SettingsView";
import { AppearanceView } from "../views/AppearanceView";
import { SkillsView } from "../views/SkillsView";
import { MarketplaceView } from "../views/MarketplaceView";

export function Workspace() {
  const { state } = useApp();
  const { view } = state;

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--color-bg)" }}>
      <Topbar />
      <div className="flex-1 flex flex-col min-h-0">
        {view === "chat" && (
          <>
            <MessageList />
            <Composer />
          </>
        )}
        {view === "sessions" && <SessionsView />}
        {view === "prompts" && <PromptsView />}
        {view === "skills" && <SkillsView />}
        {view === "marketplace" && <MarketplaceView />}
        {view === "workspaces" && <WorkspacesView />}
        {view === "mcp" && <McpView />}
        {view === "agents" && <AgentsView />}
        {view === "plugins" && <PluginsView />}
        {view === "models" && <ModelsView />}
        {view === "settings" && <SettingsView />}
        {view === "appearance" && <AppearanceView />}
      </div>
    </div>
  );
}
