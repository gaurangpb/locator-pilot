import { loadSettings } from "../lib/settings";
import type { BroadcastMessage, ExtensionMessage } from "../lib/messages";

async function inject(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });
}

async function sendToTab(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // frames without a listener (browser-internal pages) are expected
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await inject(tab.id);
    const settings = await loadSettings();
    await sendToTab(tab.id, { type: "toggle-panel", ...settings });
  } catch {
    // chrome:// and the Web Store reject content-script injection
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
  if (message.type === "open-options") {
    void chrome.runtime.openOptionsPage();
    return;
  }

  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (message.type === "relay-to-top") {
    // A sub-frame's result for the panel, which lives in the top frame. Routed
    // through here (rather than window.postMessage) so the page can neither read
    // it nor forge one: only this extension's own scripts can reach this listener.
    chrome.tabs.sendMessage(tabId, message.message, { frameId: 0 }).catch(() => {
      // the top frame's content script is gone (navigated away)
    });
    return;
  }

  if (message.type !== "broadcast") return;
  const payload = (message as BroadcastMessage).payload;
  void sendToTab(tabId, payload);
});