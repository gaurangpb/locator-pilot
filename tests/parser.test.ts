import { describe, expect, it } from "vitest";
import { parseLocator } from "../src/lib/parser";

describe("parseLocator", () => {
  it("parses TypeScript getByRole with name and exact", () => {
    const { spec, guessed } = parseLocator(
      `page.getByRole('button', { name: 'Submit', exact: true })`,
      "data-testid",
    );
    expect(guessed).toBe(false);
    expect(spec).toMatchObject({ strategy: "role", role: "button", name: "Submit", exact: true });
  });

  it("parses C# GetByRole with AriaRole enum and Name option", () => {
    const { spec } = parseLocator(
      `Page.GetByRole(AriaRole.Button, new() { Name = "Submit" })`,
      "data-testid",
    );
    expect(spec).toMatchObject({ strategy: "role", role: "button", name: "Submit" });
  });

  it("parses getByTestId", () => {
    const { spec } = parseLocator(`page.getByTestId('user-menu')`, "data-testid");
    expect(spec).toMatchObject({ strategy: "testId", attribute: "data-testid", value: "user-menu" });
  });

  it("parses a locator() call with an xpath= prefix", () => {
    const { spec } = parseLocator(`page.locator('xpath=//button[@id="go"]')`, "data-testid");
    expect(spec).toMatchObject({ strategy: "xpath", expression: '//button[@id="go"]' });
  });

  it("parses a bare CSS selector as a guess", () => {
    const { spec, guessed } = parseLocator(`.btn-primary > span`, "data-testid");
    expect(guessed).toBe(true);
    expect(spec).toMatchObject({ strategy: "css", selector: ".btn-primary > span" });
  });

  it("parses a bare XPath expression as a guess", () => {
    const { spec, guessed } = parseLocator(`//div[@id='root']/button[1]`, "data-testid");
    expect(guessed).toBe(true);
    expect(spec).toMatchObject({ strategy: "xpath" });
  });

  it("extracts a locator call embedded in a full statement", () => {
    const { spec } = parseLocator(
      `var submit = Page.GetByRole(AriaRole.Button, new() { Name = "Submit" });`,
      "data-testid",
    );
    expect(spec).toMatchObject({ strategy: "role", role: "button", name: "Submit" });
  });

  it("throws on empty input", () => {
    expect(() => parseLocator("   ", "data-testid")).toThrow();
  });
});
