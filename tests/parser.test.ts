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

  it("parses getByAltText", () => {
    const { spec } = parseLocator(`page.getByAltText('Company logo')`, "data-testid");
    expect(spec).toMatchObject({ strategy: "altText", text: "Company logo" });
  });

  it("parses C# GetByTitle with Exact option", () => {
    const { spec } = parseLocator(`Page.GetByTitle("Close", new() { Exact = true })`, "data-testid");
    expect(spec).toMatchObject({ strategy: "title", text: "Close", exact: true });
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

  it("flags a chained .filter() call as ignored", () => {
    const { spec, chained } = parseLocator(
      `page.locator('.card').filter({ hasText: 'foo' })`,
      "data-testid",
    );
    expect(chained).toBe(true);
    expect(spec).toMatchObject({ strategy: "css", selector: ".card" });
  });

  it("flags a chained .getByRole() call after getByTestId as ignored", () => {
    const { chained } = parseLocator(`page.getByTestId('foo').getByRole('button')`, "data-testid");
    expect(chained).toBe(true);
  });

  it("flags .nth()/.first() chains as ignored", () => {
    expect(parseLocator(`page.getByRole('button', { name: 'Submit' }).nth(0)`, "data-testid").chained).toBe(true);
    expect(parseLocator(`page.getByRole('button', { name: 'Submit' }).first()`, "data-testid").chained).toBe(true);
  });

  it("does not flag chaining for a plain, unchained call", () => {
    const { chained } = parseLocator(`page.getByRole('button', { name: 'Submit' })`, "data-testid");
    expect(chained).toBe(false);
  });

  it("does not flag chaining when embedded in a larger statement", () => {
    const { chained } = parseLocator(
      `await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();`,
      "data-testid",
    );
    expect(chained).toBe(false);
  });

  it("never flags chaining for a guessed raw selector", () => {
    const { chained, guessed } = parseLocator(`.btn-primary > span`, "data-testid");
    expect(guessed).toBe(true);
    expect(chained).toBe(false);
  });

  it("rejects a JS regex literal passed to getByText with a clear error", () => {
    expect(() => parseLocator(`page.getByText(/submit/i)`, "data-testid")).toThrow(/regex/i);
  });

  it("rejects a JS regex literal passed to getByLabel", () => {
    expect(() => parseLocator(`page.getByLabel(/email/)`, "data-testid")).toThrow(/regex/i);
  });

  it("rejects a JS regex literal passed to getByPlaceholder", () => {
    expect(() => parseLocator(`page.getByPlaceholder(/search/i)`, "data-testid")).toThrow(/regex/i);
  });

  it("rejects a JS regex literal passed to getByTestId", () => {
    expect(() => parseLocator(`page.getByTestId(/^row-\\d+$/)`, "data-testid")).toThrow(/regex/i);
  });

  it("rejects a regex passed as getByRole's name option", () => {
    expect(() => parseLocator(`page.getByRole('button', { name: /submit/i })`, "data-testid")).toThrow(/regex/i);
  });

  it("rejects a .NET Regex() passed as GetByRole's Name option", () => {
    expect(() =>
      parseLocator(`Page.GetByRole(AriaRole.Button, new() { Name = new Regex("Submit") })`, "data-testid"),
    ).toThrow(/regex/i);
  });

  it("rejects a bare pasted regex literal", () => {
    expect(() => parseLocator(`/submit/i`, "data-testid")).toThrow(/regex/i);
  });

  it("does not reject a plain string that happens to contain slashes", () => {
    const { spec } = parseLocator(`page.getByText('a/b')`, "data-testid");
    expect(spec).toMatchObject({ strategy: "text", text: "a/b" });
  });
});
