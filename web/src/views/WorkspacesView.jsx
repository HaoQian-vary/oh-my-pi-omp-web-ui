// 工作区:当前 cwd、omp 会话目录、状态。
import { useApp } from "../store";
import { PageShell } from "./PageShell";
import { IconFolder, IconHistory } from "../icons";

export function WorkspacesView() {
  const { state } = useApp();
  const st = state.state;

  const cwd = st?.sessionFile ? st.sessionFile.split(/[\\/]/).slice(0, -1).join("/") : "—";

  return (
    <PageShell title="工作区" desc="omp 进程的工作目录与会话存储位置。">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <IconFolder size={15} className="text-accent" />
            <span className="text-[13px] font-medium">当前工作区</span>
          </div>
          <div className="text-[12px] text-secondary font-mono break-all">{cwd}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <IconHistory size={15} className="text-accent" />
            <span className="text-[13px] font-medium">会话文件</span>
          </div>
          <div className="text-[12px] text-secondary font-mono break-all">{st?.sessionFile ?? "—"}</div>
        </div>
      </div>
      <div className="text-[12px] text-secondary mt-4 leading-relaxed">
        工作区由 omp 启动参数 <span className="font-mono">--cwd</span> 决定,会话文件存储在
        <span className="font-mono"> ~/.omp/agent/sessions/</span> 下,按工作目录编码分目录存放。
      </div>
    </PageShell>
  );
}
