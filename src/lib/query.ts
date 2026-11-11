import { matchLocator, textMatches, type TextPattern } from "./matcher";
import type { LocatorSpec } from "./types";

// A pasted locator expression, as a pipeline of steps — the "Find on page" side's
// model. Deliberately separate from `LocatorSpec` (the generation side's model, which
// codegen/brittleness rely on being a single plain-string locator): a query can
// chain locators, filter, pick by index, and carry regex arguments.

/** A `getBy…()`/`locator()` call. The first one searches the whole document; later ones search inside the previous step's matches. */
export interface LocatorStep {
  kind: "locator";
  spec: LocatorSpec;
  /** Set when the call's text/name/test-id argument was a regex — used in place of the spec's string (which then just holds the regex source, for display). */
  pattern?: RegExp;
}

/** `.filter({ hasText, hasNotText, has, hasNot })`, or the same options passed to `locator()`. */
export interface FilterStep {
  kind: "filter";
  hasText?: TextPattern;
  hasNotText?: TextPattern;
  has?: LocatorQuery;
  hasNot?: LocatorQuery;
}

/** `.nth(i)`, `.first()` (0) or `.last()` (-1). Negative indexes count from the end. */
export interface NthStep {
  kind: "nth";
  index: number;
}

/** `.and(other)` (intersection) / `.or(other)` (union, in document order). */
export interface CombineStep {
  kind: "and" | "or";
  query: LocatorQuery;
}

export type QueryStep = LocatorStep | FilterStep | NthStep | CombineStep;
export type LocatorQuery = QueryStep[];

/** True when `el` is strictly inside `ancestor`, crossing shadow-root boundaries on the way up. */
function isDeepDescendant(ancestor: Element, el: Element): boolean {
  let node: Node | null = el.parentNode;
  while (node) {
    if (node === ancestor) return true;
    node = node.nodeType === 11 && "host" in node ? (node as ShadowRoot).host : node.parentNode;
  }
  return false;
}

function inDocumentOrder(elements: Element[]): Element[] {
  return elements.slice().sort((a, b) => {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

function applyFilter(doc: Document, current: Element[], step: FilterStep): Element[] {
  const has = step.has ? evaluateQuery(doc, step.has) : null;
  const hasNot = step.hasNot ? evaluateQuery(doc, step.hasNot) : null;
  const containsAny = (el: Element, inner: Element[]): boolean =>
    inner.some((candidate) => isDeepDescendant(el, candidate));

  return current.filter((el) => {
    const text = el.textContent || "";
    if (step.hasText !== undefined && !textMatches(text, step.hasText, false)) return false;
    if (step.hasNotText !== undefined && textMatches(text, step.hasNotText, false)) return false;
    if (has && !containsAny(el, has)) return false;
    if (hasNot && containsAny(el, hasNot)) return false;
    return true;
  });
}

/** Evaluates a parsed locator expression against `doc`, mirroring how Playwright resolves the same chain. */
export function evaluateQuery(doc: Document, query: LocatorQuery): Element[] {
  let current: Element[] | null = null;

  for (const step of query) {
    if (step.kind === "locator") {
      const found = matchLocator(doc, step.spec, step.pattern);
      const scopes = current as Element[] | null;
      current = scopes === null ? found : found.filter((el) => scopes.some((scope) => isDeepDescendant(scope, el)));
    } else if (step.kind === "filter") {
      current = applyFilter(doc, current ?? [], step);
    } else if (step.kind === "nth") {
      const list: Element[] = current ?? [];
      const picked = list[step.index < 0 ? list.length + step.index : step.index];
      current = picked ? [picked] : [];
    } else {
      const list: Element[] = current ?? [];
      const other = evaluateQuery(doc, step.query);
      current =
        step.kind === "and"
          ? list.filter((el) => other.includes(el))
          : inDocumentOrder([...list, ...other.filter((el) => !list.includes(el))]);
    }
  }

  return current ?? [];
}
