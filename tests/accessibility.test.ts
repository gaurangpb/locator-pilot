import { describe, expect, it } from "vitest";
import {
  getAccessibleName,
  getImplicitRole,
  isCssVisible,
  isExposedToAccessibilityTree,
} from "../src/lib/accessibility";

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

function first(html: string): Element {
  return setBody(html).body.firstElementChild!;
}

describe("getImplicitRole", () => {
  it("uses the first token of an explicit role attribute", () => {
    expect(getImplicitRole(first(`<div role=" tab presentation "></div>`))).toBe("tab");
  });

  it("maps input types, defaulting unknown/missing types to textbox", () => {
    expect(getImplicitRole(first(`<input type="checkbox" />`))).toBe("checkbox");
    expect(getImplicitRole(first(`<input type="SUBMIT" />`))).toBe("button");
    expect(getImplicitRole(first(`<input type="range" />`))).toBe("slider");
    expect(getImplicitRole(first(`<input type="number" />`))).toBe("spinbutton");
    expect(getImplicitRole(first(`<input />`))).toBe("textbox");
    expect(getImplicitRole(first(`<input type="date" />`))).toBe("textbox");
  });

  it("only gives an <a> the link role when it has an href", () => {
    expect(getImplicitRole(first(`<a href="/home">Home</a>`))).toBe("link");
    expect(getImplicitRole(first(`<a>Anchor</a>`))).toBeNull();
  });

  it("maps common tags and returns null for generic containers", () => {
    expect(getImplicitRole(first(`<h3>Title</h3>`))).toBe("heading");
    expect(getImplicitRole(first(`<select></select>`))).toBe("combobox");
    expect(getImplicitRole(first(`<nav></nav>`))).toBe("navigation");
    expect(getImplicitRole(first(`<div></div>`))).toBeNull();
    expect(getImplicitRole(first(`<span></span>`))).toBeNull();
  });

  it("treats an empty alt as a decorative image (no img role), like Playwright", () => {
    expect(getImplicitRole(first(`<img alt="" src="x.png" />`))).toBeNull();
    expect(getImplicitRole(first(`<img alt="Logo" src="x.png" />`))).toBe("img");
    expect(getImplicitRole(first(`<img src="x.png" />`))).toBe("img");
  });

  it("keeps the img role on an empty alt when a title, aria label or tabindex overrides it", () => {
    expect(getImplicitRole(first(`<img alt="" title="Chart" />`))).toBe("img");
    expect(getImplicitRole(first(`<img alt="" aria-label="Chart" />`))).toBe("img");
    expect(getImplicitRole(first(`<img alt="" tabindex="0" />`))).toBe("img");
    expect(getImplicitRole(first(`<img alt="" role="button" />`))).toBe("button");
  });
});

describe("getAccessibleName", () => {
  it("prefers aria-labelledby over aria-label over content", () => {
    const doc = setBody(`
      <span id="l1">From</span><span id="l2">labelledby</span>
      <button id="b" aria-labelledby="l1 l2" aria-label="From aria-label">Content</button>
    `);
    expect(getAccessibleName(doc.getElementById("b")!)).toBe("From labelledby");
  });

  it("falls back to aria-label, then text content for content-bearing elements", () => {
    expect(getAccessibleName(first(`<button aria-label="Close dialog">×</button>`))).toBe("Close dialog");
    expect(getAccessibleName(first(`<button>  Save
      changes </button>`))).toBe("Save changes");
  });

  it("names form controls from <label for>, a wrapping label, then placeholder", () => {
    const doc = setBody(`
      <label for="email">Email</label><input id="email" placeholder="you@example.com" />
      <label>Phone <input id="phone" /></label>
      <input id="search" placeholder="Search" />
    `);
    expect(getAccessibleName(doc.getElementById("email")!)).toBe("Email");
    expect(getAccessibleName(doc.getElementById("phone")!)).toBe("Phone");
    expect(getAccessibleName(doc.getElementById("search")!)).toBe("Search");
  });

  it("uses alt for images and title as a last resort", () => {
    expect(getAccessibleName(first(`<img alt="Company logo" />`))).toBe("Company logo");
    expect(getAccessibleName(first(`<div title="Tooltip text"></div>`))).toBe("Tooltip text");
  });

  it("doesn't take text content from non-content-bearing elements", () => {
    expect(getAccessibleName(first(`<div>Just a div</div>`))).toBe("");
  });

  it("names an inline SVG from its <title>", () => {
    expect(getAccessibleName(first(`<svg><title>Download</title></svg>`))).toBe("Download");
  });
});

describe("isExposedToAccessibilityTree", () => {
  it("is false for display:none, visibility:hidden and aria-hidden (directly or via an ancestor)", () => {
    const doc = setBody(`
      <button id="a" style="display:none">a</button>
      <div style="visibility:hidden"><button id="b">b</button></div>
      <div aria-hidden="true"><button id="c">c</button></div>
      <button id="d">d</button>
    `);
    expect(isExposedToAccessibilityTree(doc.getElementById("a")!)).toBe(false);
    expect(isExposedToAccessibilityTree(doc.getElementById("b")!)).toBe(false);
    expect(isExposedToAccessibilityTree(doc.getElementById("c")!)).toBe(false);
    expect(isExposedToAccessibilityTree(doc.getElementById("d")!)).toBe(true);
  });

  it("walks out of a shadow root to the host when checking ancestors", () => {
    const doc = setBody(`<div id="host" aria-hidden="true"></div><div id="host2" style="display:none"></div>`);
    const inner = doc.getElementById("host")!.attachShadow({ mode: "open" });
    inner.innerHTML = `<button>In shadow</button>`;
    const inner2 = doc.getElementById("host2")!.attachShadow({ mode: "open" });
    inner2.innerHTML = `<button>In hidden shadow</button>`;
    expect(isExposedToAccessibilityTree(inner.querySelector("button")!)).toBe(false);
    expect(isCssVisible(inner2.querySelector("button")!)).toBe(false);
  });
});
