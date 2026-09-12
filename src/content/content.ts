import { deepElementFromPoint } from "../lib/domQuery";
import { generateCandidates } from "../lib/locatorEngine";
import { matchLocator } from "../lib/matcher";
import type { ExtensionMessage, FindResultMessage } from "../lib/messages";
import { parseLocator } from "../lib/parser";
import overlayCss from "./overlay.css";
import { buildBanner, buildCandidatePanel, positionNear } from "./ui";

declare global {
  interface Window {
    __locatorPilotLoaded?: boolean;
  }
}

if (!window.__locatorPilotLoaded) {
  window.__locatorPilotLoaded = true;
  main();
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
  let banner: HTMLElement | null = null;
  let highlightBox: HTMLElement | null = null;
  let lastHovered: Element | null = null;
  let panel: HTMLElement | null = null;
  let clearHighlightsTimeout: number | undefined;

  document.documentElement.appendChild(host);

  function ensureHighlightBox(): HTMLElement {
    if (!highlightBox) {
      highlightBox = document.createElement("div");
      highlightBox.className = "lp-highlight";
      highlightBox.style.display = "none";
      root.appendChild(highlightBox);
    }
    return highlightBox;
  }

  function showHighlightAt(rect: DOMRect, secondary = false): HTMLElement {
    const box = document.createElement("div");
    box.className = secondary ? "lp-highlight lp-secondary" : "lp-highlight";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    root.appendChild(box);
    return box;
  }

  function updateHoverHighlight(el: Element | null): void {
    const box = ensureHighlightBox();
    if (!el) {
      box.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function onMouseMove(e: MouseEvent): void {
    const target = deepElementFromPoint(document, e.clientX, e.clientY);
    if (target === host || (target && host.contains(target))) return;
    lastHovered = target;
    updateHoverHighlight(target);
  }

  function onClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = lastHovered ?? deepElementFromPoint(document, e.clientX, e.clientY);
    stopPicker();
    if (!target) return;

    const testIdAttribute = pendingTestIdAttribute;
    const candidates = generateCandidates(target, { testIdAttribute });
    showResultsPanel(target, candidates);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      stopPicker();
    }
  }

  let pendingTestIdAttribute = "data-testid";

  function startPicker(testIdAttribute: string): void {
    pendingTestIdAttribute = testIdAttribute;
    if (pickerActive) return;
    pickerActive = true;
    closePanel();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    if (isTopFrame) {
      banner = buildBanner();
      root.appendChild(banner);
    }
  }

  function stopPicker(): void {
    if (!pickerActive) return;
    pickerActive = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    updateHoverHighlight(null);
    if (banner) {
      banner.remove();
      banner = null;
    }
  }

  function closePanel(): void {
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  function showResultsPanel(target: Element, candidates: Parameters<typeof buildCandidatePanel>[0]): void {
    closePanel();
    panel = buildCandidatePanel(candidates, closePanel);
    root.appendChild(panel);
    positionNear(panel, target.getBoundingClientRect());
    const highlight = showHighlightAt(target.getBoundingClientRect());
    setTimeout(() => highlight.remove(), 4000);
  }

  function clearFindHighlights(): void {
    for (const box of Array.from(root.querySelectorAll(".lp-highlight"))) {
      if (box !== highlightBox) box.remove();
    }
  }

  function handleFindLocator(raw: string, testIdAttribute: string): void {
    clearTimeout(clearHighlightsTimeout);
    clearFindHighlights();

    let response: FindResultMessage;
    try {
      const { spec, guessed } = parseLocator(raw, testIdAttribute);
      const matches = matchLocator(document, spec);
      for (const match of matches) {
        showHighlightAt(match.getBoundingClientRect(), matches.length > 1);
      }
      if (matches.length > 0) {
        matches[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
        clearHighlightsTimeout = window.setTimeout(clearFindHighlights, 5000);
      }
      response = { type: "find-result", matchCount: matches.length, guessed };
    } catch (err) {
      response = {
        type: "find-result",
        matchCount: 0,
        guessed: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    try {
      chrome.runtime.sendMessage(response);
    } catch {
      // popup may already be closed — the on-page highlight is the primary feedback
    }
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "activate-picker") {
      startPicker(message.testIdAttribute);
    } else if (message.type === "deactivate-picker") {
      stopPicker();
    } else if (message.type === "find-locator") {
      handleFindLocator(message.raw, message.testIdAttribute);
    }
  });
}
