// omp-web 前端全局状态:连接、消息、工具执行、弹窗、视图。
import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { api } from "./api";

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
};

function pushToast(list, text, kind = "") {
  const id = Date.now() + Math.random().toString(36).slice(2, 6);
  const arr = [...list, { id, text, kind }];
  return { arr, id };
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
        // 流式结束/开始由 agent_start/agent_end 控制,但 state 里也有 isStreaming
        msgs: syncStreaming(s.msgs, st?.isStreaming),
      };
    }
    case "models": return { ...s, models: a.models };
    case "session_info": return { ...s, sessionInfo: a.info };
    case "msg_start": {
      // 新 assistant 消息(忽略 user 回显,用户消息已本地渲染)
      const msg = a.message;
      if (!msg || msg.role === "user") return s;
      const card = {
        role: "assistant",
        blocks: [...(msg?.content ?? [])],
        meta: { api: msg?.api, provider: msg?.provider, model: msg?.model, usage: msg?.usage, stopReason: msg?.stopReason },
        status: "streaming",
        msgId: msg?.id ?? `m${Date.now()}`,
      };
      return { ...s, msgs: [...s.msgs, card] };
    }
    case "msg_update": {
      // 用全量快照重建最后一张 assistant 卡片
      const partial = a.partial ?? a.message;
      if (!partial) return s;
      const msgs = [...s.msgs];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant" || last.status !== "streaming") {
        msgs.push({ role: "assistant", blocks: [], meta: {}, status: "streaming", msgId: `m${Date.now()}` });
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
      if (last && last.role === "assistant" && last.status === "streaming") {
        last.status = "done";
        const m = a.message;
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
    case "user_msg": {
      const card = {
        role: "user",
        blocks: [{ type: "text", text: a.text }],
        meta: { ts: Date.now() },
        status: "done",
        msgId: `u${Date.now()}`,
      };
      return { ...s, msgs: [...s.msgs, card] };
    }
    case "dialog": {
      if (!a.dialog) return { ...s, dialog: null };
      return { ...s, dialogStack: [...s.dialogStack, a.dialog], dialog: a.dialog };
    }
    case "dialog_close": {
      const stack = s.dialogStack.slice(0, -1);
      return { ...s, dialogStack: stack, dialog: stack.length ? stack[stack.length - 1] : null };
    }
    case "view": return { ...s, view: a.view };
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
      return;
    case "agent_end":
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
    const sendPrompt = async (text, images) => {
      const r = await api.prompt(text, images);
      if (r?.ok) {
        dispatch({ type: "user_msg", text });
        return true;
      }
      showToast(`发送失败: ${r?.error ?? "未知错误"}`, "bad");
      return false;
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
      loadSessions: async () => {
        const r = await api.sessions();
        return r?.ok ? r.sessions ?? [] : [];
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
    api.state().then((r) => {
      if (r?.ok) dispatch({ type: "state", state: r.state });
    }).catch(() => {});
    // 全局错误:EventSource 状态
    return () => { if (es) { try { es.close(); } catch {} es = null; } };
  }, [actions]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
