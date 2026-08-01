// Skills 管理页面：显示已发现的 skills，支持查看内容、使用。
import { useEffect, useState } from "react";
import { useApp } from "../store";
import { PageShell } from "./PageShell";
import {
  IconRefresh, IconSearch, IconFileText, IconChevronRight,
  IconChevronDown, IconCopy, IconCheck, IconZap
} from "../icons";

export function SkillsView() {
  const { actions } = useApp();
  const [skills, setSkills] = useState(null);
  const [err, setErr] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [skillContent, setSkillContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all"); // all | user | project

  const load = () => {
    setSkills(null);
    setErr(null);
    actions.loadSkills()
      .then((list) => setSkills(list))
      .catch((e) => setErr(String(e)));
  };
  useEffect(load, []);

  const openSkill = async (skill) => {
    setSelectedSkill(skill);
    setLoadingContent(true);
    setSkillContent(null);
    try {
      const content = await actions.getSkillContent(skill.name);
      setSkillContent(content);
    } catch (e) {
      setSkillContent({ content: `加载失败: ${e}` });
    }
    setLoadingContent(false);
  };

  const copySkillRef = (name) => {
    navigator.clipboard.writeText(`skill://${name}`).catch(() => {});
    setCopied(name);
    setTimeout(() => setCopied(false), 1500);
  };

  const useSkill = (skill) => {
    // 填充输入框
    actions.dispatch({ type: "view", view: "chat" });
    window.dispatchEvent(new CustomEvent("omp:fill-prompt", { detail: `/skill:${skill.name} ` }));
    actions.toast(`已填入: /skill:${skill.name}`);
  };

  const filtered = (skills ?? []).filter((s) => {
    const okSource = sourceFilter === "all" || s.source === sourceFilter;
    const q = searchQuery.toLowerCase();
    const okQ = !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q);
    return okSource && okQ;
  });

  const userCount = (skills ?? []).filter((s) => s.source === "user").length;
  const projectCount = (skills ?? []).filter((s) => s.source === "project").length;

  return (
    <PageShell
      title="Skills"
      desc="已发现的能力包（Skills）。通过 skill:// 协议或 /skill:<name> 命令使用。"
      actions={
        <button className="btn btn-ghost" onClick={load} title="刷新">
          <IconRefresh size={13} /> 刷新
        </button>
      }
    >
      {/* 筛选和搜索 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
          <input
            className="input pl-8 h-8"
            placeholder="搜索 skills…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {[
            { id: "all", label: `全部 (${skills?.length ?? 0})` },
            { id: "user", label: `用户 (${userCount})` },
            { id: "project", label: `项目 (${projectCount})` },
          ].map((f) => (
            <button
              key={f.id}
              className={`btn h-7 text-[12px] ${sourceFilter === f.id ? "bg-accent border-accent text-white" : ""}`}
              onClick={() => setSourceFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="text-[13px] text-error mb-3">{err}</div>}
      {!skills && !err && <div className="text-secondary text-[13px] py-8 text-center">加载中…</div>}
      {skills && !skills.length && (
        <div className="card p-6 text-center">
          <IconZap size={32} className="mx-auto text-secondary/40 mb-3" />
          <h3 className="text-[14px] font-medium mb-2">暂未发现 Skills</h3>
          <p className="text-[12.5px] text-secondary max-w-md mx-auto leading-relaxed">
            Skills 是基于文件的能力包，放在以下目录即可自动发现：
          </p>
          <div className="mt-3 text-[11.5px] font-mono text-secondary bg-[var(--color-bg-secondary)] rounded-md p-3 text-left max-w-sm mx-auto">
            <div>~/.omp/agent/skills/&lt;name&gt;/SKILL.md <span className="text-accent">(用户级)</span></div>
            <div className="mt-1">.omp/skills/&lt;name&gt;/SKILL.md <span className="text-accent">(项目级)</span></div>
          </div>
        </div>
      )}

      {/* 列表 + 详情双栏 */}
      <div className="flex gap-4 min-h-[400px]">
        {/* 列表 */}
        <div className={`${selectedSkill ? "w-2/5" : "w-full"} space-y-1.5 transition-all duration-150`}>
          {filtered.map((s) => (
            <div
              key={`${s.source}-${s.name}`}
              className={`card px-3.5 py-2.5 cursor-pointer hover:border-[var(--color-border-hover)] transition-colors duration-100 ${
                selectedSkill?.name === s.name ? "border-accent" : ""
              }`}
              onClick={() => openSkill(s)}
            >
              <div className="flex items-center gap-2">
                <IconFileText size={13} className="text-accent shrink-0" />
                <span className="text-[13px] font-medium flex-1 truncate">{s.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  s.source === "user" ? "bg-accent/15 text-accent" : "bg-success/15 text-success"
                }`}>
                  {s.source === "user" ? "用户" : "项目"}
                </span>
                {s.alwaysApply && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">自动</span>
                )}
              </div>
              {s.description && (
                <p className="text-[11.5px] text-secondary mt-1 line-clamp-2">{s.description}</p>
              )}
              {s.globs.length > 0 && (
                <div className="mt-1 text-[10.5px] text-secondary/70 font-mono">
                  globs: {s.globs.join(", ")}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && skills?.length > 0 && (
            <div className="text-secondary text-[13px] py-8 text-center">无匹配结果</div>
          )}
        </div>

        {/* 详情面板 */}
        {selectedSkill && (
          <div className="flex-1 card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <IconFileText size={14} className="text-accent shrink-0" />
                <span className="text-[13.5px] font-semibold truncate">{selectedSkill.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="btn btn-icon h-6 w-6"
                  title="复制 skill:// 引用"
                  onClick={() => copySkillRef(selectedSkill.name)}
                >
                  {copied === selectedSkill.name ? <IconCheck size={11} className="text-success" /> : <IconCopy size={11} />}
                </button>
                <button
                  className="btn btn-icon h-6 w-6"
                  title="关闭详情"
                  onClick={() => setSelectedSkill(null)}
                >
                  <IconChevronRight size={11} />
                </button>
              </div>
            </div>
            {selectedSkill.description && (
              <div className="px-3.5 py-2 border-b border-border text-[12px] text-secondary">
                {selectedSkill.description}
              </div>
            )}
            <div className="px-3.5 py-2 border-b border-border flex items-center gap-3 text-[11px]">
              <span className="text-secondary">来源: <span className="text-primary font-mono">{selectedSkill.source}</span></span>
              <span className="text-secondary">路径: <span className="text-primary font-mono">{selectedSkill.baseDir}</span></span>
            </div>
            <div className="flex-1 overflow-y-auto p-3.5">
              {loadingContent && <div className="text-secondary text-[13px] py-4 text-center">加载中…</div>}
              {skillContent && (
                <div className="md text-[12.5px]" dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(skillContent.content) }} />
              )}
            </div>
            <div className="px-3.5 py-2 border-t border-border shrink-0">
              <button
                className="btn btn-primary h-8 w-full"
                onClick={() => useSkill(selectedSkill)}
              >
                <IconZap size={13} /> 使用此 Skill
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="card p-4 mt-4">
        <h3 className="text-[12.5px] font-medium mb-2">关于 Skills</h3>
        <ul className="text-[12px] text-secondary space-y-1.5 list-disc pl-4">
          <li>Skills 是基于文件的能力包，每个 skill 包含一个 SKILL.md 文件</li>
          <li>在聊天中输入 <span className="font-mono text-accent">/skill:&lt;name&gt;</span> 调用 skill</li>
          <li>模型可以通过 <span className="font-mono text-accent">skill://&lt;name&gt;</span> 协议读取 skill 内容</li>
          <li>支持多种来源：native、claude、codex、agents、github 等</li>
          <li><span className="font-mono">alwaysApply: true</span> 的 skill 会自动注入到系统提示中</li>
        </ul>
      </div>
    </PageShell>
  );
}

// 简单 markdown 渲染（不依赖外部库）
function renderSimpleMarkdown(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-[14px] font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-[15px] font-semibold mt-4 mb-2 border-b border-border pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-[16px] font-bold mt-4 mb-2 border-b border-border pb-1.5">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="font-mono text-[12px] bg-[var(--color-bg-secondary)] border border-border rounded px-1 py-px">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^```(\w*)\n([\s\S]*?)```$/gm, '<pre class="my-2 rounded-lg border border-border bg-[var(--color-bg-secondary)] overflow-x-auto"><code class="block p-3 text-[12px] font-mono leading-relaxed">$2</code></pre>')
    .replace(/\n{2,}/g, '</p><p class="my-2">')
    .replace(/\n/g, '<br/>')
    .replace(/^(?!<[hluop])/gm, '<p class="my-1">')
    .replace(/(<br\/>)+<\/p>/g, '</p>');
}
