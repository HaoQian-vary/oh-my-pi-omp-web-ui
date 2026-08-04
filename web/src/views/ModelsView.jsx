// 模型管理:列表、搜索、过滤、切换默认模型 + Provider 登录/API Key 管理。
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { api } from "../api";
import { useLang } from "../i18n";
import { PageShell } from "./PageShell";
import { fmtTokens, fmtCost } from "../format";
import { IconSearch, IconCheck, IconCpu, IconGlobe } from "../icons";

export function ModelsView() {
  const { t } = useLang();
  const { state, actions } = useApp();
  const { models, state: st, loginInfo } = state;
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("全部");
  const [busy, setBusy] = useState(null);
  const openaiKeyRef = useRef(null);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  // 最近见过的模型（按 provider 缓存，持久化到 localStorage）：
  // 退出登录后 omp 不再返回该 provider 的模型，用缓存保留其模型行（标记未登录），重新登录后恢复。
  const modelsCacheRef = useRef(null);
  if (modelsCacheRef.current === null) {
    try {
      modelsCacheRef.current = new Map(JSON.parse(localStorage.getItem("omp.modelsCache") ?? "[]"));
    } catch {
      modelsCacheRef.current = new Map();
    }
  }

  useEffect(() => {
    actions.refreshLoginInfo();
    fetch("/api/openai_key")
      .then((r) => r.json())
      .then((j) => j.ok && setOpenaiConfigured(!!j.configured))
      .catch(() => {});
  }, []);

  // 加载到模型时写入缓存（刷新页面后仍保留已退出 provider 的模型行）
  useEffect(() => {
    const cache = modelsCacheRef.current;
    let changed = false;
    for (const m of models) {
      const list = cache.get(m.provider) ?? [];
      if (!list.some((x) => x.provider === m.provider && x.id === m.id)) {
        list.push(m);
        changed = true;
      }
      cache.set(m.provider, list);
    }
    if (changed) {
      try {
        localStorage.setItem("omp.modelsCache", JSON.stringify([...cache.entries()]));
      } catch {}
    }
  }, [models]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r?.ok) actions.toast(okMsg);
      else actions.toast(`${t("失败")}: ${r?.error ?? ""}`, "bad");
    } finally {
      setBusy(null);
    }
  };

  // OpenAI API Key：写入 ~/.omp/agent/.env（omp 启动时加载），保存后自动重启 omp 子进程
  const saveOpenaiKey = async () => {
    setBusy("openai-key");
    try {
      const r = await fetch("/api/openai_key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: openaiKeyInput.trim() }),
      }).then((res) => res.json());
      if (r?.ok) {
        setOpenaiConfigured(!!r.configured);
        setOpenaiKeyInput("");
        actions.toast(t("OpenAI API Key 已保存，omp 已重启生效"));
      } else {
        actions.toast(`${t("失败")}: ${r?.error ?? ""}`, "bad");
      }
    } catch (e) {
      actions.toast(String(e), "bad");
    } finally {
      setBusy(null);
    }
  };

  const clearOpenaiKey = async () => {
    if (!window.confirm(t("确定清除 OpenAI API Key 吗？OpenAI 模型将不可用。"))) return;
    setBusy("openai-key");
    try {
      const r = await fetch("/api/openai_key", { method: "DELETE" }).then((res) => res.json());
      if (r?.ok) {
        setOpenaiConfigured(false);
        // 服务端已把当前 openai 模型切到其他可用模型，刷新列表移除 openai 模型
        actions.refreshModels();
        actions.toast(r.modelReset ? t("已清除 OpenAI API Key 并重置模型") : t("已清除 OpenAI API Key"));
      } else {
        actions.toast(`${t("失败")}: ${r?.error ?? ""}`, "bad");
      }
    } catch (e) {
      actions.toast(String(e), "bad");
    } finally {
      setBusy(null);
    }
  };

  // 退出登录：删除本地 API Key 凭据，之后可重新登录替换
  const handleLogout = async (providerId) => {
    if (!window.confirm(`确定退出 ${providerId} 的登录吗？\n\n退出后该 Provider 的 API Key 将从本地删除，模型将不可用。需要重新登录并配置新的 API Key。`)) return;
    setBusy(`logout-${providerId}`);
    try {
      const r = await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      }).then((res) => res.json());
      if (r?.ok) {
        actions.toast(`${t("已退出登录: ")}${providerId}`);
        actions.toast(t("已退出登录，模型保留在列表中，可重新登录后使用"));
        // 刷新登录状态列表（全局 store，Topbar 模型下拉同步禁用该 provider）
        actions.refreshLoginInfo();
        actions.refreshModels();
        // 若当前模型被自动切换（原模型不可用），刷新 state 让顶部栏同步
        if (r.modelReset) {
          api.state().then((j) => j?.ok && actions.dispatch({ type: "state", state: j.state })).catch(() => {});
        }
      } else {
        actions.toast(`${t("退出失败: ")}${r?.error ?? ""}`, "bad");
      }
    } finally {
      setBusy(null);
    }
  };

  // provider -> 登录状态（openai 以 API Key 是否配置为准；未知 provider 默认可用）
  const loginMap = useMemo(() => {
    const map = {};
    for (const p of loginInfo ?? []) map[p.id] = !!p.authenticated;
    return map;
  }, [loginInfo]);
  const isAuthed = (m) => (m.provider === "openai" ? openaiConfigured : (loginMap[m.provider] ?? true));

  const providers = useMemo(() => {
    const set = new Set(models.map((m) => m.provider));
    for (const p of loginInfo ?? []) set.add(p.id);
    for (const p of modelsCacheRef.current.keys()) set.add(p);
    return ["全部", ...set];
  }, [models, loginInfo]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const rows = models.filter((m) => {
      const okP = provider === "全部" || m.provider === provider;
      const okQ = !ql || m.id.toLowerCase().includes(ql) || (m.name ?? "").toLowerCase().includes(ql) || m.provider.toLowerCase().includes(ql);
      return okP && okQ;
    });
    // 追加无模型条目的 provider 占位行（含已登录但模型尚未加载的）
    const withModel = new Set(models.map((m) => m.provider));
    const seen = new Set(rows.map((m) => `${m.provider}/${m.id}`));
    const providerPool = new Set((loginInfo ?? []).map((p) => p.id));
    for (const p of modelsCacheRef.current.keys()) providerPool.add(p);
    for (const p of providerPool) {
      if (withModel.has(p)) continue;
      const cached = modelsCacheRef.current.get(p) ?? [];
      if (!cached.length) {
        const pv = (loginInfo ?? []).find((x) => x.id === p);
        if (!pv) continue;
        const okP = provider === "全部" || p === provider;
        const okQ = !ql || p.toLowerCase().includes(ql) || (pv.name ?? "").toLowerCase().includes(ql);
        if (okP && okQ) rows.push({ kind: "provider", provider: p, id: p, name: pv.name });
        continue;
      }
      // 已退出登录的 provider：用缓存保留其模型行，标记未登录
      for (const cm of cached) {
        const key = `${cm.provider}/${cm.id}`;
        if (seen.has(key)) continue;
        const okP = provider === "全部" || cm.provider === provider;
        const okQ = !ql || cm.id.toLowerCase().includes(ql) || (cm.name ?? "").toLowerCase().includes(ql) || cm.provider.toLowerCase().includes(ql);
        if (!okP || !okQ) continue;
        seen.add(key);
        rows.push({ ...cm, kind: "cached", authed: false });
      }
    }
    return rows;
  }, [models, q, provider, loginInfo]);

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
      title={t("模型管理")}
      desc={`${t("当前 ")}${models.length}${t(" 个可用模型。未登录的 Provider 也会列出，登录后可加载其模型。")}`}
      actions={
        <button className="btn btn-ghost" onClick={() => actions.refreshModels()}>{t("刷新")}</button>
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
          <input className="input pl-7" placeholder={t("搜索模型…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {providers.map((p) => (
            <button key={t(p)} className={`btn h-7 text-[12px] ${provider === p ? "bg-accent border-accent text-white" : ""}`} onClick={() => setProvider(p)}>
              {t(p)}
            </button>
          ))}
        </div>
        {/* OpenAI API Key 紧凑配置：omp 不支持 openai 账号登录，凭据写入本地 .env */}
        <div className="flex items-center gap-2 ml-auto">
          <IconGlobe size={13} className="text-accent shrink-0" />
          <span className="text-[12px] font-medium">OpenAI API Key</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${openaiConfigured ? "border-success/40 text-success" : "border-border text-secondary"}`}>
            {openaiConfigured ? t("已配置") : t("未配置")}
          </span>
          <input
            ref={openaiKeyRef}
            type="password"
            className="input h-7 w-40 text-[12px] font-mono"
            placeholder="sk-..."
            value={openaiKeyInput}
            onChange={(e) => setOpenaiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openaiKeyInput.trim() && saveOpenaiKey()}
          />
          <button
            className="btn h-7 text-[12px]"
            onClick={saveOpenaiKey}
            disabled={busy === "openai-key" || !openaiKeyInput.trim()}
          >
            {busy === "openai-key" ? t("保存中…") : t("保存")}
          </button>
          {openaiConfigured && (
            <button
              className="btn btn-ghost h-7 text-[12px] text-error"
              onClick={clearOpenaiKey}
              disabled={busy === "openai-key"}
            >
              {t("清除")}
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full table-fixed text-left">
          <colgroup>
            <col className="w-[27%]" />
            <col className="w-[21%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[19%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-sidebar text-[11px] text-secondary uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">{t("模型")}</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Provider</th>
              <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Context</th>
              <th className="px-3 py-2 font-medium text-right hidden lg:table-cell">Max Tokens</th>
              <th className="px-3 py-2 font-medium hidden lg:table-cell">Reasoning</th>
              <th className="px-3 py-2 font-medium text-right hidden md:table-cell">{t("成本")}</th>
              <th className="px-3 py-2 font-medium text-right">{t("操作")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const isProviderRow = m.kind === "provider";
              const isCurrent = !isProviderRow && current === `${m.provider}/${m.id}`;
              const authed = m.authed ?? (isProviderRow ? (!!loginMap[m.provider]) : isAuthed(m));
              const isOpenai = !isProviderRow && m.provider === "openai";
              return (
                <tr key={`${m.provider}/${m.id}`} className="border-b border-border/50 hover: transition-colors duration-100">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {isProviderRow ? <IconGlobe size={13} className="text-secondary shrink-0" /> : <IconCpu size={13} className="text-accent shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{m.name ?? m.id}</div>
                        <div className="text-[10.5px] text-secondary font-mono truncate">{isProviderRow ? m.id : m.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] text-secondary font-mono truncate max-w-[160px]">{m.provider}</span>
                      <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full border shrink-0 ${authed ? "border-success/40 text-success" : "border-border text-secondary"}`}>
                        {authed ? t("已登录") : t("未登录")}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-right hidden sm:table-cell">{isProviderRow ? "—" : fmtTokens(m.contextWindow)}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-right hidden lg:table-cell">{isProviderRow ? "—" : fmtTokens(m.maxTokens)}</td>
                  <td className="px-3 py-2.5 text-[12px] hidden lg:table-cell">{isProviderRow ? "—" : (m.reasoning ? "✓" : "—")}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-right hidden md:table-cell">{isProviderRow ? "—" : fmtCost(m.cost?.input)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isCurrent && (
                        <span className={`inline-flex items-center gap-1 text-[11.5px] ${authed ? "text-success" : "text-error"}`}>
                          <IconCheck size={12} /> {authed ? t("当前") : `${t("当前")} · ${t("未登录")}`}
                        </span>
                      )}
                      {authed ? (
                        !isCurrent && (
                          <>
                            {!isOpenai && (
                              <button
                                className="btn btn-ghost h-6 text-[11.5px] text-error"
                                title={t("退出登录后可在控制台重新获取 API Key 并再次登录")}
                                disabled={busy === `logout-${m.provider}`}
                                onClick={() => handleLogout(m.provider)}
                              >
                                {busy === `logout-${m.provider}` ? t("退出中…") : t("退出")}
                              </button>
                            )}
                            <button className="btn h-6 text-[11.5px]" disabled={busy === `${m.provider}/${m.id}`} onClick={() => setDefault(m)}>
                              {busy === `${m.provider}/${m.id}` ? t("切换中…") : t("设为当前")}
                            </button>
                          </>
                        )
                      ) : isOpenai ? (
                        <button className="btn h-6 text-[11.5px]" onClick={() => openaiKeyRef.current?.focus()}>
                          {t("配置 Key")}
                        </button>
                      ) : (
                        <button className="btn h-6 text-[11.5px]" disabled={busy === `login-${m.provider}`} onClick={() => run(`login-${m.provider}`, () => fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: m.provider }) }).then((r) => r.json()), `登录流程已启动: ${m.provider}`)}>
                          {busy === `login-${m.provider}` ? t("登录中…") : t("登录")}
                        </button>
                      )}
                    </div>
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
