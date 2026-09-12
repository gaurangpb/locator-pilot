import { describe, expect, it } from "vitest";
import { toCSharp, toTypeScript } from "../src/lib/codegen";
import type { LocatorSpec } from "../src/lib/types";

describe("codegen", () => {
  it("generates role locators for both languages", () => {
    const spec: LocatorSpec = { strategy: "role", role: "button", name: "Submit", exact: false };
    expect(toCSharp(spec)).toBe('Page.GetByRole(AriaRole.Button, new() { Name = "Submit" })');
    expect(toTypeScript(spec)).toBe("page.getByRole('button', { name: 'Submit' })");
  });

  it("escapes quotes in generated string literals", () => {
    const spec: LocatorSpec = { strategy: "text", text: `Say "hi"`, exact: false };
    expect(toCSharp(spec)).toBe('Page.GetByText("Say \\"hi\\"")');
    expect(toTypeScript(spec)).toBe("page.getByText('Say \"hi\"')");
  });

  it("generates a testId locator", () => {
    const spec: LocatorSpec = { strategy: "testId", attribute: "data-testid", value: "user-menu" };
    expect(toCSharp(spec)).toBe('Page.GetByTestId("user-menu")');
    expect(toTypeScript(spec)).toBe("page.getByTestId('user-menu')");
  });

  it("prefixes xpath in locator() calls", () => {
    const spec: LocatorSpec = { strategy: "xpath", expression: "//div[@id='x']" };
    expect(toCSharp(spec)).toBe(`Page.Locator("xpath=//div[@id='x']")`);
    expect(toTypeScript(spec)).toBe(`page.locator('xpath=//div[@id=\\'x\\']')`);
  });
});
