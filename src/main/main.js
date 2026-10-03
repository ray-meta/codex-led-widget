const { app, BrowserWindow, ipcMain, shell, Tray, Menu, screen } = require("electron");
const path = require("node:path");
const { getQuota } = require("./quota-service");

let mainWindow;
let tray;
let isQuitting = false;
let isAlwaysOnTop = true;
let isMiniMode = true;
const WINDOW_SIZES = { full: { width: 390, height: 236 }, mini: { width: 185, height: 60 } };
const MINI_MIN_WIDTH = 170;
const MINI_MAX_WIDTH = 420;
let miniWidth = WINDOW_SIZES.mini.width;
const iconPath = path.join(__dirname, "../assets/icon.ico");

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: iconPath,
    width: WINDOW_SIZES.mini.width,
    height: WINDOW_SIZES.mini.height,
    minWidth: MINI_MIN_WIDTH,
    minHeight: WINDOW_SIZES.mini.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.on("resize", () => {
    if (isMiniMode) miniWidth = mainWindow.getBounds().width;
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.once("ready-to-show", () => {
    placeWindowTopRight();
    mainWindow.show();
  });
}

function placeWindowTopRight() {
  if (!mainWindow) return;
  const display = screen.getPrimaryDisplay();
  const { width, height } = mainWindow.getBounds();
  const { workArea } = display;
  mainWindow.setBounds({
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    width,
    height
  });
}

function createTray() {
  tray = new Tray(iconPath);
  tray.setToolTip("Codex Quota Widget");
  rebuildTrayMenu();
  tray.on("click", toggleWindow);
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示/隐藏", click: toggleWindow },
      { label: "刷新额度", click: () => mainWindow?.webContents.send("quota:refresh") },
      { label: isMiniMode ? "退出 Mini 模式" : "进入 Mini 模式", click: () => setMiniMode(!isMiniMode) },
      {
        label: isAlwaysOnTop ? "取消置顶" : "置顶",
        click: () => setAlwaysOnTop(!isAlwaysOnTop)
      },
      {
        label: "开机自启动",
        type: "checkbox",
        checked: getLaunchAtStartup(),
        click: (item) => setLaunchAtStartup(item.checked)
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    ])
  );
}

function setAlwaysOnTop(value) {
  isAlwaysOnTop = Boolean(value);
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(isAlwaysOnTop);
    mainWindow.webContents.send("window:alwaysOnTopChanged", isAlwaysOnTop);
  }
  rebuildTrayMenu();
  return isAlwaysOnTop;
}

function getLoginItemOptions() {
  return {
    path: process.execPath,
    ...(!app.isPackaged ? { args: [app.getAppPath()] } : {})
  };
}

function getLaunchAtStartup() {
  if (process.platform !== "win32") return false;
  return app.getLoginItemSettings(getLoginItemOptions()).openAtLogin;
}

function setLaunchAtStartup(value) {
  if (process.platform !== "win32") return false;
  app.setLoginItemSettings({ ...getLoginItemOptions(), openAtLogin: Boolean(value) });
  const enabled = getLaunchAtStartup();
  mainWindow?.webContents.send("app:launchAtStartupChanged", enabled);
  rebuildTrayMenu();
  return enabled;
}

function setMiniMode(value, preferredWidth) {
  const nextMiniMode = Boolean(value);
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    if (isMiniMode) miniWidth = bounds.width;
    if (Number.isFinite(preferredWidth)) {
      miniWidth = Math.max(MINI_MIN_WIDTH, Math.min(MINI_MAX_WIDTH, Math.round(preferredWidth)));
    }
    const size = nextMiniMode ? { width: miniWidth, height: WINDOW_SIZES.mini.height } : WINDOW_SIZES.full;
    const workArea = screen.getDisplayMatching(bounds).workArea;
    isMiniMode = nextMiniMode;
    mainWindow.setBounds({
      x: Math.max(workArea.x, Math.min(bounds.x + bounds.width - size.width, workArea.x + workArea.width - size.width)),
      y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - size.height)),
      ...size
    });
    mainWindow.webContents.send("window:miniModeChanged", isMiniMode);
  } else {
    isMiniMode = nextMiniMode;
  }
  rebuildTrayMenu();
  return isMiniMode;
}

function resizeMiniWindow(requestedWidth, edge) {
  if (!mainWindow || !isMiniMode || !Number.isFinite(requestedWidth)) return miniWidth;
  const bounds = mainWindow.getBounds();
  const width = Math.max(MINI_MIN_WIDTH, Math.min(MINI_MAX_WIDTH, Math.round(requestedWidth)));
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const right = bounds.x + bounds.width;
  const x = edge === "left" ? right - width : bounds.x;
  miniWidth = width;
  mainWindow.setBounds({
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)),
    y: bounds.y,
    width,
    height: WINDOW_SIZES.mini.height
  });
  return width;
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("cn.codex.quota.widget");
  createWindow();
  createTray();

  ipcMain.handle("quota:get", async () => getQuota());
  ipcMain.handle("window:minimize", () => mainWindow?.hide());
  ipcMain.handle("window:alwaysOnTop:get", () => isAlwaysOnTop);
  ipcMain.handle("window:alwaysOnTop:set", (_event, value) => setAlwaysOnTop(value));
  ipcMain.handle("window:miniMode:set", (_event, value, preferredWidth) => setMiniMode(value, preferredWidth));
  ipcMain.handle("window:miniWidth:set", (_event, width, edge) => resizeMiniWindow(width, edge));
  ipcMain.handle("app:launchAtStartup:get", () => getLaunchAtStartup());
  ipcMain.handle("app:launchAtStartup:set", (_event, value) => setLaunchAtStartup(value));
  ipcMain.handle("external:openCodex", () => {
    shell.openPath(path.join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin", "codex.exe"));
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});
