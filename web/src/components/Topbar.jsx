// 顶部栏:会话名、模型切换、思考级别、Agent 状态、停止/新建。
import { useEffect, useMemo, useState } from "react";
import { useApp, LEVELS } from "../store";
import { IconChevronDown, IconPanelRight, IconStop, IconPlus, IconCheck, IconRefresh } from "../icons";
import { fmtTokens } from "../format";
import { useLang } from "../i18n";

export function Topbar() {
  const { state, actions } = useApp();
  const { state: st, models, inspector, loginInfo } = state;
  const [modelOpen, setModelOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [modelQ, setModelQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    fetch("/api/openai_key")
      .then((r) => r.json())
      .then((j) => j.ok && setOpenaiConfigured(!!j.configured))
      .catch(() => {});
  }, []);

  // provider 登录状态映射（openai 以 API Key 配置为准；未知 provider 默认可用）
  const loginMap = useMemo(() => {
    const map = {};
    for (const p of loginInfo ?? []) map[p.id] = !!p.authenticated;
    return map;
  }, [loginInfo]);
  const model = st?.model;
  const isAuthed = (provider) => (provider === "openai" ? openaiConfigured : (loginMap[provider] ?? true));
  const currentAuthed = model ? isAuthed(model.provider) : true;
  const isStreaming = state.isStreaming ?? false;
  const contextPct = st?.contextUsage?.percent ?? 0;

  // 当前模型支持的思考级别（自适应）
  const modelEfforts = model?.thinking?.efforts;
  const supportsThinking = !!modelEfforts;
  const availableLevels = supportsThinking
    ? LEVELS.filter((l) => modelEfforts.includes(l))
    : [];
  // 当前显示的思考级别：若模型不支持当前值，回退到模型支持的第一个级别
  const currentLevel = supportsThinking
    ? (modelEfforts.includes(st?.thinkingLevel) ? st?.thinkingLevel : modelEfforts[0])
    : null;

  // 当前工作目录：服务端 state 帧提供（refreshState 注入 cwd: WORKDIR）
  const workDir = st?.cwd ?? "—";

  // 按 provider 分组（可选搜索过滤：匹配 provider / 模型 id / 名称）
  // 只显示已登录可用的模型；未登录 provider 的模型不出现（当前模型例外，需可见）
  const groups = {};
  const q = modelQ.trim().toLowerCase();
  for (const m of models) {
    if (q && !m.id.toLowerCase().includes(q) && !(m.name ?? "").toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q)) continue;
    const authed = isAuthed(m.provider);
    const isCurrentModel = model && m.provider === model.provider && m.id === model.id;
    if (!authed && !isCurrentModel) continue;
    (groups[m.provider] ??= []).push(m);
  }
  const groupEntries = Object.entries(groups);
  const visibleCount = Object.values(groups).reduce((n, l) => n + l.length, 0);
  const matches = q ? visibleCount : visibleCount;

  const switchModel = async (provider, modelId) => {
    setModelOpen(false);
    setBusy(true);
    try {
      const r = await actions.setModel(provider, modelId);
      if (!r?.ok) actions.toast(`${t("切换失败")}: ${r?.error ?? ""}`, "bad");
    } finally {
      setBusy(false);
    }
  };

  const switchLevel = async (level) => {
    setLevelOpen(false);
    const r = await actions.setThinking(level);
    if (!r?.ok) actions.toast(`${t("设置失败")}: ${r?.error ?? ""}`, "bad");
  };

  const closeAll = () => {
    setModelOpen(false);
    setLevelOpen(false);
  };

  return (
    <>
      {/* 全局遮罩：点击关闭下拉菜单 */}
      {(modelOpen || levelOpen) && (
        <div className="fixed inset-0 z-40" onClick={closeAll} />
      )}

      <div className="flex items-center gap-2 px-3 h-11 border-b shrink-0" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        {/* 会话名 + 工作目录 */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium truncate max-w-[160px]" title={st?.sessionName ?? t("新会话")}>
            {st?.sessionName ?? t("新会话")}
          </span>
          <span className="hidden md:inline text-[11px] font-mono truncate max-w-[180px]" style={{ color: 'var(--color-text-secondary)' }} title={t("当前工作目录")}>
            {workDir}
          </span>
        </div>

        <div className="flex-1" />

        {/* 流程总结方式（模型左侧） */}
        <select
          className="h-6 rounded-md px-1.5 text-[11px] mr-1 border bg-transparent"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          value={state.flowMode}
          title={t("流程总结方式")}
          onChange={(e) => {
            const v = e.target.value;
            localStorage.setItem("omp-flow-mode", v);
            actions.dispatch({ type: "flow_mode", mode: v });
          }}
        >
          <option value="steps">{t("仅步骤")}</option>
          <option value="ai">{t("仅 AI 总结")}</option>
          <option value="both">{t("两者")}</option>
        </select>

        {/* 模型和思考级别（带方框，放在'空闲'左侧） */}
        <div className="flex items-center gap-0 border rounded-md px-1 py-0.5" style={{ borderColor: 'var(--color-border)' }}>
          {/* 模型显示（可点击切换） */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] transition-colors duration-150"
              style={{ background: modelOpen ? 'var(--color-bg-elevated)' : 'transparent' }}
              onMouseEnter={(e) => { if (!modelOpen) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
              onMouseLeave={(e) => { if (!modelOpen) e.currentTarget.style.background = 'transparent'; }}
              onClick={(e) => { e.stopPropagation(); if (!modelOpen) setModelQ(""); setModelOpen(!modelOpen); setLevelOpen(false); }}
              disabled={busy}
              title={t("点击切换模型")}
            >
              <span className="font-mono truncate max-w-[120px]" style={{ color: currentAuthed ? 'var(--color-text-secondary)' : 'var(--color-error)' }} title={model?.name ?? model?.id}>
                {currentAuthed ? (model?.name ?? model?.id ?? t("选择模型")) : `${model?.name ?? model?.id ?? ""} (${t("未登录")})`}
              </span>
              <IconChevronDown size={10} style={{ color: 'var(--color-text-secondary)' }} className="shrink-0" />
            </button>
            {modelOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 card shadow-xl z-50 animate-fade-in" style={{ background: 'var(--color-card)' }}>
                <div className="px-3 py-2 text-[11px] border-b" style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }}>
                  {t("模型")} · {matches} {t("个可用")}
                </div>
                <div className="px-2 pt-1.5 pb-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <input
                    autoFocus
                    className="w-full input h-7 text-[12px] pl-6"
                    placeholder={t("搜索模型…")}
                    value={modelQ}
                    onChange={(e) => setModelQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setModelQ(""); setModelOpen(false); } }}
                    style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <div className="max-h-[60vh] overflow-y-auto py-1">
                  {groupEntries.map(([provider, list]) => (
                    <div key={provider}>
                      <div className="px-3 pt-2 pb-1 text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        {provider}
                      </div>
                      {list.map((m) => {
                        const authed = isAuthed(m.provider);
                        return (
                          <button
                            key={`${m.provider}/${m.id}`}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100"
                            style={{ background: 'transparent', opacity: authed ? 1 : 0.45, cursor: authed ? 'pointer' : 'not-allowed' }}
                            onMouseEnter={(e) => { if (authed) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            onClick={() => authed && switchModel(m.provider, m.id)}
                            title={authed ? "" : t("未登录，登录后可用")}
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-[12.5px] truncate">{m.name ?? m.id}</span>
                              <span className="block text-[10.5px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                {m.id}
                                {m.contextWindow ? ` · ctx ${fmtTokens(m.contextWindow)}` : ""}
                              </span>
                            </span>
                            {model?.id === m.id && model?.provider === m.provider && (
                              <IconCheck size={13} className="shrink-0" style={{ color: 'var(--color-accent)' }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {!models.length && (
                    <div className="px-3 py-3 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{t("暂无可用模型")}</div>
                  )}
                  {models.length > 0 && !matches && (
                    <div className="px-3 py-3 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>{t("无匹配模型")}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 分隔线 */}
          <div className="w-px h-4 mx-0.5" style={{ background: 'var(--color-border)' }} />

          {/* 思考级别（可点击切换，自适应模型支持） */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] font-mono transition-colors duration-150"
              style={{
                background: levelOpen ? 'var(--color-bg-elevated)' : 'transparent',
                color: supportsThinking ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                cursor: supportsThinking ? 'pointer' : 'not-allowed',
                opacity: supportsThinking ? 1 : 0.5
              }}
              onMouseEnter={(e) => { if (!levelOpen && supportsThinking) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
              onMouseLeave={(e) => { if (!levelOpen) e.currentTarget.style.background = 'transparent'; }}
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!supportsThinking) return;
                setLevelOpen(!levelOpen); 
                setModelOpen(false); 
              }}
              title={supportsThinking ? `${t("点击切换思考级别（")}${availableLevels.length}${t("个可用）")}` : t("该模型不支持思考级别")}
            >
              <span>{currentLevel ?? "—"}</span>
              <IconChevronDown size={10} className="shrink-0" />
            </button>
            {levelOpen && supportsThinking && (
              <div className="absolute right-0 top-full mt-1 w-40 card shadow-xl z-50 animate-fade-in py-1" style={{ background: 'var(--color-card)' }}>
                <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {t("思考级别")} · {model?.id}
                </div>
                {availableLevels.map((l) => (
                  <button
                    key={l}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[12.5px] transition-colors duration-100"
                    style={{
                      background: 'transparent',
                      color: currentLevel === l ? 'var(--color-accent)' : 'var(--color-text-primary)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    onClick={() => switchLevel(l)}
                  >
                    <span className="font-mono">{l}</span>
                    {currentLevel === l && <IconCheck size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent 状态 */}
        <div className={`flex items-center gap-1.5 text-[11.5px] px-2 h-6 rounded-full border ${
          isStreaming ? "border-warning/50 text-warning" : "border-border text-secondary"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? "bg-warning animate-pulse" : "bg-success"}`} />
          {isStreaming ? t("运行中") : t("空闲")}
        </div>

        <button className="btn btn-icon" title={`${t("停止")} (Esc)`} onClick={() => actions.abort()} disabled={!isStreaming}>
          <IconStop size={14} />
        </button>
        <button
          className="btn btn-icon"
          title={t("新会话")}
          onClick={async () => {
            const ok = await actions.newSession();
            if (ok) actions.toast(t("已新建会话"));
          }}
        >
          <IconPlus size={14} />
        </button>
        <button
          className={`btn btn-icon ${inspector ? "text-accent" : ""}`}
          title="Inspector (Ctrl+I)"
          onClick={() => actions.dispatch({ type: "inspector", open: !inspector })}
        >
          <IconPanelRight size={14} />
        </button>
        <button
          className="btn btn-icon"
          title={t("刷新")}
          onClick={async () => {
            await actions.refreshAll();
            actions.toast(t("刷新成功"));
          }}
        >
          <IconRefresh size={14} />
        </button>

        {/* 上下文占用条 */}
        <div className="hidden lg:flex items-center gap-2 w-40">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-elevated)' }}>
            <div
              className={`h-full rounded-full ${contextPct > 80 ? "bg-error" : contextPct > 60 ? "bg-warning" : "bg-accent"}`}
              style={{ width: `${Math.min(100, contextPct)}%` }}
            />
          </div>
          <span className="text-[10.5px] font-mono whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
            {st?.contextUsage ? `${Math.round(contextPct)}%` : "—"}
          </span>
        </div>
      </div>
    </>
  );
}
