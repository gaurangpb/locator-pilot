import { describe, expect, it } from "vitest";
import { generateCandidates } from "../src/lib/locatorEngine";
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
