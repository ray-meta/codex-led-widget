const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 12000;

function resolveCodexPath() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const nativePackage = process.arch === "arm64" ? "codex-win32-arm64" : "codex-win32-x64";
  const nativeTarget = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  const nativeFromPackage = (packageRoot) => path.join(
    packageRoot, "node_modules", "@openai", nativePackage,
    "vendor", nativeTarget, "bin", "codex.exe"
  );
  const candidates = [process.env.CODEX_CLI_PATH];
  if (localAppData) {
    candidates.push(path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"));
  }

  // Explorer may have an older PATH and will not inherit Codex session variables.
  // Check the usual npm installation roots before relying on PATH.
  const npmRoots = [
    process.env.CODEX_MANAGED_PACKAGE_ROOT,
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "nodejs", "node_modules", "@openai", "codex"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "nodejs", "node_modules", "@openai", "codex"),
    process.env.NVM_SYMLINK && path.join(process.env.NVM_SYMLINK, "node_modules", "@openai", "codex")
  ].filter(Boolean);
  for (const root of npmRoots) candidates.push(nativeFromPackage(root));

  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    candidates.push(path.join(directory, "codex.exe"));
    const shim = path.join(directory, "codex.cmd");
    if (fs.existsSync(shim)) {
      // npm installs codex.cmd beside node_modules. nvm may expose it through a symlink.
      try {
        const packageRoot = path.join(path.dirname(fs.realpathSync(shim)), "node_modules", "@openai", "codex");
        candidates.push(nativeFromPackage(packageRoot));
      } catch {
        // A stale shim should not prevent checking other candidates.
      }
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("Codex CLI executable not found. Install Codex or set CODEX_CLI_PATH.");
}

async function getQuota() {
  let response;
  try {
    response = await requestRateLimits();
  } catch (error) {
    const proxy = readWindowsProxy();
    if (!proxy || process.env.HTTPS_PROXY || !/timed out|timeout|connect|network|resolve|dns/i.test(error.message)) {
      throw error;
    }
    response = await requestRateLimits(proxy);
  }
  const snapshot =
    response.rateLimitsByLimitId?.codex ||
    response.rateLimits ||
    firstSnapshot(response.rateLimitsByLimitId);

  if (!snapshot) {
    throw new Error("Codex did not return a rate-limit snapshot.");
  }

  return normalizeSnapshot(snapshot);
}

function readWindowsProxy() {
  if (process.platform !== "win32") return null;
  try {
    const registry = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");
    const output = execFileSync(registry, [
      "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v", "ProxyServer"
    ], { encoding: "utf8", windowsHide: true, timeout: 2000 });
    const rawValue = output.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim();
    if (!rawValue) return null;
    const entries = rawValue.split(";");
    const address = entries.find((entry) => /^https=/i.test(entry))?.split("=").slice(1).join("=") ||
      entries.find((entry) => /^http=/i.test(entry))?.split("=").slice(1).join("=") || entries[0];
    const proxy = new URL(/^https?:\/\//i.test(address) ? address : `http://${address}`);
    return proxy.hostname && proxy.port ? proxy.toString() : null;
  } catch {
    return null;
  }
}

function firstSnapshot(map) {
  if (!map || typeof map !== "object") return null;
  const firstKey = Object.keys(map)[0];
  return firstKey ? map[firstKey] : null;
}

function normalizeSnapshot(snapshot) {
  const primary = normalizeWindow(snapshot.primary);
  const secondary = normalizeWindow(snapshot.secondary);
  const activeWindow = primary || secondary;

  return {
    limitId: snapshot.limitId || "codex",
    limitName: snapshot.limitName || "Codex",
    planType: snapshot.planType || "unknown",
    reachedType: snapshot.rateLimitReachedType || null,
    credits: snapshot.credits || null,
    primary,
    secondary,
    remainingPercent: activeWindow ? activeWindow.remainingPercent : null,
    usedPercent: activeWindow ? activeWindow.usedPercent : null,
    resetsAt: activeWindow ? activeWindow.resetsAt : null,
    fetchedAt: new Date().toISOString()
  };
}

function normalizeWindow(window) {
  if (!window) return null;
  const usedPercent = clampPercent(Number(window.usedPercent || 0));
  return {
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowDurationMins: window.windowDurationMins ?? null,
    resetsAt: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null
  };
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function requestRateLimits(proxy) {
  const codexPath = resolveCodexPath();
  const child = spawn(codexPath, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: proxy ? { ...process.env, HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : process.env
  });

  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map();

  const cleanup = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
    }
    pending.clear();
    if (!child.killed) child.kill();
  };

  const send = (method, params) => {
    const id = nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, DEFAULT_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
    });
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      handleMessage(line, pending);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });

    child.once("exit", (code) => {
      if (pending.size > 0) {
        cleanup();
        reject(new Error(stderr || `Codex app-server exited with code ${code}`));
      }
    });

    (async () => {
      try {
        await send("initialize", {
          clientInfo: {
            name: "codex-led-widget",
            title: "Codex LED Widget",
            version: "0.1.0"
          },
          capabilities: null
        });
        const result = await send("account/rateLimits/read");
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(new Error(stderr || error.message));
      }
    })();
  });
}

function handleMessage(line, pending) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(message, "id")) return;
  const request = pending.get(message.id);
  if (!request) return;

  clearTimeout(request.timer);
  pending.delete(message.id);

  if (message.error) {
    request.reject(new Error(message.error.message || JSON.stringify(message.error)));
  } else {
    request.resolve(message.result);
  }
}

module.exports = { getQuota, normalizeSnapshot, resolveCodexPath, readWindowsProxy };
