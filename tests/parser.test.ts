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

  it("parses a chained .filter({ hasText }) into a filter step", () => {
    const { spec, query, ignoredCalls } = parseLocator(
      `page.locator('.card').filter({ hasText: 'foo' })`,
      "data-testid",
    );
    expect(spec).toMatchObject({ strategy: "css", selector: ".card" });
    expect(query).toHaveLength(2);
    expect(query[1]).toEqual({ kind: "filter", hasText: "foo" });
    expect(ignoredCalls).toEqual([]);
  });

  it("parses a nested getBy… chain into scoped locator steps", () => {
    const { query } = parseLocator(`page.getByTestId('foo').getByRole('button')`, "data-testid");
    expect(query).toMatchObject([
      { kind: "locator", spec: { strategy: "testId", value: "foo" } },
      { kind: "locator", spec: { strategy: "role", role: "button" } },
    ]);
  });

  it("parses .nth()/.first()/.last() and C#'s parenless .First", () => {
    const second = (raw: string) => parseLocator(raw, "data-testid").query[1];
    expect(second(`page.getByRole('button').nth(2)`)).toEqual({ kind: "nth", index: 2 });
    expect(second(`page.getByRole('button').first()`)).toEqual({ kind: "nth", index: 0 });
    expect(second(`page.getByRole('button').last()`)).toEqual({ kind: "nth", index: -1 });
    expect(second(`Page.GetByRole(AriaRole.Button).First`)).toEqual({ kind: "nth", index: 0 });
    expect(second(`Page.GetByRole(AriaRole.Button).Nth(1)`)).toEqual({ kind: "nth", index: 1 });
  });

  it("parses filter's has option as a nested query (TS and C#)", () => {
    const ts = parseLocator(
      `page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Buy' }) })`,
      "data-testid",
    );
    expect(ts.query[1]).toMatchObject({
      kind: "filter",
      has: [{ kind: "locator", spec: { strategy: "role", role: "button", name: "Buy" } }],
    });
    const cs = parseLocator(
      `Page.GetByRole(AriaRole.Listitem).Filter(new() { Has = Page.GetByText("Buy"), HasNotText = "Sold" })`,
      "data-testid",
    );
    expect(cs.query[1]).toMatchObject({
      kind: "filter",
      hasNotText: "Sold",
      has: [{ kind: "locator", spec: { strategy: "text", text: "Buy" } }],
    });
  });

  it("parses locator()'s own hasText option as a filter", () => {
    const { query } = parseLocator(`page.locator('li', { hasText: 'Milk' })`, "data-testid");
    expect(query).toMatchObject([{ kind: "locator" }, { kind: "filter", hasText: "Milk" }]);
  });

  it("parses .and()/.or()", () => {
    const { query } = parseLocator(`page.getByRole('button').or(page.getByRole('link'))`, "data-testid");
    expect(query[1]).toMatchObject({ kind: "or", query: [{ spec: { strategy: "role", role: "link" } }] });
  });

  it("stops at a trailing action call without reporting it", () => {
    const { query, ignoredCalls } = parseLocator(
      `await page.getByRole('button', { name: 'Submit' }).first().click();`,
      "data-testid",
    );
    expect(query).toHaveLength(2);
    expect(ignoredCalls).toEqual([]);
  });

  it("reports a filter option it can't evaluate instead of dropping it silently", () => {
    const { query, ignoredCalls } = parseLocator(`page.getByRole('row').filter({ has: someLocator })`, "data-testid");
    expect(query).toHaveLength(1);
    expect(ignoredCalls).toHaveLength(1);
  });

  it("does not treat a wrapping expect(...) as a chain", () => {
    const { query } = parseLocator(
      `await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();`,
      "data-testid",
    );
    expect(query).toHaveLength(1);
  });

  it("does not read frameLocator() as locator(), and searches for what follows a frame hop", () => {
    const { spec, query } = parseLocator(`page.frameLocator('#pay').getByRole('button')`, "data-testid");
    expect(query).toHaveLength(1);
    expect(spec).toMatchObject({ strategy: "role", role: "button" });
    const hop = parseLocator(`page.locator('iframe').contentFrame().getByText('Pay')`, "data-testid");
    expect(hop.query).toMatchObject([{ kind: "locator", spec: { strategy: "text", text: "Pay" } }]);
  });

  const patternOf = (raw: string): RegExp | undefined => {
    const step = parseLocator(raw, "data-testid").query[0];
    return step?.kind === "locator" ? step.pattern : undefined;
  };

  it("parses a JS regex literal argument into a pattern", () => {
    const { spec } = parseLocator(`page.getByText(/submit/i)`, "data-testid");
    expect(spec).toMatchObject({ strategy: "text", text: "submit" });
    expect(patternOf(`page.getByText(/submit/i)`)).toEqual(/submit/i);
  });

  it("parses regex arguments for label, placeholder and test id", () => {
    expect(patternOf(`page.getByLabel(/email/)`)).toEqual(/email/);
    expect(patternOf(`page.getByPlaceholder(/search/i)`)).toEqual(/search/i);
    expect(patternOf(String.raw`page.getByTestId(/^row-\d+$/)`)).toEqual(/^row-\d+$/);
  });

  it("handles parens, commas and quotes inside a regex literal", () => {
    const { query } = parseLocator(String.raw`page.getByText(/(a|b), "c"\)/).first()`, "data-testid");
    expect(query).toHaveLength(2);
    expect(patternOf(String.raw`page.getByText(/(a|b), "c"\)/).first()`)?.source).toBe(String.raw`(a|b), "c"\)`);
  });

  it("parses a regex passed as getByRole's name option", () => {
    expect(patternOf(`page.getByRole('button', { name: /submit/i, exact: true })`)).toEqual(/submit/i);
  });

  it("parses a .NET Regex() with RegexOptions or an inline (?i) into a JS pattern", () => {
    expect(
      patternOf(`Page.GetByRole(AriaRole.Button, new() { NameRegex = new Regex("Submit", RegexOptions.IgnoreCase) })`),
    ).toEqual(/Submit/i);
    expect(patternOf(String.raw`Page.GetByText(new Regex("(?i)sub\\d"))`)).toEqual(/sub\d/i);
    expect(patternOf(String.raw`Page.GetByText(new Regex(@"sub\d"))`)).toEqual(/sub\d/);
  });

  it("gives a clear error for an argument that isn't a literal", () => {
    expect(() => parseLocator(`page.getByText(buttonLabel)`, "data-testid")).toThrow(/literal/i);
  });

  it("rejects a bare pasted regex literal", () => {
    expect(() => parseLocator(`/submit/i`, "data-testid")).toThrow(/regex/i);
  });

  it("does not reject a plain string that happens to contain slashes", () => {
    const { spec } = parseLocator(`page.getByText('a/b')`, "data-testid");
    expect(spec).toMatchObject({ strategy: "text", text: "a/b" });
  });
});
