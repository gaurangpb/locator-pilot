// querySelectorAll / document.evaluate never pierce shadow DOM, so every
// "search the page" helper here walks shadow roots manually. Iframes are
// handled separately: the extension injects this same content script into
// every frame (see manifest permissions), so each frame's own script instance
// only ever needs to search its own document — no cross-frame piercing here.
//
// XPath is the deliberate exception: Playwright's own XPath engine does not
// pierce shadow roots, so deepEvaluateXPath below intentionally evaluates
// only against the main document to match real Playwright match counts.

export type SearchRoot = Document | ShadowRoot;

/** id of the element the content script mounts the docked panel (and highlight boxes) in. */
export const PANEL_HOST_ID = "locator-pilot-host";

/**
 * The extension's own UI lives in an open shadow root on the page, so a plain deep walk
 * would count the panel's find box, result cards and history as page matches (e.g. the
 * find box's placeholder matching getByPlaceholder("Name")). Real Playwright never sees
 * it, so every search here skips the host and everything inside it.
 */
function isPanelHost(el: Element): boolean {
  return el.id === PANEL_HOST_ID;
}

function withoutPanelHost(elements: Iterable<Element>): Element[] {
  return Array.from(elements).filter((el) => !isPanelHost(el));
}

function* walkRoots(root: SearchRoot): Generator<SearchRoot> {
  yield root;
  const all = root.querySelectorAll("*");
  for (const el of all) {
    if (el.shadowRoot && !isPanelHost(el)) {
      yield* walkRoots(el.shadowRoot);
    }
  }
}

export function deepQuerySelectorAll(root: SearchRoot, selector: string): Element[] {
  const results: Element[] = [];
  for (const r of walkRoots(root)) {
    try {
      results.push(...withoutPanelHost(r.querySelectorAll(selector)));
    } catch {
      // invalid selector for this root — ignore and keep searching others
    }
  }
  return results;
}

export function deepQueryAll(root: SearchRoot): Element[] {
  const results: Element[] = [];
  for (const r of walkRoots(root)) {
    results.push(...withoutPanelHost(r.querySelectorAll("*")));
  }
  return results;
}

export function deepEvaluateXPath(doc: Document, expression: string): Element[] {
  const results: Element[] = [];
  // Unlike the other deep* helpers, this does NOT walk shadow roots: real
  // Playwright XPath locators never match into shadow DOM, so piercing here
  // would report matches that a real page.locator('xpath=...') would miss.
  try {
    const xpathResult = doc.evaluate(
      expression,
      doc,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    for (let i = 0; i < xpathResult.snapshotLength; i++) {
      const node = xpathResult.snapshotItem(i);
      if (node instanceof Element && !isPanelHost(node)) results.push(node);
    }
  } catch {
    // malformed expression
  }
  return results;
}

/** Pierces shadow roots to find the actual innermost element under a point. */
export function deepElementFromPoint(doc: Document, x: number, y: number): Element | null {
  let el = doc.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

export function getRootForElement(el: Element): SearchRoot {
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root : el.ownerDocument;
}
