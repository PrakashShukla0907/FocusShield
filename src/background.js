let activeTabId = null;
let activeDomain = null;
let startTime = null;

const DEFAULT_WORK_MODE = {
  enabled: false,
  startHour: 9,
  endHour: 17,
  blockedSites: [
    'youtube.com', 'x.com', 'instagram.com', 'facebook.com', 
    'reddit.com', 'netflix.com', 'snapchat.com'
  ],
};

// ─── helpers ──────────────────────────────────────────────────
function getDomain(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── time tracking ────────────────────────────────────────────
async function updateTime() {
  if (!activeDomain || !startTime) return;
  const now = Date.now();
  const spent = now - startTime;

  const data = await chrome.storage.local.get(["usage", "limits"]);
  const usage = data.usage || {};
  const limits = data.limits || {};

  usage[activeDomain] = (usage[activeDomain] || 0) + spent;
  await chrome.storage.local.set({ usage });

  if (limits[activeDomain] && usage[activeDomain] >= limits[activeDomain]) {
    if (activeTabId !== null) {
      chrome.tabs
        .sendMessage(activeTabId, {
          type: "LIMIT_REACHED",
          domain: activeDomain,
        })
        .catch(() => {});
    }
  }
  startTime = now; // reset for continuous tracking
}

// ─── work-mode block check ────────────────────────────────────
async function maybeBlockTab(tabId, url) {
  if (!url) return false;
  // Never redirect extension pages
  if (url.startsWith(chrome.runtime.getURL(""))) return false;

  const domain = getDomain(url);
  if (!domain) return false;

  const data = await chrome.storage.local.get(["workMode", "usage", "limits"]);
  const workMode = data.workMode || DEFAULT_WORK_MODE;
  if (!workMode.enabled) return false;

  const hour = new Date().getHours();
  if (hour < workMode.startHour || hour >= workMode.endHour) return false;

  const isBlocked = (workMode.blockedSites || []).some(
    (s) => domain === s || domain.endsWith("." + s),
  );
  if (!isBlocked) return false;

  // Respect daily limits for blocked sites
  const limits = data.limits || {};
  const usage = data.usage || {};
  if (limits[domain] !== undefined && (usage[domain] || 0) < limits[domain]) {
    return false; // Time limit not reached yet
  }

  const blockedUrl =
    chrome.runtime.getURL("blocked.html") +
    "?site=" +
    encodeURIComponent(domain);
  chrome.tabs.update(tabId, { url: blockedUrl }).catch(() => {});
  return true;
}

// ─── tab activation ───────────────────────────────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateTime();
  activeTabId = activeInfo.tabId;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    activeDomain = getDomain(tab.url);
    startTime = activeDomain ? Date.now() : null;
  } catch {
    activeDomain = null;
    startTime = null;
  }
});

// ─── tab navigation ───────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Work-mode block check for ALL tabs on URL change
  if (changeInfo.url) {
    const blocked = await maybeBlockTab(tabId, changeInfo.url);
    if (blocked) return;
  }

  // Time-tracking only for the active tab
  if (tabId === activeTabId && changeInfo.url) {
    await updateTime();
    activeDomain = getDomain(changeInfo.url);
    startTime = activeDomain ? Date.now() : null;
  }
});

// ─── messages from content scripts ───────────────────────────
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "close_tab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
});

// ─── window focus changes ──────────────────────────────────────
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await updateTime();
    activeDomain = null;
    startTime = null;
  } else {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0) {
        await updateTime();
        activeTabId = tabs[0].id;
        activeDomain = getDomain(tabs[0].url);
        startTime = activeDomain ? Date.now() : null;
      }
    } catch {}
  }
});

// ─── alarms ───────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "periodicSave") {
    await updateTime();
  } else if (alarm.name === "midnightReset") {
    await updateTime();
    await chrome.storage.local.set({ usage: {} });
    scheduleMidnightReset();
    startTime = Date.now();
  }
});

function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  chrome.alarms.create("midnightReset", { when: midnight.getTime() });
}

// ─── install / startup ────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["usage", "limits", "workMode"], (result) => {
    if (!result.usage) chrome.storage.local.set({ usage: {} });
    if (!result.limits) chrome.storage.local.set({ limits: {} });
    if (!result.workMode)
      chrome.storage.local.set({ workMode: DEFAULT_WORK_MODE });
  });
  scheduleMidnightReset();
  // Periodic save every ~5 s via alarms (MV3-safe; setInterval dies with the SW)
  chrome.alarms.create("periodicSave", { periodInMinutes: 1 / 12 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get("periodicSave", (a) => {
    if (!a) chrome.alarms.create("periodicSave", { periodInMinutes: 1 / 12 });
  });
  chrome.alarms.get("midnightReset", (a) => {
    if (!a) scheduleMidnightReset();
  });
});
