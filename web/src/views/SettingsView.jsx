// 设置:Agent 设置(接真实 RPC 命令)+ Provider 配置(信息展示)+ 登录。
import { useEffect, useState } from "react";
import { useApp } from "../store";
import { PageShell } from "./PageShell";
import { fmtTokens } from "../format";
import { IconGlobe, IconRefresh, IconUser, IconSettings } from "../icons";

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      className={`w-8 h-[18px] rounded-full relative transition-colors duration-150 shrink-0 ${checked ? "bg-accent" : ""} ${disabled ? "opacity-50 cursor-default" : "cursor-pointer"}`}
      style={!checked ? { background: 'var(--color-border)' } : undefined}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150 ${checked ? "translate-x-[16px]" : "translate-x-[2px]"}`} />
    </button>
  );
}

export function SettingsView() {
  const { state, actions } = useApp();
  const st = state.state;
  const [busy, setBusy] = useState(null);
  const [loginInfo, setLoginInfo] = useState(null);

  useEffect(() => {
    fetch("/api/login_providers")
      .then((r) => r.json())
      .then((j) => j.ok && setLoginInfo(j.providers))
      .catch(() => {});
  }, []);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r?.ok) actions.toast(okMsg);
      else actions.toast(`失败: ${r?.error ?? ""}`, "bad");
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
        actions.toast(`已退出登录: ${providerId}`);
        // 刷新登录状态列表
        fetch("/api/login_providers")
          .then((res) => res.json())
          .then((j) => j.ok && setLoginInfo(j.providers))
          .catch(() => {});
        actions.refreshModels();
      } else {
        actions.toast(`退出失败: ${r?.error ?? ""}`, "bad");
      }
    } finally {
      setBusy(null);
    }
  };

  const agent = [
    {
      key: "autoCompaction",
      label: "自动压缩上下文",
      desc: "接近上下文窗口时自动压缩历史",
      value: st?.autoCompactionEnabled ?? false,
      set: (v) => run("ac", () => actions.setAutoCompaction(v), v ? "已开启自动压缩" : "已关闭自动压缩"),
    },
    {
      key: "fastMode",
      label: "Fast Mode",
      desc: "快速模式(服务层加速)",
      value: st?.fastModeEnabled ?? false,
      set: (v) => run("fast", () => actions.setFastMode(v), v ? "已开启 Fast Mode" : "已关闭 Fast Mode"),
    },
  ];

  const modes = [
    {
      label: "Steering 模式",
      desc: "转向消息队列出队方式",
      value: st?.steeringMode ?? "one-at-a-time",
      set: (v) => run("steer", () => actions.setSteeringMode(v), `Steering 模式: ${v}`),
      opts: ["one-at-a-time", "all"],
    },
    {
      label: "Follow-up 模式",
      desc: "后续消息队列出队方式",
      value: st?.followUpMode ?? "one-at-a-time",
      set: (v) => run("fu", () => actions.setFollowUpMode(v), `Follow-up 模式: ${v}`),
      opts: ["one-at-a-time", "all"],
    },
    {
      label: "Interrupt 模式",
      desc: "工具执行期间的转向打断策略",
      value: st?.interruptMode ?? "immediate",
      set: (v) => run("int", () => actions.setInterruptMode(v), `Interrupt 模式: ${v}`),
      opts: ["immediate", "wait"],
    },
  ];

  const provider = st?.model?.provider ?? "—";
  const baseUrl = st?.model?.baseUrl ?? "—";
  const model = st?.model;

  return (
    <PageShell title="设置" desc="Agent 行为设置实时生效;Provider 凭据由 omp 配置文件管理。">
      {/* 外观设置入口 */}
      <div className="mb-6">
        <button
          className="btn btn-ghost w-full justify-start gap-3 h-10"
          onClick={() => actions.dispatch({ type: "view", view: "appearance" })}
        >
          <IconSettings size={15} />
          <span className="text-[13.5px]">外观设置</span>
          <span className="text-[11.5px] text-secondary ml-auto">切换主题</span>
        </button>
      </div>

      {/* Agent 设置 */}
      <h2 className="text-[13.5px] font-semibold mt-2 mb-2">Agent 设置</h2>
      <div className="card divide-y divide-border/60">
        {agent.map((a) => (
          <div key={a.key} className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">{a.label}</div>
              <div className="text-[11.5px] text-secondary">{a.desc}</div>
            </div>
            <Switch checked={!!a.value} onChange={a.set} disabled={busy === a.key} label={a.label} />
          </div>
        ))}
        {modes.map((m) => (
          <div key={m.label} className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">{m.label}</div>
              <div className="text-[11.5px] text-secondary">{m.desc}</div>
            </div>
            <select className="select" value={m.value} disabled={busy === m.label} onChange={(e) => m.set(e.target.value)}>
              {m.opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <div className="px-4 py-3 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium">思考级别</div>
            <div className="text-[11.5px] text-secondary">Reasoning level</div>
          </div>
          <select
            className="select"
            value={st?.thinkingLevel ?? "auto"}
            disabled={busy === "think"}
            onChange={(e) => run("think", () => actions.setThinking(e.target.value), `思考级别: ${e.target.value}`)}
          >
            {["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Provider 配置 */}
      <h2 className="text-[13.5px] font-semibold mt-6 mb-2">Provider 配置</h2>
      <div className="card divide-y divide-border/60">
        <div className="px-4 py-3 flex items-center gap-4">
          <IconGlobe size={15} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium">当前 Provider</div>
            <div className="text-[11.5px] text-secondary font-mono">{provider} · {baseUrl}</div>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${st ? "border-success/40 text-success" : "border-border text-secondary"}`}>
            {st ? "已连接" : "未知"}
          </span>
        </div>
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
            <KV k="模型" v={model?.id ?? "—"} mono />
            <KV k="模型名称" v={model?.name ?? "—"} />
            <KV k="API" v={model?.api ?? "—"} mono />
            <KV k="上下文窗口" v={model?.contextWindow ? fmtTokens(model.contextWindow) : "—"} mono />
            <KV k="Max Tokens" v={model?.maxTokens ? fmtTokens(model.maxTokens) : "—"} mono />
            <KV k="推理" v={model?.reasoning ? "支持" : "不支持"} />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[12px] text-secondary leading-relaxed">
            Provider 的 API Key、Endpoint、Temperature 等参数由 omp 的配置文件管理
            (<span className="font-mono">~/.omp/agent/config.yml</span>)。
            修改后需重启 omp 生效。本界面只读展示当前激活的 Provider 信息,避免凭据泄漏到浏览器。
          </div>
        </div>
      </div>

      {/* 登录状态 */}
      <h2 className="text-[13.5px] font-semibold mt-6 mb-2">登录</h2>
      <div className="card p-4">
        {!loginInfo && <div className="text-[12.5px] text-secondary">加载中…</div>}
        {loginInfo && !loginInfo.length && (
          <div className="text-[12.5px] text-secondary flex items-center gap-2">
            <IconUser size={13} /> 无可用登录 Provider
          </div>
        )}
        {loginInfo?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-1.5">
            <span className="font-mono text-[12.5px] flex-1">{p.id}</span>
            {p.authenticated ? (
              <>
                <span className="text-[11.5px] text-success">已登录</span>
                <button
                  className="btn btn-ghost h-6 text-[11.5px] text-error"
                  title="退出登录后可在控制台重新获取 API Key 并再次登录"
                  onClick={() => handleLogout(p.id)}
                  disabled={busy === `logout-${p.id}`}
                >
                  {busy === `logout-${p.id}` ? "退出中…" : "退出登录"}
                </button>
              </>
            ) : (
              <button className="btn h-6 text-[11.5px]" onClick={() => run(`login-${p.id}`, () => fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: p.id }) }).then((r) => r.json()), `登录流程已启动: ${p.id}`)}>
                登录
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 系统信息 */}
      <h2 className="text-[13.5px] font-semibold mt-6 mb-2">系统信息</h2>
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
          <KV k="Session ID" v={st?.sessionId ?? "—"} mono />
          <KV k="会话文件" v={st?.sessionFile ? st.sessionFile.split(/[\\/]/).pop() : "—"} mono />
          <KV k="消息数" v={st?.messageCount ?? 0} />
          <KV k="Token 速率" v={st?.tokensPerSecond ? `${st.tokensPerSecond}/s` : "—"} mono />
        </div>
      </div>
    </PageShell>
  );
}

function KV({ k, v, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-secondary shrink-0">{k}</span>
      <span className={`text-right break-all ${mono ? "font-mono text-[11.5px]" : ""}`}>{v}</span>
    </div>
  );
}
