import type { BrittlenessLevel, LocatorCandidate } from "../lib/types";

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

function codeRow(label: string, code: string): HTMLElement {
  return el("div", { className: "lp-code-row" }, [
    el("code", { className: "lp-code", text: code, attrs: { "aria-label": label } }),
    copyButton(() => code),
  ]);
}

function candidateCard(candidate: LocatorCandidate): HTMLElement {
  const meta = el("div", { className: "lp-candidate-meta" }, [
    el("span", { className: "lp-badge lp-badge-strategy", text: strategyLabel(candidate.spec.strategy) }),
    el("span", { className: badgeClassForBrittleness(candidate.brittleness.level), text: candidate.brittleness.level }),
    el("span", { className: "lp-match-count", text: matchCountLabel(candidate) }),
  ]);

  const card = el("div", { className: "lp-candidate" }, [
    meta,
    codeRow("C# locator", candidate.csharp),
    codeRow("TypeScript locator", candidate.typescript),
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

export function buildCandidatePanel(candidates: LocatorCandidate[], onClose: () => void): HTMLElement {
  const closeBtn = el("button", { className: "lp-close-btn", text: "✕", attrs: { "aria-label": "Close" } });
  closeBtn.addEventListener("click", onClose);

  const header = el("div", { className: "lp-panel-header" }, [
    el("span", { className: "lp-panel-title", text: "Locator Pilot" }),
    closeBtn,
  ]);

  const panel = el("div", { className: "lp-panel" }, [header]);

  if (candidates.length === 0) {
    panel.appendChild(el("div", { text: "No locator could be generated for this element." }));
  } else {
    for (const candidate of candidates) panel.appendChild(candidateCard(candidate));
  }

  return panel;
}

export function positionNear(panel: HTMLElement, rect: DOMRect): void {
  const margin = 12;
  const width = 380;
  let left = rect.right + margin;
  if (left + width > window.innerWidth) left = Math.max(margin, rect.left - width - margin);
  let top = rect.top;
  if (top + 200 > window.innerHeight) top = Math.max(margin, window.innerHeight - 200 - margin);

  panel.style.left = `${Math.max(margin, left)}px`;
  panel.style.top = `${Math.max(margin, top)}px`;
}

export function buildBanner(): HTMLElement {
  return el("div", { className: "lp-banner" }, [
    el("span", { text: "Click an element to get its locator" }),
    el("kbd", { text: "Esc" }),
    el("span", { text: "to cancel" }),
  ]);
}
