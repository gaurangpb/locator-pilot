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

describe("matchLocator altText/title strategies", () => {
  it("matches an element by its alt attribute", () => {
    const doc = setBody(`<img alt="Company logo" src="logo.png" />`);
    const matches = matchLocator(doc, { strategy: "altText", text: "Company logo", exact: false });
    expect(matches).toHaveLength(1);
  });

  it("matches an element by its title attribute", () => {
    const doc = setBody(`<button title="Close dialog">×</button>`);
    const matches = matchLocator(doc, { strategy: "title", text: "Close dialog", exact: false });
    expect(matches).toHaveLength(1);
  });

  it("respects exact matching for altText/title", () => {
    const doc = setBody(`<img alt="Company logo, small" src="logo.png" />`);
    expect(matchLocator(doc, { strategy: "altText", text: "Company logo", exact: true })).toHaveLength(0);
    expect(matchLocator(doc, { strategy: "altText", text: "Company logo, small", exact: true })).toHaveLength(1);
  });
});

describe("matchLocator label strategy — Playwright's three labelling mechanisms", () => {
  const label = (text: string, exact = false) => ({ strategy: "label" as const, text, exact });
  const ids = (elements: Element[]): string[] => elements.map((el) => el.id);

  it("matches a <label for> and a wrapping <label>", () => {
    const doc = setBody(`
      <label for="email">Email</label><input id="email" />
      <label>Phone <input id="phone" /></label>
    `);
    expect(ids(matchLocator(doc, label("Email")))).toEqual(["email"]);
    expect(ids(matchLocator(doc, label("Phone")))).toEqual(["phone"]);
  });

  it("matches aria-label", () => {
    const doc = setBody(`<input id="q" aria-label="Search products" /><button id="x" aria-label="Close">x</button>`);
    expect(ids(matchLocator(doc, label("search")))).toEqual(["q"]);
    expect(ids(matchLocator(doc, label("Close", true)))).toEqual(["x"]);
    expect(matchLocator(doc, label("Clos", true))).toHaveLength(0);
  });

  it("matches aria-labelledby, joining multiple references", () => {
    const doc = setBody(`
      <span id="a">Billing</span><span id="b">address</span>
      <input id="addr" aria-labelledby="a b" />
      <input id="dangling" aria-labelledby="missing" />
    `);
    expect(ids(matchLocator(doc, label("Billing address")))).toEqual(["addr"]);
  });

  it("returns each element once, in document order, when several mechanisms match", () => {
    const doc = setBody(`
      <input id="first" aria-label="Name" />
      <label for="second">Name</label><input id="second" aria-label="Name" />
    `);
    expect(ids(matchLocator(doc, label("Name")))).toEqual(["first", "second"]);
  });
});

describe("matchLocator placeholder strategy", () => {
  it("matches inputs and textareas by placeholder, case-insensitive substring by default", () => {
    const doc = setBody(`
      <input id="a" placeholder="Search products" />
      <textarea id="b" placeholder="Search notes"></textarea>
      <input id="c" />
    `);
    const ids = matchLocator(doc, { strategy: "placeholder", text: "search", exact: false }).map((el) => el.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("respects exact matching", () => {
    const doc = setBody(`<input placeholder="Search products" />`);
    expect(matchLocator(doc, { strategy: "placeholder", text: "Search", exact: true })).toHaveLength(0);
    expect(matchLocator(doc, { strategy: "placeholder", text: "Search products", exact: true })).toHaveLength(1);
  });
});

describe("matchLocator text strategy", () => {
  it("returns only the innermost element containing the text", () => {
    const doc = setBody(`<div id="outer"><p id="inner">Welcome back, <b>Ada</b></p></div>`);
    const ids = matchLocator(doc, { strategy: "text", text: "Welcome back", exact: false }).map((el) => el.id);
    expect(ids).toEqual(["inner"]);
  });

  it("normalizes whitespace and ignores case unless exact", () => {
    const doc = setBody(`<span>  Sign
        in  </span>`);
    expect(matchLocator(doc, { strategy: "text", text: "sign in", exact: false })).toHaveLength(1);
    expect(matchLocator(doc, { strategy: "text", text: "sign in", exact: true })).toHaveLength(0);
    expect(matchLocator(doc, { strategy: "text", text: "Sign in", exact: true })).toHaveLength(1);
  });

  it("skips script and style contents", () => {
    const doc = setBody(`<script>var x = "Checkout";</script><style>/* Checkout */</style>`);
    expect(matchLocator(doc, { strategy: "text", text: "Checkout", exact: false })).toHaveLength(0);
  });

  it("finds text inside a shadow root", () => {
    const doc = setBody(`<div id="host"></div>`);
    doc.getElementById("host")!.attachShadow({ mode: "open" }).innerHTML = `<span>Inside shadow</span>`;
    expect(matchLocator(doc, { strategy: "text", text: "Inside shadow", exact: false })).toHaveLength(1);
  });

  it("evaluates a regex pattern in place of the spec text", () => {
    const doc = setBody(`<button>Submit order</button><button>Cancel</button>`);
    const matches = matchLocator(doc, { strategy: "text", text: "", exact: false }, /^submit/i);
    expect(matches.map((el) => el.textContent)).toEqual(["Submit order"]);
  });
});

describe("matchLocator testId strategy", () => {
  it("matches the configured attribute exactly, including inside shadow roots", () => {
    const doc = setBody(`
      <div data-testid="save"></div>
      <div data-testid="save-draft"></div>
      <div data-qa="save"></div>
      <div id="host"></div>
    `);
    doc.getElementById("host")!.attachShadow({ mode: "open" }).innerHTML = `<span data-testid="save"></span>`;
    expect(matchLocator(doc, { strategy: "testId", attribute: "data-testid", value: "save" })).toHaveLength(2);
    expect(matchLocator(doc, { strategy: "testId", attribute: "data-qa", value: "save" })).toHaveLength(1);
  });

  it("escapes quotes and special characters in the value", () => {
    const doc = setBody(`<div data-testid='say "hi"'></div>`);
    expect(matchLocator(doc, { strategy: "testId", attribute: "data-testid", value: 'say "hi"' })).toHaveLength(1);
  });

  it("evaluates a regex pattern against the attribute value", () => {
    const doc = setBody(`<div data-testid="row-1"></div><div data-testid="row-2"></div><div data-testid="header"></div>`);
    expect(matchLocator(doc, { strategy: "testId", attribute: "data-testid", value: "" }, /^row-\d$/)).toHaveLength(2);
  });
});

describe("matchLocator role strategy — names and decorative images", () => {
  it("matches the accessible name as a substring unless exact", () => {
    const doc = setBody(`<button>Save draft</button><button>Save</button>`);
    expect(matchLocator(doc, { strategy: "role", role: "button", name: "save", exact: false })).toHaveLength(2);
    expect(matchLocator(doc, { strategy: "role", role: "button", name: "Save", exact: true })).toHaveLength(1);
  });

  it("does not treat an <img alt=\"\"> as role img", () => {
    const doc = setBody(`<img alt="" src="divider.png" /><img alt="Logo" src="logo.png" />`);
    expect(matchLocator(doc, { strategy: "role", role: "img", exact: false })).toHaveLength(1);
  });
});
