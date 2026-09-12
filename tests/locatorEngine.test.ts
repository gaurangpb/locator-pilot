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
});
