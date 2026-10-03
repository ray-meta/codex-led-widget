(() => {
  const api = window.codexQuota;
  const $ = (id) => document.getElementById(id);
  const widget = document.querySelector(".widget");
  const secondaryCard = $("secondaryLabel").closest(".quota-card");
  const elements = Object.fromEntries([
    "trafficLight", "brandName", "stateText", "remaining", "remainingLabel", "liquidFill",
    "primaryLabel", "primaryText", "primaryMiniPercent", "primaryMiniReset",
    "secondaryLabel", "secondaryText", "secondaryMiniPercent", "secondaryMiniReset",
    "planLabel", "planText", "statusText", "modeBtn", "langBtn", "pinBtn",
    "refreshBtn", "minimizeBtn", "closeBtn"
  ].map((id) => [id, $(id)]));

  const copy = {
    zh: {
      brand: "Codex 额度", loading: "读取中", ready: "实时额度", warning: "额度偏低", critical: "额度用尽", error: "读取失败",
      remaining: "剩余", primary: "5小时窗口", secondary: "7天窗口", primaryMini: "5h", secondaryMini: "7d", plan: "计划",
      refresh: "正在读取 Codex 额度...", updated: "已更新 · 每60秒自动刷新",
      failed: "无法读取额度", unavailable: "暂无数据", pin: "置顶", unpin: "取消置顶", enterMini: "进入 Mini 模式", exitMini: "退出 Mini 模式",
      miniReset: (time) => `${time}后`,
      reset: (time) => `${time}后重置`, minutes: (n) => `${n}分钟`, hours: (n) => `${n}小时`, days: (n) => `${n}天`
    },
    en: {
      brand: "Codex Quota", loading: "Loading", ready: "Quota available", warning: "Running low", critical: "Quota exhausted", error: "Unavailable",
      remaining: "Remaining", primary: "5-hour window", secondary: "7-day window", primaryMini: "5h", secondaryMini: "7d", plan: "Plan",
      refresh: "Reading Codex quota...", updated: "Updated · refreshes every 60s",
      failed: "Could not read quota", unavailable: "No data", pin: "Pin", unpin: "Unpin", enterMini: "Enter Mini mode", exitMini: "Exit Mini mode",
      miniReset: (time) => `in ${time}`,
      reset: (time) => `resets in ${time}`, minutes: (n) => `${n}m`, hours: (n) => `${n}h`, days: (n) => `${n}d`
    }
  };

  let language = "zh";
  let quota = null;
  let error = null;
  let loading = false;
  let alwaysOnTop = true;
  let miniMode = true;
  const savedMiniWidth = Number(localStorage.getItem("miniWidth")) || 185;

  function applyMiniMode(value) {
    miniMode = Boolean(value);
    document.body.dataset.mode = miniMode ? "mini" : "full";
    (miniMode ? secondaryCard : widget).appendChild(elements.modeBtn);
    render();
  }

  function untilReset(value) {
    if (!value) return "";
    const difference = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(difference) || difference <= 0) return "";
    const minutes = Math.ceil(difference / 60000);
    const t = copy[language];
    if (minutes < 60) return t.minutes(minutes);
    if (minutes < 1440) return `${t.hours(Math.floor(minutes / 60))}${minutes % 60 ? t.minutes(minutes % 60) : ""}`;
    return `${t.days(Math.floor(minutes / 1440))}${Math.floor((minutes % 1440) / 60) ? t.hours(Math.floor((minutes % 1440) / 60)) : ""}`;
  }

  function windowText(windowData) {
    if (!windowData) return copy[language].unavailable;
    const remaining = Math.max(0, Math.min(100, Number(windowData.remainingPercent) || 0));
    const reset = untilReset(windowData.resetsAt);
    return `${remaining}%${reset ? ` · ${copy[language].reset(reset)}` : ""}`;
  }

  function miniSevenDayReset(windowData) {
    if (!windowData) return "--";
    const resetMs = new Date(windowData.resetsAt).getTime() - Date.now();
    if (!Number.isFinite(resetMs) || resetMs <= 0) return "--";
    const totalMinutes = Math.ceil(resetMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    return copy[language].miniReset(`${days}d${hours}h`);
  }

  function miniFiveHourReset(windowData) {
    if (!windowData) return "--";
    const resetMs = new Date(windowData.resetsAt).getTime() - Date.now();
    if (!Number.isFinite(resetMs) || resetMs <= 0) return "--";
    const minutes = Math.ceil(resetMs / 60000);
    const hours = Math.floor(minutes / 60);
    const time = `${hours ? `${hours}h` : ""}${minutes % 60 ? `${minutes % 60}m` : ""}`;
    return copy[language].miniReset(time);
  }

  function miniPercent(windowData) {
    return windowData ? `${Math.max(0, Math.min(100, Number(windowData.remainingPercent) || 0))}%` : "--%";
  }

  function render() {
    const t = copy[language];
    const remaining = quota?.remainingPercent;
    const state = error ? "error" : loading && !quota ? "loading" :
      remaining === null || remaining === undefined ? "error" :
      remaining <= 0 ? "critical" : remaining < 10 ? "warning" : "ready";
    document.body.dataset.state = state;
    elements.brandName.textContent = t.brand;
    elements.stateText.textContent = t[state];
    elements.remaining.textContent = Number.isFinite(remaining) ? `${remaining}%` : "--%";
    elements.remainingLabel.textContent = t.remaining;
    elements.liquidFill.style.height = Number.isFinite(remaining) ? `${remaining}%` : "0%";
    elements.primaryLabel.textContent = miniMode ? t.primaryMini : t.primary;
    elements.primaryText.textContent = windowText(quota?.primary);
    elements.primaryText.title = windowText(quota?.primary);
    elements.primaryMiniPercent.textContent = error ? (language === "zh" ? "失败" : "Error") : miniPercent(quota?.primary);
    elements.primaryMiniReset.textContent = miniFiveHourReset(quota?.primary);
    elements.primaryMiniReset.title = windowText(quota?.primary);
    elements.secondaryLabel.textContent = miniMode ? t.secondaryMini : t.secondary;
    elements.secondaryText.textContent = windowText(quota?.secondary);
    elements.secondaryText.title = windowText(quota?.secondary);
    elements.secondaryMiniPercent.textContent = error ? (language === "zh" ? "失败" : "Error") : miniPercent(quota?.secondary);
    elements.secondaryMiniReset.textContent = miniSevenDayReset(quota?.secondary);
    elements.secondaryMiniReset.title = windowText(quota?.secondary);
    elements.planLabel.textContent = t.plan;
    elements.planText.textContent = quota?.planType && quota.planType !== "unknown" ? quota.planType.toUpperCase() : "--";
    elements.statusText.textContent = loading ? t.refresh : error ? `${t.failed}: ${error}` : quota ? t.updated : t.unavailable;
    widget.title = error ? `${t.failed}: ${error}` : "";
    elements.langBtn.textContent = language === "zh" ? "EN" : "中";
    elements.modeBtn.textContent = miniMode ? "↗" : "MINI";
    elements.modeBtn.title = elements.modeBtn.ariaLabel = miniMode ? t.exitMini : t.enterMini;
    elements.pinBtn.classList.toggle("active", alwaysOnTop);
    elements.pinBtn.title = elements.pinBtn.ariaLabel = alwaysOnTop ? t.unpin : t.pin;
    elements.closeBtn.title = elements.closeBtn.ariaLabel = language === "zh" ? "隐藏到托盘" : "Hide to tray";
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    error = null;
    render();
    try {
      quota = await api.getQuota();
    } catch (failure) {
      error = failure?.message || String(failure);
    } finally {
      loading = false;
      render();
    }
  }

  elements.langBtn.addEventListener("click", () => {
    language = language === "zh" ? "en" : "zh";
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    render();
  });
  async function toggleMiniMode(event) {
    const nextMode = !miniMode;
    applyMiniMode(nextMode);
    try {
      applyMiniMode(await api.setMiniMode(nextMode));
    } catch (failure) {
      console.error("Could not resize widget:", failure);
      applyMiniMode(!nextMode);
    }
  }
  document.addEventListener("pointerdown", (event) => {
    const bounds = elements.modeBtn.getBoundingClientRect();
    const insideButton = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (event.target === elements.modeBtn || insideButton) {
      event.preventDefault();
      event.stopPropagation();
      toggleMiniMode(event);
    }
  }, true);
  elements.pinBtn.addEventListener("click", async () => {
    alwaysOnTop = await api.setAlwaysOnTop(!alwaysOnTop);
    render();
  });
  elements.refreshBtn.addEventListener("click", refresh);
  elements.minimizeBtn.addEventListener("click", () => api.minimize());
  elements.closeBtn.addEventListener("click", () => api.minimize());
  api.onRefresh(refresh);
  api.onAlwaysOnTopChanged((value) => { alwaysOnTop = value; render(); });
  api.onMiniModeChanged(applyMiniMode);
  api.getAlwaysOnTop().then((value) => { alwaysOnTop = value; render(); });
  document.body.dataset.mode = miniMode ? "mini" : "full";
  applyMiniMode(miniMode);
  api.setMiniMode(miniMode, savedMiniWidth).then(applyMiniMode);
  window.addEventListener("resize", () => {
    if (miniMode && window.innerHeight <= 70) localStorage.setItem("miniWidth", String(window.innerWidth));
  });
  for (const [id, edge] of [["resizeLeft", "left"], ["resizeRight", "right"]]) {
    const handle = $(id);
    handle.addEventListener("pointerdown", (event) => {
      if (!miniMode) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const initialWidth = window.innerWidth;
      const initialScreenX = event.screenX;
      const onMove = (moveEvent) => {
        const delta = moveEvent.screenX - initialScreenX;
        const width = edge === "left" ? initialWidth - delta : initialWidth + delta;
        api.setMiniWidth(width, edge).then((appliedWidth) => {
          localStorage.setItem("miniWidth", String(appliedWidth));
        });
      };
      const stopResize = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", stopResize);
        handle.removeEventListener("pointercancel", stopResize);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", stopResize);
      handle.addEventListener("pointercancel", stopResize);
    });
  }
  setInterval(refresh, 60000);
  setInterval(render, 30000);
  refresh();
})();
