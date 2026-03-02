let activeTabId = null;
let activeDomain = null;
let startTime = null;

// Helper to extract domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    // Ignore chrome:// and other non-http/https URLs
    if (!['http:', 'https:'].includes(urlObj.protocol)) return null;
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

// Helper to update time
async function updateTime() {
  if (activeDomain && startTime) {
    const now = Date.now();
    const timeSpent = now - startTime;
    
    // Get existing data
    const data = await chrome.storage.local.get(['usage', 'limits']);
    const usage = data.usage || {};
    const limits = data.limits || {};
    
    usage[activeDomain] = (usage[activeDomain] || 0) + timeSpent;
    
    await chrome.storage.local.set({ usage });
    
    // Check if limit exceeded
    if (limits[activeDomain] && usage[activeDomain] >= limits[activeDomain]) {
       if (activeTabId !== null) {
         chrome.tabs.sendMessage(activeTabId, { type: "LIMIT_REACHED", domain: activeDomain }).catch(() => {});
       }
    }
    startTime = now; // reset start time for continuous tracking
  }
}

// Listen to tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateTime();
  activeTabId = activeInfo.tabId;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    activeDomain = getDomain(tab.url);
    if (activeDomain) startTime = Date.now();
    else startTime = null;
  } catch (e) {
    activeDomain = null;
    startTime = null;
  }
});

// Listen to tab updates (e.g. navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    await updateTime();
    activeDomain = getDomain(changeInfo.url);
    if (activeDomain) startTime = Date.now();
    else startTime = null;
  }
});

// Listen to messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "close_tab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
});

// Listen to window focus (user switches away from browser or back)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus
    await updateTime();
    activeDomain = null;
    startTime = null;
  } else {
    // Browser gained focus
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
      if (tabs.length > 0) {
        await updateTime();
        activeTabId = tabs[0].id;
        activeDomain = getDomain(tabs[0].url);
        if (activeDomain) startTime = Date.now();
        else startTime = null;
      }
    } catch (e) {}
  }
});

// Set up midnight reset alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "midnightReset") {
    await updateTime(); // save current time before reset
    await chrome.storage.local.set({ usage: {} });
    scheduleMidnightReset();
    startTime = Date.now(); // restart counting
  }
});

function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  chrome.alarms.create("midnightReset", { when: nextMidnight.getTime() });
}

// Initial setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['usage', 'limits'], (result) => {
    if (!result.usage) chrome.storage.local.set({ usage: {} });
    if (!result.limits) chrome.storage.local.set({ limits: {} });
  });
  scheduleMidnightReset();
});

// Periodically update time every 5 seconds to ensure UI stays fresh and we don't lose data on crash
setInterval(() => {
  updateTime();
}, 5000);
