// 中英文国际化：默认中文，可切换英文，localStorage 持久化。
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

// 翻译字典：key 为中文（源码用中文直接写），value 为英文
const DICT = {
  // 通用
  "对话": "Chat",
  "聊天记录": "History",
  "Prompt 库": "Prompts",
  "Skills": "Skills",
  "Marketplace": "Marketplace",
  "工作区": "Workspaces",
  "MCP 服务器": "MCP Servers",
  "Agents": "Agents",
  "插件": "Plugins",
  "模型": "Models",
  "设置": "Settings",
  "外观设置": "Appearance",
  "新会话": "New Session",
  "展开侧栏": "Expand sidebar",
  "折叠侧栏": "Collapse sidebar",
  "新建对话": "New Session",
  "搜索导航…": "Search navigation…",
  "本地用户": "Local user",
  "新对话": "New Chat",
  "刷新": "Refresh",
  "取消": "Cancel",
  "确定": "OK",
  "确认": "Confirm",
  "删除": "Delete",
  "重命名": "Rename",
  "置顶": "Pin",
  "取消置顶": "Unpin",
  "打开": "Open",
  "关闭": "Close",
  "复制": "Copy",
  "搜索": "Search",
  "加载中…": "Loading…",
  "暂无": "None",
  "未命名会话": "Untitled session",
  "已登录": "Signed in",
  "未登录": "Not signed in",
  "退出登录": "Sign out",
  "登录": "Sign in",
  "是": "Yes",
  "否": "No",

  // Topbar
  "思考级别": "Thinking",
  "切换模型": "Switch model",
  "点击切换模型": "Click to switch model",
  "点击切换思考级别": "Click to change thinking",
  "空闲": "Idle",
  "运行中": "Running",
  "停止": "Stop",
  "已切换到": "Switched to",
  "切换失败": "Switch failed",
  "设置失败": "Setting failed",
  "个可用": "available",
  "点击切换思考级别（": "Change thinking (",
  "个可用）": " available)",
  "该模型不支持思考级别": "Model does not support thinking",
  "当前工作目录": "Working directory",

  // Composer
  "输入消息 — Enter 发送,Shift+Enter 换行,Ctrl+Enter 发送,输入 / 查看命令": "Type a message — Enter to send, Shift+Enter newline, Ctrl+Enter send, / for commands",
  "运行中… 输入内容并按 Enter 插话，或点停止终止": "Running… type and press Enter to interject, or Stop to abort",
  "发送": "Send",
  "插话": "Interject",
  "上传图片": "Upload image",
  "拖拽图片到此处": "Drag image here",
  "仅支持图片: ": "Images only: ",
  "输入后 Enter 插话": "Type + Enter to interject",
  "Enter 发送": "Enter to send",
  "生成中…": "Generating…",
  "插话失败": "Interject failed",
  "终止当前回复": "Abort current reply",
  "已新建会话": "New session created",
  "发送失败": "Send failed",
  "Slash 命令": "Slash Commands",
  "恢复历史会话": "Resume session",
  "从当前会话派生新会话": "Fork session",
  "压缩上下文": "Compact context",
  "生成交接说明": "Handoff",
  "导出会话为 HTML": "Export as HTML",
  "重置 provider 流状态": "Reset provider stream",
  "Shift+Enter 换行 · Esc 停止": "Shift+Enter newline · Esc stop",

  // MessageList
  "思考": "Thinking",
  "行": "lines",
  "收起": "Collapse",
  "展开": "Expand",
  "结果": "result",
  "完成": "Done",
  "失败": "Failed",
  "字符": "chars",
  "执行中…": "Running…",
  "本地 AI Agent 工作台,驱动": "Local AI agent workspace, driving",
  "输入消息或点击下方建议开始。": "Type a message or pick a suggestion to start.",
  "解释这个项目的架构": "Explain this project's architecture",
  "帮我重构 server.mjs": "Help me refactor server.mjs",
  "写一个单元测试": "Write a unit test",
  "总结当前工作区文件": "Summarize the workspace files",

  // Inspector
  "上下文占用": "Context Usage",
  "会话": "Session",
  "消息数": "Messages",
  "队列": "Queued",
  "自动压缩": "Auto-compaction",
  "队列模式": "Queue Modes",
  "工作区文件": "Workspace Files",
  "omp stderr": "omp stderr",
  "任务": "Tasks",
  "可用工具": "Available Tools",
  "本轮工具": "Active Tools",
  "暂无工具信息": "No tool info",
  "暂无任务": "No tasks",
  "暂无日志": "No logs",
  "关闭 Inspector": "Close Inspector",

  // NewSessionDialog
  "对话名称": "Session name",
  "可选": "optional",
  "工作文件夹": "Working folder",
  "浏览": "Browse",
  "清除": "Clear",
  "创建对话": "Create",
  "创建中…": "Creating…",
  "创建失败: ": "Create failed: ",
  "对话已创建": "Session created",
  "选择磁盘": "Select drive",
  "上一级": "Up",
  "例如：重构 server.mjs": "e.g. refactor server.mjs",
  "默认工作区": "Default workspace",
  "此文件夹下没有子目录": "No subdirectories",
  "不填写则使用当前默认工作区。选择后该对话的模型将在所选文件夹中工作。": "Leave empty to use the default workspace. The model will work in the selected folder.",
  "设置后显示在会话标题和聊天记录中。": "Shown in the session title and history.",

  // SessionsView
  "搜索会话…": "Search sessions…",
  "已置顶": "Pinned",
  "今天": "Today",
  "昨天": "Yesterday",
  "最近7天": "Last 7 Days",
  "更早": "Earlier",
  "按时间": "By time",
  "按名称": "By name",
  "条消息": "messages",
  "切换中…": "Switching…",
  "确认删除": "Confirm Delete",
  "历史会话列表。点击打开恢复完整会话。": "History list. Click to open and restore the full session.",
  "删除后无法恢复。确定要删除此会话吗？": "This cannot be undone. Delete this session?",
  "已重命名": "Renamed",
  "已删除": "Deleted",
  "已取消置顶": "Unpinned",
  "重命名失败": "Rename failed",
  "删除失败": "Delete failed",
  "已切换到 ": "Switched to ",
  "暂无历史会话": "No sessions yet",
  "消息": "msgs",

  // PromptsView
  "搜索 prompt…": "Search prompts…",
  "全部": "All",
  "一键使用": "Use",
  "已填入: ": "Filled: ",
  "收藏": "Favorite",

  // SkillsView
  "搜索 skills…": "Search skills…",
  "用户": "User",
  "项目": "Project",
  "自动": "auto",
  "使用此 Skill": "Use this Skill",
  "来源: ": "Source: ",
  "路径: ": "Path: ",
  "加载失败: ": "Load failed: ",
  "暂未发现 Skills": "No Skills found",
  "无匹配结果": "No matches",
  "关于 Skills": "About Skills",
  "已发现的能力包（Skills）。通过 skill:// 协议或 /skill:<name> 命令使用。": "Discovered capability packs (Skills). Use via skill:// protocol or /skill:<name>.",
  "复制 skill:// 引用": "Copy skill:// reference",
  "关闭详情": "Close detail",

  // Marketplace
  "搜索插件，如 pdf、database、security、browser…": "Search plugins, e.g. pdf, database, security, browser…",
  "搜索并安装插件（Skills、Commands、Agents、MCP 等能力）。": "Search and install plugins (Skills, Commands, Agents, MCP…).",
  "添加源": "Add source",
  "添加市场源": "Add marketplace",
  "市场源:": "Sources:",
  "未添加任何市场源，点击「添加源」添加（如 anthropics/claude-plugins-official）": "No sources added — click \"Add source\" (e.g. anthropics/claude-plugins-official)",
  "已安装 ": "Installed ",
  "个": "",
  "安装": "Install",
  "安装中…": "Installing…",
  "卸载": "Uninstall",
  "卸载中…": "Uninstalling…",
  "已安装: ": "Installed: ",
  "已卸载: ": "Uninstalled: ",
  "安装失败": "Install failed",
  "卸载失败": "Uninstall failed",
  "未找到匹配插件": "No plugins found",
  "先添加市场源，然后搜索。常用市场：anthropics/claude-plugins-official（官方插件市场）": "Add a source first, then search. Common: anthropics/claude-plugins-official",
  "换一个关键词试试，或添加更多市场源。": "Try another keyword or add more sources.",
  "主页": "Home",
  "市场源地址": "Marketplace source",
  "支持格式：GitHub 简写 ": "Formats: GitHub shorthand ",
  "添加失败: ": "Add failed: ",
  "已添加市场源": "Source added",
  "关于 Marketplace": "About Marketplace",

  // PluginsView
  "已启用": "Enabled",
  "已禁用": "Disabled",
  "启用": "Enable",
  "禁用": "Disable",
  "卸载插件": "Uninstall plugin",
  "扩展模块": "Extensions",
  "本地扩展模块": "Local Extensions",
  "暂无已安装插件": "No plugins installed",
  "去 ": "Go to ",
  "页搜索并安装插件。": " to search and install plugins.",
  "什么是插件 vs 扩展模块": "Plugins vs Extensions",
  "范围: ": "Scope: ",
  "确定卸载插件 ": "Uninstall plugin ",
  "吗？": "?",
  "已禁用: ": "Disabled: ",
  "已启用: ": "Enabled: ",
  "操作失败": "Action failed",

  // AgentsView
  "任务代理：在主对话中分派子任务给指定 agent 并行执行。": "Task agents: dispatch subtasks to a named agent from the main conversation.",
  "如何在对话中使用 Agents": "How to use Agents",
  "可用 Agents": "Available Agents",
  "当前会话子代理": "Active Subagents",
  "暂无运行中的子代理": "No active subagents",
  "测试": "Test",
  "测试中…": "Testing…",
  "创建自定义 Agent": "Create Custom Agent",
  "内置": "Built-in",
  "自定义": "Custom",
  "已触发 agent 测试: ": "Agent test triggered: ",
  "用 scout 探索一下这个项目的目录结构": "Use scout to explore this project's structure",
  "让 reviewer 审查我刚改的代码": "Have reviewer review my recent changes",
  "派一个 task 代理去研究 xxx 库的用法": "Send a task agent to research library xxx",

  // ModelsView
  "模型管理": "Model Manager",
  "搜索模型…": "Search models…",
  "设为当前": "Set current",
  "当前": "Current",
  "已切换默认模型: ": "Default model set: ",
  "无匹配模型": "No matching models",
  "成本": "Cost",
  "推理": "Reasoning",

  // SettingsView
  "Agent 设置": "Agent Settings",
  "自动压缩上下文": "Auto-compact context",
  "接近上下文窗口时自动压缩历史": "Automatically compact history near the context limit",
  "Fast Mode": "Fast Mode",
  "快速模式(服务层加速)": "Fast mode (service-tier acceleration)",
  "Steering 模式": "Steering Mode",
  "转向消息队列出队方式": "How queued steering messages dequeue",
  "Follow-up 模式": "Follow-up Mode",
  "后续消息队列出队方式": "How queued follow-up messages dequeue",
  "Interrupt 模式": "Interrupt Mode",
  "工具执行期间的转向打断策略": "Steering interruption policy during tool execution",
  "Reasoning level": "Reasoning level",
  "Provider 配置": "Provider Config",
  "当前 Provider": "Current Provider",
  "已连接": "Connected",
  "未知": "Unknown",
  "Provider 的 API Key、Endpoint、Temperature 等参数由 omp 的配置文件管理": "Provider API keys and settings are managed by omp's config file",
  "修改后需重启 omp 生效。本界面只读展示当前激活的 Provider 信息,避免凭据泄漏到浏览器。": "Restart omp to apply. This UI shows provider info read-only to avoid leaking credentials.",
  "系统信息": "System Info",
  "Agent 行为设置实时生效;Provider 凭据由 omp 配置文件管理。": "Agent behavior applies live; provider credentials are managed by omp's config file.",
  "模型名称": "Model Name",
  "上下文窗口": "Context Window",
  "支持": "Yes",
  "不支持": "No",
  "退出中…": "Signing out…",
  "已开启自动压缩": "Auto-compaction enabled",
  "已关闭自动压缩": "Auto-compaction disabled",
  "已开启 Fast Mode": "Fast Mode enabled",
  "已关闭 Fast Mode": "Fast Mode disabled",
  "已退出登录: ": "Signed out: ",
  "退出失败: ": "Sign out failed: ",
  "登录流程已启动: ": "Sign-in started: ",
  "无可用登录 Provider": "No login providers",
  "确定退出 ": "Sign out of ",
  " 的登录吗？": "?",
  "退出后该 Provider 的 API Key 将从本地删除，模型将不可用。需要重新登录并配置新的 API Key。": "The API key will be removed locally and models become unavailable. Re-sign-in with a new key.",

  // AppearanceView
  "自定义界面主题和视觉风格。切换主题后立即生效。": "Customize the UI theme. Changes apply instantly.",
  "主题": "Theme",
  "关于主题": "About Themes",
  "主题切换立即生效，无需刷新页面": "Themes switch instantly, no reload needed",
  "选择 \"System\" 会自动跟随系统暗色/亮色设置": "\"System\" follows your OS dark/light setting",
  "主题设置会保存在浏览器本地存储中": "Theme choice is saved in browser storage",
  "主题覆盖所有界面元素：侧边栏、消息区、Inspector、终端、代码块、Diff 视图等": "Themes cover all UI: sidebar, messages, Inspector, terminal, code blocks, diffs",
  "Dark": "Dark",
  "Light": "Light",
  "System": "System",
  "Midnight": "Midnight",
  "GitHub Dark": "GitHub Dark",
  "GitHub Light": "GitHub Light",
  "黑色背景 + 白色文字": "Black bg + white text",
  "白色背景 + 黑色文字": "White bg + black text",
  "跟随系统设置": "Follow system",
  "深蓝黑": "Deep blue-black",
  "GitHub 暗色主题": "GitHub dark",
  "GitHub 亮色主题": "GitHub light",
  "界面语言": "Language",
  "中文": "中文 / Chinese",
  "English": "English",
  "选择界面显示语言": "Choose the UI language",
  "语言设置会保存在浏览器本地存储中": "Language choice is saved in browser storage",

  // WorkspacesView / McpView / PageShell
  "当前工作区": "Current Workspace",
  "会话文件": "Session File",
  "Model Context Protocol 服务器管理。": "Model Context Protocol server management.",
  "说明": "Info",
  "由 omp 配置管理": "Managed by omp config",
  "返回": "Back",
  "列表": "List",
  "在线": "Online",
};

const LangCtx = createContext(null);
export const useLang = () => useContext(LangCtx);

// 翻译函数：中文 key → 英文；查不到返回原文
export function useT() {
  const { lang } = useContext(LangCtx);
  return useCallback(
    (zh) => (lang === "en" ? DICT[zh] ?? zh : zh),
    [lang]
  );
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem("omp-lang") || "zh";
    } catch {
      return "zh";
    }
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try {
      localStorage.setItem("omp-lang", l);
    } catch { /* ignore */ }
  }, []);

  // 应用 lang 属性到根元素（供 CSS 可选使用）
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: (zh) => (lang === "en" ? DICT[zh] ?? zh : zh) }), [lang, setLang]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
