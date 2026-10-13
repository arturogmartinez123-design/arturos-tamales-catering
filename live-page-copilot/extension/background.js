const BACKEND = "http://127.0.0.1:8787";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Content script → side panel: forward snapshot
  if (msg.type === "LPC_SNAPSHOT") {
    const tabId = sender.tab?.id;
    chrome.runtime
      .sendMessage({
        type: "LPC_SNAPSHOT",
        snapshot: msg.snapshot,
        tabId,
      })
      .catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // Side panel → content script helpers
  if (msg.type === "LPC_TO_TAB") {
    const tabId = msg.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tabId" });
      return true;
    }
    chrome.tabs.sendMessage(tabId, msg.payload, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response || { ok: true });
      }
    });
    return true;
  }

  if (msg.type === "LPC_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ ok: true, tab: tabs[0] || null });
    });
    return true;
  }

  if (msg.type === "LPC_BACKEND_URL") {
    sendResponse({ ok: true, url: BACKEND });
    return true;
  }
});
