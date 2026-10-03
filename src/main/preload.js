const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexQuota", {
  getQuota: () => ipcRenderer.invoke("quota:get"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  getAlwaysOnTop: () => ipcRenderer.invoke("window:alwaysOnTop:get"),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("window:alwaysOnTop:set", value),
  setMiniMode: (value, preferredWidth) => ipcRenderer.invoke("window:miniMode:set", value, preferredWidth),
  setMiniWidth: (width, edge) => ipcRenderer.invoke("window:miniWidth:set", width, edge),
  getLaunchAtStartup: () => ipcRenderer.invoke("app:launchAtStartup:get"),
  setLaunchAtStartup: (value) => ipcRenderer.invoke("app:launchAtStartup:set", value),
  openCodex: () => ipcRenderer.invoke("external:openCodex"),
  onRefresh: (callback) => {
    ipcRenderer.on("quota:refresh", callback);
  },
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on("window:alwaysOnTopChanged", (_event, value) => callback(value));
  },
  onMiniModeChanged: (callback) => {
    ipcRenderer.on("window:miniModeChanged", (_event, value) => callback(value));
  },
  onLaunchAtStartupChanged: (callback) => {
    ipcRenderer.on("app:launchAtStartupChanged", (_event, value) => callback(value));
  }
});
