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

function* walkRoots(root: SearchRoot): Generator<SearchRoot> {
  yield root;
  const all = root.querySelectorAll("*");
  for (const el of all) {
    if (el.shadowRoot) {
      yield* walkRoots(el.shadowRoot);
    }
  }
}

export function deepQuerySelectorAll(root: SearchRoot, selector: string): Element[] {
  const results: Element[] = [];
  for (const r of walkRoots(root)) {
    try {
      results.push(...Array.from(r.querySelectorAll(selector)));
    } catch {
      // invalid selector for this root — ignore and keep searching others
    }
  }
  return results;
}

export function deepQueryAll(root: SearchRoot): Element[] {
  const results: Element[] = [];
  for (const r of walkRoots(root)) {
    results.push(...Array.from(r.querySelectorAll("*")));
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
      if (node instanceof Element) results.push(node);
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
