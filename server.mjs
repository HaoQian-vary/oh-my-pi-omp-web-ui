#!/usr/bin/env node
// omp-web — 本地 Web 界面,驱动 Oh My Pi (omp) 编码代理。
//
// 原理:spawn `omp --mode rpc`,把它的 JSONL 协议桥接到浏览器(SSE + HTTP API)。
// 前端由 Vite 构建到 web/dist,本服务静态托管。
// 用法:node server.mjs [--port 3838] [--omp omp] [--cwd <工作目录>]
//
// 只绑定 127.0.0.1,不要暴露到公网。

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const WEB_DIR = join(ROOT, "web", "dist");

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const PORT = Number(arg("--port", process.env.PORT ?? 3838));
const OMP_BIN = arg("--omp", process.env.OMP ?? "omp");
let WORKDIR = arg("--cwd", process.env.OMP_CWD ?? process.cwd());

// ---------- RPC 桥接状态 ----------
let child = null;
let shuttingDown = false;
let switchingWorkspace = false;
const pending = new Map(); // id -> { resolve, reject, timer }
const sseClients = new Set();
const uiTimers = new Map(); // extension UI 请求 id -> 超时句柄
let streaming = false;
let state = null;
let seq = 0;

const nextId = () => `c${++seq}`;

const send = (frame) => {
  if (child && child.stdin.writable) child.stdin.write(JSON.stringify(frame) + "\n");
};

const broadcast = (frame) => {
  const payload = `data: ${JSON.stringify(frame)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      /* 连接已断开 */
    }
  }
};

// 发命令并等待 ack(ack 超时兜底;流式完成靠事件,不在此等待)
function command(type, payload = {}, { timeout = 60000 } = {}) {
  const id = nextId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: no response for ${type}`));
      }
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    send({ id, type, ...payload });
  });
}

function refreshState() {
  return command("get_state")
    .then((data) => {
      state = data;
      broadcast({ type: "state", data });
    })
    .catch(() => {});
}

// ---------- omp 子进程 ----------
function startOmp() {
  broadcast({ type: "child_status", status: "starting" });
  child = spawn(OMP_BIN, ["--mode", "rpc"], {
    cwd: WORKDIR,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stderr.on("data", (d) => broadcast({ type: "child_stderr", text: d.toString() }));
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    handleFrame(frame);
  });
  child.on("error", (err) => {
    broadcast({ type: "child_status", status: "error", error: String(err) });
    // 命令不存在（ENOENT）：omp 未安装，停止无限重试
    if (err?.code === "ENOENT") {
      console.error(`[ERROR] 未找到 omp 可执行文件: ${OMP_BIN}`);
      console.error(`        安装方式:`);
      console.error(`          Windows (PowerShell):  irm https://omp.sh/install.ps1 | iex`);
      console.error(`          macOS / Linux:          curl -fsSL https://omp.sh/install | sh`);
      console.error(`          Homebrew:               brew install can1357/tap/omp`);
      console.error(`          Bun:                    bun install -g @oh-my-pi/pi-coding-agent`);
    }
  });
  child.on("exit", (code, signal) => {
    broadcast({ type: "child_status", status: "exited", code, signal });
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error("omp 进程退出"));
    }
    pending.clear();
    for (const t of uiTimers.values()) clearTimeout(t);
    uiTimers.clear();
    streaming = false;
    child = null;
    // 非主动切换时自动重启（ENOENT 不重试，避免刷屏）
    if (!shuttingDown && !switchingWorkspace && code !== null && code !== "ENOENT") {
      setTimeout(() => !child && startOmp(), 1500);
    }
  });
}

// 切换工作目录：杀掉 omp 子进程 → 更新 WORKDIR → 重启
function switchWorkspace(newDir) {
  return new Promise((resolve) => {
    const finish = () => {
      WORKDIR = newDir;
      switchingWorkspace = false;
      if (!child) startOmp();
      resolve();
    };
    if (!child) {
      WORKDIR = newDir;
      startOmp();
      return resolve();
    }
    switchingWorkspace = true;
    // 超时兜底：若 exit 事件未触发（进程僵死），3s 后强制继续
    const timer = setTimeout(finish, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      finish();
    });
    try {
      child.kill();
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function handleFrame(frame) {
  switch (frame.type) {
    case "ready":
      send({ id: "proto-1", type: "negotiate_protocol", protocolVersion: 2 });
      refreshState();
      return;
    case "response": {
      const p = pending.get(frame.id);
      if (p) {
        pending.delete(frame.id);
        clearTimeout(p.timer);
        if (frame.success) p.resolve(frame.data);
        else p.reject(new Error(frame.error || `command ${frame.command} failed`));
      }
      if (frame.command === "prompt" && frame.success) refreshState();
      broadcast(frame);
      return;
    }
    case "agent_start":
      streaming = true;
      broadcast(frame);
      return;
    case "agent_end":
      streaming = false;
      broadcast(frame);
      refreshState();
      return;
    case "extension_ui_request": {
      const interactive = ["select", "confirm", "input", "editor", "notify", "open_url"].includes(frame.method);
      if (interactive) {
        if (["select", "confirm", "input", "editor"].includes(frame.method)) {
          const ms = frame.timeout ?? 120000;
          const t = setTimeout(() => {
            uiTimers.delete(frame.id);
            send({ type: "extension_ui_response", id: frame.id, cancelled: true, timedOut: true });
          }, ms);
          uiTimers.set(frame.id, t);
        }
        broadcast(frame);
      }
      // setWidget / setStatus / setTitle 等纯展示请求:忽略
      return;
    }
    default:
      broadcast(frame);
  }
}

// ---------- Skills 管理 ----------
const SKILLS_ROOTS = () => [
  join(homedir(), ".omp", "agent", "skills"),
  join(WORKDIR, ".omp", "skills"),
];

async function listSkills() {
  const roots = SKILLS_ROOTS();
  const out = [];
  const seen = new Set();

  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(root, entry.name);
      const skillMd = join(skillDir, "SKILL.md");

      try {
        await stat(skillMd);
      } catch {
        continue; // 没有 SKILL.md，跳过
      }

      if (seen.has(entry.name)) continue; // 去重，优先级高的先加载
      seen.add(entry.name);

      // 解析 SKILL.md frontmatter
      const content = await readFile(skillMd, "utf8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let name = entry.name;
      let description = "";
      let globs = [];
      let alwaysApply = false;

      if (fmMatch) {
        const fm = fmMatch[1];
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        const descMatch = fm.match(/^description:\s*(.+)$/m);
        const globsMatch = fm.match(/^globs:\s*\[([^\]]+)\]$/m);
        const alwaysMatch = fm.match(/^alwaysApply:\s*(true|false)$/m);

        if (nameMatch) name = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
        if (globsMatch) globs = globsMatch[1].split(",").map((g) => g.trim());
        if (alwaysMatch) alwaysApply = alwaysMatch[1] === "true";
      }

      out.push({
        name,
        description,
        globs,
        alwaysApply,
        filePath: skillMd,
        baseDir: skillDir,
        source: root.includes(".omp" + sep + "agent") ? "user" : "project",
      });
    }
  }

  return out;
}

async function readSkillContent(name) {
  const roots = SKILLS_ROOTS();
  for (const root of roots) {
    const skillMd = join(root, name, "SKILL.md");
    try {
      const content = await readFile(skillMd, "utf8");
      // 去掉 frontmatter
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
      return { name, content: body, filePath: skillMd };
    } catch {
      continue;
    }
  }
  return null;
}

// ---------- Marketplace 管理 ----------
const MARKETPLACES_FILE = () => join(homedir(), ".omp", "marketplaces.json");
const INSTALLED_PLUGINS_FILE = () => join(homedir(), ".omp", "plugins", "installed_plugins.json");

async function listMarketplaces() {
  try {
    const content = await readFile(MARKETPLACES_FILE(), "utf8");
    return JSON.parse(content);
  } catch {
    return { marketplaces: [] };
  }
}

async function listInstalledPlugins() {
  try {
    const content = await readFile(INSTALLED_PLUGINS_FILE(), "utf8");
    return JSON.parse(content);
  } catch {
    return { plugins: {} };
  }
}

// 列出已安装插件的详细信息：安装信息 + 启用状态 + 能力（skills/agents/commands/mcp/extensions）
async function listPluginsDetail() {
  const installed = await listInstalledPlugins();
  const plugins = installed?.plugins ?? {};
  let lock = { plugins: {} };
  try {
    lock = JSON.parse(await readFile(join(homedir(), ".omp", "plugins", "omp-plugins.lock.json"), "utf8"));
  } catch { /* 无 lock 文件 */ }

  const out = [];
  for (const [key, entries] of Object.entries(plugins)) {
    const [name, marketplace] = key.split("@");
    const entry = Array.isArray(entries) ? entries[0] : entries;
    const installPath = entry?.installPath;
    // 能力检测
    const caps = { skills: [], agents: [], commands: [], mcp: false, extensions: [] };
    try {
      const skillsDir = join(installPath, "skills");
      const skillEntries = await readdir(skillsDir, { withFileTypes: true });
      caps.skills = skillEntries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { /* 无 skills */ }
    try {
      const agentsDir = join(installPath, "agents");
      const agentEntries = await readdir(agentsDir, { withFileTypes: true });
      caps.agents = agentEntries.filter((e) => e.isFile()).map((e) => e.name.replace(/\.md$/, ""));
    } catch { /* 无 agents */ }
    try {
      const commandsDir = join(installPath, "commands");
      const cmdEntries = await readdir(commandsDir);
      caps.commands = cmdEntries.filter((f) => f.endsWith(".md"));
    } catch { /* 无 commands */ }
    try {
      await stat(join(installPath, ".mcp.json"));
      caps.mcp = true;
    } catch { /* 无 mcp */ }
    try {
      const pkg = JSON.parse(await readFile(join(installPath, "package.json"), "utf8"));
      caps.extensions = [...(pkg.omp?.extensions ?? []), ...(pkg.pi?.extensions ?? [])];
    } catch { /* 无 package.json */ }

    // plugin.json 描述
    let description = "";
    let author = null;
    let homepage = null;
    try {
      const meta = JSON.parse(await readFile(join(installPath, ".claude-plugin", "plugin.json"), "utf8"));
      description = meta.description ?? "";
      author = meta.author?.name ?? null;
      homepage = meta.homepage ?? null;
    } catch { /* 无 plugin.json */ }

    out.push({
      name,
      marketplace,
      key,
      version: entry?.version ?? null,
      installedAt: entry?.installedAt ?? null,
      scope: entry?.scope ?? "user",
      installPath,
      enabled: lock?.plugins?.[name]?.enabled ?? true,
      description,
      author,
      homepage,
      caps,
    });
  }
  return out;
}

// 通过 CLI 启用/禁用插件
async function setPluginEnabled(key, enabled) {
  const cmd = enabled ? "enable" : "disable";
  await runCli(["plugin", cmd, key]);
}

async function discoverMarketplacePlugins(marketplaceName) {
  // 读取缓存的 marketplace.json catalog
  const cacheDir = join(homedir(), ".omp", "plugins", "cache", "marketplaces", marketplaceName);
  const catalogPath = join(cacheDir, "marketplace.json");
  try {
    const content = await readFile(catalogPath, "utf8");
    const catalog = JSON.parse(content);
    return catalog?.plugins ?? [];
  } catch {
    return [];
  }
}

// 跨市场搜索插件：遍历所有已配置市场的缓存 catalog，按名称/描述/关键词模糊匹配
async function searchPlugins(query) {
  const q = (query ?? "").trim().toLowerCase();
  const mkt = await listMarketplaces();
  const marketplaces = mkt?.marketplaces ?? [];
  const results = [];
  for (const m of marketplaces) {
    const plugins = await discoverMarketplacePlugins(m.name);
    for (const p of plugins) {
      const name = (p.name ?? "").toLowerCase();
      const desc = (p.description ?? "").toLowerCase();
      const keywords = (p.keywords ?? []).map((k) => String(k).toLowerCase());
      const matched = !q || name.includes(q) || desc.includes(q) || keywords.some((k) => k.includes(q));
      if (matched) {
        results.push({ ...p, marketplace: m.name, marketplaceSource: m.sourceUri ?? m.name });
      }
    }
  }
  // 按名称排序，名称完全匹配的优先
  results.sort((a, b) => {
    const aExact = a.name?.toLowerCase() === q;
    const bExact = b.name?.toLowerCase() === q;
    if (aExact !== bExact) return aExact ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return results;
}

// 通过 CLI 安装/卸载插件（带超时，避免网络问题挂起）
function runCli(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(OMP_BIN, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch {}
      reject(new Error(`CLI 超时 (${timeoutMs}ms): omp ${args.join(" ")}`));
    }, timeoutMs);
    const cleanup = () => clearTimeout(timer);
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `exit ${code}`).trim()));
    });
  });
}

// ---------- 会话列表(读取 ~/.omp/agent/sessions) ----------
const SESSIONS_ROOT = () => join(homedir(), ".omp", "agent", "sessions");

async function listSessions() {
  const root = SESSIONS_ROOT();
  const out = [];
  let dirs;
  try {
    dirs = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const sub = join(root, d.name);
    let files;
    try {
      files = await readdir(sub);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const path = join(sub, f);
      try {
        const st = await stat(path);
        const m = f.match(/^([\dTZ.:+-]+)_([0-9a-f-]+)\.jsonl$/i);
        out.push({
          path,
          file: f,
          id: m?.[2] ?? f,
          mtime: st.mtimeMs,
          size: st.size,
          cwd: d.name.replace(/^--/, "").replace(/--$/, "").replace(/--/g, "/").replace(/^-/, "C:/"),
        });
      } catch {
        /* 忽略 */
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

async function readSessionHeader(path) {
  try {
    const fh = await readFile(path, "utf8");
    const line = fh.split("\n").find((l) => l.includes('"type":"session"')) ?? "";
    const j = JSON.parse(line);
    return { name: j.title ?? null, messageCount: null };
  } catch {
    return { name: null, messageCount: null };
  }
}

async function readSessionMessages(path) {
  const content = await readFile(path, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const msgs = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "message" && entry.message) {
        msgs.push(entry.message);
      }
    } catch {
      /* 忽略解析失败 */
    }
  }
  return msgs;
}

async function readSessionDetail(path) {
  const content = await readFile(path, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const detail = { name: null, model: null, provider: null, thinkingLevel: null, cwd: null, messageCount: 0 };
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "session") {
        detail.name = entry.title ?? null;
        detail.cwd = entry.cwd ?? null;
      } else if (entry.type === "message" && entry.message?.role === "assistant") {
        detail.model = detail.model ?? entry.message.model;
        detail.provider = detail.provider ?? entry.message.provider;
        detail.messageCount++;
      } else if (entry.type === "thinking_level_change") {
        detail.thinkingLevel = entry.thinkingLevel ?? null;
      }
    } catch {
      /* 忽略解析失败 */
    }
  }
  return detail;
}

async function renameSession(path, name) {
  const content = await readFile(path, "utf8");
  const lines = content.split("\n");
  const newLines = lines.map((line) => {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "session") {
        entry.title = name;
        return JSON.stringify(entry);
      }
      return line;
    } catch {
      return line;
    }
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, newLines.join("\n"), "utf8");
}

async function deleteSession(path) {
  const { unlink } = await import("node:fs/promises");
  await unlink(path);
}

async function pinSession(path, pinned) {
  const content = await readFile(path, "utf8");
  const lines = content.split("\n");
  const newLines = lines.map((line) => {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "session") {
        entry.pinned = pinned;
        return JSON.stringify(entry);
      }
      return line;
    } catch {
      return line;
    }
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, newLines.join("\n"), "utf8");
}

// 目录浏览：列出指定目录的子目录（供文件夹选择器用）
// start 为 null 时返回盘符列表（Windows）
async function listDirectories(start) {
  if (!start) {
    // Windows: 列出盘符
    const out = [];
    for (let c = 65; c <= 90; c++) {
      const drive = `${String.fromCharCode(c)}:/`;
      try {
        await stat(drive);
        out.push({ path: drive, name: drive });
      } catch {
        /* 跳过不存在的盘符 */
      }
    }
    return { parent: null, dirs: out };
  }

  const out = [];
  let entries;
  try {
    entries = await readdir(start, { withFileTypes: true });
  } catch {
    return { parent: null, dirs: [] };
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "$Recycle.Bin" || e.name === "System Volume Information") continue;
    const p = join(start, e.name);
    out.push({ path: p, name: e.name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));

  // 父目录
  let parent = null;
  try {
    const parentDir = start.replace(/[\\/]+$/, "").split(/[\\/]/).slice(0, -1).join("/");
    if (parentDir && parentDir !== start.replace(/[\\/]+$/, "")) {
      parent = parentDir.length >= 2 ? parentDir : null;
    }
  } catch {
    parent = null;
  }
  return { parent, dirs: out };
}

// 退出登录：从本地 agent.db 删除指定 provider 的凭据（API key）
// omp RPC 无 logout 命令，直接操作凭据表
async function logoutProvider(provider) {
  const dbPath = join(homedir(), ".omp", "agent", "agent.db");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const stmt = db.prepare("DELETE FROM auth_credentials WHERE provider = ?");
    const result = stmt.run(provider);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// 发现自定义 agents：扫描用户级和项目级 .omp/agents/*.md
async function discoverAgents() {
  const roots = [
    join(homedir(), ".omp", "agent", "agents"),
    join(WORKDIR, ".omp", "agents"),
  ];
  const out = [];
  const seen = new Set();
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !/^\.md$/.test(e.name)) continue;
      const path = join(root, e.name);
      try {
        const content = await readFile(path, "utf8");
        const name = e.name.replace(/\.md$/, "");
        if (seen.has(name)) continue;
        seen.add(name);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        const toolsMatch = content.match(/^tools:\s*(.+)$/m);
        out.push({
          name,
          description: descMatch?.[1]?.trim() ?? "",
          tools: toolsMatch?.[1]?.trim() ?? "",
          source: root.includes(".omp" + sep + "agent") ? "user" : "project",
          filePath: path,
        });
      } catch {
        /* 跳过解析失败 */
      }
    }
  }
  return out;
}

// 发现本地扩展模块：用户级 + 项目级 extensions 目录
async function discoverExtensions() {
  const roots = [
    { dir: join(homedir(), ".omp", "agent", "extensions"), source: "user" },
    { dir: join(WORKDIR, ".omp", "extensions"), source: "project" },
  ];
  const out = [];
  for (const { dir, source } of roots) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      let name = null;
      if (e.isFile() && /\.(ts|js)$/.test(e.name)) {
        name = e.name.replace(/\.(ts|js)$/, "");
      } else if (e.isDirectory()) {
        // 子目录入口：index.ts/index.js 或 package.json 的 omp.extensions
        try {
          await stat(join(dir, e.name, "index.ts"));
          name = e.name;
        } catch {
          try {
            await stat(join(dir, e.name, "index.js"));
            name = e.name;
          } catch {
            try {
              const pkg = JSON.parse(await readFile(join(dir, e.name, "package.json"), "utf8"));
              if (pkg.omp?.extensions || pkg.pi?.extensions) name = e.name;
            } catch { /* 跳过 */ }
          }
        }
      }
      if (name) {
        out.push({ name, source, path: join(dir, e.name ?? name) });
      }
    }
  }
  return out;
}

// ---------- HTTP ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(urlPath, res) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = normalize(join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 5_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// 工作区文件列表(供 Inspector → Files)
async function listFiles(dir, depth = 0) {
  const out = [];
  if (depth > 3) return out;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  const ignore = new Set([".git", "node_modules", "dist", "__pycache__", ".cache", ".venv", "web/dist"]);
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const p = join(dir, e.name);
    const rel = p.replace(WORKDIR + sep, "");
    if (e.isDirectory()) {
      out.push({ path: rel, isDir: true, size: 0 });
      out.push(...await listFiles(p, depth + 1));
    } else {
      try {
        const s = await stat(p);
        out.push({ path: rel, isDir: false, size: s.size });
      } catch {
        out.push({ path: rel, isDir: false, size: 0 });
      }
    }
    if (out.length > 400) break;
  }
  return out.slice(0, 400);
}

async function handleApi(pathname, req, res) {
  // ---------- GET ----------
  if (req.method === "GET" && pathname === "/api/state") {
    if (!state) await refreshState();
    return json(res, 200, { ok: true, state });
  }
  if (req.method === "GET" && pathname === "/api/available_models") {
    try {
      const data = await command("get_available_models");
      return json(res, 200, { ok: true, models: data?.models ?? [] });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/sessions") {
    try {
      const sessions = await listSessions();
      for (const s of sessions) {
        const h = await readSessionHeader(s.path);
        s.name = h.name;
      }
      return json(res, 200, { ok: true, sessions });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/skills") {
    try {
      const skills = await listSkills();
      return json(res, 200, { ok: true, skills });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/agents") {
    try {
      const agents = await discoverAgents();
      return json(res, 200, { ok: true, agents });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/extensions") {
    try {
      const extensions = await discoverExtensions();
      return json(res, 200, { ok: true, extensions });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/marketplaces") {
    try {
      const data = await listMarketplaces();
      return json(res, 200, { ok: true, marketplaces: data?.marketplaces ?? [] });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/installed_plugins") {
    try {
      const data = await listInstalledPlugins();
      return json(res, 200, { ok: true, plugins: data?.plugins ?? {} });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/plugins") {
    try {
      const plugins = await listPluginsDetail();
      return json(res, 200, { ok: true, plugins });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/files") {
    try {
      const files = await listFiles(WORKDIR);
      return json(res, 200, { ok: true, files, cwd: WORKDIR });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/subagents") {
    try {
      const data = await command("get_subagents");
      return json(res, 200, { ok: true, agents: Array.isArray(data) ? data : data?.subagents ?? [] });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (req.method === "GET" && pathname === "/api/login_providers") {
    try {
      const data = await command("get_login_providers");
      return json(res, 200, { ok: true, providers: Array.isArray(data) ? data : data?.providers ?? [] });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message ?? String(e) });
    }
  }
  if (pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    sseClients.add(res);
    broadcast({ type: "child_status", status: child ? "running" : "starting" });
    if (state) broadcast({ type: "state", data: state });
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (req.method !== "POST" || !pathname.startsWith("/api/")) {
    if (pathname === "/api/state") return json(res, 200, { ok: true, state });
    if (pathname.startsWith("/api/")) return json(res, 405, { ok: false, error: "method not allowed" });
    return serveStatic(pathname, res);
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const fail = (e) => json(res, 500, { ok: false, error: e.message ?? String(e) });
  const simple = (type, payload = {}) => async () => {
    try {
      const data = await command(type, payload);
      if (type === "set_model" || type === "set_thinking_level" || type === "set_fast_mode" || type === "set_auto_compaction" || type === "set_auto_retry" || type === "set_steering_mode" || type === "set_follow_up_mode" || type === "set_interrupt_mode") refreshState();
      return json(res, 200, { ok: true, data });
    } catch (e) {
      return fail(e);
    }
  };

  switch (pathname) {
    case "/api/prompt": {
      if (!body?.message) return json(res, 400, { ok: false, error: "message required" });
      const payload = { type: "prompt", message: String(body.message) };
      if (body.images?.length) payload.images = body.images;
      if (streaming) payload.streamingBehavior = "followUp";
      try {
        return json(res, 200, { ok: true, data: await command("prompt", payload) });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/steer": {
      if (!body?.message) return json(res, 400, { ok: false, error: "message required" });
      try {
        return json(res, 200, { ok: true, data: await command("steer", { message: String(body.message) }) });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/abort":
      send({ type: "abort" });
      return json(res, 200, { ok: true });
    case "/api/new_session": {
      try {
        await command("new_session");
        refreshState();
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/set_model":
      if (!body?.provider || !body?.modelId) return json(res, 400, { ok: false, error: "provider and modelId required" });
      return simple("set_model", { provider: body.provider, modelId: body.modelId })();
    case "/api/set_thinking_level":
      if (!body?.level) return json(res, 400, { ok: false, error: "level required" });
      return simple("set_thinking_level", { level: body.level })();
    case "/api/set_fast_mode":
      return simple("set_fast_mode", { enabled: !!body?.enabled })();
    case "/api/set_auto_compaction":
      return simple("set_auto_compaction", { enabled: !!body?.enabled })();
    case "/api/set_auto_retry":
      return simple("set_auto_retry", { enabled: !!body?.enabled })();
    case "/api/set_steering_mode":
      return simple("set_steering_mode", { mode: body?.mode ?? "one-at-a-time" })();
    case "/api/set_follow_up_mode":
      return simple("set_follow_up_mode", { mode: body?.mode ?? "one-at-a-time" })();
    case "/api/set_interrupt_mode":
      return simple("set_interrupt_mode", { mode: body?.mode ?? "immediate" })();
    case "/api/available_models": {
      try {
        const data = await command("get_available_models");
        return json(res, 200, { ok: true, models: data?.models ?? [] });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/switch_session": {
      if (!body?.path) return json(res, 400, { ok: false, error: "path required" });
      try {
        await command("switch_session", { sessionPath: String(body.path) });
        refreshState();
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/skill_content": {
      if (!body?.name) return json(res, 400, { ok: false, error: "name required" });
      try {
        const skill = await readSkillContent(String(body.name));
        if (!skill) return json(res, 404, { ok: false, error: "skill not found" });
        return json(res, 200, { ok: true, skill });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/install_plugin": {
      if (!body?.name || !body?.marketplace) return json(res, 400, { ok: false, error: "name and marketplace required" });
      try {
        // CLI: omp plugin install name@marketplace
        await runCli(["plugin", "install", `${String(body.name)}@${String(body.marketplace)}`]);
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/uninstall_plugin": {
      if (!body?.name || !body?.marketplace) return json(res, 400, { ok: false, error: "name and marketplace required" });
      try {
        await runCli(["plugin", "uninstall", `${String(body.name)}@${String(body.marketplace)}`]);
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/plugin_set_enabled": {
      if (!body?.key) return json(res, 400, { ok: false, error: "key required" });
      try {
        await setPluginEnabled(String(body.key), !!body?.enabled);
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/search_plugins": {
      try {
        const plugins = await searchPlugins(body?.query ?? "");
        return json(res, 200, { ok: true, plugins });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/add_marketplace": {
      if (!body?.source) return json(res, 400, { ok: false, error: "source required" });
      try {
        const out = await runCli(["plugin", "marketplace", "add", String(body.source)]);
        return json(res, 200, { ok: true, out });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/test_agent": {
      if (!body?.agent) return json(res, 400, { ok: false, error: "agent required" });
      try {
        // 用 prompt 触发一次 task 调用验证 agent 可用性
        await command("prompt", { message: `请用 task 工具调用 agent "${String(body.agent)}" 执行一个极简只读任务并返回结果。` });
        return json(res, 200, { ok: true, message: `已触发 agent 测试: ${body.agent}` });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/discover_marketplace": {
      if (!body?.marketplace) return json(res, 400, { ok: false, error: "marketplace required" });
      try {
        const plugins = await discoverMarketplacePlugins(String(body.marketplace));
        return json(res, 200, { ok: true, plugins });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/login": {
      if (!body?.providerId) return json(res, 400, { ok: false, error: "providerId required" });
      try {
        const data = await command("login", { providerId: String(body.providerId) });
        return json(res, 200, { ok: true, data });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/logout": {
      if (!body?.providerId) return json(res, 400, { ok: false, error: "providerId required" });
      try {
        const removed = await logoutProvider(String(body.providerId));
        // 重启 omp 子进程，刷新凭据缓存
        await switchWorkspace(WORKDIR);
        await new Promise((res) => setTimeout(res, 1500));
        return json(res, 200, { ok: true, removed });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/ui_response": {
      const { id, value, confirmed, cancelled } = body ?? {};
      if (!id) return json(res, 400, { ok: false, error: "id required" });
      const t = uiTimers.get(id);
      if (t) {
        clearTimeout(t);
        uiTimers.delete(id);
      }
      const frame = { type: "extension_ui_response", id };
      if (cancelled) frame.cancelled = true;
      else if (typeof confirmed === "boolean") frame.confirmed = confirmed;
      else frame.value = value;
      send(frame);
      return json(res, 200, { ok: true });
    }
    case "/api/create_session": {
      const { name, cwd } = body ?? {};
      try {
        // 1. 切换工作目录（若指定）
        if (cwd) {
          await switchWorkspace(String(cwd));
          // 等待新子进程就绪
          await new Promise((res) => setTimeout(res, 1500));
        }
        // 2. 新建会话
        await command("new_session");
        // 3. 设置会话名称（若指定）——RPC 的 new_session 不接收 name
        if (name) {
          await command("set_session_name", { name: String(name) });
        }
        refreshState();
        return json(res, 200, { ok: true, cwd: WORKDIR, name: name ?? null });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/list_dirs": {
      const start = body?.path ? String(body.path) : null;
      try {
        const { parent, dirs } = await listDirectories(start);
        return json(res, 200, { ok: true, dirs, parent });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/get_messages": {
      if (!body?.path) return json(res, 400, { ok: false, error: "path required" });
      try {
        const msgs = await readSessionMessages(String(body.path));
        return json(res, 200, { ok: true, messages: msgs });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/get_session_detail": {
      if (!body?.path) return json(res, 400, { ok: false, error: "path required" });
      try {
        const detail = await readSessionDetail(String(body.path));
        return json(res, 200, { ok: true, detail });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/rename_session": {
      if (!body?.path || !body?.name) return json(res, 400, { ok: false, error: "path and name required" });
      try {
        await renameSession(String(body.path), String(body.name));
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/delete_session": {
      if (!body?.path) return json(res, 400, { ok: false, error: "path required" });
      try {
        await deleteSession(String(body.path));
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    case "/api/pin_session": {
      if (!body?.path) return json(res, 400, { ok: false, error: "path required" });
      try {
        await pinSession(String(body.path), !!body?.pinned);
        return json(res, 200, { ok: true });
      } catch (e) {
        return fail(e);
      }
    }
    default:
      return json(res, 404, { ok: false, error: "unknown endpoint" });
  }
}

// ---------- 启动 ----------
// 先拉起 omp 子进程,再监听 HTTP
startOmp();

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) return handleApi(url.pathname, req, res);
  return serveStatic(url.pathname, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`omp-web 已启动: http://127.0.0.1:${PORT}`);
  console.log(`  omp 二进制  : ${OMP_BIN}`);
  console.log(`  工作目录    : ${WORKDIR}`);
  if (!existsSync(join(WEB_DIR, "index.html"))) {
    console.log(`  [!] 未找到构建产物 ${join("web", "dist", "index.html")},请先运行: npm install && npm run build`);
  }
  console.log(`  按 Ctrl+C 退出`);
});

function shutdown() {
  shuttingDown = true;
  try {
    child?.kill();
  } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
