import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ORIGIN, expect, test } from "./fixtures";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playgroundDir = path.join(repoRoot, "docs", "playground");
const assetsDir = path.join(repoRoot, "docs", "assets");

const PLAYGROUND_URL = `${ORIGIN}/playground/index.html`;

async function mountPlayground(
  context: import("@playwright/test").BrowserContext,
): Promise<void> {
  const indexHtml = readFileSync(path.join(playgroundDir, "index.html"), "utf8");
  const frameHtml = readFileSync(path.join(playgroundDir, "frame.html"), "utf8");
  const iconPng = readFileSync(path.join(assetsDir, "icon128.png"));

  await context.route(`${ORIGIN}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/playground/" || pathname === "/playground/index.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: indexHtml });
    }
    if (pathname === "/playground/frame.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: frameHtml });
    }
    if (pathname === "/assets/icon128.png") {
      return route.fulfill({ status: 200, contentType: "image/png", body: iconPng });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
}

async function openPlayground(
  context: import("@playwright/test").BrowserContext,
  page: import("@playwright/test").Page,
  togglePanel: (page: import("@playwright/test").Page) => Promise<void>,
): Promise<void> {
  await mountPlayground(context);
  // Wide viewport so the right-hand docked panel never overlaps the centered playground column.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(PLAYGROUND_URL);
  await page.frameLocator('iframe[title="Coupon form"]').getByRole("button").waitFor();
  await togglePanel(page);
}

test.describe("playground regression suite", () => {
  test("picker strategies: basics, duplicate chaining, hidden badges, ARIA names, alt/title, and CSS class filtering", async ({
    context,
    page,
    togglePanel,
    panel,
  }) => {
    await openPlayground(context, page, togglePanel);
    const p = panel(page);
    const pickBtn = p.locator(".lp-section .lp-primary-btn").first();
    const firstCode = p.locator(".lp-results .lp-code").first();

    const pick = async (target: import("@playwright/test").Locator) => {
      await target.scrollIntoViewIfNeeded();
      await pickBtn.click();
      await target.click();
    };

    // 1. Basic strategies
    await pick(page.locator("#basics").getByRole("button", { name: "Save draft" }));
    await expect(firstCode).toHaveText("page.getByRole('button', { name: 'Save draft' })");

    // 2. Duplicate names: direct testId wins when present; Plums gets chained row+filter locator
    await pick(page.locator("#duplicates").getByTestId("delete-apples"));
    await expect(firstCode).toHaveText("page.getByTestId('delete-apples')");

    const plumsDelete = page.locator("#duplicates tr", { hasText: "Plums" }).getByRole("button", { name: "Delete" });
    await pick(plumsDelete);
    await expect(firstCode).toHaveText(
      "page.getByRole('row').filter({ hasText: 'Plums' }).getByRole('button', { name: 'Delete' })",
    );
    await expect(p.locator(".lp-results .lp-badge-strategy").first()).toHaveText("Chained");
    await expect(p.locator(".lp-results .lp-badge-robust").first()).toHaveText("robust");

    // 3. Hidden elements: Export report has a display:none sibling -> text candidate gets Hidden badge
    await pick(page.locator("#hidden button:visible", { hasText: "Export report" }));
    await expect(firstCode).toHaveText("page.getByRole('button', { name: 'Export report' })");
    await expect(p.locator(".lp-results .lp-badge-hidden")).toHaveCount(1);

    // aria-hidden button: no role candidate, and no Hidden badge (badge is CSS-hidden only)
    await pick(page.locator("#hidden").getByTestId("hidden-aria"));
    await expect(p.locator(".lp-results")).not.toContainText("getByRole('button'");
    await expect(p.locator(".lp-results .lp-badge-hidden")).toHaveCount(0);

    // 4. aria-label and aria-labelledby
    await pick(page.locator("#aria-names button"));
    await expect(firstCode).toHaveText("page.getByRole('button', { name: 'Close dialog' })");

    // 5. alt and title: logo, status dot, and decorative img (alt="")
    await pick(page.locator('#alt-title img[alt="Company logo"]'));
    await expect(p.locator(".lp-results")).toContainText("page.getByAltText('Company logo')");

    await pick(page.locator('#alt-title span[title="Server online"]'));
    await expect(firstCode).toHaveText("page.getByTitle('Server online')");

    await pick(page.locator("#alt-title img.decor"));
    await expect(p.locator(".lp-results")).not.toContainText("getByRole('img'");

    // 9. Generated and transient classes: yellow keeps .promo-banner, grey flags fragile nth-of-type
    await pick(page.locator("#css-classes .promo-banner"));
    await expect(firstCode).toContainText(".promo-banner");
    await expect(firstCode).not.toContainText("css-1q2w3e4");
    await expect(firstCode).not.toContainText("is-active");
    await expect(firstCode).not.toContainText("ng-star-inserted");

    await pick(page.locator("#css-classes .sc-a1b2c3"));
    await expect(firstCode).toContainText(":nth-of-type(");
    await expect(p.locator(".lp-results .lp-badge-fragile").first()).toHaveText("fragile");
    await expect(p.locator(".lp-results .lp-reason-list").first()).toContainText("nth-of-type");
  });

  test("shadow DOM, same-origin iframe frameLocator, custom-element card, and live re-render", async ({
    context,
    page,
    togglePanel,
    panel,
  }) => {
    await openPlayground(context, page, togglePanel);
    const p = panel(page);
    const pickBtn = p.locator(".lp-section .lp-primary-btn").first();
    const firstCode = p.locator(".lp-results .lp-code").first();

    const pick = async (target: import("@playwright/test").Locator) => {
      await target.scrollIntoViewIfNeeded();
      await pickBtn.click();
      await target.click();
    };

    // 6. Shadow DOM: pick nested shadow button
    await pick(page.locator("#shadow").getByRole("button", { name: "Nested shadow action" }));
    await expect(firstCode).toHaveText("page.getByRole('button', { name: 'Nested shadow action' })");

    // 7. Same-origin iframe: pick emits frameLocator('iframe[title="Coupon form"]') and preserves it on Exact toggle
    const iframeBtn = page.frameLocator('iframe[title="Coupon form"]').getByRole("button", { name: "Apply coupon" });
    await page.locator("#iframe").scrollIntoViewIfNeeded();
    await pickBtn.click();
    await iframeBtn.click();
    await expect(firstCode).toHaveText(
      `page.frameLocator('iframe[title="Coupon form"]').getByRole('button', { name: 'Apply coupon' })`,
    );

    await p.locator(".lp-results .lp-exact-toggle input").first().check();
    await expect(firstCode).toHaveText(
      `page.frameLocator('iframe[title="Coupon form"]').getByRole('button', { name: 'Apply coupon', exact: true })`,
    );

    // 8. Custom-element card: stable attribute selector, no transient classes, stays 1 match when selection moves
    const firstCardLabel = page.locator("#custom-card demo-card").first().locator("label");
    await pick(firstCardLabel);
    const cardResults = await p.locator(".lp-results").textContent();
    expect(cardResults).not.toContain("demo-card--selected");
    expect(cardResults).not.toContain("hydrated");
    await expect(p.locator(".lp-results")).toContainText('demo-card[value="Save for retirement"]');

    // Move selection to the second card; live re-check should still report 1 match
    await page.locator("#custom-card demo-card").nth(1).locator("label").click();
    await expect(p.locator(".lp-results > div").first()).toContainText("1 match");

    // 10. Live re-render: adding duplicate updates count from 1 to 2, removing flips back to 1
    await pick(page.locator("#refresh-a"));
    await expect(p.locator(".lp-results > div").first()).toContainText("1 match");
    await page.locator("#toggle-dup").click();
    await expect(p.locator(".lp-results > div").first()).toContainText("2 matches — not unique");
    await page.locator("#toggle-dup").click();
    await expect(p.locator(".lp-results > div").first()).toContainText("1 match");
  });

  test("panel UI controls: C#/TS language toggle, history remove/clear, and Ctrl+Enter find cases", async ({
    context,
    page,
    togglePanel,
    panel,
  }) => {
    await openPlayground(context, page, togglePanel);
    const p = panel(page);
    const pickBtn = p.locator(".lp-section .lp-primary-btn").first();
    const findInput = p.locator("#lp-paste-input");
    const findResult = p.locator(".lp-find-result");
    const firstCode = p.locator(".lp-results .lp-code").first();

    // Pick two elements so history has 2 entries (second one is a chained row locator)
    await page.locator("#basics").scrollIntoViewIfNeeded();
    await pickBtn.click();
    await page.locator("#basics").getByRole("button", { name: "Save draft" }).click();

    const plumsDelete = page.locator("#duplicates tr", { hasText: "Plums" }).getByRole("button", { name: "Delete" });
    await plumsDelete.scrollIntoViewIfNeeded();
    await pickBtn.click();
    await plumsDelete.click();

    // Toggle language from TS -> C# and verify both results and history update
    await p.getByRole("button", { name: "C#" }).click();
    await expect(firstCode).toHaveText(
      'Page.GetByRole(AriaRole.Row).Filter(new() { HasText = "Plums" }).GetByRole(AriaRole.Button, new() { Name = "Delete" })',
    );

    // Open history, verify 2 entries in C#, remove one, then clear
    const historyToggle = p.locator(".lp-history-toggle");
    await expect(historyToggle).toHaveText("History (2)");
    await historyToggle.click();
    await expect(p.locator(".lp-history-code").first()).toContainText("Page.GetByRole(");

    await p.locator(".lp-history-remove").first().click();
    await expect(historyToggle).toHaveText("History (1)");

    await p.getByRole("button", { name: "Clear" }).click();
    await expect(historyToggle).toHaveText("History (0)");

    // Paste-and-find via Ctrl+Enter across playground find cases
    const findWithCtrlEnter = async (expr: string) => {
      await findInput.fill(expr);
      await findInput.press("Control+Enter");
    };

    // Panel's own find box must not be counted as a match for getByPlaceholder('Name')
    await findWithCtrlEnter("page.getByPlaceholder('Name')");
    await expect(findResult).toHaveText("Found 2 matches — highlighted on the page.");

    // Hidden role -> 0 matches; ARIA labelledby -> 1 match; ARIA label not text -> 0 matches
    await findWithCtrlEnter("page.getByRole('button', { name: 'Hidden by display' })");
    await expect(findResult).toHaveText("No matches found on this page.");

    await findWithCtrlEnter("page.getByLabel('Shipping quantity')");
    await expect(findResult).toHaveText("Found 1 match — highlighted on the page.");

    await findWithCtrlEnter("page.getByText('Close dialog')");
    await expect(findResult).toHaveText("No matches found on this page.");

    // Shadow DOM XPath -> 0 matches; iframe label -> 1 match
    await findWithCtrlEnter("xpath=//button[text()='Shadow subscribe']");
    await expect(findResult).toContainText("No matches found on this page");

    await findWithCtrlEnter("page.getByLabel('Coupon code')");
    await expect(findResult).toHaveText("Found 1 match — highlighted on the page.");

    // Chained locators & Regex arguments (TS and C#)
    await findWithCtrlEnter(
      "page.getByTestId('fruit-list').getByRole('listitem').filter({ hasText: 'Banana' }).getByRole('button')",
    );
    await expect(findResult).toHaveText("Found 1 match — highlighted on the page.");

    await findWithCtrlEnter(
      'Page.GetByRole(AriaRole.Button, new() { NameRegex = new Regex("^pay", RegexOptions.IgnoreCase) })',
    );
    await expect(findResult).toHaveText("Found 1 match — highlighted on the page.");
  });
});
