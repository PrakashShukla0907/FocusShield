// FocusShield – blocked page script
// All button handlers here (inline onclick is blocked by Chrome MV3 CSP)

// ── site name ────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const site = params.get('site');
if (site) {
  document.getElementById('site-name').textContent = site + ' is blocked';
}

// ── work hours from storage ───────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get(['workMode'], (data) => {
    const wm = data.workMode;
    if (wm) {
      const fmt = (h) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const disp = h % 12 === 0 ? 12 : h % 12;
        return `${disp}:00 ${ampm}`;
      };
      document.getElementById('work-hours-display').textContent =
        `🕘 ${fmt(wm.startHour)} – ${fmt(wm.endHour)}`;
    }
  });
}

// ── live clock ────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clock-display').textContent =
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
updateClock();
setInterval(updateClock, 1000);

// ── buttons ───────────────────────────────────────────────────
// "Go Back" – navigate to the page before the blocked site.
// We go back 2 steps: (-1) would be the blocked redirect itself,
// (-2) takes us to the actual previous page.
document.getElementById('btn-back').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.go(-2);
  } else {
    // No real history – open new tab page instead
    window.location.href = 'chrome://newtab';
  }
});

// "Open New Tab" – safe fallback that always works
document.getElementById('btn-newtab').addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: 'chrome://newtab' });
  } else {
    window.open('about:blank', '_blank');
  }
});
