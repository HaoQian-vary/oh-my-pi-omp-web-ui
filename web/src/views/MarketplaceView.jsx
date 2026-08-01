// Marketplace 页面：直接搜索可用插件（跨所有已添加市场），一键安装/卸载。
import { useEffect, useState, useMemo } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { PageShell } from "./PageShell";
import {
  IconRefresh, IconSearch, IconPlug, IconCheck, IconTrash,
  IconDownload, IconExternalLink, IconX, IconFolder, IconChevronRight
} from "../icons";

export function MarketplaceView() {
  const { t } = useLang();
  const { actions } = useApp();
  const [marketplaces, setMarketplaces] = useState([]);
  const [installed, setInstalled] = useState({});
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSource, setAddSource] = useState("");
  const [addingSource, setAddingSource] = useState(false);

  const loadMeta = async () => {
    try {
      const [mkt, inst] = await Promise.all([
        actions.loadMarketplaces(),
        actions.loadInstalledPlugins(),
      ]);
      setMarketplaces(mkt);
      setInstalled(inst);
    } catch (e) {
      setErr(String(e));
    }
  };
  useEffect(() => { loadMeta(); }, []);

  // 搜索（空查询时列出所有）
  const doSearch = async (q = query) => {
    setLoading(true);
    setErr(null);
    try {
      const list = await actions.searchPlugins(q.trim());
      setResults(list);
      setSearched(true);
    } catch (e) {
      setErr(String(e));
    }
    setLoading(false);
  };
  useEffect(() => { doSearch(""); }, []);

  const install = async (p) => {
    setBusy(`install-${p.name}`);
    try {
      const ok = await actions.installPlugin(p.name, p.marketplace);
      if (ok) {
        actions.toast(`${t("已安装: ")}${p.name}`);
        await loadMeta();
      } else {
        actions.toast(t("安装失败"), "bad");
      }
    } catch (e) {
      actions.toast(`安装失败: ${e.message ?? e}`, "bad");
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (p) => {
    setBusy(`uninstall-${p.name}`);
    try {
      const ok = await actions.uninstallPlugin(p.name, p.marketplace);
      if (ok) {
        actions.toast(`${t("已卸载: ")}${p.name}`);
        await loadMeta();
      } else {
        actions.toast(t("卸载失败"), "bad");
      }
    } catch (e) {
      actions.toast(`卸载失败: ${e.message ?? e}`, "bad");
    } finally {
      setBusy(null);
    }
  };

  const addMarketplace = async () => {
    if (!addSource.trim()) return;
    setAddingSource(true);
    try {
      await fetch("/api/add_marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: addSource.trim() }),
      }).then((r) => r.json()).then((j) => {
        if (j.ok) {
          actions.toast(t("已添加市场源"));
          setAddSource("");
          setAddOpen(false);
          loadMeta().then(() => doSearch(""));
        } else {
          actions.toast(`${t("添加失败: ")}${j.error ?? ""}`, "bad");
        }
      });
    } finally {
      setAddingSource(false);
    }
  };

  const isInstalled = (name) => {
    return Object.keys(installed).some((k) => k.includes(name));
  };

  return (
    <PageShell
      title="Marketplace"
      desc={t("搜索并安装插件（Skills、Commands、Agents、MCP 等能力）。")}
      actions={
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => doSearch()} title={t("刷新")}>
            <IconRefresh size={13} /> 刷新
          </button>
          <button className="btn" onClick={() => setAddOpen(true)} title={t("添加市场源")}>
            <IconPlug size={13} /> 添加源
          </button>
        </div>
      }
    >
      {/* 搜索框 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xl">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
          <input
            className="input pl-9 h-9 text-[13px]"
            placeholder={t("搜索插件，如 pdf、database、security、browser…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          />
        </div>
        <button className="btn btn-primary h-9 px-4" onClick={() => doSearch()} disabled={loading}>
          {loading ? t("搜索中…") : t("搜索")}
        </button>
      </div>

      {/* 市场源状态 */}
      <div className="flex items-center gap-2 mb-4 text-[12px] flex-wrap">
        <span style={{ color: 'var(--color-text-secondary)' }}>{t("市场源:")}</span>
        {marketplaces.length === 0 ? (
          <span className="text-secondary">{t("未添加任何市场源，点击「添加源」添加（如 anthropics/claude-plugins-official）")}</span>
        ) : (
          marketplaces.map((m) => (
            <span key={m.name} className="px-2 py-0.5 rounded-full border text-[11.5px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {m.name}
            </span>
          ))
        )}
        {Object.keys(installed).length > 0 && (
          <span className="px-2 py-0.5 rounded-full border text-[11.5px]" style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
            {t("已安装 ")}{Object.keys(installed).length}{t("个")}
          </span>
        )}
      </div>

      {err && <div className="text-[13px] text-error mb-3">{err}</div>}
      {loading && <div className="text-secondary text-[13px] py-8 text-center">{t("加载中…")}</div>}

      {!loading && (
        <>
          {searched && results.length === 0 && (
            <div className="card p-8 text-center">
              <IconPlug size={40} className="mx-auto text-secondary/30 mb-3" />
              <h3 className="text-[14px] font-medium mb-2">{t("未找到匹配插件")}</h3>
              <p className="text-[12.5px] text-secondary max-w-md mx-auto">
                {marketplaces.length === 0
                  ? "先添加市场源，然后搜索。常用市场：anthropics/claude-plugins-official（官方插件市场）"
                  : "换一个关键词试试，或添加更多市场源。"}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {results.map((p) => (
              <div key={`${p.marketplace}-${p.name}`} className="card px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-medium">{p.name}</span>
                      {p.version && <span className="text-[10px] text-secondary font-mono">v{p.version}</span>}
                      {p.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">{p.category}</span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}>
                        {p.marketplace}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-[12px] text-secondary mt-1 leading-relaxed">{p.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-secondary flex-wrap">
                      {p.author?.name && <span>by {p.author.name}</span>}
                      {p.homepage && (
                        <a href={p.homepage} target="_blank" rel="noopener" className="flex items-center gap-1 text-accent hover:underline">
                          <IconExternalLink size={10} /> 主页
                        </a>
                      )}
                      {p.keywords?.length > 0 && <span className="text-secondary/60">{p.keywords.slice(0, 5).join(", ")}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.commands?.length > 0 && <Cap chip="commands" n={p.commands.length} color="var(--color-success)" />}
                      {p.agents?.length > 0 && <Cap chip="agents" n={p.agents.length} color="var(--color-warning)" />}
                      {p.hooks && <Cap chip="hooks" color="var(--color-error)" />}
                      {p.mcpServers && <Cap chip="MCP" color="var(--color-accent)" />}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isInstalled(p.name) ? (
                      <button
                        className="btn btn-danger h-8"
                        disabled={busy === `uninstall-${p.name}`}
                        onClick={() => uninstall(p)}
                      >
                        {busy === `uninstall-${p.name}` ? t("卸载中…") : t("卸载")}
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary h-8"
                        disabled={busy === `install-${p.name}`}
                        onClick={() => install(p)}
                      >
                        {busy === `install-${p.name}` ? t("安装中…") : t("安装")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 添加市场源弹窗 */}
      {addOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="w-[460px] max-w-[92vw] card shadow-2xl animate-slide-up" style={{ background: 'var(--color-card)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="text-[14px] font-semibold">{t("添加市场源")}</h3>
              <button className="btn btn-icon" onClick={() => setAddOpen(false)}><IconX size={13} /></button>
            </div>
            <div className="px-4 py-4">
              <label className="text-[12.5px] text-secondary block mb-1.5">{t("市场源地址")}</label>
              <input
                className="input h-8"
                placeholder="如 anthropics/claude-plugins-official 或 https://github.com/org/repo"
                value={addSource}
                onChange={(e) => setAddSource(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMarketplace(); }}
                autoFocus
              />
              <div className="mt-2 text-[11px] text-secondary">
                支持格式：GitHub 简写 <span className="font-mono">owner/repo</span>、Git URL、本地目录、直接 JSON URL
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button className="btn" onClick={() => setAddOpen(false)}>取消</button>
              <button className="btn btn-primary" onClick={addMarketplace} disabled={addingSource || !addSource.trim()}>
                {addingSource ? t("添加中…") : t("添加")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Cap({ chip, n, color }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${color}22`, color }}>
      {n ? `${n} ${chip}` : chip}
    </span>
  );
}
