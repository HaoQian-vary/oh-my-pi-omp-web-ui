# omp-web

A local web UI for the [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) coding agent. Don't like the terminal? Use a browser instead.

## Why this project exists

**omp is an incredibly powerful terminal-based AI coding agent — but it assumes you live in the command line.**

We built this web UI for everyone who finds terminals intimidating: people who are new to coding, who aren't comfortable with command-line tools, or who simply prefer a visual, mouse-driven interface. With `omp-web` you get:

- **No terminal required** — everything from chatting to managing models, sessions, and plugins happens in the browser
- **Instant visibility** — see streaming output, thinking blocks, tool calls, token usage, and costs rendered visually instead of raw text scrolling by
- **One-click setup** — double-click `start.bat` on Windows and you're in; no command-line incantations
- **Everything at a glance** — model switching, thinking levels, working folders, session history, plugin marketplace, all in a familiar web layout

Think of it as giving omp a friendly face: all the power underneath, none of the terminal friction.

> omp is an MIT-licensed open-source AI coding agent ([github.com/can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)) — the core engine this project depends on. This UI is an independent web frontend that drives omp through its RPC protocol.


## License

This project is fully open source under the **MIT License** — see [LICENSE](LICENSE).

## Table of Contents

- [Why this project exists](#why-this-project-exists)
- [Features](#features)
- [Architecture](#architecture)
- [Install & Usage](#install--usage)
- [UI Overview](#ui-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Protocol Notes](#protocol-notes)
- [Development](#development)
- [Known Limitations](#known-limitations)

---

## Features

### Core Chat

- **Streaming rendering**: tokens stream in live, collapsible thinking blocks, tool calls shown as terminal-style cards with real-time output
- **GitHub-style diff viewer**: ` ```diff ` blocks auto-highlight (+green / -red)
- **Message metadata**: model, token usage, and cost per reply
- **Interjection (steering)**: type while the AI is replying to pause output and redirect with your new instruction
- **Abort**: red "Stop" button or Esc to terminate the current reply anytime
- **Adaptive thinking level**: dropdown only shows levels the current model supports (e.g. deepseek: high/max only; gpt-4: disabled since it doesn't support thinking)
- **Image upload**: paste, drag-drop, or click to attach images with messages

### Session Management

- **New session**: optional name + working folder (folder browser with drive/directory navigation)
- **Workspace switching**: each session binds an independent workspace; the model works in the selected directory (restarts omp to take effect)
- **History**: searchable, grouped by date (Today / Yesterday / Last 7 Days / Earlier), sortable by time or name
- **Full replay**: opening a session restores all messages (user/assistant/tool calls/thinking/cost) — continue, not restart
- **Session ops**: rename, pin, delete (with confirmation), hover shortcuts
- **Persistent names**: custom names show in the top bar and history

### Extensibility

- **Marketplace**: cross-market search for plugins (by name/description/keywords), one-click install/uninstall, add sources (GitHub shorthand / Git URL / local dir / JSON URL)
- **Skills**: discover installed capability packs (user `~/.omp/agent/skills/`, project `.omp/skills/`), view content, copy `skill://` references, use in one click
- **Plugin manager**: installed plugins with enable/disable/uninstall, capability badges (skills/agents/commands/MCP/extensions), local extension modules
- **Agents**: built-in/custom task agents with usage guide and authoring tutorial, testable
- **Model manager**: 120+ models, filter by provider, search, switch current model

### Settings & Appearance

Everything visual and behavioral is configurable from the UI — no config file editing required:

- **Model switching**: pick your model from the top bar dropdown (grouped by provider, shows context window), or manage the full 120+ model list in **Models** (filter by provider, search, set current)
- **Appearance**: switch themes anytime in **Settings → Appearance** — Dark / Light / System / Midnight / GitHub Dark / GitHub Light, CSS-variable driven, instant, persisted across restarts
- **Provider auth**: manage your model credentials from **Settings → Login** — no config file editing
  - **Login**: click **Login** next to a provider (e.g. DeepSeek, Zhipu, Xiaomi) and follow the omp authentication flow; the API key is stored in `~/.omp/agent/agent.db` (your home directory, never in this project)
  - **Logout**: click **Logout** on a provider to delete its local API key — useful when you want to swap keys (e.g. after rotating/revoking one in the provider console). A confirmation dialog appears before deletion; the omp process restarts automatically to refresh credential state
  - **Re-login**: after logout, the provider shows as unauthenticated; click **Login** again and enter the new API key
  - **Note**: a logged-out provider's models become unavailable until you log back in
- **Agent behavior**: auto-compaction, fast mode, queue modes, thinking level — apply live

### Other

- Extension UI dialogs (confirm / input / select / editor / notify) auto-forwarded to browser modals
- Multi-tab status bar: context usage bar, token rate, session info
- Binds 127.0.0.1 only — never exposed to LAN/public

---

## Architecture

```
Browser UI (web/src)  ⇄  HTTP/SSE  ⇄  server.mjs  ⇄  omp --mode rpc  ⇄  (Model API)
```

- **server.mjs** (Node.js): spawns `omp --mode rpc`, bridges its JSONL protocol into browser-friendly SSE events + HTTP API; also serves the built frontend and manages sessions/plugins/credentials
- **web/src** (React): pure frontend consuming the event stream via EventSource

### Backend Responsibilities

| Responsibility | Description |
|---|---|
| RPC bridge | `omp --mode rpc` stdio ↔ SSE + HTTP |
| Static hosting | Serves Vite build output (web/dist) |
| Sessions | create/switch/rename/pin/delete, history replay |
| Workspace | restarts the omp child with a new cwd |
| Ecosystem | marketplace search/install, plugin toggle, skills/agents/extension discovery |
| Credentials | login status, logout (removes local agent.db credential) |
| Directory browser | folder picker backend (drives/dirs/parent) |

---

## Install & Usage

### Requirements

- **Node.js ≥ 20**
- **omp** (required, the engine): `omp --mode rpc` must work with model credentials configured

### Windows One-Click

Double-click `start.bat`. It checks the environment, cleans the port, installs deps (first run), builds the frontend, opens the browser, and starts the server.

If omp is missing, it shows install instructions:

```
Windows (PowerShell):  irm https://omp.sh/install.ps1 | iex
macOS / Linux:            curl -fsSL https://omp.sh/install | sh
Homebrew:                 brew install can1357/tap/omp
Bun:                      bun install -g @oh-my-pi/pi-coding-agent
```

### Manual

```bash
npm install          # first run
npm run build        # build frontend to web/dist
node server.mjs      # default port 3838
```

Options:

```bash
node server.mjs --port 8080          # change port
node server.mjs --cwd D:/work        # set omp working dir (sessions live here)
node server.mjs --omp /path/to/omp   # custom omp binary
```

### Dev Mode (HMR)

```bash
npm run dev          # Vite dev server :5173, proxies /api to 3838
node server.mjs      # run backend in another terminal
```

Open http://127.0.0.1:3838 (prod) or http://127.0.0.1:5173 (dev).

---

## UI Overview

Three-column layout (design language inspired by OpenAI Codex / Cursor):

```
┌──────────┬─────────────────────────────┬──────────┐
│ Sidebar  │  Workspace                  │ Inspector│
│  · Logo  │  · session name  workdir    │ · Context│
│  · New   │  · [Model▼] [Thinking▼] Idle│ · Files  │
│  · Nav   │  · message stream           │ · Logs   │
│  · bottom│  · composer (interject/stop)│ · Tasks  │
│  Provider│                             │ · Tools  │
│  Model   │                             │          │
└──────────┴─────────────────────────────┴──────────┘
```

- **Left Sidebar**: new session, navigation (History / Prompts / Skills / Marketplace / Workspaces / MCP / Agents / Plugins / Models / Settings), footer shows Provider / Model / Context usage
- **Center Workspace**: top bar (session name, working dir, model switch, thinking level, agent status, context bar) + message stream + composer
- **Right Inspector**: Context / Files / Logs / Tasks / Tools panels with real session data

### Navigation Pages

| Page | Purpose |
|---|---|
| Chat | main conversation |
| History | search/group/rename/pin/delete sessions, full replay |
| Prompts | prompt templates, one-click fill |
| Skills | discovered capability packs, view/copy/use |
| Marketplace | search plugins, install/uninstall, add sources |
| Workspaces | current working dir & session storage |
| MCP Servers | info page (managed by omp config) |
| Agents | task agents + usage guide + authoring tutorial |
| Plugins | manage installed plugins: toggle/uninstall/capabilities/extensions |
| Models | model list: filter/search/switch |
| Settings | agent behavior + provider auth + appearance |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | TailwindCSS 3 + CSS variable theme system |
| Rendering | marked (Markdown) + hand-rolled diff parser |
| Icons | inline SVG (zero deps) |
| Backend | Node.js ≥ 20 (native http, zero frameworks) |
| DB access | node:sqlite (credentials, built into Node 22) |
| State | React Context + useReducer (no Redux) |
| Transport | EventSource (SSE) + fetch (HTTP) |

---

## Project Structure

```
├── server.mjs          # Node backend: RPC bridge + static hosting + session/plugin/credential APIs
├── start.bat           # Windows one-click launcher
├── vite.config.mjs     # Vite config
├── tailwind.config.js  # Tailwind config (colors reference CSS vars)
├── package.json
└── web/
    ├── index.html      # Vite entry
    └── src/
        ├── main.jsx    # React entry
        ├── App.jsx     # three-column layout + ThemeProvider
        ├── store.jsx   # global state (useReducer) + SSE event machine
        ├── api.js      # HTTP API wrapper
        ├── ThemeProvider.jsx  # theme state + localStorage persistence
        ├── md.jsx      # Markdown + Diff rendering
        ├── icons.jsx   # inline SVG icon set
        ├── format.js   # formatting helpers
        ├── index.css   # theme variables + component styles
        ├── components/ # Sidebar/Topbar/MessageList/Composer/Inspector/...
        └── views/      # pages (Sessions/Marketplace/Plugins/Agents/...)
```

---

## Protocol Notes

Full protocol: `omp://rpc.md` (built-in omp docs). Core event shapes verified in practice:

- `message_start` / `message_update` / `message_end`, content block types: `text` / `thinking` / `toolCall` / `toolResult`
- `message_update`'s `assistantMessageEvent.partial` carries the full message snapshot (render whole, don't stitch deltas)
- `tool_execution_start/update/end`: **fields at frame top level** (`toolCallId` / `toolName` / `args` / `partialResult` / `result` / `isError`), not under `data`
- Streaming deltas: `assistantMessageEvent.type` = `text_delta` / `thinking_delta` etc.
- Model metadata: `get_available_models` returns `thinking.efforts` (basis for adaptive thinking level)
- Credentials: `get_login_providers` returns `authenticated`; logout deletes the local `agent.db` credential (RPC has no logout command)

---

## Development

### Adding a Page

1. Create the component in `web/src/views/`
2. Add the view id to `VIEWS` in `store.jsx`
3. Add the render branch in `Workspace.jsx`
4. For backend data: add an API in `server.mjs`, wrap it in `api.js`

### Theme System

- `index.css` defines CSS variables (`--color-*`) at top; each `[data-theme="xxx"]` overrides them
- `tailwind.config.js` colors all reference CSS vars (`bg: "var(--color-bg)"`)
- Avoid hardcoded colors in components — use CSS vars or themed classes

### Commands

```bash
npm run build    # production build
npm run dev      # dev HMR
npm start        # run backend
```

---

## Known Limitations

- Switching working dirs restarts the omp child (~seconds), interrupting any active conversation
- Plugin enable/disable takes effect after restart
- The collapsible thinking block only shows when the model emits a standalone thinking block (protocol supports it; depends on the model)
- History replay excludes nested subagent transcripts (main-thread messages only)
- File upload supports images only (protocol only supports images)

---

# omp-web

给 [Oh My Pi](https://github.com/can1357/oh-my-pi)（omp）编码代理打造的本地 Web 界面。终端里用 omp 不方便？打开浏览器就能用。

## 项目初衷

**omp 是一个极其强大的终端型 AI 编码代理——但它默认使用者熟悉命令行。**

我们打造这个 Web 界面，是为了那些不习惯控制台的人：刚入门编程的新手、不熟悉命令行工具的用户，或者只是更喜欢可视化、鼠标操作界面的朋友。使用 `omp-web` 你可以：

- **无需终端**——从聊天到模型、会话、插件管理，全部在浏览器里完成
- **所见即所得**——流式输出、思考过程、工具调用、token 用量、费用都以可视化卡片呈现，而不是黑压压的文字滚动
- **一键启动**——Windows 双击 `start.bat` 即用，无需任何命令行操作
- **一览无余**——模型切换、思考级别、工作文件夹、历史会话、插件市场，都在熟悉的网页布局里

相当于给 omp 换了一张友好的面孔：底层能力不变，但没有终端的门槛。

> omp 是 MIT 许可的开源 AI 编码代理（[github.com/can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)），本项目的依赖与核心引擎。本界面是独立的外围 Web 前端，通过 omp 的 RPC 协议驱动它。


## License

本项目基于 **MIT License** 完全开源，详见 [LICENSE](LICENSE)。

## 目录

- [项目初衷](#项目初衷)
- [特性](#特性)
- [架构](#架构)
- [安装与使用](#安装与使用)
- [界面概览](#界面概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [协议说明](#协议说明)
- [开发](#开发)
- [已知限制](#已知限制)

---

## 特性

### 核心对话

- **流式渲染**：消息逐 token 输出，thinking 块可折叠，工具调用以终端风格卡片实时展示
- **GitHub 风格 Diff 查看器**：` ```diff ` 代码块自动高亮（+绿 / -红）
- **消息元信息**：每条回复显示模型、tokens 用量、费用
- **插话（Steering）**：AI 回复过程中可直接输入插话，当前输出暂停转向处理你的新指令
- **终止**：红色「停止」按钮或 Esc 键随时终止当前回复
- **自适应思考级别**：下拉菜单只显示当前模型支持的级别（如 deepseek 仅 high/max，gpt-4 不支持思考则禁用）
- **图片上传**：支持粘贴/拖拽/点击上传图片随消息发送

### 会话管理

- **新建对话**：可设置对话名称 + 选择工作文件夹（文件夹浏览器点选，支持盘符/目录导航）
- **工作目录切换**：每个对话绑定独立 Workspace，模型在选定目录中工作（自动重启 omp 生效）
- **历史会话**：列表支持搜索、按日期分组（今天/昨天/近 7 天/更早）、按时间或名称排序
- **完整回放**：点击历史会话恢复全部消息（User/Assistant/工具调用/思考/费用），继续对话而非重新开始
- **会话管理**：重命名、置顶（Pin）、删除（带确认），鼠标悬停快捷操作
- **会话名持久化**：自定义名称显示在顶部栏和聊天记录中

### 扩展能力

- **Marketplace**：跨市场直接搜索可用插件（按名称/描述/关键词），一键安装/卸载，添加市场源（GitHub 简写 / Git URL / 本地目录 / JSON URL）
- **Skills**：发现已安装的能力包（用户级 `~/.omp/agent/skills/`、项目级 `.omp/skills/`），查看内容、复制 `skill://` 引用、一键使用
- **插件管理**：已安装插件列表（启用状态、能力标签：skills/agents/commands/MCP/extensions）、启用/禁用/卸载、本地扩展模块查看
- **Agents**：内置/自定义任务代理列表 + 用法说明 + 自定义 agent 教程，可测试可用性
- **模型管理**：120+ 模型列表，按 Provider 筛选、搜索、切换当前模型

### 设置与外观

所有界面与行为设置都在 UI 中完成，无需手动编辑配置文件：

- **模型切换**：顶部栏下拉直接切换当前模型（按 Provider 分组、显示上下文窗口）；也可在**模型**页面管理全部 120+ 模型（按 Provider 筛选、搜索、设为当前）
- **外观主题**：随时在**设置 → 外观设置**切换——Dark / Light / System / Midnight / GitHub Dark / GitHub Light 六套主题，CSS 变量驱动、即时生效、重启后保留
- **Provider 登录**：在**设置 → 登录**管理模型凭据，无需编辑配置文件
  - **登录**：点击 Provider（如 DeepSeek、智谱、小米）旁的「登录」按钮，按 omp 认证流程操作；API Key 保存在 `~/.omp/agent/agent.db`（你的主目录，不在本项目内）
  - **退出登录**：点击 Provider 旁的「退出登录」删除其本地 API Key——适合在控制台轮换/吊销 Key 后更换新 Key。删除前有确认弹窗；操作后自动重启 omp 进程刷新凭据状态
  - **重新登录**：退出后该 Provider 显示为未登录，再次点击「登录」输入新 API Key 即可
  - **注意**：退出登录后该 Provider 的模型不可用，直到重新登录
- **Agent 行为**：自动压缩、Fast Mode、队列模式、思考级别，实时生效

### 其他

- 扩展 UI 弹窗（confirm / input / select / editor / notify）自动转发为浏览器对话框
- 多标签状态栏：上下文占用条、token 速率、会话信息
- 只绑定 127.0.0.1，不暴露到局域网/公网

---

## 架构

```
浏览器 UI (web/src)  ⇄  HTTP/SSE  ⇄  server.mjs  ⇄  omp --mode rpc  ⇄  (模型 API)
```

- **server.mjs**（Node.js）：spawn `omp --mode rpc`，把 JSONL 协议桥接为浏览器可用的 SSE 事件流 + HTTP API；同时负责静态托管前端产物、会话/插件/凭据管理
- **web/src**（React）：纯前端，通过 EventSource 消费事件流，无状态后端依赖

### 后端职责

| 职责 | 说明 |
|---|---|
| RPC 桥接 | `omp --mode rpc` stdio ↔ SSE + HTTP |
| 静态托管 | 托管 Vite 构建产物（web/dist） |
| 会话管理 | 新建/切换/重命名/置顶/删除，历史消息回放 |
| 工作目录 | 切换时重启 omp 子进程（新 cwd） |
| 扩展生态 | Marketplace 搜索/安装、插件启停、Skills/Agents/扩展发现 |
| 凭据 | 登录状态查询、退出登录（删除本地 agent.db 凭据） |
| 目录浏览 | 文件夹选择器后端（盘符/目录/父级） |

---

## 安装与使用

### 环境要求

- **Node.js ≥ 20**
- **omp**（核心引擎，必须）：`omp --mode rpc` 可用且已配置模型凭据

### Windows 一键启动

双击 `start.bat`，自动完成：检查环境 → 清理占用端口 → 安装依赖（首次）→ 构建前端 → 打开浏览器 → 启动服务。

未安装 omp 时会显示安装指引：

```
Windows (PowerShell):  irm https://omp.sh/install.ps1 | iex
macOS / Linux:            curl -fsSL https://omp.sh/install | sh
Homebrew:                 brew install can1357/tap/omp
Bun:                      bun install -g @oh-my-pi/pi-coding-agent
```

### 手动运行

```bash
npm install          # 首次
npm run build        # 构建前端到 web/dist
node server.mjs      # 默认端口 3838
```

可选参数：

```bash
node server.mjs --port 8080    # 改端口
node server.mjs --cwd D:/work  # 指定 omp 工作目录（会话存这里）
node server.mjs --omp /path/to/omp  # 指定 omp 二进制
```

### 开发模式（热更新）

```bash
npm run dev          # Vite dev server :5173，自动代理 /api 到 3838
node server.mjs      # 另开终端跑后端
```

打开浏览器访问 http://127.0.0.1:3838（生产）或 http://127.0.0.1:5173（开发）。

---

## 界面概览

三栏布局（参考 OpenAI Codex / Cursor 设计语言）：

```
┌──────────┬─────────────────────────────┬──────────┐
│ Sidebar  │  Workspace                  │ Inspector│
│  · Logo  │  · 会话名 工作目录          │ · Context│
│  · 新建  │  · [模型▼] [思考级别▼] 空闲 │ · Files  │
│  · 导航  │  · 消息流（流式/工具/思考） │ · Logs   │
│  · 底部  │  · 输入区（插话/停止/发送） │ · Tasks  │
│  Provider│                             │ · Tools  │
│  Model   │                             │          │
└──────────┴─────────────────────────────┴──────────┘
```

- **左侧 Sidebar**：新会话、导航（聊天记录 / Prompt 库 / Skills / Marketplace / 工作区 / MCP / Agents / 插件 / 模型 / 设置）、底部显示 Provider / Model / Context 占用
- **中间 Workspace**：顶部栏（会话名、工作目录、模型切换、思考级别、Agent 状态、上下文进度条）+ 消息流 + 底部输入区
- **右侧 Inspector**：Context / Files / Logs / Tasks / Tools 面板，显示真实会话数据

### 导航页面

| 页面 | 功能 |
|---|---|
| 对话 | 主聊天界面 |
| 聊天记录 | 历史会话：搜索/分组/重命名/置顶/删除/完整回放 |
| Prompt 库 | 常用 prompt 模板，一键填入输入框 |
| Skills | 已发现的能力包，查看内容、复制引用、一键使用 |
| Marketplace | 搜索可用插件，一键安装/卸载，添加市场源 |
| 工作区 | 当前工作目录与会话存储位置 |
| MCP 服务器 | 说明页（由 omp 配置管理） |
| Agents | 任务代理列表 + 用法说明 + 自定义教程 |
| 插件 | 已安装插件管理：启停/卸载/能力检测/扩展模块 |
| 模型 | 模型列表：筛选/搜索/切换 |
| 设置 | Agent 行为 + Provider 登录/退出 + 外观主题 |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + Vite 5 |
| 样式 | TailwindCSS 3 + CSS 变量主题系统 |
| 渲染 | marked（Markdown）+ 手写 Diff 解析器 |
| 图标 | 内联 SVG（零依赖） |
| 后端 | Node.js ≥ 20（原生 http，零框架） |
| 数据库访问 | node:sqlite（凭据管理，Node 22 内置） |
| 状态管理 | React Context + useReducer（无 Redux） |
| 通信 | EventSource（SSE）+ fetch（HTTP） |

---

## 项目结构

```
D:/omp界面/
├── server.mjs          # Node 后端：RPC 桥接 + 静态托管 + 会话/插件/凭据 API
├── start.bat           # Windows 一键启动
├── vite.config.mjs     # Vite 配置
├── tailwind.config.js  # Tailwind 配置（颜色引用 CSS 变量）
├── package.json
└── web/
    ├── index.html      # Vite 入口
    └── src/
        ├── main.jsx    # React 入口
        ├── App.jsx     # 三栏布局 + ThemeProvider
        ├── store.jsx   # 全局状态（useReducer）+ SSE 事件状态机
        ├── api.js      # HTTP API 封装
        ├── ThemeProvider.jsx  # 主题状态 + localStorage 持久化
        ├── md.jsx      # Markdown + Diff 渲染
        ├── icons.jsx   # 内联 SVG 图标集
        ├── format.js   # 格式化工具
        ├── index.css   # 主题变量 + 组件样式
        ├── components/ # Sidebar/Topbar/MessageList/Composer/Inspector/...
        └── views/      # 管理页面（Sessions/Marketplace/Plugins/Agents/...）
```

---

## 协议说明

完整协议见 omp 内置文档 `omp://rpc.md`。核心事件形状已经过实测：

- `message_start` / `message_update` / `message_end`，内容块类型：`text` / `thinking` / `toolCall` / `toolResult`
- `message_update` 的 `assistantMessageEvent.partial` 携带完整消息快照（全量渲染，不拼 delta）
- `tool_execution_start/update/end`：**字段在帧顶层**（`toolCallId` / `toolName` / `args` / `partialResult` / `result` / `isError`），不在 `data` 下
- 流式增量：`assistantMessageEvent.type` = `text_delta` / `thinking_delta` 等
- 模型元数据：`get_available_models` 返回 `thinking.efforts`（思考级别自适应依据）
- 凭据：`get_login_providers` 返回 `authenticated` 状态；退出登录通过删除本地 `agent.db` 凭据实现（RPC 无 logout 命令）

---

## 开发

### 添加新页面

1. 在 `web/src/views/` 创建组件
2. 在 `store.jsx` 的 `VIEWS` 添加视图 id
3. 在 `Workspace.jsx` 添加渲染分支
4. 需要后端数据时在 `server.mjs` 添加 API，`api.js` 封装

### 主题系统

- `index.css` 顶部定义 CSS 变量（`--color-*`），每个 `[data-theme="xxx"]` 覆盖
- `tailwind.config.js` 颜色全部引用 CSS 变量（`bg: "var(--color-bg)"`）
- 组件内避免硬编码色值，用 CSS 变量或主题类名

### 常用命令

```bash
npm run build    # 构建生产产物
npm run dev      # 开发热更新
npm start        # 启动后端
```

---

## 已知限制

- 切换工作目录会重启 omp 子进程（约几秒），期间对话中断
- 插件启用/禁用后需重启生效
- 当前模型输出不含独立 thinking 块时，折叠区不显示（协议支持，取决于模型）
- 会话历史回放不含 subagent 嵌套记录（仅主对话消息）
- 上传文件仅支持图片（协议只支持 images）；文件上传未实现

---

