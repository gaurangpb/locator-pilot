import { ORIGIN, expect, test } from "./fixtures";

// Fixture content stays in the left half of the viewport: the docked panel
// covers the right edge of the page.
const layout = `<style>body { font-family: sans-serif; margin: 24px; max-width: 420px; }</style>`;

test.describe("docked panel", () => {
  test("opens, and closes on a second toolbar click", async ({ page, serve, togglePanel, panel }) => {
    await serve({ "/index.html": `${layout}<button>Submit order</button>` });
    await page.goto(`${ORIGIN}/index.html`);

    await togglePanel(page);
    await expect(panel(page)).toBeVisible();

    await togglePanel(page);
    await expect(panel(page)).toBeHidden();
  });

  test("picks an element and shows a ranked role locator first", async ({ page, serve, togglePanel, panel }) => {
    await serve({ "/index.html": `${layout}<h1>Checkout</h1><button>Submit order</button>` });
    await page.goto(`${ORIGIN}/index.html`);
    await togglePanel(page);

    await panel(page).getByRole("button", { name: "Pick an element" }).click();
    await expect(panel(page).getByRole("button", { name: /Picking/ })).toBeVisible();
    await page.getByRole("button", { name: "Submit order" }).click();

    const firstCard = panel(page).locator(".lp-results .lp-code").first();
    await expect(firstCard).toContainText("page.getByRole('button', { name: 'Submit order' })");
    await expect(panel(page).locator(".lp-results")).toContainText("1 match");
    await expect(panel(page).locator(".lp-history-toggle")).toHaveText("History (1)");
  });

  test("Escape cancels picking first, then closes the panel", async ({ page, serve, togglePanel, panel }) => {
    await serve({ "/index.html": `${layout}<button>Submit order</button>` });
    await page.goto(`${ORIGIN}/index.html`);
    await togglePanel(page);

    const pickButton = panel(page).locator(".lp-section .lp-primary-btn").first();
    await pickButton.click();
    await expect(pickButton).toHaveText(/Picking/);

    // Focus is on the pick button inside the panel: the first Escape only cancels the pick.
    await page.keyboard.press("Escape");
    await expect(pickButton).toHaveText("Pick an element");
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
  });

  test("Escape on the page itself (focus outside the panel) leaves the panel open", async ({
    page,
    serve,
    togglePanel,
    panel,
  }) => {
    await serve({ "/index.html": `${layout}<input aria-label="Search" />` });
    await page.goto(`${ORIGIN}/index.html`);
    await togglePanel(page);

    await page.getByRole("textbox", { name: "Search" }).focus();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeVisible();
  });

  test("finds a pasted chained locator on the page", async ({ page, serve, togglePanel, panel }) => {
    await serve({
      "/index.html": `${layout}
        <ul>
          <li data-testid="row">Apples <button>Delete</button></li>
          <li data-testid="row">Pears <button>Delete</button></li>
        </ul>`,
    });
    await page.goto(`${ORIGIN}/index.html`);
    await togglePanel(page);

    const input = panel(page).locator("textarea");
    const findButton = panel(page).getByRole("button", { name: "Find on page" });
    const result = panel(page).locator(".lp-find-result");

    await input.fill("page.getByTestId('row').filter({ hasText: 'Pears' }).getByRole('button')");
    await findButton.click();
    await expect(result).toHaveText("Found 1 match — highlighted on the page.");

    await input.fill("page.getByRole('button', { name: 'Delete' })");
    await findButton.click();
    await expect(result).toHaveText("Found 2 matches — highlighted on the page.");
  });

  test("re-checks match counts live when the page re-renders", async ({ page, serve, togglePanel, panel }) => {
    await serve({ "/index.html": `${layout}<div id="list"><button>Add to cart</button></div>` });
    await page.goto(`${ORIGIN}/index.html`);
    await togglePanel(page);

    await panel(page).getByRole("button", { name: "Pick an element" }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    const roleCard = panel(page).locator(".lp-results > div").first();
    await expect(roleCard).toContainText("1 match");

    await page.evaluate(() => {
      document.getElementById("list")!.insertAdjacentHTML("beforeend", "<button>Add to cart</button>");
    });
    await expect(roleCard).toContainText("2 matches — not unique");
  });

  test("picks inside a same-origin iframe and reports back to the top-frame panel", async ({
    page,
    serve,
    togglePanel,
    panel,
  }) => {
    await serve({
      "/index.html": `${layout}<iframe src="/frame.html" style="width:400px;height:200px;border:0"></iframe>`,
      "/frame.html": `<button data-testid="framed">Framed action</button>`,
    });
    await page.goto(`${ORIGIN}/index.html`);
    await page.frameLocator("iframe").getByRole("button").waitFor();
    await togglePanel(page);

    await panel(page).getByRole("button", { name: "Pick an element" }).click();
    await page.frameLocator("iframe").getByRole("button", { name: "Framed action" }).click();

    await expect(panel(page).locator(".lp-results .lp-code").first()).toContainText(
      "getByRole('button', { name: 'Framed action' })",
    );
  });
});
