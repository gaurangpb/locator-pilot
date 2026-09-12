import type { ExtensionMessage, FindResultMessage } from "../lib/messages";
import { DEFAULT_TEST_ID_ATTRIBUTE } from "../lib/types";

async function getTestIdAttribute(): Promise<string> {
  const stored = await chrome.storage.sync.get("testIdAttribute");
  return typeof stored.testIdAttribute === "string" && stored.testIdAttribute.trim()
    ? stored.testIdAttribute.trim()
    : DEFAULT_TEST_ID_ATTRIBUTE;
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab.id;
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });
}

async function sendToTab(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // a frame with no listener (e.g. a browser-internal frame) is expected and harmless
  }
}

function setFindResult(text: string, kind: "ok" | "warn" | "error" | "") {
  const el = document.getElementById("find-result")!;
  el.textContent = text;
  el.className = `find-result ${kind}`.trim();
}

function wireOptionsLink(): void {
  document.getElementById("options-link")!.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

function wirePickButton(): void {
  const button = document.getElementById("pick-btn") as HTMLButtonElement;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const testIdAttribute = await getTestIdAttribute();
      const tabId = await getActiveTabId();
      await ensureContentScriptInjected(tabId);
      await sendToTab(tabId, { type: "activate-picker", testIdAttribute });
      window.close();
    } catch (err) {
      button.disabled = false;
      setFindResult(err instanceof Error ? err.message : String(err), "error");
    }
  });
}

function wireFindButton(): void {
  const button = document.getElementById("find-btn") as HTMLButtonElement;
  const textarea = document.getElementById("paste-input") as HTMLTextAreaElement;
  let aggregateTimer: number | undefined;
  let aggregateTotal = 0;
  let aggregateGuessed = false;

  chrome.runtime.onMessage.addListener((message: FindResultMessage) => {
    if (message.type !== "find-result") return;
    if (aggregateTimer === undefined) return; // not currently waiting on a find
    if (message.error) {
      window.clearTimeout(aggregateTimer);
      aggregateTimer = undefined;
      setFindResult(message.error, "error");
      return;
    }
    aggregateTotal += message.matchCount;
    aggregateGuessed = aggregateGuessed || message.guessed;
  });

  button.addEventListener("click", async () => {
    const raw = textarea.value.trim();
    if (!raw) {
      setFindResult("Paste a locator first.", "error");
      return;
    }

    button.disabled = true;
    setFindResult("Searching…", "");
    aggregateTotal = 0;
    aggregateGuessed = false;
    if (aggregateTimer !== undefined) window.clearTimeout(aggregateTimer);

    try {
      const testIdAttribute = await getTestIdAttribute();
      const tabId = await getActiveTabId();
      await ensureContentScriptInjected(tabId);
      await sendToTab(tabId, { type: "find-locator", raw, testIdAttribute });

      aggregateTimer = window.setTimeout(() => {
        aggregateTimer = undefined;
        button.disabled = false;
        const guessNote = aggregateGuessed ? " (interpreted as a raw selector)" : "";
        if (aggregateTotal === 0) {
          setFindResult(`No matches found on this page${guessNote}.`, "error");
        } else if (aggregateTotal === 1) {
          setFindResult(`Found 1 match — highlighted on the page${guessNote}.`, "ok");
        } else {
          setFindResult(`Found ${aggregateTotal} matches — highlighted on the page${guessNote}.`, "warn");
        }
      }, 400);
    } catch (err) {
      button.disabled = false;
      aggregateTimer = undefined;
      setFindResult(err instanceof Error ? err.message : String(err), "error");
    }
  });
}

wireOptionsLink();
wirePickButton();
wireFindButton();
