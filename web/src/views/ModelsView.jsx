// 模型管理:列表、搜索、过滤、切换默认模型。
import { useMemo, useState } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { PageShell } from "./PageShell";
import { fmtTokens, fmtCost } from "../format";
import { IconSearch, IconCheck, IconCpu } from "../icons";

export function ModelsView() {
  const { t } = useLang();
  const { state, actions } = useApp();
  const { models, state: st } = state;
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("全部");
  const [busy, setBusy] = useState(null);

  const providers = useMemo(() => ["全部", ...new Set(models.map((m) => m.provider))], [models]);

  const filtered = useMemo(() => {
    return models.filter((m) => {
      const okP = provider === "全部" || m.provider === provider;
      const okQ = !q.trim() || m.id.toLowerCase().includes(q.toLowerCase()) || (m.name ?? "").toLowerCase().includes(q.toLowerCase());
      return okP && okQ;
    });
  }, [models, q, provider]);

  const current = `${st?.model?.provider}/${st?.model?.id}`;

  const setDefault = async (m) => {
    setBusy(`${m.provider}/${m.id}`);
    try {
      const r = await actions.setModel(m.provider, m.id);
      if (r?.ok) actions.toast(`${t("已切换默认模型: ")}${m.id}`);
      else actions.toast(`${t("失败")}: ${r?.error ?? ""}`, "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell
      title="模型管理"
      desc={`当前 ${models.length} 个可用模型。点击"设为当前"切换。`}
      actions={
        <button className="btn btn-ghost" onClick={() => actions.refreshModels()}>{t("刷新")}</button>
      }
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
          <input className="input pl-7" placeholder={t("搜索模型…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {providers.map((p) => (
            <button key={p} className={`btn h-7 text-[12px] ${provider === p ? "bg-accent border-accent text-white" : ""}`} onClick={() => setProvider(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-sidebar text-[11px] text-secondary uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">模型</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Provider</th>
              <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Context</th>
              <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">Max Tokens</th>
              <th className="px-3 py-2 font-medium hidden lg:table-cell">Reasoning</th>
              <th className="px-3 py-2 font-medium text-right hidden md:table-cell">{t("成本")}</th>
              <th className="px-3 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const isCurrent = current === `${m.provider}/${m.id}`;
              return (
                <tr key={`${m.provider}/${m.id}`} className="border-b border-border/50 hover: transition-colors duration-100">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <IconCpu size={13} className="text-accent shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{m.name ?? m.id}</div>
                        <div className="text-[10.5px] text-secondary font-mono truncate">{m.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-secondary font-mono hidden md:table-cell">{m.provider}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-right hidden sm:table-cell">{fmtTokens(m.contextWindow)}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-right hidden lg:table-cell">{fmtTokens(m.maxTokens)}</td>
                  <td className="px-3 py-2.5 text-[12px] hidden lg:table-cell">{m.reasoning ? "✓" : "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-right hidden md:table-cell">{fmtCost(m.cost?.input)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-success"><IconCheck size={12} /> {t("当前")}</span>
                    ) : (
                      <button className="btn h-6 text-[11.5px]" disabled={busy === `${m.provider}/${m.id}`} onClick={() => setDefault(m)}>
                        {busy === `${m.provider}/${m.id}` ? t("切换中…") : t("设为当前")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-secondary text-[13px]">{t("无匹配模型")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
