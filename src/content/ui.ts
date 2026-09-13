import { bestCandidateCode, exportHistoryText, type HistoryEntry } from "../lib/history";
import type { BrittlenessLevel, CodeLanguage, LocatorCandidate, ResolutionKind } from "../lib/types";

interface ElOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function badgeClassForBrittleness(level: BrittlenessLevel): string {
  if (level === "robust") return "lp-badge lp-badge-robust";
  if (level === "medium") return "lp-badge lp-badge-medium";
  return "lp-badge lp-badge-fragile";
}

function strategyLabel(strategy: LocatorCandidate["spec"]["strategy"]): string {
  switch (strategy) {
    case "role":
      return "Role";
    case "label":
      return "Label";
    case "placeholder":
      return "Placeholder";
    case "altText":
      return "Alt Text";
    case "title":
      return "Title";
    case "text":
      return "Text";
    case "testId":
      return "Test ID";
    case "css":
      return "CSS";
    case "xpath":
      return "XPath";
  }
}

function matchCountLabel(candidate: LocatorCandidate): string {
  if (candidate.matchCount === 0) return "0 matches (won't find this element)";
  if (candidate.matchCount === 1) return "1 match";
  return `${candidate.matchCount} matches — not unique`;
}

/**
 * A brittleness badge alone can read "robust" even when the locator matches more
 * than one element (or none) — isUnique/matchCount weren't factored in. Backlog:
 * "Non-unique candidates aren't visually distinct." These affect the match-count
 * text's own color/weight and the card's border, not just adjacent muted text.
 */
function matchCountClass(candidate: LocatorCandidate): string {
  if (candidate.matchCount === 0) return "lp-match-count lp-match-count-error";
  if (!candidate.isUnique) return "lp-match-count lp-match-count-warn";
  return "lp-match-count";
}

function candidateCardClass(candidate: LocatorCandidate): string {
  if (candidate.matchCount === 0) return "lp-candidate lp-candidate-error";
  if (!candidate.isUnique) return "lp-candidate lp-candidate-nonunique";
  return "lp-candidate";
}

function copyButton(getText: () => string): HTMLButtonElement {
  const button = el("button", { className: "lp-copy-btn", text: "Copy" });
  button.addEventListener("click", () => {
    void navigator.clipboard.writeText(getText()).then(
      () => {
        button.textContent = "Copied!";
        setTimeout(() => (button.textContent = "Copy"), 1200);
      },
      () => {
        button.textContent = "Copy failed";
        setTimeout(() => (button.textContent = "Copy"), 1200);
      },
    );
  });
  return button;
}

function codeFor(candidate: LocatorCandidate, language: CodeLanguage): string {
  return language === "typescript" ? candidate.typescript : candidate.csharp;
}

function exactToggle(candidate: LocatorCandidate, onToggleExact: (exact: boolean) => void): HTMLElement | null {
  if (!("exact" in candidate.spec)) return null;
  const checkbox = el("input", { attrs: { type: "checkbox" } });
  checkbox.checked = candidate.spec.exact;
  checkbox.addEventListener("change", () => onToggleExact(checkbox.checked));
  return el("label", { className: "lp-exact-toggle" }, [checkbox, document.createTextNode("Exact match")]);
}

function candidateCard(
  candidate: LocatorCandidate,
  language: CodeLanguage,
  onToggleExact: (exact: boolean) => void,
): HTMLElement {
  const badges = [
    el("span", { className: "lp-badge lp-badge-strategy", text: strategyLabel(candidate.spec.strategy) }),
    el("span", { className: badgeClassForBrittleness(candidate.brittleness.level), text: candidate.brittleness.level }),
  ];
  if (candidate.hasHiddenMatch) {
    badges.push(
      el("span", {
        className: "lp-badge lp-badge-hidden",
        text: "Hidden",
        attrs: {
          title:
            "Matches a CSS-hidden element (display:none or visibility:hidden) — Playwright actions like click/fill will fail or time out on it.",
        },
      }),
    );
  }
  const meta = el("div", { className: "lp-candidate-meta" }, [
    ...badges,
    el("span", { className: matchCountClass(candidate), text: matchCountLabel(candidate) }),
  ]);

  const toggle = exactToggle(candidate, onToggleExact);

  const card = el("div", { className: candidateCardClass(candidate) }, [
    meta,
    ...(toggle ? [toggle] : []),
    el("div", { className: "lp-code-row" }, [
      el("code", {
        className: "lp-code",
        text: codeFor(candidate, language),
        attrs: { "aria-label": language === "typescript" ? "TypeScript locator" : "C# locator" },
      }),
      copyButton(() => codeFor(candidate, language)),
    ]),
  ]);

  if (candidate.brittleness.reasons.length > 0) {
    const list = el("ul", { className: "lp-reason-list" });
    for (const reason of candidate.brittleness.reasons) {
      list.appendChild(el("li", { text: reason }));
    }
    card.appendChild(list);
  }

  return card;
}

export type FindKind = "ok" | "warn" | "error" | "";

export interface DockedPanelHandlers {
  onPick: () => void;
  onCancelPick: () => void;
  onFind: (raw: string) => void;
  onClose: () => void;
  onLanguageChange: (language: CodeLanguage) => void;
  onToggleExact: (index: number, exact: boolean) => void;
  onOptions: () => void;
  onRemoveHistoryEntry: (id: string) => void;
  onClearHistory: () => void;
}

export interface DockedPanelApi {
  root: HTMLElement;
  setPicking(active: boolean): void;
  setLanguage(language: CodeLanguage): void;
  setCandidates(candidates: LocatorCandidate[] | null, resolvedVia?: ResolutionKind | null): void;
  setFindResult(text: string, kind: FindKind): void;
  setHistory(history: HistoryEntry[]): void;
}

function historyEntryRow(entry: HistoryEntry, language: CodeLanguage, onRemove: () => void): HTMLElement {
  const code = bestCandidateCode(entry, language) || "No locator could be generated for this pick.";
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const removeBtn = el("button", {
    className: "lp-history-remove",
    text: "✕",
    attrs: { type: "button", "aria-label": "Remove from history" },
  });
  removeBtn.addEventListener("click", onRemove);

  return el("div", { className: "lp-history-entry" }, [
    el("div", { className: "lp-history-meta" }, [
      el("span", { className: "lp-history-time", text: time }),
      copyButton(() => bestCandidateCode(entry, language)),
      removeBtn,
    ]),
    el("code", { className: "lp-history-code", text: code }),
  ]);
}

function resolutionNoteText(resolvedVia: ResolutionKind): string {
  // See docs/LOCATOR_STRATEGY.md §1 — candidates below target a different element
  // than the one clicked; the blue box on the page marks it.
  return resolvedVia === "descendant"
    ? "The element you clicked has no accessible name of its own — showing locators for a labelled control nested inside it instead (blue highlight)."
    : "The element you clicked has no accessible name of its own — showing locators for the nearest interactive ancestor instead (blue highlight).";
}

export function buildDockedPanel(language: CodeLanguage, handlers: DockedPanelHandlers): DockedPanelApi {
  let currentLanguage = language;
  let currentCandidates: LocatorCandidate[] | null = null;
  let currentResolvedVia: ResolutionKind | null = null;
  let currentHistory: HistoryEntry[] = [];
  let picking = false;

  const pickBtn = el("button", { className: "lp-primary-btn", text: "Pick an element", attrs: { type: "button" } });
  const pickHint = el("p", {
    className: "lp-hint",
    text: "Hover the page and click an element. The panel stays open.",
  });
  const findInput = el("textarea", {
    className: "lp-textarea",
    attrs: {
      id: "lp-paste-input",
      rows: "3",
      placeholder: "e.g. page.getByRole('button', { name: 'Submit' })",
      spellcheck: "false",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
    },
  });
  const findBtn = el("button", { className: "lp-primary-btn", text: "Find on page", attrs: { type: "button" } });
  const findResult = el("p", { className: "lp-find-result", attrs: { role: "status" } });
  const results = el("div", { className: "lp-results" });
  const csharpBtn = el("button", {
    className: "lp-lang-btn",
    text: "C#",
    attrs: { type: "button", "aria-pressed": language === "csharp" ? "true" : "false" },
  });
  const tsBtn = el("button", {
    className: "lp-lang-btn",
    text: "TS",
    attrs: { type: "button", "aria-pressed": language === "typescript" ? "true" : "false" },
  });

  function syncLanguageButtons(): void {
    csharpBtn.setAttribute("aria-pressed", currentLanguage === "csharp" ? "true" : "false");
    tsBtn.setAttribute("aria-pressed", currentLanguage === "typescript" ? "true" : "false");
  }

  function renderResults(): void {
    results.replaceChildren();
    if (!currentCandidates) {
      results.appendChild(
        el("p", { className: "lp-empty", text: "Pick an element to see ranked locators here." }),
      );
      return;
    }
    if (currentCandidates.length === 0) {
      results.appendChild(el("p", { className: "lp-empty", text: "No locator could be generated for this element." }));
      return;
    }
    if (currentResolvedVia) {
      results.appendChild(el("p", { className: "lp-resolved-note", text: resolutionNoteText(currentResolvedVia) }));
    }
    currentCandidates.forEach((candidate, index) => {
      results.appendChild(
        candidateCard(candidate, currentLanguage, (exact) => handlers.onToggleExact(index, exact)),
      );
    });
  }

  const historyToggle = el("summary", { className: "lp-history-toggle", text: "History (0)" });
  const historyExportBtn = el("button", { className: "lp-link-btn", text: "Export", attrs: { type: "button" } });
  const historyClearBtn = el("button", { className: "lp-link-btn", text: "Clear", attrs: { type: "button" } });
  const historyList = el("div", { className: "lp-history-list" });

  function renderHistory(): void {
    historyToggle.textContent = `History (${currentHistory.length})`;
    historyList.replaceChildren();
    if (currentHistory.length === 0) {
      historyList.appendChild(el("p", { className: "lp-empty", text: "Elements you pick will show up here." }));
      return;
    }
    for (const entry of currentHistory) {
      historyList.appendChild(
        historyEntryRow(entry, currentLanguage, () => handlers.onRemoveHistoryEntry(entry.id)),
      );
    }
  }

  historyExportBtn.addEventListener("click", () => {
    const text = exportHistoryText(currentHistory, currentLanguage);
    if (!text) return;
    void navigator.clipboard.writeText(text).then(
      () => {
        historyExportBtn.textContent = "Copied!";
        setTimeout(() => (historyExportBtn.textContent = "Export"), 1200);
      },
      () => {
        historyExportBtn.textContent = "Copy failed";
        setTimeout(() => (historyExportBtn.textContent = "Export"), 1200);
      },
    );
  });

  historyClearBtn.addEventListener("click", () => {
    handlers.onClearHistory();
  });

  function setPicking(active: boolean): void {
    picking = active;
    pickBtn.textContent = active ? "Picking… Esc to cancel" : "Pick an element";
    pickBtn.classList.toggle("lp-primary-btn-armed", active);
    pickHint.textContent = active
      ? "Click any element on the page. Esc cancels without closing this panel."
      : "Hover the page and click an element. The panel stays open.";
  }

  pickBtn.addEventListener("click", () => {
    if (picking) handlers.onCancelPick();
    else handlers.onPick();
  });

  findBtn.addEventListener("click", () => {
    handlers.onFind(findInput.value);
  });

  csharpBtn.addEventListener("click", () => {
    if (currentLanguage === "csharp") return;
    currentLanguage = "csharp";
    syncLanguageButtons();
    renderResults();
    handlers.onLanguageChange(currentLanguage);
  });

  tsBtn.addEventListener("click", () => {
    if (currentLanguage === "typescript") return;
    currentLanguage = "typescript";
    syncLanguageButtons();
    renderResults();
    handlers.onLanguageChange(currentLanguage);
  });

  const closeBtn = el("button", { className: "lp-close-btn", text: "✕", attrs: { type: "button", "aria-label": "Close" } });
  closeBtn.addEventListener("click", handlers.onClose);

  const optionsBtn = el("button", { className: "lp-link-btn", text: "Options", attrs: { type: "button" } });
  optionsBtn.addEventListener("click", handlers.onOptions);

  const root = el("aside", { className: "lp-dock", attrs: { role: "dialog", "aria-label": "Locator Pilot" } }, [
    el("header", { className: "lp-dock-header" }, [
      el("div", { className: "lp-dock-heading" }, [
        el("span", { className: "lp-dock-title", text: "Locator Pilot" }),
        optionsBtn,
      ]),
      el("div", { className: "lp-dock-header-actions" }, [
        el("div", { className: "lp-lang-toggle", attrs: { role: "group", "aria-label": "Locator language" } }, [
          csharpBtn,
          tsBtn,
        ]),
        closeBtn,
      ]),
    ]),
    el("section", { className: "lp-section" }, [pickBtn, pickHint]),
    el("section", { className: "lp-section" }, [
      el("label", { className: "lp-label", text: "Paste a locator to find it on the page", attrs: { for: "lp-paste-input" } }),
      findInput,
      findBtn,
      findResult,
    ]),
    el("section", { className: "lp-section lp-section-results" }, [
      el("h2", { className: "lp-results-heading", text: "Results" }),
      results,
    ]),
    el("section", { className: "lp-section lp-section-history" }, [
      el("details", { className: "lp-history-details" }, [
        historyToggle,
        el("div", { className: "lp-history-actions" }, [historyExportBtn, historyClearBtn]),
        historyList,
      ]),
    ]),
  ]);

  renderResults();
  renderHistory();
  syncLanguageButtons();

  return {
    root,
    setPicking,
    setLanguage(next) {
      currentLanguage = next;
      syncLanguageButtons();
      renderResults();
      renderHistory();
    },
    setCandidates(candidates, resolvedVia = null) {
      currentCandidates = candidates;
      currentResolvedVia = resolvedVia;
      renderResults();
    },
    setFindResult(text, kind) {
      findResult.textContent = text;
      findResult.className = `lp-find-result${kind ? ` lp-${kind}` : ""}`;
    },
    setHistory(history) {
      currentHistory = history;
      renderHistory();
    },
  };
}