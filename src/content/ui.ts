import type { BrittlenessLevel, CodeLanguage, LocatorCandidate } from "../lib/types";

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
  return `${candidate.matchCount} matches`;
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

function candidateCard(candidate: LocatorCandidate, language: CodeLanguage): HTMLElement {
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
    el("span", { className: "lp-match-count", text: matchCountLabel(candidate) }),
  ]);

  const card = el("div", { className: "lp-candidate" }, [
    meta,
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
  onOptions: () => void;
}

export interface DockedPanelApi {
  root: HTMLElement;
  setPicking(active: boolean): void;
  setLanguage(language: CodeLanguage): void;
  setCandidates(candidates: LocatorCandidate[] | null): void;
  setFindResult(text: string, kind: FindKind): void;
}

export function buildDockedPanel(language: CodeLanguage, handlers: DockedPanelHandlers): DockedPanelApi {
  let currentLanguage = language;
  let currentCandidates: LocatorCandidate[] | null = null;
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
    for (const candidate of currentCandidates) {
      results.appendChild(candidateCard(candidate, currentLanguage));
    }
  }

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
  ]);

  renderResults();
  syncLanguageButtons();

  return {
    root,
    setPicking,
    setLanguage(next) {
      currentLanguage = next;
      syncLanguageButtons();
      renderResults();
    },
    setCandidates(candidates) {
      currentCandidates = candidates;
      renderResults();
    },
    setFindResult(text, kind) {
      findResult.textContent = text;
      findResult.className = `lp-find-result${kind ? ` lp-${kind}` : ""}`;
    },
  };
}