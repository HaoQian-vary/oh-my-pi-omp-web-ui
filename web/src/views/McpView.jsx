// MCP 服务器:由 omp 配置管理,展示说明与协议能力。
import { PageShell } from "./PageShell";
import { IconGlobe } from "../icons";
import { useLang } from "../i18n";

export function McpView() {
  const { t } = useLang();
  return (
    <PageShell title="MCP 服务器" desc={t("Model Context Protocol 服务器管理。")}>
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <IconGlobe size={15} className="text-accent" />
          <span className="text-[13px] font-medium">{t("说明")}</span>
        </div>
        <p className="text-[12.5px] text-secondary leading-relaxed">
          MCP 服务器在 omp 的配置文件中管理(<span className="font-mono">~/.omp/agent/config.yml</span> 的
          <span className="font-mono"> mcp</span> 配置节)。当前 RPC 会话协议未暴露 MCP 服务器的新增/删除/状态 API,
          因此本页为信息展示。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            ["连接状态", "由 omp 启动时建立,失败会记录在 omp 日志中"],
            ["Transport", "stdio / SSE / streamable HTTP,取决于服务器配置"],
            ["Tools", "MCP 工具会作为会话工具注入,可在 Inspector → Tools 中查看"],
            ["Reconnect", "重启 server.mjs 或 omp 进程后自动重连"],
          ].map(([k, v]) => (
            <div key={k} className="border border-border rounded-md px-3 py-2.5">
              <div className="text-[12px] font-medium mb-0.5">{k}</div>
              <div className="text-[11.5px] text-secondary leading-relaxed">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
