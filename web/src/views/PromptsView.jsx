// Prompt 库:分类、搜索、收藏、一键使用。
import { useMemo, useState } from "react";
import { useApp } from "../store";
import { PageShell } from "./PageShell";
import { IconSearch, IconStar, IconSparkle } from "../icons";

const LIBRARY = [
  { cat: "代码", name: "代码审查", prompt: "请审查代码质量、安全性、性能,指出问题并给出修改建议。" },
  { cat: "代码", name: "解释代码", prompt: "请解释这段代码的功能、结构和关键实现细节。" },
  { cat: "代码", name: "写单元测试", prompt: "请为当前模块编写单元测试,覆盖正常路径和边界情况。" },
  { cat: "代码", name: "重构", prompt: "请重构这段代码,提高可读性和可维护性,保持行为不变。" },
  { cat: "写作", name: "总结", prompt: "请总结以下内容的核心要点,用简洁的要点列出。" },
  { cat: "写作", name: "翻译成英文", prompt: "请将以下内容翻译成英文,保持原意和技术准确性。" },
  { cat: "研究", name: "技术调研", prompt: "请调研该主题的现状、主流方案和优缺点,给出对比和建议。" },
  { cat: "运维", name: "排查错误", prompt: "请分析这个错误日志,定位根因并给出修复方案。" },
];

export function PromptsView() {
  const { actions } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("全部");
  const [favs, setFavs] = useState(() => new Set());

  const cats = useMemo(() => ["全部", ...new Set(LIBRARY.map((p) => p.cat))], []);
  const filtered = useMemo(() => {
    return LIBRARY.filter((p) => {
      const okCat = cat === "全部" || p.cat === cat;
      const okQ = !q.trim() || p.name.toLowerCase().includes(q.toLowerCase()) || p.prompt.toLowerCase().includes(q.toLowerCase());
      return okCat && okQ;
    });
  }, [q, cat]);

  const usePrompt = (p) => {
    actions.dispatch({ type: "view", view: "chat" });
    // 填充输入框:通过自定义事件交给 Composer
    window.dispatchEvent(new CustomEvent("omp:fill-prompt", { detail: p.prompt }));
    actions.toast(`已填入: ${p.name}`);
  };

  return (
    <PageShell title="Prompt 库" desc="常用 prompt 模板,一键填入输入框。">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
          <input className="input pl-7" placeholder="搜索 prompt…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {cats.map((c) => (
            <button key={c} className={`btn h-7 text-[12px] ${cat === c ? "bg-accent border-accent text-white" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filtered.map((p) => (
          <div key={p.name} className="card px-3.5 py-3 group">
            <div className="flex items-center gap-2 mb-1.5">
              <IconSparkle size={13} className="text-accent" />
              <span className="text-[13px] font-medium">{p.name}</span>
              <span className="text-[10.5px] text-secondary px-1.5 py-px rounded" style={{ background: 'var(--color-bg-elevated)' }}>{p.cat}</span>
              <span className="flex-1" />
              <button
                className={`btn btn-icon ${favs.has(p.name) ? "text-warning" : ""}`}
                title="收藏"
                onClick={() => setFavs((s) => { const n = new Set(s); n.has(p.name) ? n.delete(p.name) : n.add(p.name); return n; })}
              >
                <IconStar size={13} />
              </button>
            </div>
            <p className="text-[12px] text-secondary leading-relaxed line-clamp-2 mb-2">{p.prompt}</p>
            <button className="btn btn-ghost text-[12px] opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={() => usePrompt(p)}>
              一键使用
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
