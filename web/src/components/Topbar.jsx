// 顶部栏:会话名、模型切换、思考级别、Agent 状态、停止/新建。
import { useEffect, useMemo, useState } from "react";
import { useApp, LEVELS } from "../store";
import { IconChevronDown, IconPanelRight, IconStop, IconPlus, IconCheck } from "../icons";
import { fmtTokens } from "../format";

export function Topbar() {
  const { state, actions } = useApp();
  const { state: st, models, inspector } = state;
  const [modelOpen, setModelOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const model = st?.model;
  const isStreaming = st?.isStreaming ?? false;
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

  // 当前工作目录：从 sessionFile 解析（sessions/--编码名--/xxx.jsonl → 解码编码名）
  const workDir = useMemo(() => {
    const sf = st?.sessionFile ?? "";
    const m = sf.match(/sessions[\\/]+--(.+)--[\\/]+[^\\/]+\.jsonl$/);
    if (m) {
      // 编码名：--D--omp界面-- → D:/omp界面（-- 分隔层级）
      const decoded = m[1].replace(/--/g, "/").replace(/^-/, "").replace(/^(.):\/(.*)/, "$1:/$2");
      return decoded;
    }
    return sf.split(/[\\/]/).slice(0, -1).join("/") || "—";
  }, [st?.sessionFile]);

  // 按 provider 分组
  const groups = {};
  for (const m of models) {
    (groups[m.provider] ??= []).push(m);
  }

  const switchModel = async (provider, modelId) => {
    setModelOpen(false);
    setBusy(true);
    try {
      const r = await actions.setModel(provider, modelId);
      if (!r?.ok) actions.toast(`切换失败: ${r?.error ?? ""}`, "bad");
    } finally {
      setBusy(false);
    }
  };

  const switchLevel = async (level) => {
    setLevelOpen(false);
    const r = await actions.setThinking(level);
    if (!r?.ok) actions.toast(`设置失败: ${r?.error ?? ""}`, "bad");
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
          <span className="text-[13px] font-medium truncate max-w-[160px]" title={st?.sessionName ?? "新会话"}>
            {st?.sessionName ?? "新会话"}
          </span>
          <span className="hidden md:inline text-[11px] font-mono truncate max-w-[180px]" style={{ color: 'var(--color-text-secondary)' }} title="当前工作目录">
            {workDir}
          </span>
        </div>

        <div className="flex-1" />

        {/* 模型和思考级别（带方框，放在'空闲'左侧） */}
        <div className="flex items-center gap-0 border rounded-md px-1 py-0.5" style={{ borderColor: 'var(--color-border)' }}>
          {/* 模型显示（可点击切换） */}
          <div className="relative">
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] transition-colors duration-150"
              style={{ background: modelOpen ? 'var(--color-bg-elevated)' : 'transparent' }}
              onMouseEnter={(e) => { if (!modelOpen) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
              onMouseLeave={(e) => { if (!modelOpen) e.currentTarget.style.background = 'transparent'; }}
              onClick={(e) => { e.stopPropagation(); setModelOpen(!modelOpen); setLevelOpen(false); }}
              disabled={busy}
              title="点击切换模型"
            >
              <span className="font-mono truncate max-w-[120px]" style={{ color: 'var(--color-text-secondary)' }}>
                {model?.name ?? model?.id ?? "选择模型"}
              </span>
              <IconChevronDown size={10} style={{ color: 'var(--color-text-secondary)' }} className="shrink-0" />
            </button>
            {modelOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 max-h-[70vh] overflow-y-auto card shadow-xl z-50 animate-fade-in" style={{ background: 'var(--color-card)' }}>
                <div className="px-3 py-2 text-[11px] border-b" style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-border)' }}>
                  模型 · {models.length} 个可用
                </div>
                <div className="py-1">
                  {Object.entries(groups).map(([provider, list]) => (
                    <div key={provider}>
                      <div className="px-3 pt-2 pb-1 text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        {provider}
                      </div>
                      {list.map((m) => (
                        <button
                          key={`${m.provider}/${m.id}`}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100"
                          style={{ background: 'transparent' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          onClick={() => switchModel(m.provider, m.id)}
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
                      ))}
                    </div>
                  ))}
                  {!models.length && (
                    <div className="px-3 py-3 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>暂无可用模型</div>
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
              title={supportsThinking ? `点击切换思考级别（${availableLevels.length} 个可用）` : "该模型不支持思考级别"}
            >
              <span>{currentLevel ?? "—"}</span>
              <IconChevronDown size={10} className="shrink-0" />
            </button>
            {levelOpen && supportsThinking && (
              <div className="absolute right-0 top-full mt-1 w-40 card shadow-xl z-50 animate-fade-in py-1" style={{ background: 'var(--color-card)' }}>
                <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  思考级别 · {model?.id}
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
          {isStreaming ? "运行中" : "空闲"}
        </div>

        <button className="btn btn-icon" title="停止 (Esc)" onClick={() => actions.abort()} disabled={!isStreaming}>
          <IconStop size={14} />
        </button>
        <button
          className="btn btn-icon"
          title="新会话"
          onClick={async () => {
            const ok = await actions.newSession();
            if (ok) actions.toast("已新建会话");
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
