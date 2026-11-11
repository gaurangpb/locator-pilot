import { test as base, chromium, type BrowserContext, type Locator, type Page, type Worker } from "@playwright/test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist");

/** Fixture pages are served from this fake origin via context.route — no real server needed. */
export const ORIGIN = "http://lp.test";

/**
 * A copy of dist/ with one test-only change: host permission for every URL. The
 * shipped extension relies on `activeTab`, which Chrome only grants on a real
 * toolbar click — something no automation can perform — so without this the
 * service worker couldn't inject the content script into the test page.
 */
function prepareExtensionCopy(): string {
  if (!existsSync(path.join(distDir, "manifest.json"))) {
    throw new Error("dist/ is missing — run `npm run build` before the e2e tests.");
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "locator-pilot-e2e-ext-"));
  cpSync(distDir, dir, { recursive: true });
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = ["<all_urls>"];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

interface Fixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  /** Pages keyed by path ("/index.html" → HTML), served under ORIGIN. */
  serve: (pages: Record<string, string>) => Promise<void>;
  /** Does what a toolbar-icon click does: inject content.js into every frame and toggle the panel. */
  togglePanel: (page: Page) => Promise<void>;
  panel: (page: Page) => Locator;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionDir = prepareExtensionCopy();
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), "locator-pilot-e2e-profile-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // The "chromium" channel is full Chromium in new-headless mode, which (unlike
      // the headless shell) can load extensions.
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(extensionDir, { recursive: true, force: true });
  },

  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },

  serve: async ({ context }, use) => {
    const pages: Record<string, string> = {};
    await context.route(`${ORIGIN}/**`, (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pages[pathname];
      if (body === undefined) return route.fulfill({ status: 404, body: "not found" });
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
    });
    await use(async (next) => {
      Object.assign(pages, next);
    });
  },

  togglePanel: async ({ serviceWorker }, use) => {
    await use(async (page) => {
      const url = page.url();
      await serviceWorker.evaluate(async (pageUrl) => {
        const [tab] = await chrome.tabs.query({ url: pageUrl });
        if (!tab?.id) throw new Error(`no tab for ${pageUrl}`);
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
        await chrome.tabs.sendMessage(tab.id, {
          type: "toggle-panel",
          testIdAttribute: "data-testid",
          language: "typescript",
        });
      }, url);
    });
  },

  panel: async ({}, use) => {
    // Playwright's CSS engine pierces the panel's open shadow root.
    await use((page) => page.locator("#locator-pilot-host .lp-dock"));
  },
});

export const expect = test.expect;
