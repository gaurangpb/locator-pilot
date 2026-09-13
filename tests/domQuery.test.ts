import { describe, expect, it } from "vitest";
import { deepEvaluateXPath, deepQueryAll, deepQuerySelectorAll } from "../src/lib/domQuery";

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("deepEvaluateXPath", () => {
  it("matches a light-DOM element", () => {
    const doc = setBody(`<button id="go">Go</button>`);
    expect(deepEvaluateXPath(doc, "//button")).toHaveLength(1);
  });

  it("does not pierce shadow DOM, mirroring real Playwright XPath semantics", () => {
    const doc = setBody(`<button>Light button</button><div id="host"></div>`);
    const host = doc.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button>Shadow button</button>`;

    // Sanity check: the shadow button is real and findable via deep helpers.
    expect(deepQueryAll(doc).some((el) => el.textContent === "Shadow button")).toBe(true);

    // But Playwright's XPath engine never crosses into shadow roots, so the
    // match count here must reflect only the light-DOM button.
    expect(deepEvaluateXPath(doc, "//button")).toHaveLength(1);
  });

  it("still resolves CSS-based deep queries into shadow DOM (unaffected by the XPath fix)", () => {
    const doc = setBody(`<div id="host"></div>`);
    const host = doc.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button class="go">Go</button>`;
    expect(deepQuerySelectorAll(doc, ".go")).toHaveLength(1);
  });
});
