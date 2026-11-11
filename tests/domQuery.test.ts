import { describe, expect, it } from "vitest";
import { deepEvaluateXPath, deepQueryAll, deepQuerySelectorAll, getRootForElement } from "../src/lib/domQuery";

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

describe("deepQuerySelectorAll / deepQueryAll", () => {
  it("searches nested shadow roots", () => {
    const doc = setBody(`<div id="outer"></div>`);
    const outer = doc.getElementById("outer")!.attachShadow({ mode: "open" });
    outer.innerHTML = `<p class="hit"></p><div id="inner"></div>`;
    const inner = outer.getElementById("inner")!.attachShadow({ mode: "open" });
    inner.innerHTML = `<p class="hit"></p>`;
    expect(deepQuerySelectorAll(doc, ".hit")).toHaveLength(2);
    expect(deepQueryAll(doc).filter((el) => el.classList.contains("hit"))).toHaveLength(2);
  });

  it("returns an empty list for an invalid selector instead of throwing", () => {
    const doc = setBody(`<div></div>`);
    expect(deepQuerySelectorAll(doc, "div[")).toEqual([]);
  });

  it("can be scoped to a shadow root", () => {
    const doc = setBody(`<b></b><div id="host"></div>`);
    const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<b></b><b></b>`;
    expect(deepQuerySelectorAll(shadow, "b")).toHaveLength(2);
  });
});

describe("deepEvaluateXPath — malformed and non-element results", () => {
  it("returns an empty list for a malformed expression", () => {
    const doc = setBody(`<div></div>`);
    expect(deepEvaluateXPath(doc, "//div[")).toEqual([]);
  });

  it("returns only elements, not text or attribute nodes", () => {
    const doc = setBody(`<a href="/x">Link</a>`);
    expect(deepEvaluateXPath(doc, "//a/@href | //a/text() | //a")).toHaveLength(1);
  });
});

describe("getRootForElement", () => {
  it("returns the shadow root for a shadow element and the document otherwise", () => {
    const doc = setBody(`<span id="light"></span><div id="host"></div>`);
    const shadow = doc.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<span></span>`;
    expect(getRootForElement(doc.getElementById("light")!)).toBe(doc);
    expect(getRootForElement(shadow.querySelector("span")!)).toBe(shadow);
  });
});
