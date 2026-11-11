import { describe, expect, it } from "vitest";
import { parseLocator } from "../src/lib/parser";
import { evaluateQuery } from "../src/lib/query";

function find(html: string, locator: string): Element[] {
  document.body.innerHTML = html;
  return evaluateQuery(document, parseLocator(locator, "data-testid").query);
}

const ids = (elements: Element[]): string[] => elements.map((el) => el.id);

const LIST = `
  <ul>
    <li id="milk">Milk <button>Buy</button></li>
    <li id="eggs">Eggs <button>Buy</button></li>
    <li id="soap">Soap <a href="#">Details</a></li>
  </ul>
  <button id="outside">Buy</button>
`;

describe("evaluateQuery — chained locators", () => {
  it("scopes a chained locator to the previous step's matches", () => {
    const matches = find(LIST, `page.locator('#eggs').getByRole('button', { name: 'Buy' })`);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.parentElement?.id).toBe("eggs");
  });

  it("applies filter hasText / hasNotText", () => {
    expect(ids(find(LIST, `page.getByRole('listitem').filter({ hasText: 'eggs' })`))).toEqual(["eggs"]);
    expect(ids(find(LIST, `page.getByRole('listitem').filter({ hasNotText: 'Buy' })`))).toEqual(["soap"]);
  });

  it("applies filter has / hasNot with a nested locator", () => {
    const has = find(LIST, `page.getByRole('listitem').filter({ has: page.getByRole('link') })`);
    expect(ids(has)).toEqual(["soap"]);
    const hasNot = find(
      LIST,
      `Page.GetByRole(AriaRole.Listitem).Filter(new() { HasNot = Page.GetByRole(AriaRole.Link) })`,
    );
    expect(ids(hasNot)).toEqual(["milk", "eggs"]);
  });

  it("applies first / last / nth, including out-of-range", () => {
    expect(ids(find(LIST, `page.getByRole('listitem').first()`))).toEqual(["milk"]);
    expect(ids(find(LIST, `page.getByRole('listitem').last()`))).toEqual(["soap"]);
    expect(ids(find(LIST, `page.getByRole('listitem').nth(1)`))).toEqual(["eggs"]);
    expect(find(LIST, `page.getByRole('listitem').nth(7)`)).toHaveLength(0);
  });

  it("chains several steps in order, ignoring a trailing action", () => {
    const matches = find(
      LIST,
      `page.getByRole('listitem').filter({ hasText: 'Buy' }).last().getByRole('button').click()`,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.parentElement?.id).toBe("eggs");
  });

  it("combines with and / or", () => {
    expect(ids(find(LIST, `page.getByRole('button').and(page.locator('#outside'))`))).toEqual(["outside"]);
    expect(ids(find(LIST, `page.locator('#soap').or(page.locator('#milk'))`))).toEqual(["milk", "soap"]);
  });

  it("scopes into shadow DOM", () => {
    document.body.innerHTML = `<div id="host"></div><button>Go</button>`;
    const shadow = document.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button>Go</button>`;
    const query = parseLocator(`page.locator('#host').getByRole('button')`, "data-testid").query;
    const matches = evaluateQuery(document, query);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.getRootNode()).toBe(shadow);
  });
});

describe("evaluateQuery — regex arguments", () => {
  const html = `
    <button>Submit order</button>
    <button>submit draft</button>
    <button>Cancel</button>
    <input placeholder="Search products" />
    <div data-testid="row-1"></div><div data-testid="row-22"></div><div data-testid="row-x"></div>
  `;

  it("matches getByText by regex, honouring flags", () => {
    expect(find(html, `page.getByText(/^submit/i)`)).toHaveLength(2);
    expect(find(html, `page.getByText(/^submit/)`)).toHaveLength(1);
  });

  it("matches getByRole's name by regex (TS and C#)", () => {
    expect(find(html, `page.getByRole('button', { name: /order$/ })`)).toHaveLength(1);
    expect(
      find(
        html,
        `Page.GetByRole(AriaRole.Button, new() { NameRegex = new Regex("SUBMIT", RegexOptions.IgnoreCase) })`,
      ),
    ).toHaveLength(2);
  });

  it("matches placeholder and test id by regex", () => {
    expect(find(html, `page.getByPlaceholder(/search/i)`)).toHaveLength(1);
    expect(find(html, String.raw`page.getByTestId(/^row-\d+$/)`)).toHaveLength(2);
  });

  it("uses a regex in filter hasText", () => {
    expect(find(html, `page.getByRole('button').filter({ hasText: /draft|cancel/i })`)).toHaveLength(2);
  });
});
