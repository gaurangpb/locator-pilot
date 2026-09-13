import { describe, expect, it } from "vitest";
import { assessBrittleness } from "../src/lib/brittleness";
import type { LocatorSpec } from "../src/lib/types";

describe("assessBrittleness", () => {
  it("treats testId as robust", () => {
    const spec: LocatorSpec = { strategy: "testId", attribute: "data-testid", value: "x" };
    expect(assessBrittleness(spec).level).toBe("robust");
  });

  it("treats role without a name as medium", () => {
    const spec: LocatorSpec = { strategy: "role", role: "textbox", exact: false };
    expect(assessBrittleness(spec).level).toBe("medium");
  });

  it("flags nth-child css selectors as fragile", () => {
    const spec: LocatorSpec = { strategy: "css", selector: "div > span:nth-child(3)" };
    expect(assessBrittleness(spec).level).toBe("fragile");
  });

  it("flags auto-generated class names as fragile", () => {
    const spec: LocatorSpec = { strategy: "css", selector: ".css-1a2b3c" };
    expect(assessBrittleness(spec).level).toBe("fragile");
  });

  it("treats a plain id selector as robust", () => {
    const spec: LocatorSpec = { strategy: "css", selector: "#login-button" };
    expect(assessBrittleness(spec).level).toBe("robust");
  });

  it("treats altText and title as medium", () => {
    expect(assessBrittleness({ strategy: "altText", text: "Logo", exact: false }).level).toBe("medium");
    expect(assessBrittleness({ strategy: "title", text: "Close", exact: false }).level).toBe("medium");
  });

  it("flags positional xpath as fragile", () => {
    const spec: LocatorSpec = { strategy: "xpath", expression: "//div[2]/span[1]" };
    expect(assessBrittleness(spec).level).toBe("fragile");
  });
});
