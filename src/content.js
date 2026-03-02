let isOverlayShown = false;

function showOverlay(domain) {
  if (isOverlayShown) return;
  isOverlayShown = true;

  const overlay = document.createElement("div");
  overlay.id = "focusshield-overlay";

  const modal = document.createElement("div");
  modal.id = "focusshield-modal";

  modal.innerHTML = `
    <h1>Time to Disconnect.</h1>
    <p>You've reached your daily limit for <span id="focusshield-domain">${domain}</span>.<br/>Take a 5 minute break to refresh your mind.</p>
    <button id="fs-close-tab" class="fs-button">Close Tab</button>
    <button id="fs-dismiss" class="fs-button-outline">Dismiss (I need a minute)</button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById("fs-close-tab").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "close_tab" });
  });

  document.getElementById("fs-dismiss").addEventListener("click", () => {
    overlay.remove();
    // Prevent immediate reappearance, we'll implement a temporary snooze or just allow it 
    // until background script sends limit reached again (e.g. next time interval)
    setTimeout(() => {
        isOverlayShown = false;
    }, 60000); // 1 minute snooze on dismissal
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LIMIT_REACHED") {
    showOverlay(message.domain);
  }
});
