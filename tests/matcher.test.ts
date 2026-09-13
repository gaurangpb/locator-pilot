import { describe, expect, it } from "vitest";
import { matchLocator } from "../src/lib/matcher";

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("matchLocator role strategy — visibility", () => {
  it("excludes display:none elements, mirroring Playwright's getByRole default", () => {
    const doc = setBody(`
      <div style="display:none"><button>Hidden button</button></div>
    `);
    const matches = matchLocator(doc, { strategy: "role", role: "button", name: "Hidden button", exact: false });
    expect(matches).toHaveLength(0);
  });

  it("excludes visibility:hidden elements", () => {
    const doc = setBody(`<button style="visibility:hidden">Invisible button</button>`);
    const matches = matchLocator(doc, { strategy: "role", role: "button", name: "Invisible button", exact: false });
    expect(matches).toHaveLength(0);
  });

  it("excludes aria-hidden elements, including via an ancestor", () => {
    const doc = setBody(`
      <button aria-hidden="true">Ghost button</button>
      <div aria-hidden="true"><button>Nested ghost</button></div>
    `);
    expect(matchLocator(doc, { strategy: "role", role: "button", name: "Ghost button", exact: false })).toHaveLength(0);
    expect(matchLocator(doc, { strategy: "role", role: "button", name: "Nested ghost", exact: false })).toHaveLength(0);
  });

  it("still matches ordinary visible elements", () => {
    const doc = setBody(`<button>Submit</button>`);
    const matches = matchLocator(doc, { strategy: "role", role: "button", name: "Submit", exact: false });
    expect(matches).toHaveLength(1);
  });

  it("does not apply the same visibility filter to text matching (Playwright's getByText isn't a11y-tree based)", () => {
    const doc = setBody(`<button style="display:none">Hidden button</button>`);
    const matches = matchLocator(doc, { strategy: "text", text: "Hidden button", exact: false });
    expect(matches).toHaveLength(1);
  });
});
