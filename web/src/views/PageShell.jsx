// 辅助页面通用外壳:标题 + 返回对话按钮。
export function PageShell({ title, desc, children, actions }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[18px] font-semibold">{title}</h1>
          {actions}
        </div>
        {desc && <p className="text-secondary text-[12.5px] mb-5">{desc}</p>}
        {children}
      </div>
    </div>
  );
}
