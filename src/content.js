'use strict';

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function getDomain() {
  return window.location.hostname.replace(/^www\./, '');
}

function isLateNight() {
  const h = new Date().getHours();
  return h >= 22 || h < 6;
}

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let limitOverlayShown  = false;
let checkOverlayShown  = false;
let snoozeUntil        = 0;
let checkCooldownUntil = 0;

// Scroll session tracker
const scroller = {
  history      : [],        // [{dist, ts}] — rolling 15-second window
  sessionStart : null,      // when the rapid-scroll session started
  slowSince    : null,      // when velocity first dropped below threshold
  lastY        : window.scrollY,
};

const VELOCITY_WINDOW_MS  = 15_000;   // rolling window for avg velocity
const VELOCITY_THRESHOLD  = 400;      // px/sec average → "rapid scrolling"
const MINDLESS_TRIGGER_MS = 3 * 60_000; // 3 min of rapid → show check
const SLOW_RESET_MS       = 60_000;   // 1 min of slow → reset session
const CHECK_COOLDOWN_MS   = 10 * 60_000; // 10 min between checks

// ─────────────────────────────────────────────
//  Limit-exceeded Overlay
// ─────────────────────────────────────────────
function showLimitOverlay(domain) {
  if (limitOverlayShown) return;
  if (Date.now() < snoozeUntil) return;
  if (document.getElementById('focusshield-overlay')) return;
  limitOverlayShown = true;

  const night = isLateNight();
  const el = document.createElement('div');
  el.id = 'focusshield-overlay';
  el.innerHTML = `
    <div id="focusshield-modal">
      <div class="fs-emoji">🛡️</div>
      <h1>Time to Disconnect.</h1>
      <p>You've reached your daily limit for
         <span id="focusshield-domain">${domain}</span>.<br>
         ${night
           ? "It's late — rest is productive too. 🌙"
           : "Take a 5-minute break to refresh your mind."}</p>
      <button id="fs-close-tab" class="fs-button">Close Tab</button>
      <button id="fs-dismiss"   class="fs-button-outline">Snooze 5 min</button>
    </div>`;
  document.body.appendChild(el);

  el.querySelector('#fs-close-tab').addEventListener('click', () =>
    chrome.runtime.sendMessage({ action: 'close_tab' }));

  el.querySelector('#fs-dismiss').addEventListener('click', () => {
    el.remove();
    limitOverlayShown = false;
    snoozeUntil = Date.now() + 5 * 60_000;
  });
}

// ─────────────────────────────────────────────
//  "Still intentional?" Check Overlay
// ─────────────────────────────────────────────
function showIntentionalityCheck(elapsedMin) {
  if (checkOverlayShown) return;
  if (Date.now() < checkCooldownUntil) return;
  if (document.getElementById('focusshield-check-overlay')) return;
  checkOverlayShown  = true;
  checkCooldownUntil = Date.now() + CHECK_COOLDOWN_MS;

  const domain = getDomain();
  const night  = isLateNight();

  const el = document.createElement('div');
  el.id = 'focusshield-check-overlay';
  el.innerHTML = `
    <div id="focusshield-check-modal">
      <div class="fs-emoji">${night ? '🌙' : '🤔'}</div>
      <h1>Still intentional?</h1>
      ${night ? '<div class="fs-night-badge">🌙 Late-night scrolling detected</div>' : ''}
      <p>You've been scrolling <strong>${domain}</strong>
         for <strong>${elapsedMin} min</strong>
         ${night ? 'at this hour' : 'straight'}.</p>
      <p class="fs-sub">
        ${night
          ? 'Late-night scrolling is often stress or boredom — not intention.'
          : 'Is this how you want to spend your time right now?'}
      </p>
      <input id="fs-intent-input"
             type="text"
             placeholder='Type "yes" to continue intentionally'
             autocomplete="off" />
      <button id="fs-intent-continue" class="fs-button" disabled>
        Continue Intentionally
      </button>
      <button id="fs-intent-close" class="fs-button-outline">
        I'm Done — Close Tab
      </button>
    </div>`;
  document.body.appendChild(el);

  const input    = el.querySelector('#fs-intent-input');
  const contBtn  = el.querySelector('#fs-intent-continue');

  input.focus();
  input.addEventListener('input', () => {
    contBtn.disabled = input.value.trim().toLowerCase() !== 'yes';
  });

  contBtn.addEventListener('click', () => {
    if (input.value.trim().toLowerCase() !== 'yes') return;
    el.remove();
    checkOverlayShown = false;
    // Reset scroll session so the 3-min clock restarts
    scroller.sessionStart = null;
    scroller.slowSince    = null;
  });

  el.querySelector('#fs-intent-close').addEventListener('click', () =>
    chrome.runtime.sendMessage({ action: 'close_tab' }));
}

// ─────────────────────────────────────────────
//  Scroll Detection
// ─────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const now  = Date.now();
  const dist = Math.abs(window.scrollY - scroller.lastY);
  scroller.lastY = window.scrollY;

  // Build rolling velocity window
  scroller.history.push({ dist, ts: now });
  const cutoff = now - VELOCITY_WINDOW_MS;
  scroller.history = scroller.history.filter(e => e.ts > cutoff);

  const totalDist = scroller.history.reduce((s, e) => s + e.dist, 0);
  const velocity  = (totalDist / VELOCITY_WINDOW_MS) * 1000; // px/sec

  if (velocity >= VELOCITY_THRESHOLD) {
    scroller.slowSince = null; // still scrolling fast
    if (!scroller.sessionStart) {
      scroller.sessionStart = now;
    } else {
      const elapsed = now - scroller.sessionStart;
      if (elapsed >= MINDLESS_TRIGGER_MS) {
        showIntentionalityCheck(Math.round(elapsed / 60_000));
      }
    }
  } else {
    // Velocity dropped — only reset session if slow for SLOW_RESET_MS
    if (!scroller.slowSince) {
      scroller.slowSince = now;
    } else if (now - scroller.slowSince >= SLOW_RESET_MS) {
      scroller.sessionStart = null;
      scroller.slowSince    = null;
    }
  }
}, { passive: true });

// ─────────────────────────────────────────────
//  Limit Check (storage-driven — primary path)
// ─────────────────────────────────────────────
function checkLimit(usage, limits) {
  const d = getDomain();
  if (!d) return;
  const spent = usage[d] || 0;
  const limit = limits[d];
  if (limit && spent >= limit) showLimitOverlay(d);
}

// Fires every time background writes usage (~every alarm tick)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  chrome.storage.local.get(['usage', 'limits'], data =>
    checkLimit(data.usage || {}, data.limits || {}));
});

// Background fast-path message (fires immediately when limit first crossed)
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'LIMIT_REACHED' && message.domain === getDomain())
    showLimitOverlay(message.domain);
});

// Initial check when content script first injects into the page
chrome.storage.local.get(['usage', 'limits'], data =>
  checkLimit(data.usage || {}, data.limits || {}));
