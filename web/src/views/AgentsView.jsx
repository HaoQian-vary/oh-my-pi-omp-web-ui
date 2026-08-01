// Agents 页面：展示可用任务代理（agents）及如何在对话中使用。
import { useEffect, useState } from "react";
import { useApp } from "../store";
import { useLang } from "../i18n";
import { PageShell } from "./PageShell";
import { IconBot, IconRefresh, IconSparkle, IconChevronRight } from "../icons";

// 内置 agents（与 omp 文档一致）
const BUILTIN_AGENTS = [
  { name: "task", desc: "通用任务代理，可编辑文件", tools: ["全工具"] },
  { name: "scout", desc: "只读侦察代理，快速探索代码库", tools: ["read", "search", "glob"] },
  { name: "designer", desc: "UI/UX 设计专家", tools: ["read", "edit"] },
  { name: "reviewer", desc: "代码审查专家", tools: ["read", "search", "lsp"] },
  { name: "librarian", desc: "外部库/API 源码研究", tools: ["read"] },
  { name: "sonic", desc: "低推理机械性任务（批量更新、数据收集）", tools: ["编辑类"] },
];

export function AgentsView() {
  const { t } = useLang();
  const { actions } = useApp();
  const [agents, setAgents] = useState(null); // 运行中的子代理
  const [err, setErr] = useState(null);
  const [customAgents, setCustomAgents] = useState([]); // 自定义 agent 文件
  const [busy, setBusy] = useState(null);

  const load = () => {
    setAgents(null);
    setErr(null);
    fetch("/api/subagents")
      .then((r) => r.json())
      .then((j) => (j.ok ? setAgents(j.agents) : setErr(j.error)))
      .catch((e) => setErr(String(e)));
    // 加载自定义 agents
    fetch("/api/agents")
      .then((r) => r.json())
      .then((j) => j.ok && setCustomAgents(j.agents ?? []))
      .catch(() => {});
  };
  useEffect(load, []);

  const testAgent = async (name) => {
    setBusy(name);
    try {
      const r = await fetch("/api/test_agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: name }),
      }).then((res) => res.json());
      actions.toast(r.ok ? r.message : `${t("失败")}: ${r.error ?? ""}`, r.ok ? "" : "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell
      title="Agents"
      desc={t("任务代理：在主对话中分派子任务给指定 agent 并行执行。")}
      actions={
        <button className="btn btn-ghost" onClick={load} title={t("刷新")}>
          <IconRefresh size={13} /> {t("刷新")}
        </button>
      }
    >
      {/* 用法说明 */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <IconSparkle size={15} className="text-accent" />
          <span className="text-[13px] font-medium">{t("如何在对话中使用 Agents")}</span>
        </div>
        <p className="text-[12.5px] text-secondary leading-relaxed mb-2">
          {t("Agents 通过对话中的")} <span className="font-mono text-accent">task</span> {t("工具使用。在主对话中直接说，例如：")}
        </p>
        <div className="space-y-1.5 font-mono text-[12px] p-3 rounded-md" style={{ background: 'var(--color-bg-secondary)' }}>
          <div><span className="text-accent">"{t("用 scout 探索一下这个项目的目录结构")}"</span> —— {t("只读侦察")}</div>
          <div><span className="text-accent">"{t("让 reviewer 审查我刚改的代码")}"</span> —— {t("代码审查")}</div>
          <div><span className="text-accent">"{t("派一个 task 代理去研究 xxx 库的用法")}"</span> —— {t("独立任务")}</div>
        </div>
        <p className="text-[11.5px] text-secondary mt-2">
          {t("模型会创建子代理（在后台并行运行），完成后结果回到主对话。子代理也可由插件/自定义文件扩展。")}
        </p>
      </div>

      {err && <div className="text-[13px] text-error mb-3">{err}</div>}

      {/* 可用 agents */}
      <h3 className="text-[11px] uppercase tracking-wider text-secondary/70 font-semibold mb-2 px-1">{t("可用 Agents")}</h3>
      <div className="space-y-2 mb-6">
        {customAgents.map((a) => (
          <AgentCard key={`custom-${a.name}`} name={a.name} desc={a.description} tools={a.tools} source={t("自定义")} onTest={() => testAgent(a.name)} busy={busy === a.name} />
        ))}
        {BUILTIN_AGENTS.map((a) => (
          <AgentCard key={`builtin-${a.name}`} name={a.name} desc={a.desc} tools={a.tools} source={t("内置")} onTest={() => testAgent(a.name)} busy={busy === a.name} />
        ))}
      </div>

      {/* 运行中的子代理 */}
      <h3 className="text-[11px] uppercase tracking-wider text-secondary/70 font-semibold mb-2 px-1">{t("当前会话子代理")}</h3>
      {!agents && !err && <div className="text-secondary text-[13px] py-4 text-center">{t("加载中…")}</div>}
      {agents && !agents.length && (
        <div className="text-secondary text-[13px] py-4 text-center flex flex-col items-center gap-2">
          <IconBot size={20} className="opacity-40" />
          {t("暂无运行中的子代理")}
        </div>
      )}
      <div className="space-y-1.5">
        {agents?.map((a) => (
          <div key={a.id} className="card px-3.5 py-2.5 flex items-center gap-2">
            <IconBot size={13} className="text-accent shrink-0" />
            <span className="font-mono text-[12.5px]">{a.id}</span>
            {a.status && <span className="text-[11px] text-secondary">{a.status}</span>}
          </div>
        ))}
      </div>

      {/* 自定义 agent 说明 */}
      <div className="card p-4 mt-4">
        <h3 className="text-[12.5px] font-medium mb-2">{t("创建自定义 Agent")}</h3>
        <p className="text-[12px] text-secondary leading-relaxed">
          {t("在")} <span className="font-mono">.omp/agents/&lt;name&gt;.md</span>（{t("项目级")}）{t("或")}
          <span className="font-mono"> ~/.omp/agent/agents/</span>（{t("用户级")}）{t("创建 Markdown 文件：")}
        </p>
        <pre className="font-mono text-[11.5px] p-3 rounded-md mt-2 overflow-x-auto" style={{ background: 'var(--color-code)' }}>
{`---
name: my-helper
description: 我的专属助手
tools: read, search, edit
---
你是我的专属助手，负责……`}
        </pre>
      </div>
    </PageShell>
  );
}

function AgentCard({ name, desc, tools, source, onTest, busy }) {
  const { t } = useLang();
  return (
    <div className="card px-4 py-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-muted)' }}>
        <IconBot size={15} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium font-mono">{name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: source === '内置' ? 'var(--color-bg-elevated)' : 'var(--color-accent-muted)', color: source === '内置' ? 'var(--color-text-secondary)' : 'var(--color-accent)' }}>
            {t(source)}
          </span>
        </div>
        {desc && <p className="text-[12px] text-secondary mt-0.5">{t(desc)}</p>}
        {tools && <div className="text-[11px] text-secondary/70 mt-1 font-mono">{t(tools)}</div>}
      </div>
      <button className="btn h-7 shrink-0" onClick={onTest} disabled={busy} title={t("测试")}>
        {busy ? t("测试中…") : t("测试")}
      </button>
    </div>
  );
}
