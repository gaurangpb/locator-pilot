import { getAccessibleName, getImplicitRole, isExposedToAccessibilityTree } from "./accessibility";
import { cssEscape } from "./cssEscape";
import { deepEvaluateXPath, deepQueryAll, deepQuerySelectorAll } from "./domQuery";
import type { LocatorSpec } from "./types";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What a text-based locator matches against: a plain string, or a regex (pasted `getByText(/submit/i)`-style locators). */
export type TextPattern = string | RegExp;

/**
 * Mirrors Playwright's default text-matching: case-insensitive substring unless
 * exact. A regex is tested against the whitespace-normalized text as-is — `exact`
 * doesn't apply to it, same as in Playwright.
 */
export function textMatches(candidate: string, target: TextPattern, exact: boolean): boolean {
  const a = normalize(candidate);
  if (typeof target !== "string") {
    target.lastIndex = 0;
    return target.test(a);
  }
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

function matchByRole(doc: Document, role: string, name: TextPattern | undefined, exact: boolean): Element[] {
  return deepQueryAll(doc).filter((el) => {
    if (getImplicitRole(el) !== role) return false;
    // Mirrors Playwright's default getByRole() behavior: hidden elements
    // (display:none, visibility:hidden, aria-hidden) aren't in the a11y tree.
    if (!isExposedToAccessibilityTree(el)) return false;
    if (!name) return true;
    return textMatches(getAccessibleName(el, doc), name, exact);
  });
}

/** The text of the elements an `aria-labelledby` points at, joined in reference order — null when none of the ids resolve. */
function labelledByText(el: Element): string | null {
  const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
  if (ids.length === 0) return null;
  const root = el.getRootNode() as Document | ShadowRoot;
  const parts: string[] = [];
  for (const id of ids) {
    const ref = root.querySelector(`#${cssEscape(id)}`);
    if (ref) parts.push(ref.textContent || "");
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Mirrors Playwright's getByLabel(), which matches a control by any of its three
 * labelling mechanisms: an associated `<label>` (via `for` or by wrapping),
 * `aria-labelledby`, or `aria-label`.
 */
function matchByLabel(doc: Document, text: TextPattern, exact: boolean): Element[] {
  const all = deepQueryAll(doc);
  const targets = new Set<Element>();
  for (const el of all) {
    if (el.tagName.toLowerCase() === "label") {
      if (!textMatches(el.textContent || "", text, exact)) continue;
      const target = resolveLabelTarget(el, doc);
      if (target) targets.add(target);
      continue;
    }
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel !== null && ariaLabel.trim() && textMatches(ariaLabel, text, exact)) {
      targets.add(el);
      continue;
    }
    const labelledBy = labelledByText(el);
    if (labelledBy !== null && textMatches(labelledBy, text, exact)) targets.add(el);
  }
  // Document order, regardless of which mechanism matched each element.
  return all.filter((el) => targets.has(el));
}

function matchByPlaceholder(doc: Document, text: TextPattern, exact: boolean): Element[] {
  return deepQueryAll(doc).filter((el) => {
    const placeholder = el.getAttribute("placeholder");
    return placeholder !== null && textMatches(placeholder, text, exact);
  });
}

function matchByAltText(doc: Document, text: TextPattern, exact: boolean): Element[] {
  return deepQueryAll(doc).filter((el) => {
    const alt = el.getAttribute("alt");
    return alt !== null && textMatches(alt, text, exact);
  });
}

function matchByTitle(doc: Document, text: TextPattern, exact: boolean): Element[] {
  return deepQueryAll(doc).filter((el) => {
    const title = el.getAttribute("title");
    return title !== null && textMatches(title, text, exact);
  });
}

function matchByText(doc: Document, text: TextPattern, exact: boolean): Element[] {
  const skip = new Set(["script", "style", "svg", "noscript"]);
  const candidates = deepQueryAll(doc).filter((el) => {
    if (skip.has(el.tagName.toLowerCase())) return false;
    return textMatches(el.textContent || "", text, exact);
  });

  // Keep only the innermost matching element in each ancestor chain, since a
  // parent's textContent also "contains" whatever a matching child has.
  return candidates.filter((el) => !candidates.some((other) => other !== el && el.contains(other)));
}

function matchByTestId(doc: Document, attribute: string, value: TextPattern): Element[] {
  if (typeof value !== "string") {
    return deepQuerySelectorAll(doc, `[${attribute}]`).filter((el) => {
      value.lastIndex = 0;
      return value.test(el.getAttribute(attribute) ?? "");
    });
  }
  return deepQuerySelectorAll(doc, `[${attribute}="${cssEscape(value)}"]`);
}

/**
 * Finds every element in `doc` matching `spec`. `pattern`, when given, is a regex
 * used in place of the spec's own text/name/test-id string (css and xpath have no
 * text argument, so it's ignored there) — this is how pasted regex locators are
 * evaluated without widening `LocatorSpec`, which the generation/codegen side
 * relies on being plain strings.
 */
export function matchLocator(doc: Document, spec: LocatorSpec, pattern?: RegExp): Element[] {
  switch (spec.strategy) {
    case "role":
      return matchByRole(doc, spec.role, pattern ?? spec.name, spec.exact);
    case "label":
      return matchByLabel(doc, pattern ?? spec.text, spec.exact);
    case "placeholder":
      return matchByPlaceholder(doc, pattern ?? spec.text, spec.exact);
    case "altText":
      return matchByAltText(doc, pattern ?? spec.text, spec.exact);
    case "title":
      return matchByTitle(doc, pattern ?? spec.text, spec.exact);
    case "text":
      return matchByText(doc, pattern ?? spec.text, spec.exact);
    case "testId":
      return matchByTestId(doc, spec.attribute, pattern ?? spec.value);
    case "css":
      return deepQuerySelectorAll(doc, spec.selector);
    case "xpath":
      return deepEvaluateXPath(doc, spec.expression);
  }
}
