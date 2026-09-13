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

  if (message.type !== "broadcast") return;
  const tabId = sender.tab?.id;
  if (!tabId) return;
  const payload = (message as BroadcastMessage).payload;
  void sendToTab(tabId, payload);
});