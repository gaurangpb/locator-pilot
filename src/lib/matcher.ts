import { getAccessibleName, getImplicitRole } from "./accessibility";
import { cssEscape } from "./cssEscape";
import { deepEvaluateXPath, deepQueryAll, deepQuerySelectorAll } from "./domQuery";
import type { LocatorSpec } from "./types";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Mirrors Playwright's default text-matching: case-insensitive substring unless exact. */
function textMatches(candidate: string, target: string, exact: boolean): boolean {
  const a = normalize(candidate);
  const b = normalize(target);
  if (exact) return a === b;
  return a.toLowerCase().includes(b.toLowerCase());
}

function resolveLabelTarget(label: Element, doc: Document): Element | null {
  const forId = label.getAttribute("for");
  if (forId) {
    const root = label.getRootNode() as Document | ShadowRoot;
    const byId = root.querySelector(`#${cssEscape(forId)}`);
    if (byId) return byId;
  }
  return label.querySelector("input, textarea, select");
}

function matchByRole(doc: Document, role: string, name: string | undefined, exact: boolean): Element[] {
  return deepQueryAll(doc).filter((el) => {
    if (getImplicitRole(el) !== role) return false;
    if (!name) return true;
    return textMatches(getAccessibleName(el, doc), name, exact);
  });
}

function matchByLabel(doc: Document, text: string, exact: boolean): Element[] {
  const labels = deepQueryAll(doc).filter((el) => el.tagName.toLowerCase() === "label");
  const targets = new Set<Element>();
  for (const label of labels) {
    if (!textMatches(label.textContent || "", text, exact)) continue;
    const target = resolveLabelTarget(label, doc);
    if (target) targets.add(target);
  }
  return Array.from(targets);
}

function matchByPlaceholder(doc: Document, text: string, exact: boolean): Element[] {
  return deepQueryAll(doc).filter((el) => {
    const placeholder = el.getAttribute("placeholder");
    return placeholder !== null && textMatches(placeholder, text, exact);
  });
}

function matchByText(doc: Document, text: string, exact: boolean): Element[] {
  const skip = new Set(["script", "style", "svg", "noscript"]);
  const candidates = deepQueryAll(doc).filter((el) => {
    if (skip.has(el.tagName.toLowerCase())) return false;
    return textMatches(el.textContent || "", text, exact);
  });

  // Keep only the innermost matching element in each ancestor chain, since a
  // parent's textContent also "contains" whatever a matching child has.
  return candidates.filter((el) => !candidates.some((other) => other !== el && el.contains(other)));
}

function matchByTestId(doc: Document, attribute: string, value: string): Element[] {
  return deepQuerySelectorAll(doc, `[${attribute}="${cssEscape(value)}"]`);
}

export function matchLocator(doc: Document, spec: LocatorSpec): Element[] {
  switch (spec.strategy) {
    case "role":
      return matchByRole(doc, spec.role, spec.name, spec.exact);
    case "label":
      return matchByLabel(doc, spec.text, spec.exact);
    case "placeholder":
      return matchByPlaceholder(doc, spec.text, spec.exact);
    case "text":
      return matchByText(doc, spec.text, spec.exact);
    case "testId":
      return matchByTestId(doc, spec.attribute, spec.value);
    case "css":
      return deepQuerySelectorAll(doc, spec.selector);
    case "xpath":
      return deepEvaluateXPath(doc, spec.expression);
  }
}
