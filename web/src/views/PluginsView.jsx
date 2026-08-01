// 插件（Extensions）管理：列出已安装插件、启用/禁用、卸载，展示扩展模块。
import { useEffect, useState } from "react";
import { useApp } from "../store";
import { PageShell } from "./PageShell";
import {
  IconPuzzle, IconRefresh, IconTrash, IconExternalLink,
  IconCheck, IconWrench, IconBot, IconBook, IconGlobe, IconCpu
} from "../icons";

export function PluginsView() {
  const { actions } = useApp();
  const [plugins, setPlugins] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [extensions, setExtensions] = useState([]); // 本地扩展模块
  const [showExtensions, setShowExtensions] = useState(false);

  const load = async () => {
    setPlugins(null);
    setErr(null);
    try {
      const list = await actions.loadPluginsDetail();
      setPlugins(list);
      // 加载本地扩展模块（用户级 + 项目级）
      const r = await fetch("/api/extensions").then((res) => res.json());
      if (r.ok) setExtensions(r.extensions ?? []);
    } catch (e) {
      setErr(String(e));
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (p) => {
    setBusy(`toggle-${p.key}`);
    try {
      const ok = await actions.pluginSetEnabled(p.key, !p.enabled);
      if (ok) {
        actions.toast(p.enabled ? `已禁用: ${p.name}` : `已启用: ${p.name}`);
        load();
      } else {
        actions.toast("操作失败", "bad");
      }
    } catch (e) {
      actions.toast(`操作失败: ${e.message ?? e}`, "bad");
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (p) => {
    if (!window.confirm(`确定卸载插件 ${p.name}@${p.marketplace} 吗？`)) return;
    setBusy(`uninstall-${p.key}`);
    try {
      const ok = await actions.uninstallPlugin(p.name, p.marketplace);
      if (ok) {
        actions.toast(`已卸载: ${p.name}`);
        load();
      } else {
        actions.toast("卸载失败", "bad");
      }
    } catch (e) {
      actions.toast(`卸载失败: ${e.message ?? e}`, "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell
      title="插件"
      desc="管理已安装的插件与扩展模块。插件从 Marketplace 安装，扩展模块是自定义代码（工具/命令/事件钩子）。"
      actions={
        <div className="flex gap-2">
          <button
            className={`btn btn-ghost ${showExtensions ? "" : ""}`}
            onClick={() => setShowExtensions(!showExtensions)}
            title={showExtensions ? "隐藏扩展模块" : "查看本地扩展模块"}
          >
            <IconWrench size={13} /> 扩展模块 {extensions.length > 0 ? `(${extensions.length})` : ""}
          </button>
          <button className="btn btn-ghost" onClick={load} title="刷新">
            <IconRefresh size={13} /> 刷新
          </button>
        </div>
      }
    >
      {/* 扩展模块列表 */}
      {showExtensions && (
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <IconWrench size={14} className="text-accent" />
            <span className="text-[13px] font-medium">本地扩展模块</span>
          </div>
          {extensions.length === 0 && (
            <p className="text-[12px] text-secondary">
              暂无自定义扩展模块。在 <span className="font-mono">~/.omp/agent/extensions/</span>（用户级）或
              <span className="font-mono"> .omp/extensions/</span>（项目级）放置 <span className="font-mono">.ts</span> / <span className="font-mono">.js</span> 文件即可。
            </p>
          )}
          <div className="space-y-1.5 mt-2">
            {extensions.map((e) => (
              <div key={e.path} className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: 'var(--color-bg-secondary)' }}>
                <span className="font-mono text-[12px] flex-1 truncate">{e.name}</span>
                <span className="text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}>
                  {e.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div className="text-[13px] text-error mb-3">{err}</div>}
      {!plugins && !err && <div className="text-secondary text-[13px] py-8 text-center">加载中…</div>}
      {plugins && plugins.length === 0 && (
        <div className="card p-8 text-center">
          <IconPuzzle size={40} className="mx-auto text-secondary/30 mb-3" />
          <h3 className="text-[14px] font-medium mb-2">暂无已安装插件</h3>
          <p className="text-[12.5px] text-secondary">
            去 <span className="text-accent">Marketplace</span> 页搜索并安装插件。
          </p>
        </div>
      )}

      <div className="space-y-2">
        {plugins?.map((p) => (
          <div key={p.key} className={`card px-4 py-3 ${p.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-muted)' }}>
                <IconPuzzle size={15} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-medium font-mono">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}>
                    @{p.marketplace}
                  </span>
                  {p.version && <span className="text-[10px] text-secondary font-mono">{p.version}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.enabled ? "text-success" : "text-error"}`} style={{ background: p.enabled ? 'var(--color-success)22' : 'var(--color-error)22' }}>
                    {p.enabled ? "已启用" : "已禁用"}
                  </span>
                </div>
                {p.description && <p className="text-[12px] text-secondary mt-1 leading-relaxed">{p.description}</p>}
                {/* 能力标签 */}
                {(p.caps?.skills?.length > 0 || p.caps?.agents?.length > 0 || p.caps?.commands?.length > 0 || p.caps?.mcp || p.caps?.extensions?.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.caps.skills?.length > 0 && (
                      <Cap icon={<IconBook size={10} />} text={`${p.caps.skills.length} skills`} color="var(--color-success)" />
                    )}
                    {p.caps.agents?.length > 0 && (
                      <Cap icon={<IconBot size={10} />} text={`${p.caps.agents.length} agents`} color="var(--color-warning)" />
                    )}
                    {p.caps.commands?.length > 0 && (
                      <Cap icon={<IconCpu size={10} />} text={`${p.caps.commands.length} commands`} color="var(--color-accent)" />
                    )}
                    {p.caps.mcp && (
                      <Cap icon={<IconGlobe size={10} />} text="MCP" color="var(--color-accent)" />
                    )}
                    {p.caps.extensions?.length > 0 && (
                      <Cap icon={<IconWrench size={10} />} text={`${p.caps.extensions.length} extensions`} color="var(--color-warning)" />
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-secondary">
                  {p.author && <span>by {p.author}</span>}
                  {p.homepage && (
                    <a href={p.homepage} target="_blank" rel="noopener" className="flex items-center gap-1 text-accent hover:underline">
                      <IconExternalLink size={10} /> 主页
                    </a>
                  )}
                  <span>范围: {p.scope}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* 启用/禁用开关 */}
                <button
                  className={`btn h-7 ${p.enabled ? "btn-ghost" : "btn-primary"}`}
                  onClick={() => toggle(p)}
                  disabled={busy === `toggle-${p.key}`}
                  title={p.enabled ? "禁用此插件" : "启用此插件"}
                >
                  {busy === `toggle-${p.key}` ? "…" : p.enabled ? "禁用" : "启用"}
                </button>
                <button
                  className="btn btn-icon h-7 w-7"
                  onClick={() => uninstall(p)}
                  disabled={busy === `uninstall-${p.key}`}
                  title="卸载插件"
                >
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 说明 */}
      <div className="card p-4 mt-4">
        <h3 className="text-[12.5px] font-medium mb-2">什么是插件 vs 扩展模块</h3>
        <ul className="text-[12px] text-secondary space-y-1.5 list-disc pl-4">
          <li><strong className="text-primary">插件（Plugin）</strong>：从 Marketplace 安装的能力包，可包含 skills / agents / commands / MCP servers / 扩展代码</li>
          <li><strong className="text-primary">扩展模块（Extension）</strong>：单独的 <span className="font-mono">.ts/.js</span> 代码文件，可注册自定义工具、斜杠命令、事件钩子（如安全拦截）</li>
          <li>禁用插件后其全部能力（skills/MCP/命令）立即从会话移除，启用后需重启生效</li>
          <li>扩展模块在 <span className="font-mono">config.yml</span> 的 <span className="font-mono">extensions:</span> 列表或 <span className="font-mono">--extension</span> 参数加载</li>
        </ul>
      </div>
    </PageShell>
  );
}

function Cap({ icon, text, color }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${color}22`, color }}>
      {icon} {text}
    </span>
  );
}
