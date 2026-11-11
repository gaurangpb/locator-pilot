import { addHistoryEntry, removeHistoryEntry, type HistoryEntry } from "../lib/history";
import { pickCandidates } from "../lib/locatorEngine";
import type { BroadcastMessage, ContentResponse, ExtensionMessage } from "../lib/messages";
import { parseLocator } from "../lib/parser";
import { evaluateQuery } from "../lib/query";
import { saveLanguage } from "../lib/settings";
import type { CodeLanguage, LocatorCandidate, ResolutionKind } from "../lib/types";
import { createFindAggregator } from "./findAggregator";
import { createHighlighter } from "./highlights";
import { createLiveRecheck } from "./liveRecheck";
import overlayCss from "./overlay.css";
import { createPicker } from "./picker";
import { buildDockedPanel, type DockedPanelApi } from "./ui";

// Injected into every frame of the tab (background.ts). Each frame picks, finds and
// live-rechecks in its own document; only the top frame shows the panel, and other
// frames' results reach it via the background worker (publishToTop).

declare global {
  interface Window {
    __locatorPilotLoaded?: boolean;
  }
}

if (!window.__locatorPilotLoaded) {
  window.__locatorPilotLoaded = true;
  main();
}

/** How long the top frame waits for every frame's find-result before summarizing. */
const FIND_WAIT_MS = 400;
const PICK_HIGHLIGHT_MS = 4000;
const FIND_HIGHLIGHT_MS = 5000;

function broadcast(payload: BroadcastMessage["payload"]): void {
  void chrome.runtime.sendMessage({ type: "broadcast", payload });
}

function main(): void {
  const host = document.createElement("div");
  host.id = "locator-pilot-host";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  shadow.appendChild(style);
  const root = document.createElement("div");
  root.className = "lp-root";
  shadow.appendChild(root);
  document.documentElement.appendChild(host);

  const isTopFrame = window.self === window.top;

  let testIdAttribute = "data-testid";
  let language: CodeLanguage = "csharp";
  let panelApi: DockedPanelApi | null = null;
  let panelVisible = false;
  let clearFindHighlightsTimer: number | undefined;
  let findWaitTimer: number | undefined;
  const find = createFindAggregator();

  // In-memory only (see the note in src/lib/history.ts) — resets when the content
  // script reloads (page navigation), never written to chrome.storage.
  let history: HistoryEntry[] = [];
  let historySeq = 0;

  const highlighter = createHighlighter(root);
  window.addEventListener("scroll", highlighter.reposition, { capture: true, passive: true });
  window.addEventListener("resize", highlighter.reposition, { passive: true });

  const liveRecheck = createLiveRecheck((candidates, resolvedVia) => {
    publishToTop({ type: "candidates-updated", candidates, resolvedVia });
  });

  const picker = createPicker({
    host,
    highlighter,
    onPicked: (picked) => {
      afterPickerStopped();
      if (picked) onPicked(picked);
    },
    onCancel: afterPickerStopped,
  });

  // ---- cross-frame plumbing -------------------------------------------------

  function handleContentResponse(message: ContentResponse): void {
    if (message.type === "element-picked") onElementPicked(message.candidates, message.resolvedVia);
    else if (message.type === "find-result") {
      if (isTopFrame && findWaitTimer !== undefined) find.add(message);
    } else onCandidatesUpdated(message.candidates, message.resolvedVia);
  }

  function publishToTop(message: ContentResponse): void {
    if (isTopFrame) {
      handleContentResponse(message);
      return;
    }
    // Via the background worker, not window.postMessage — the page must not be
    // able to read locator text sent from an embedded frame, or forge panel content.
    void chrome.runtime.sendMessage({ type: "relay-to-top", message });
  }

  // ---- picking ---------------------------------------------------------------

  function startPicker(nextTestIdAttribute: string): void {
    // A fresh pick is starting — whichever frame currently owns the live
    // re-check for a previous pick is about to be superseded.
    liveRecheck.stop();
    testIdAttribute = nextTestIdAttribute;
    picker.start();
    panelApi?.setPicking(true);
  }

  /** Panel/other-frame bookkeeping once this frame's picker has stopped (pick, Escape, or the panel's cancel). */
  function afterPickerStopped(): void {
    panelApi?.setPicking(false);
    if (isTopFrame) broadcast({ type: "deactivate-picker" });
  }

  function onPicked(picked: Element): void {
    const { candidates, target, resolvedVia } = pickCandidates(picked, { testIdAttribute });
    publishToTop({ type: "element-picked", candidates, resolvedVia });
    liveRecheck.start(candidates, resolvedVia);

    // Always show what was clicked; when resolution (docs/LOCATOR_STRATEGY.md §1)
    // promoted to a different element, add a second box so it's clear the
    // candidates target that element, not the one under the cursor.
    const boxes = [highlighter.show(picked)];
    if (target !== picked) boxes.push(highlighter.show(target, true));
    setTimeout(() => boxes.forEach((box) => highlighter.remove(box)), PICK_HIGHLIGHT_MS);
  }

  // ---- find on page ------------------------------------------------------------

  function handleFindLocator(raw: string, findTestIdAttribute: string): void {
    window.clearTimeout(clearFindHighlightsTimer);
    highlighter.clearAll();

    try {
      const { query, guessed, ignoredCalls } = parseLocator(raw, findTestIdAttribute);
      const matches = evaluateQuery(document, query);
      for (const match of matches) highlighter.show(match, matches.length > 1);
      if (matches.length > 0) {
        matches[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
        clearFindHighlightsTimer = window.setTimeout(() => highlighter.clearAll(), FIND_HIGHLIGHT_MS);
      }
      publishToTop({ type: "find-result", matchCount: matches.length, guessed, ignoredCalls });
    } catch (err) {
      publishToTop({
        type: "find-result",
        matchCount: 0,
        guessed: false,
        ignoredCalls: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function startFind(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) {
      panelApi?.setFindResult("Paste a locator first.", "error");
      return;
    }
    find.reset();
    panelApi?.setFindResult("Searching…", "");
    if (findWaitTimer !== undefined) window.clearTimeout(findWaitTimer);
    findWaitTimer = window.setTimeout(() => {
      findWaitTimer = undefined;
      const { text, kind } = find.summary();
      panelApi?.setFindResult(text, kind);
    }, FIND_WAIT_MS);
    broadcast({ type: "find-locator", raw: trimmed, testIdAttribute });
  }

  // ---- panel (top frame only) --------------------------------------------------

  function showPanel(nextLanguage: CodeLanguage): void {
    if (!isTopFrame) return;
    language = nextLanguage;
    if (!panelApi) {
      panelApi = buildDockedPanel(language, {
        onPick: () => broadcast({ type: "activate-picker", testIdAttribute }),
        onCancelPick: () => {
          picker.stop();
          afterPickerStopped();
        },
        onFind: startFind,
        onClose: hidePanel,
        onLanguageChange: (next) => {
          language = next;
          void saveLanguage(next);
        },
        onToggleExact: (index, exact) => {
          // The common case (no iframes, or the pick happened in this very
          // frame) can be handled synchronously and instantly. Only fall back
          // to the cross-frame broadcast — a real round-trip through the
          // background service worker, which can lag if it was asleep — when
          // this frame isn't the one that owns the current pick.
          if (liveRecheck.setExact(index, exact)) {
            onCandidatesUpdated(liveRecheck.candidates!, liveRecheck.resolvedVia);
          } else {
            broadcast({ type: "recompute-exact", index, exact });
          }
        },
        onOptions: () => void chrome.runtime.sendMessage({ type: "open-options" }),
        onRemoveHistoryEntry: (id) => {
          history = removeHistoryEntry(history, id);
          panelApi?.setHistory(history);
        },
        onClearHistory: () => {
          history = [];
          panelApi?.setHistory(history);
        },
      });
      root.appendChild(panelApi.root);
      // Escape inside the panel closes it, like most docked panels. While picking,
      // the picker's own capture-phase Escape handler runs first and marks the event
      // handled, so that first Escape only cancels the pick.
      panelApi.root.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        hidePanel();
      });
    }
    panelApi.setLanguage(language);
    panelApi.root.style.display = "flex";
    panelVisible = true;
  }

  function hidePanel(): void {
    picker.stop();
    afterPickerStopped();
    if (panelApi) panelApi.root.style.display = "none";
    panelVisible = false;
    broadcast({ type: "clear-live-recheck" });
  }

  function onElementPicked(candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null): void {
    if (!isTopFrame) return;
    picker.stop();
    afterPickerStopped();
    showPanel(language);
    panelApi?.setCandidates(candidates, resolvedVia);
    history = addHistoryEntry(history, {
      // Not crypto.randomUUID(): it only exists in secure contexts, so on a plain
      // http:// page it threw here — losing the history entry and skipping the live
      // re-check that the picking frame starts right after publishing.
      id: `pick-${Date.now()}-${++historySeq}`,
      timestamp: Date.now(),
      candidates,
      resolvedVia,
    });
    panelApi?.setHistory(history);
  }

  function onCandidatesUpdated(candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null): void {
    if (!isTopFrame) return;
    panelApi?.setCandidates(candidates, resolvedVia);
  }

  // ---- messages from the background worker -------------------------------------

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    switch (message.type) {
      case "element-picked":
      case "find-result":
      case "candidates-updated":
        // A sub-frame's result, relayed by the background worker to this (top) frame.
        if (isTopFrame) handleContentResponse(message);
        break;
      case "toggle-panel":
        testIdAttribute = message.testIdAttribute;
        language = message.language;
        if (!isTopFrame) return;
        if (panelVisible) hidePanel();
        else showPanel(message.language);
        break;
      case "activate-picker":
        startPicker(message.testIdAttribute);
        break;
      case "deactivate-picker":
        picker.stop();
        panelApi?.setPicking(false);
        break;
      case "find-locator":
        handleFindLocator(message.raw, message.testIdAttribute);
        break;
      case "clear-live-recheck":
        liveRecheck.stop();
        break;
      case "recompute-exact":
        if (liveRecheck.setExact(message.index, message.exact)) {
          publishToTop({
            type: "candidates-updated",
            candidates: liveRecheck.candidates!,
            resolvedVia: liveRecheck.resolvedVia,
          });
        }
        break;
    }
  });
}
