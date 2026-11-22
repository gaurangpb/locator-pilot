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

  it("generates altText and title locators for both languages", () => {
    const altSpec: LocatorSpec = { strategy: "altText", text: "Company logo", exact: false };
    expect(toCSharp(altSpec)).toBe('Page.GetByAltText("Company logo")');
    expect(toTypeScript(altSpec)).toBe("page.getByAltText('Company logo')");

    const titleSpec: LocatorSpec = { strategy: "title", text: "Close", exact: true };
    expect(toCSharp(titleSpec)).toBe('Page.GetByTitle("Close", new() { Exact = true })');
    expect(toTypeScript(titleSpec)).toBe("page.getByTitle('Close', { exact: true })");
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

  it("generates chained locators with and without parentHasText", () => {
    const withFilter: LocatorSpec = {
      strategy: "chained",
      parent: { strategy: "role", role: "row", exact: false },
      parentHasText: "Plums",
      child: { strategy: "role", role: "button", name: "Delete", exact: false },
    };
    expect(toTypeScript(withFilter)).toBe(
      "page.getByRole('row').filter({ hasText: 'Plums' }).getByRole('button', { name: 'Delete' })",
    );
    expect(toCSharp(withFilter)).toBe(
      'Page.GetByRole(AriaRole.Row).Filter(new() { HasText = "Plums" }).GetByRole(AriaRole.Button, new() { Name = "Delete" })',
    );

    const withoutFilter: LocatorSpec = {
      strategy: "chained",
      parent: { strategy: "testId", attribute: "data-testid", value: "billing-card" },
      child: { strategy: "role", role: "button", name: "Edit", exact: false },
    };
    expect(toTypeScript(withoutFilter)).toBe(
      "page.getByTestId('billing-card').getByRole('button', { name: 'Edit' })",
    );
    expect(toCSharp(withoutFilter)).toBe(
      'Page.GetByTestId("billing-card").GetByRole(AriaRole.Button, new() { Name = "Edit" })',
    );
  });

  it("prepends frameLocator() calls when frameSelectors are provided", () => {
    const spec: LocatorSpec = { strategy: "role", role: "button", name: "Apply coupon", exact: false };
    expect(toTypeScript(spec, ['iframe[title="Coupon form"]'])).toBe(
      `page.frameLocator('iframe[title="Coupon form"]').getByRole('button', { name: 'Apply coupon' })`,
    );
    expect(toCSharp(spec, ['iframe[title="Coupon form"]'])).toBe(
      `Page.FrameLocator("iframe[title=\\"Coupon form\\"]").GetByRole(AriaRole.Button, new() { Name = "Apply coupon" })`,
    );
    expect(toTypeScript(spec, ["#outer", 'iframe[name="inner"]'])).toBe(
      `page.frameLocator('#outer').frameLocator('iframe[name="inner"]').getByRole('button', { name: 'Apply coupon' })`,
    );
  });
});
