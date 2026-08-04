// omp-web 前端全局状态:连接、消息、工具执行、弹窗、视图。
import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { api } from "./api";
import { splitByHeadings } from "./md";

// 消息 id 生成：用全局递增序号（Date.now() 毫秒精度在批量 dispatch/回放时
// 会撞 key → React 复用 DOM → 消息被“顶掉”/错乱）
let msgSeq = 0;
const nextMsgId = (prefix) => `${prefix}${++msgSeq}`;

export const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"];
export const VIEWS = [
  { id: "chat", label: "对话" },
  { id: "sessions", label: "聊天记录" },
  { id: "prompts", label: "Prompt 库" },
  { id: "skills", label: "Skills" },
  { id: "marketplace", label: "Marketplace" },
  { id: "workspaces", label: "工作区" },
  { id: "mcp", label: "MCP 服务器" },
  { id: "agents", label: "Agents" },
  { id: "plugins", label: "插件" },
  { id: "models", label: "模型" },
  { id: "settings", label: "设置" },
  { id: "appearance", label: "外观" },
];

const initial = {
  conn: "connecting", // connecting | running | exited | error
  connError: null,
  childLog: [], // 最近 stderr 日志(环形)
  state: null, // get_state 快照
  models: [],
  loginInfo: [], // provider 登录状态 [{id, authenticated, ...}]
  msgs: [], // 消息卡片 {role, blocks, meta, status}
  tools: new Map(), // toolCallId -> {toolName, intent, args, status, output, isError}
  dialog: null, // extension UI 弹窗
  dialogStack: [],
  view: "chat",
  inspector: true,
  inspectorTab: "context",
  sidebarOpen: true, // 桌面端左侧栏
  sessionInfo: null, // 会话统计
  toasts: [],
  flowMode: (typeof localStorage !== "undefined" && localStorage.getItem("omp-flow-mode")) || "steps", // 流程总结方式: steps | ai | both
  historyDrawer: false, // 左侧历史问题抽屉
  scrollTarget: null, // 消息定位信号 { msgId, seq }
  isStreaming: false, // 由 agent_start/agent_end 事件驱动（state 帧可能滞后，尤其带图消息要先分析图片）
};

function pushToast(list, text, kind = "") {
  const id = Date.now() + Math.random().toString(36).slice(2, 6);
  const arr = [...list, { id, text, kind }];
  return { arr, id };
}

// 聚合一轮 turn 内所有 assistant 消息的“流程”：文本节标题（结构/结论）+ 工具调用（执行步骤）
function buildFlow(msgs, tools) {
  const steps = [];
  for (const m of msgs) {
    if (!m || m.role === "user") continue;
    for (const b of m.blocks ?? []) {
      if (b.type === "toolCall") {
        const t = tools.get(b.id);
        steps.push({ kind: "tool", name: b.name ?? t?.toolName ?? "tool", intent: t?.intent ?? "" });
      } else if (b.type === "text" && b.text) {
        for (const sec of splitByHeadings(b.text)) {
          if (sec.title) steps.push({ kind: "text", title: sec.title });
        }
      }
    }
  }
  return steps.length ? { steps } : null;
}

function reducer(s, a) {
  switch (a.type) {
    case "conn": return { ...s, conn: a.status, connError: a.error ?? null };
    case "child_log": {
      const line = a.text.trim();
      if (!line) return s;
      const arr = [...s.childLog, { id: Date.now() + Math.random().toString(36).slice(2, 6), text: line }];
      return { ...s, childLog: arr.slice(-200) };
    }
    case "state": {
      const st = a.state;
      return {
        ...s,
        state: st,
        isStreaming: !!st?.isStreaming,
        // 流式结束/开始由 agent_start/agent_end 控制,但 state 里也有 isStreaming
        msgs: syncStreaming(s.msgs, st?.isStreaming),
      };
    }
    case "models": return { ...s, models: a.models };
    case "login_info": return { ...s, loginInfo: a.providers ?? [] };
    case "session_info": return { ...s, sessionInfo: a.info };
    case "msg_start": {
      // 新 assistant 消息(忽略 user 回显,用户消息已本地渲染)
      const msg = a.message;
      if (!msg || msg.role === "user") return s;
      const msgs = [...s.msgs];
      // 真实回复开始：此刻才移除“图片分析中”占位卡，保证发送图片后占位卡一直可见到首 token
      if (msgs.length && msgs[msgs.length - 1].status === "analyzing") msgs.pop();
      const card = {
        role: "assistant",
        blocks: [...(msg?.content ?? [])],
        meta: { api: msg?.api, provider: msg?.provider, model: msg?.model, usage: msg?.usage, stopReason: msg?.stopReason },
        status: "streaming",
        msgId: msg?.id ?? nextMsgId("m"),
      };
      return { ...s, msgs: [...msgs, card] };
    }
    case "msg_update": {
      // 用全量快照重建最后一张 assistant 卡片
      const partial = a.partial ?? a.message;
      if (!partial) return s;
      // user 回显帧不参与 assistant 消息渲染（防御：绝不覆盖最后一条回复）
      if (a.message && a.message.role === "user") return s;
      const msgs = [...s.msgs];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant" || last.status !== "streaming") {
        msgs.push({ role: "assistant", blocks: [], meta: {}, status: "streaming", msgId: nextMsgId("m") });
      }
      const card = msgs[msgs.length - 1];
      card.blocks = [...(partial.content ?? [])];
      card.meta = {
        api: partial.api ?? card.meta?.api,
        provider: partial.provider ?? card.meta?.provider,
        model: partial.model ?? card.meta?.model,
        usage: partial.usage ?? card.meta?.usage,
        stopReason: partial.stopReason ?? card.meta?.stopReason,
        responseId: partial.responseId,
      };
      return { ...s, msgs };
    }
    case "msg_end": {
      const msgs = [...s.msgs];
      const last = msgs[msgs.length - 1];
      const m = a.message;
      // omp 会回显用户消息的 message_start/message_end（role=user）。
      // 绝不能拿 user 帧的内容覆盖最后一条 assistant 回复（否则“回复变成我发的消息”）。
      // 若最后一条 assistant 还在流式（被新消息打断），标记完成但保留其已有内容。
      if (m && m.role === "user") {
        if (last && last.role === "assistant" && last.status === "streaming") {
          const arr = [...msgs];
          arr[arr.length - 1] = { ...last, status: "done" };
          return { ...s, msgs: arr };
        }
        return s;
      }
      if (last && last.role === "assistant" && last.status === "streaming") {
        last.status = "done";
        if (m) {
          last.blocks = [...(m.content ?? last.blocks)];
          last.meta = {
            ...last.meta,
            api: m.api ?? last.meta.api,
            provider: m.provider ?? last.meta.provider,
            model: m.model ?? last.meta.model,
            usage: m.usage ?? last.meta.usage,
            stopReason: m.stopReason ?? last.meta.stopReason,
          };
        }
      }
      return { ...s, msgs };
    }
    case "msg_fail": {
      // 消息以错误结束
      const msgs = [...s.msgs];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && last.status === "streaming") {
        last.status = "error";
        last.error = a.error;
      }
      return { ...s, msgs };
    }
    case "tool_start": {
      const tools = new Map(s.tools);
      tools.set(a.callId, {
        toolName: a.toolName,
        intent: a.intent ?? "",
        args: a.args ?? {},
        status: "running",
        output: "",
        isError: false,
      });
      return { ...s, tools };
    }
    case "tool_update": {
      const tools = new Map(s.tools);
      const t = tools.get(a.callId);
      if (!t) return s;
      if (a.partial != null) t.output = a.partial;
      if (a.status) t.status = a.status;
      tools.set(a.callId, t);
      return { ...s, tools };
    }
    case "tool_end": {
      const tools = new Map(s.tools);
      const t = tools.get(a.callId);
      if (!t) return s;
      t.status = a.isError ? "error" : "success";
      t.isError = !!a.isError;
      if (a.result != null) t.output = a.result;
      tools.set(a.callId, t);
      return { ...s, tools };
    }
    case "agent_start":
      // 标记 turn 起点：下一条 assistant 消息从 s.msgs.length 开始属于本 turn；
      // “图片分析中”占位卡保留到真实消息出现(msg_start 时再移除)，保证发送图片后有即时反馈；置流式态
      {
        const msgs = [...s.msgs];
        // 占位卡仍在最后一条时，turn 起点应指向占位卡之后（新消息将替换占位卡位置）
        let idx = msgs.length;
        if (msgs.length && msgs[msgs.length - 1].status === "analyzing") idx = msgs.length - 1;
        return { ...s, turnStartMsgIdx: idx, isStreaming: true };
      }
    case "agent_end": {
      // turn 结束：把 turn 内多条 assistant 消息（工具循环拆出的 thinking/工具/文本）合并成一条回答，
      // 再聚合流程摘要挂上去。用户消息（打断）保留原位。
      const msgs = [...s.msgs];
      const fromIdx = s.turnStartMsgIdx ?? 0;
      const flow = buildFlow(msgs.slice(fromIdx), s.tools);
      const turnMsgs = msgs.slice(fromIdx);
      const assistantCount = turnMsgs.filter((m) => m.role === "assistant").length;
      if (assistantCount > 1) {
        const merged = [];
        let lastAssistant = null;
        for (const m of turnMsgs) {
          if (m.role === "assistant") {
            if (!lastAssistant) {
              lastAssistant = { ...m };
              merged.push(lastAssistant);
            } else {
              lastAssistant.blocks = [...(lastAssistant.blocks ?? []), ...(m.blocks ?? [])];
              lastAssistant.meta = m.meta ?? lastAssistant.meta;
            }
          } else {
            merged.push(m); // user 消息保留
          }
        }
        const mergedMsgs = [...msgs.slice(0, fromIdx), ...merged];
        const last = mergedMsgs[mergedMsgs.length - 1];
        if (last && last.role === "assistant") {
          if (flow) last.flow = flow;
          last.turnDone = true;
          last.status = "done";
        }
        return { ...s, msgs: mergedMsgs, turnStartMsgIdx: null, isStreaming: false };
      }
      // 单条 assistant：原逻辑
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        if (flow) last.flow = flow;
        last.turnDone = true;
      }
      return { ...s, msgs, turnStartMsgIdx: null, isStreaming: false };
    }
    case "analyzing_msg": {
      // 图片分析中占位卡（server 后台调 mimo 分析，稍后真实回复）
      const msgs = [...s.msgs];
      const last = msgs[msgs.length - 1];
      if (last && last.status === "analyzing") return s;
      msgs.push({ role: "assistant", blocks: [], meta: {}, status: "analyzing", msgId: nextMsgId("a") });
      return { ...s, msgs };
    }
    case "analyzing_clear": {
      const msgs = [...s.msgs];
      if (msgs.length && msgs[msgs.length - 1].status === "analyzing") msgs.pop();
      return { ...s, msgs };
    }
    case "user_msg": {
      const card = {
        role: "user",
        blocks: [{ type: "text", text: a.text }],
        meta: { ts: Date.now() },
        status: "done",
        msgId: nextMsgId("u"),
      };
      if (a.images?.length) card.images = a.images;
      if (a.attachments?.length) card.attachments = a.attachments;
      return { ...s, msgs: [...s.msgs, card] };
    }
    case "dialog": {
      if (!a.dialog) return { ...s, dialog: null };
      // FIFO:已有弹窗展示时新弹窗排队;否则直接展示。
      // 顺序很重要:omp 登录时先发 open_url(授权页)再发 input(填 key),必须按序出现。
      if (s.dialog) return { ...s, dialogStack: [...s.dialogStack, a.dialog] };
      return { ...s, dialog: a.dialog };
    }
    case "dialog_close": {
      if (!s.dialogStack.length) return { ...s, dialog: null };
      return { ...s, dialog: s.dialogStack[0], dialogStack: s.dialogStack.slice(1) };
    }
    case "view": return { ...s, view: a.view };
    case "flow_mode": return { ...s, flowMode: a.mode };
    case "history_drawer": return { ...s, historyDrawer: !!a.open };
    case "scroll_to": return { ...s, scrollTarget: { msgId: a.msgId, seq: (s.scrollTarget?.seq ?? 0) + 1 } };
    case "inspector": return { ...s, inspector: a.open };
    case "inspector_tab": return { ...s, inspectorTab: a.tab };
    case "sidebar": return { ...s, sidebarOpen: a.open };
    case "clear_msgs": return { ...s, msgs: [], tools: new Map() };
    case "toast": {
      const { arr, id } = pushToast(s.toasts, a.text, a.kind);
      return { ...s, toasts: arr };
    }
    case "toast_rm": return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    default: return s;
  }
}

// 根据 isStreaming 修正消息流式状态(冗余保险)
function syncStreaming(msgs, streaming) {
  if (!msgs.length) return msgs;
  const last = msgs[msgs.length - 1];
  if (last.role !== "assistant") return msgs;
  if (streaming && last.status === "done") {
    const arr = [...msgs];
    arr[arr.length - 1] = { ...last, status: "streaming" };
    return arr;
  }
  if (!streaming && last.status === "streaming") {
    const arr = [...msgs];
    arr[arr.length - 1] = { ...last, status: "done" };
    return arr;
  }
  return msgs;
}

// ---------- SSE 连接 ----------
let es = null;
function connect(dispatch, getState) {
  if (es) {
    try { es.close(); } catch {}
    es = null;
  }
  const src = new EventSource("/api/events");
  es = src;
  src.onopen = () => dispatch({ type: "conn", status: "running" });
  src.onerror = () => {
    // EventSource 自动重连
  };
  src.onmessage = (e) => {
    let frame;
    try { frame = JSON.parse(e.data); } catch { return; }
    handleFrame(frame, dispatch, getState);
  };
}

function handleFrame(f, dispatch, getState) {
  switch (f.type) {
    case "state":
      dispatch({ type: "state", state: f.data });
      return;
    case "child_status":
      dispatch({ type: "conn", status: f.status === "running" ? "running" : f.status === "starting" ? "connecting" : f.status, error: f.error });
      return;
    case "child_stderr":
      dispatch({ type: "child_log", text: f.text });
      return;
    case "agent_start":
      dispatch({ type: "agent_start" });
      return;
    case "agent_end":
      dispatch({ type: "agent_end" });
      return;
    case "message_start":
      dispatch({ type: "msg_start", message: f.message });
      return;
    case "message_update": {
      const evt = f.assistantMessageEvent;
      const partial = evt?.partial ?? null;
      dispatch({ type: "msg_update", partial, message: f.message });
      return;
    }
    case "message_end":
      dispatch({ type: "msg_end", message: f.message });
      return;
    case "tool_execution_start": {
      const d = f.data ?? f;
      dispatch({ type: "tool_start", callId: d.toolCallId, toolName: d.toolName, intent: d.intent, args: d.args });
      return;
    }
    case "tool_execution_update": {
      const d = f.data ?? f;
      const partial = extractText(d.partialResult);
      dispatch({ type: "tool_update", callId: d.toolCallId, partial });
      return;
    }
    case "tool_execution_end": {
      const d = f.data ?? f;
      dispatch({ type: "tool_end", callId: d.toolCallId, result: extractText(d.result), isError: d.isError });
      return;
    }
    case "extension_ui_request": {
      if (["select", "confirm", "input", "editor", "notify"].includes(f.method)) {
        dispatch({ type: "dialog", dialog: { id: f.id, method: f.method, title: f.title, message: f.message, options: f.options, placeholder: f.placeholder, defaultValue: f.defaultValue, timeout: f.timeout } });
      } else if (f.method === "open_url") {
        // 登录/授权:omp 请求打开授权页。展示指引 + 链接,并提供打开/复制。
        dispatch({ type: "dialog", dialog: { id: f.id, method: "open_url", title: f.title, url: f.url, launchUrl: f.launchUrl, instructions: f.instructions, timeout: f.timeout } });
      }
      return;
    }
    case "session_info_update":
      if (f.info) dispatch({ type: "session_info", info: f.info });
      return;
    case "turn_start":
    case "turn_end":
    case "auto_compaction_start":
    case "auto_compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
    case "todo_reminder":
    case "todo_auto_clear":
    case "subagent_lifecycle":
    case "subagent_progress":
    case "subagent_event":
    case "prompt_result":
    case "command_output":
    case "config_update":
      return;
    default:
      // 未知帧忽略
      return;
  }
}

function extractText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && typeof c === "object" && "text" in c ? c.text : "")).join("\n");
  }
  if (typeof content === "object" && "text" in content) return content.text;
  return "";
}

// ---------- Context ----------
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  // toast 助手：由 Toasts 组件统一在 2.5s 后自动移除
  const showToast = (text, kind = "") => {
    dispatch({ type: "toast", text, kind });
  };

  const actions = useMemo(() => {
    const sendPrompt = async (text, images, attachments) => {
      // 先立即显示用户消息（含图片/文件），不等后端，避免卡顿感
      dispatch({ type: "user_msg", text, images, attachments });
      // 有图片时显示“图片分析中”占位卡（server 后台调 mimo 分析，稍后回复）
      if (images?.length) {
        dispatch({ type: "analyzing_msg" });
        // 占位卡最短展示时间：即使模型立刻回复，也让用户先看到“图片分析中”的即时反馈
        await new Promise((r) => setTimeout(r, 600));
      }
      const r = await api.prompt(text, images);
      if (!r?.ok) {
        dispatch({ type: "analyzing_clear" });
        showToast(`发送失败: ${r?.error ?? "未知错误"}`, "bad");
        return false;
      }
      return true;
    };
    return {
      dispatch,
      sendPrompt,
      abort: () => api.abort().catch(() => {}),
      steer: async (text) => {
        const r = await api.steer(text);
        return r?.ok ?? false;
      },
      newSession: async () => {
        const r = await api.newSession();
        if (r?.ok) dispatch({ type: "clear_msgs" });
        return r?.ok ?? false;
      },
      setModel: (provider, modelId) => api.setModel(provider, modelId),
      setThinking: (level) => api.setThinking(level),
      setFastMode: (enabled) => api.setFastMode(enabled),
      setAutoCompaction: (enabled) => api.setAutoCompaction(enabled),
      setAutoRetry: (enabled) => api.setAutoRetry(enabled),
      setSteeringMode: (mode) => api.setSteeringMode(mode),
      setFollowUpMode: (mode) => api.setFollowUpMode(mode),
      setInterruptMode: (mode) => api.setInterruptMode(mode),
      uiResponse: (id, payload) => api.uiResponse(id, payload),
      toast: showToast,
      rmToast: (id) => dispatch({ type: "toast_rm", id }),
      refreshModels: async () => {
        const r = await api.models();
        if (r?.ok) dispatch({ type: "models", models: r.models ?? [] });
      },
      refreshLoginInfo: async () => {
        const r = await api.loginProviders();
        if (r?.ok) dispatch({ type: "login_info", providers: r.providers ?? [] });
      },
      loadSessions: async () => {
        const r = await api.sessions();
        return r?.ok ? r.sessions ?? [] : [];
      },
      refreshAll: async () => {
        // 手动刷新:重新拉取状态/模型/登录信息
        api.state().then((r) => { if (r?.ok) dispatch({ type: "state", state: r.state }); }).catch(() => {});
        const r = await api.models();
        if (r?.ok) dispatch({ type: "models", models: r.models ?? [] });
        const l = await api.loginProviders();
        if (l?.ok) dispatch({ type: "login_info", providers: l.providers ?? [] });
        return true;
      },
      switchSession: async (path) => {
        const r = await api.switchSession(path);
        if (r?.ok) {
          dispatch({ type: "clear_msgs" });
          // 加载历史消息
          try {
            const msgs = await api.getMessages(path);
            if (msgs?.ok && msgs.messages) {
              for (const msg of msgs.messages) {
                if (msg.role === "user") {
                  dispatch({ type: "user_msg", text: msg.content?.[0]?.text ?? "" });
                } else if (msg.role === "assistant") {
                  dispatch({ type: "msg_start", message: msg });
                  dispatch({ type: "msg_end", message: msg });
                }
              }
            }
          } catch {
            /* 忽略历史加载失败 */
          }
        }
        return r?.ok ?? false;
      },
      createSession: async (payload) => {
        const r = await api.createSession(payload);
        if (r?.ok) {
          dispatch({ type: "clear_msgs" });
          // 拉取最新 state（新会话名、工作目录）
          try {
            const st = await api.state();
            if (st?.ok) dispatch({ type: "state", state: st.state });
          } catch { /* 忽略 */ }
        }
        return r;
      },
      getMessages: async (path) => {
        const r = await api.getMessages(path);
        return r?.ok ? r.messages ?? [] : [];
      },
      getSessionDetail: async (path) => {
        const r = await api.getSessionDetail(path);
        return r?.ok ? r.detail : null;
      },
      renameSession: async (path, name) => {
        const r = await api.renameSession(path, name);
        return r?.ok ?? false;
      },
      deleteSession: async (path) => {
        const r = await api.deleteSession(path);
        return r?.ok ?? false;
      },
      pinSession: async (path, pinned) => {
        const r = await api.pinSession(path, pinned);
        return r?.ok ?? false;
      },
      loadSkills: async () => {
        const r = await api.skills();
        return r?.ok ? r.skills ?? [] : [];
      },
      getSkillContent: async (name) => {
        const r = await api.skillContent(name);
        return r?.ok ? r.skill : null;
      },
      loadMarketplaces: async () => {
        const r = await api.marketplaces();
        return r?.ok ? r.marketplaces ?? [] : [];
      },
      loadInstalledPlugins: async () => {
        const r = await api.installedPlugins();
        return r?.ok ? r.plugins ?? {} : {};
      },
      loadPluginsDetail: async () => {
        const r = await api.pluginsDetail();
        return r?.ok ? r.plugins ?? [] : [];
      },
      pluginSetEnabled: async (key, enabled) => {
        const r = await api.pluginSetEnabled(key, enabled);
        return r?.ok ?? false;
      },
      installPlugin: async (name, marketplace, scope) => {
        const r = await api.installPlugin(name, marketplace, scope);
        return r?.ok ?? false;
      },
      uninstallPlugin: async (name, marketplace, scope) => {
        const r = await api.uninstallPlugin(name, marketplace, scope);
        return r?.ok ?? false;
      },
      discoverMarketplace: async (marketplace) => {
        const r = await api.discoverMarketplace(marketplace);
        return r?.ok ? r.plugins ?? [] : [];
      },
      searchPlugins: async (query) => {
        const r = await api.searchPlugins(query);
        return r?.ok ? r.plugins ?? [] : [];
      },
    };
  }, []);

  useEffect(() => {
    connect(dispatch, stateRef);
    actions.refreshModels();
    actions.refreshLoginInfo();
    api.state().then((r) => {
      if (r?.ok) dispatch({ type: "state", state: r.state });
    }).catch(() => {});
    // 全局错误:EventSource 状态
    return () => { if (es) { try { es.close(); } catch {} es = null; } };
  }, [actions]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
