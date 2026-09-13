import { addHistoryEntry, removeHistoryEntry, type HistoryEntry } from "../lib/history";
import { pickCandidates, refreshCandidates, withExact } from "../lib/locatorEngine";
import { matchLocator } from "../lib/matcher";
import {
  PAGE_CHANNEL,
  isPageEnvelope,
  type BroadcastMessage,
  type ContentResponse,
  type ExtensionMessage,
  type FindResultMessage,
} from "../lib/messages";
import { deepElementFromPoint } from "../lib/domQuery";
import { parseLocator } from "../lib/parser";
import { saveLanguage } from "../lib/settings";
import type { CodeLanguage, LocatorCandidate, ResolutionKind } from "../lib/types";
import overlayCss from "./overlay.css";
import { buildDockedPanel, type DockedPanelApi } from "./ui";

declare global {
  interface Window {
    __locatorPilotLoaded?: boolean;
  }
}

if (!window.__locatorPilotLoaded) {
  window.__locatorPilotLoaded = true;
  main();
}

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

  const isTopFrame = window.self === window.top;

  let pickerActive = false;
  let highlightBox: HTMLElement | null = null;
  let lastHovered: Element | null = null;
  let pendingTestIdAttribute = "data-testid";
  let pendingLanguage: CodeLanguage = "csharp";
  let panelApi: DockedPanelApi | null = null;
  let panelVisible = false;
  let clearHighlightsTimeout: number | undefined;
  let findWaitTimer: number | undefined;
  let findTotal = 0;
  let findGuessed = false;
  let findChained = false;
  let findError: string | undefined;
  const trackedHighlights: { box: HTMLElement; el: Element }[] = [];

  // Live re-check: whichever frame most recently picked an element owns
  // `liveRecheckCandidates` and watches its own document for changes, so an
  // SPA re-render doesn't leave the panel showing stale match counts.
  let liveRecheckObserver: MutationObserver | null = null;
  let liveRecheckDebounce: number | undefined;
  let liveRecheckCandidates: LocatorCandidate[] | null = null;
  // Set once at pick time and carried through every subsequent candidates-updated
  // message for this pick (live re-check, exact-toggle) — resolution (docs/
  // LOCATOR_STRATEGY.md §1) doesn't change as match counts are refreshed.
  let liveRecheckResolvedVia: ResolutionKind | null = null;

  // In-memory only (see docs/history note in src/lib/history.ts) — resets when the
  // content script reloads (page navigation), never written to chrome.storage.
  let history: HistoryEntry[] = [];

  document.documentElement.appendChild(host);
  window.addEventListener("scroll", repositionTrackedHighlights, { capture: true, passive: true });
  window.addEventListener("resize", repositionTrackedHighlights, { passive: true });

  function handleContentResponse(message: ContentResponse): void {
    if (message.type === "element-picked") onElementPicked(message.candidates, message.resolvedVia);
    else if (message.type === "find-result") onFindResult(message);
    else onCandidatesUpdated(message.candidates, message.resolvedVia);
  }

  function publishToTop(message: ContentResponse): void {
    if (isTopFrame) {
      handleContentResponse(message);
      return;
    }
    window.top?.postMessage({ source: PAGE_CHANNEL, message }, "*");
  }

  function stopLiveRecheck(): void {
    liveRecheckObserver?.disconnect();
    liveRecheckObserver = null;
    if (liveRecheckDebounce !== undefined) {
      window.clearTimeout(liveRecheckDebounce);
      liveRecheckDebounce = undefined;
    }
    liveRecheckCandidates = null;
    liveRecheckResolvedVia = null;
  }

  function startLiveRecheck(candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null): void {
    stopLiveRecheck();
    liveRecheckCandidates = candidates;
    liveRecheckResolvedVia = resolvedVia;
    liveRecheckObserver = new MutationObserver(() => {
      if (liveRecheckDebounce !== undefined) return;
      liveRecheckDebounce = window.setTimeout(() => {
        liveRecheckDebounce = undefined;
        if (!liveRecheckCandidates) return;
        liveRecheckCandidates = refreshCandidates(liveRecheckCandidates, document);
        publishToTop({
          type: "candidates-updated",
          candidates: liveRecheckCandidates,
          resolvedVia: liveRecheckResolvedVia,
        });
      }, 300);
    });
    liveRecheckObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }

  function eventOnHost(e: Event): boolean {
    return e.composedPath().includes(host);
  }

  function ensureHighlightBox(): HTMLElement {
    if (!highlightBox) {
      highlightBox = document.createElement("div");
      highlightBox.className = "lp-highlight";
      highlightBox.style.display = "none";
      root.appendChild(highlightBox);
    }
    return highlightBox;
  }

  function positionBox(box: HTMLElement, rect: DOMRect): void {
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function showHighlightOn(el: Element, secondary = false): HTMLElement {
    const box = document.createElement("div");
    box.className = secondary ? "lp-highlight lp-secondary" : "lp-highlight";
    positionBox(box, el.getBoundingClientRect());
    root.appendChild(box);
    trackedHighlights.push({ box, el });
    return box;
  }

  function untrackHighlight(box: HTMLElement): void {
    const index = trackedHighlights.findIndex((entry) => entry.box === box);
    if (index !== -1) trackedHighlights.splice(index, 1);
  }

  function repositionTrackedHighlights(): void {
    for (const { box, el } of trackedHighlights) {
      positionBox(box, el.getBoundingClientRect());
    }
    if (lastHovered && highlightBox && highlightBox.style.display !== "none") {
      positionBox(highlightBox, lastHovered.getBoundingClientRect());
    }
  }

  function updateHoverHighlight(el: Element | null): void {
    const box = ensureHighlightBox();
    if (!el) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    positionBox(box, el.getBoundingClientRect());
  }

  function onMouseMove(e: MouseEvent): void {
    if (eventOnHost(e)) return;
    const target = deepElementFromPoint(document, e.clientX, e.clientY);
    if (target === host || (target && host.contains(target))) return;
    lastHovered = target;
    updateHoverHighlight(target);
  }

  function onClick(e: MouseEvent): void {
    if (eventOnHost(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const picked = lastHovered ?? deepElementFromPoint(document, e.clientX, e.clientY);
    stopPicker({ keepPanelArmed: false, broadcastStop: true });
    if (!picked) return;

    const { candidates, target, resolvedVia } = pickCandidates(picked, {
      testIdAttribute: pendingTestIdAttribute,
    });
    publishToTop({ type: "element-picked", candidates, resolvedVia });
    startLiveRecheck(candidates, resolvedVia);

    // Always show what was clicked; when resolution (docs/LOCATOR_STRATEGY.md §1)
    // promoted to a different element, add a second box so it's clear the
    // candidates target that element, not the one under the cursor.
    const highlights = [showHighlightOn(picked)];
    if (target !== picked) highlights.push(showHighlightOn(target, true));
    setTimeout(() => {
      for (const highlight of highlights) {
        untrackHighlight(highlight);
        highlight.remove();
      }
    }, 4000);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      stopPicker({ keepPanelArmed: false, broadcastStop: true });
    }
  }

  function startPicker(testIdAttribute: string): void {
    // A fresh pick is starting — whichever frame currently owns the live
    // re-check for a previous pick is about to be superseded.
    stopLiveRecheck();
    pendingTestIdAttribute = testIdAttribute;
    if (pickerActive) return;
    pickerActive = true;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    panelApi?.setPicking(true);
  }

  function stopPicker(options: { keepPanelArmed: boolean; broadcastStop: boolean }): void {
    if (pickerActive) {
      pickerActive = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      updateHoverHighlight(null);
    }
    if (!options.keepPanelArmed) panelApi?.setPicking(false);
    if (options.broadcastStop && isTopFrame) {
      broadcast({ type: "deactivate-picker" });
    }
  }

  function clearFindHighlights(): void {
    for (const box of Array.from(root.querySelectorAll(".lp-highlight"))) {
      if (box !== highlightBox) {
        untrackHighlight(box as HTMLElement);
        box.remove();
      }
    }
  }

  function handleFindLocator(raw: string, testIdAttribute: string): void {
    clearTimeout(clearHighlightsTimeout);
    clearFindHighlights();

    let response: FindResultMessage;
    try {
      const { spec, guessed, chained } = parseLocator(raw, testIdAttribute);
      const matches = matchLocator(document, spec);
      for (const match of matches) {
        showHighlightOn(match, matches.length > 1);
      }
      if (matches.length > 0) {
        matches[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
        clearHighlightsTimeout = window.setTimeout(clearFindHighlights, 5000);
      }
      response = { type: "find-result", matchCount: matches.length, guessed, chained };
    } catch (err) {
      response = {
        type: "find-result",
        matchCount: 0,
        guessed: false,
        chained: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    publishToTop(response);
  }

  function showPanel(language: CodeLanguage): void {
    if (!isTopFrame) return;
    pendingLanguage = language;
    if (!panelApi) {
      panelApi = buildDockedPanel(language, {
        onPick: () => {
          broadcast({ type: "activate-picker", testIdAttribute: pendingTestIdAttribute });
        },
        onCancelPick: () => {
          stopPicker({ keepPanelArmed: false, broadcastStop: true });
        },
        onFind: (raw) => {
          const trimmed = raw.trim();
          if (!trimmed) {
            panelApi?.setFindResult("Paste a locator first.", "error");
            return;
          }
          findTotal = 0;
          findGuessed = false;
          findChained = false;
          findError = undefined;
          panelApi?.setFindResult("Searching…", "");
          if (findWaitTimer !== undefined) window.clearTimeout(findWaitTimer);
          findWaitTimer = window.setTimeout(() => {
            findWaitTimer = undefined;
            if (findError) {
              panelApi?.setFindResult(findError, "error");
              return;
            }
            const guessNote = findGuessed ? " (interpreted as a raw selector)" : "";
            const chainNote = findChained
              ? " — chained calls like .filter()/.nth()/.first() were ignored; showing all matches for the base locator"
              : "";
            const note = `${guessNote}${chainNote}`;
            if (findTotal === 0) panelApi?.setFindResult(`No matches found on this page${note}.`, "error");
            else if (findTotal === 1 && !findChained)
              panelApi?.setFindResult(`Found 1 match — highlighted on the page${note}.`, "ok");
            else panelApi?.setFindResult(`Found ${findTotal} matches — highlighted on the page${note}.`, "warn");
          }, 400);
          broadcast({ type: "find-locator", raw: trimmed, testIdAttribute: pendingTestIdAttribute });
        },
        onClose: () => hidePanel(),
        onLanguageChange: (next) => {
          pendingLanguage = next;
          void saveLanguage(next);
        },
        onToggleExact: (index, exact) => {
          // The common case (no iframes, or the pick happened in this very
          // frame) can be handled synchronously and instantly. Only fall back
          // to the cross-frame broadcast — a real round-trip through the
          // background service worker, which can lag if it was asleep — when
          // this frame isn't the one that owns the current pick.
          if (liveRecheckCandidates) {
            liveRecheckCandidates = withExact(liveRecheckCandidates, index, exact, document);
            onCandidatesUpdated(liveRecheckCandidates, liveRecheckResolvedVia);
          } else {
            broadcast({ type: "recompute-exact", index, exact });
          }
        },
        onOptions: () => {
          void chrome.runtime.sendMessage({ type: "open-options" });
        },
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
    }
    panelApi.setLanguage(language);
    panelApi.root.style.display = "flex";
    panelVisible = true;
  }

  function hidePanel(): void {
    stopPicker({ keepPanelArmed: false, broadcastStop: true });
    if (panelApi) panelApi.root.style.display = "none";
    panelVisible = false;
    broadcast({ type: "clear-live-recheck" });
  }

  function onElementPicked(candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null): void {
    if (!isTopFrame) return;
    stopPicker({ keepPanelArmed: false, broadcastStop: true });
    showPanel(pendingLanguage);
    panelApi?.setCandidates(candidates, resolvedVia);
    history = addHistoryEntry(history, {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      candidates,
      resolvedVia,
    });
    panelApi?.setHistory(history);
  }

  function onFindResult(message: FindResultMessage): void {
    if (!isTopFrame || findWaitTimer === undefined) return;
    if (message.error) {
      findError = message.error;
      return;
    }
    findTotal += message.matchCount;
    findGuessed = findGuessed || message.guessed;
    findChained = findChained || message.chained;
  }

  function onCandidatesUpdated(candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null): void {
    if (!isTopFrame) return;
    panelApi?.setCandidates(candidates, resolvedVia);
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (!isTopFrame || !isPageEnvelope(event.data)) return;
    handleContentResponse(event.data.message);
  });

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "toggle-panel") {
      pendingTestIdAttribute = message.testIdAttribute;
      pendingLanguage = message.language;
      if (!isTopFrame) return;
      if (panelVisible) hidePanel();
      else showPanel(message.language);
    } else if (message.type === "activate-picker") {
      startPicker(message.testIdAttribute);
    } else if (message.type === "deactivate-picker") {
      stopPicker({ keepPanelArmed: false, broadcastStop: false });
    } else if (message.type === "find-locator") {
      handleFindLocator(message.raw, message.testIdAttribute);
    } else if (message.type === "clear-live-recheck") {
      stopLiveRecheck();
    } else if (message.type === "recompute-exact") {
      if (!liveRecheckCandidates) return;
      liveRecheckCandidates = withExact(liveRecheckCandidates, message.index, message.exact, document);
      publishToTop({
        type: "candidates-updated",
        candidates: liveRecheckCandidates,
        resolvedVia: liveRecheckResolvedVia,
      });
    }
  });
}