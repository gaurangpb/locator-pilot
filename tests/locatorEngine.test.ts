import { describe, expect, it } from "vitest";
import { generateCandidates, pickCandidates, refreshCandidates, withExact } from "../src/lib/locatorEngine";
import { DEFAULT_TEST_ID_ATTRIBUTE } from "../src/lib/types";

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("generateCandidates", () => {
  it("prefers role+name for a labeled button", () => {
    const doc = setBody(`<button id="submit-btn">Submit</button>`);
    const el = doc.getElementById("submit-btn")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(candidates[0]!.spec).toMatchObject({ strategy: "role", role: "button", name: "Submit" });
    expect(candidates[0]!.isUnique).toBe(true);
    expect(candidates[0]!.brittleness.level).toBe("robust");
    expect(candidates[0]!.csharp).toContain("Page.GetByRole(AriaRole.Button");
    expect(candidates[0]!.typescript).toContain("page.getByRole('button'");
  });

  it("picks up an associated label for a text input", () => {
    const doc = setBody(`
      <label for="email">Email address</label>
      <input id="email" type="email" />
    `);
    const el = doc.getElementById("email")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const labelCandidate = candidates.find((c) => c.spec.strategy === "label");
    expect(labelCandidate).toBeDefined();
    expect(labelCandidate?.isUnique).toBe(true);
  });

  it("uses the configured test-id attribute", () => {
    const doc = setBody(`<div data-qa="user-menu">Menu</div>`);
    const el = doc.querySelector("[data-qa]")!;
    const candidates = generateCandidates(el, { testIdAttribute: "data-qa" }, doc);

    const testIdCandidate = candidates.find((c) => c.spec.strategy === "testId");
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate?.csharp).toContain('Page.GetByTestId("user-menu")');
  });

  it("flags a match count greater than one as non-unique", () => {
    const doc = setBody(`
      <button class="btn">Save</button>
      <button class="btn">Save</button>
    `);
    const el = doc.querySelectorAll("button")[0]!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const roleCandidate = candidates.find((c) => c.spec.strategy === "role");
    expect(roleCandidate?.matchCount).toBe(2);
    expect(roleCandidate?.isUnique).toBe(false);
  });

  it("finds elements inside a shadow root", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button data-testid="inner-btn">Click me</button>`;
    const el = shadow.querySelector("button")!;

    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, document);
    const testIdCandidate = candidates.find((c) => c.spec.strategy === "testId");
    expect(testIdCandidate?.isUnique).toBe(true);
  });

  it("flags a css selector with nth-child as fragile and an auto-generated class as fragile", () => {
    const doc = setBody(`<div class="css-a1b2c3"><span></span><span></span></div>`);
    const el = doc.querySelectorAll("span")[1]!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const cssCandidate = candidates.find((c) => c.spec.strategy === "css");
    expect(cssCandidate?.brittleness.level).toBe("fragile");
  });

  it("flags a testId candidate targeting a hidden element with hasHiddenMatch", () => {
    const doc = setBody(`<button style="display:none" data-testid="ghost-btn">Ghost</button>`);
    const el = doc.querySelector("button")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const testIdCandidate = candidates.find((c) => c.spec.strategy === "testId");
    expect(testIdCandidate?.matchCount).toBe(1);
    expect(testIdCandidate?.hasHiddenMatch).toBe(true);
  });

  it("flags a css candidate targeting a hidden, roleless element with hasHiddenMatch", () => {
    const doc = setBody(`<div id="ghost" style="display:none"></div>`);
    const el = doc.getElementById("ghost")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const cssCandidate = candidates.find((c) => c.spec.strategy === "css");
    expect(cssCandidate?.matchCount).toBe(1);
    expect(cssCandidate?.hasHiddenMatch).toBe(true);
  });

  it("does not flag hasHiddenMatch for an ordinary visible element", () => {
    const doc = setBody(`<button id="submit-btn">Submit</button>`);
    const el = doc.getElementById("submit-btn")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(candidates.every((c) => c.hasHiddenMatch === false)).toBe(true);
  });

  it("does not flag hasHiddenMatch for a visible element that is merely aria-hidden (common decorative-icon pattern)", () => {
    // aria-hidden excludes an element from the accessibility tree (so a role
    // candidate correctly gets 0 matches), but the element is still on screen
    // and clickable — a css/testId candidate targeting it should NOT get the
    // "Hidden" warning, since Playwright's actionability checks don't consult
    // aria-hidden at all.
    const doc = setBody(`<img aria-hidden="true" data-testid="goal-icon" src="icon.svg" />`);
    const el = doc.querySelector("img")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const roleCandidate = candidates.find((c) => c.spec.strategy === "role");
    expect(roleCandidate?.matchCount).toBe(0);

    const testIdCandidate = candidates.find((c) => c.spec.strategy === "testId");
    expect(testIdCandidate?.matchCount).toBe(1);
    expect(testIdCandidate?.hasHiddenMatch).toBe(false);
  });
});

describe("generateCandidates — altText/title strategies (docs/LOCATOR_STRATEGY.md §2.4)", () => {
  it("offers a getByAltText candidate for an image with alt text, alongside its role candidate", () => {
    const doc = setBody(`<img id="logo" alt="Company logo" src="logo.png" />`);
    const el = doc.getElementById("logo")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const altCandidate = candidates.find((c) => c.spec.strategy === "altText");
    expect(altCandidate).toBeDefined();
    expect(altCandidate?.spec).toMatchObject({ text: "Company logo" });
    expect(altCandidate?.isUnique).toBe(true);
  });

  it("does not offer an altText candidate for an image with no alt attribute", () => {
    const doc = setBody(`<img id="deco" src="deco.png" />`);
    const el = doc.getElementById("deco")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(candidates.some((c) => c.spec.strategy === "altText")).toBe(false);
  });

  it("offers a getByTitle candidate for an icon-only element with a title but no visible text", () => {
    const doc = setBody(`<button id="close" title="Close dialog"></button>`);
    const el = doc.getElementById("close")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const titleCandidate = candidates.find((c) => c.spec.strategy === "title");
    expect(titleCandidate).toBeDefined();
    expect(titleCandidate?.spec).toMatchObject({ text: "Close dialog" });
  });

  it("does not offer a title candidate when the element already has its own visible text", () => {
    const doc = setBody(`<button id="save" title="Save your changes">Save</button>`);
    const el = doc.getElementById("save")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(candidates.some((c) => c.spec.strategy === "title")).toBe(false);
  });
});

describe("refreshCandidates", () => {
  it("picks up a match count that changed after the candidates were generated", () => {
    const doc = setBody(`<button class="btn">Save</button>`);
    const el = doc.querySelector("button")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);
    const roleCandidate = candidates.find((c) => c.spec.strategy === "role")!;
    expect(roleCandidate.matchCount).toBe(1);

    doc.body.insertAdjacentHTML("beforeend", `<button class="btn">Save</button>`);
    const refreshed = refreshCandidates(candidates, doc);
    const refreshedRole = refreshed.find((c) => c.spec.strategy === "role")!;
    expect(refreshedRole.matchCount).toBe(2);
    expect(refreshedRole.isUnique).toBe(false);
  });

  it("picks up an element becoming hidden after the candidates were generated", () => {
    const doc = setBody(`<button id="submit-btn">Submit</button>`);
    const el = doc.getElementById("submit-btn")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);
    expect(candidates.every((c) => c.hasHiddenMatch === false)).toBe(true);

    el.style.display = "none";
    const refreshed = refreshCandidates(candidates, doc);
    expect(refreshed.some((c) => c.hasHiddenMatch)).toBe(true);
  });
});

describe("withExact", () => {
  it("flips exact on a role candidate and recomputes its match count", () => {
    const doc = setBody(`
      <button id="save-btn">Save</button>
      <button id="save-changes-btn">Save changes</button>
    `);
    const el = doc.getElementById("save-btn")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);
    const roleIndex = candidates.findIndex((c) => c.spec.strategy === "role");
    // Default substring matching also picks up "Save changes".
    expect(candidates[roleIndex]!.matchCount).toBe(2);
    expect(candidates[roleIndex]!.isUnique).toBe(false);

    const withExactOn = withExact(candidates, roleIndex, true, doc);
    const roleCandidate = withExactOn[roleIndex]!;
    expect(roleCandidate.spec).toMatchObject({ exact: true });
    expect(roleCandidate.matchCount).toBe(1);
    expect(roleCandidate.isUnique).toBe(true);
    expect(roleCandidate.csharp).toContain("Exact = true");
    expect(roleCandidate.typescript).toContain("exact: true");
    // Other candidates in the array are left untouched.
    expect(withExactOn.filter((_, i) => i !== roleIndex)).toEqual(candidates.filter((_, i) => i !== roleIndex));
  });

  it("is a no-op for a strategy without an exact field", () => {
    const doc = setBody(`<div data-testid="user-menu">Menu</div>`);
    const el = doc.querySelector("[data-testid]")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);
    const testIdIndex = candidates.findIndex((c) => c.spec.strategy === "testId");

    const result = withExact(candidates, testIdIndex, true, doc);
    expect(result).toBe(candidates);
  });
});

describe("buildCssSelector state-class filtering (docs/LOCATOR_STRATEGY.md §2.7)", () => {
  it("excludes transient state and framework/hydration classes from the css candidate", () => {
    // Mirrors a real-world case: a Stencil custom element whose CSS candidate
    // included --selected (toggles off on deselect) and hydrated (present only
    // once Stencil finishes hydrating), producing a locator that stops matching
    // for reasons that have nothing to do with the page's actual markup changing.
    const doc = setBody(`
      <div id="wrap">
        <custom-card class="custom-card custom-card--full-height custom-card--selected hydrated"></custom-card>
      </div>
    `);
    const el = doc.querySelector("custom-card")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const cssCandidate = candidates.find((c) => c.spec.strategy === "css");
    expect(cssCandidate).toBeDefined();
    const selector = (cssCandidate!.spec as { strategy: "css"; selector: string }).selector;
    expect(selector).toContain("custom-card--full-height");
    expect(selector).not.toContain("custom-card--selected");
    expect(selector).not.toContain("hydrated");
  });
});

describe("buildCssSelector stable-attribute selectors (docs/LOCATOR_STRATEGY.md §2.7)", () => {
  it("prefers a stable, semantic attribute over a transient class chain", () => {
    const doc = setBody(`
      <div id="group">
        <custom-option value="Save for retirement" class="option option--selected hydrated"></custom-option>
        <custom-option value="Grow wealth" class="option hydrated"></custom-option>
      </div>
    `);
    const el = doc.querySelector('custom-option[value="Save for retirement"]')!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const cssCandidate = candidates.find((c) => c.spec.strategy === "css");
    const selector = (cssCandidate!.spec as { strategy: "css"; selector: string }).selector;
    expect(selector).toBe('custom-option[value="Save for retirement"]');
    expect(selector).not.toContain("option--selected");
    expect(selector).not.toContain("hydrated");
  });

  it("falls back to classes/nth-of-type when none of the curated attributes are present", () => {
    const doc = setBody(`<div class="widget widget--card"><span></span></div>`);
    const el = doc.querySelector("span")!;
    const candidates = generateCandidates(el, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    const cssCandidate = candidates.find((c) => c.spec.strategy === "css");
    const selector = (cssCandidate!.spec as { strategy: "css"; selector: string }).selector;
    expect(selector).not.toContain("[");
  });
});

describe("pickCandidates — interactive element resolution (docs/LOCATOR_STRATEGY.md §1)", () => {
  it("resolves a role-less custom-element wrapper to a labelled control nested inside it", () => {
    // The sdps-card case: a role-less wrapper around a labelled radio input.
    const doc = setBody(`
      <custom-card class="custom-card custom-card--selected hydrated">
        <label>
          <input type="radio" id="save-radio" aria-labelledby="save-radio-title" />
          <h2 id="save-radio-title" aria-hidden="true">Save for retirement</h2>
        </label>
      </custom-card>
    `);
    const card = doc.querySelector("custom-card")!;
    const result = pickCandidates(card, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(result.resolvedVia).toBe("descendant");
    expect(result.target.tagName.toLowerCase()).toBe("input");
    const roleCandidate = result.candidates.find((c) => c.spec.strategy === "role");
    expect(roleCandidate?.spec).toMatchObject({ role: "radio", name: "Save for retirement" });
    expect(roleCandidate?.isUnique).toBe(true);
  });

  it("resolves to the nearest interactive ancestor when the clicked element is an icon inside a button", () => {
    const doc = setBody(`<button id="submit-btn"><span id="icon-glyph"></span> Submit</button>`);
    const icon = doc.getElementById("icon-glyph")!;
    const result = pickCandidates(icon, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(result.resolvedVia).toBe("ancestor");
    expect(result.target.id).toBe("submit-btn");
    const roleCandidate = result.candidates.find((c) => c.spec.strategy === "role");
    expect(roleCandidate?.spec).toMatchObject({ role: "button", name: "Submit" });
  });

  it("never guesses between two equally-plausible interactive descendants", () => {
    const doc = setBody(`
      <custom-group>
        <button aria-label="First">First</button>
        <button aria-label="Second">Second</button>
      </custom-group>
    `);
    const group = doc.querySelector("custom-group")!;
    const result = pickCandidates(group, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(result.resolvedVia).toBeNull();
    expect(result.target).toBe(group);
  });

  it("does not resolve when the clicked element already has a usable role", () => {
    const doc = setBody(`<button id="submit-btn">Submit</button>`);
    const button = doc.getElementById("submit-btn")!;
    const result = pickCandidates(button, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(result.resolvedVia).toBeNull();
    expect(result.target).toBe(button);
  });

  it("does not resolve to a screen-reader-only descendant — the real sdps-card shape: a native radio hidden via sr-only inside a <label> that IS the whole visible card", () => {
    // Real-world repro (reported after the earlier "descendant" fix shipped): the
    // radio here has `class="sr-only"`, so it's exposed to the accessibility tree
    // (a technically valid, unique role match) but renders at ~0px — its visible
    // "clickable card" is the entire <label>, not the input. Resolving to the input
    // anyway produced a locator whose highlight landed nowhere meaningful. The
    // fallback should be the card itself, and its css candidate should use the
    // stable `value` attribute rather than the old transient class chain.
    const doc = setBody(`
      <custom-card value="Save for retirement" class="custom-card custom-card--selected hydrated">
        <label>
          <input type="radio" class="sr-only" aria-labelledby="title-1" />
          <h2 id="title-1" aria-hidden="true">Save for retirement</h2>
        </label>
      </custom-card>
    `);
    const card = doc.querySelector("custom-card")!;
    const result = pickCandidates(card, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(result.resolvedVia).toBeNull();
    expect(result.target).toBe(card);
    const cssCandidate = result.candidates.find((c) => c.spec.strategy === "css");
    expect(cssCandidate?.spec).toMatchObject({ selector: 'custom-card[value="Save for retirement"]' });
  });

  it("still resolves to a non-sr-only interactive descendant (regression check for the fix above)", () => {
    const doc = setBody(`
      <custom-card class="custom-card custom-card--selected hydrated">
        <label>
          <input type="radio" id="save-radio" aria-labelledby="save-radio-title" />
          <h2 id="save-radio-title" aria-hidden="true">Save for retirement</h2>
        </label>
      </custom-card>
    `);
    const card = doc.querySelector("custom-card")!;
    const result = pickCandidates(card, { testIdAttribute: DEFAULT_TEST_ID_ATTRIBUTE }, doc);

    expect(result.resolvedVia).toBe("descendant");
    expect(result.target.tagName.toLowerCase()).toBe("input");
  });
});
