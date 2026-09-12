# Privacy Policy — Locator Pilot

Locator Pilot does not collect, store, or transmit any data to any server. There is no
backend, no analytics, and no telemetry.

**What the extension does with page content:** when you activate the element picker or
paste a locator to find it, Locator Pilot reads the structure (DOM) of the currently
active tab, entirely inside your browser, to generate or match locators. This
processing happens locally in the page's own content-script context and is never sent
anywhere.

**What is stored:** only your Options preference (the test-id attribute name, e.g.
`data-testid`), saved via `chrome.storage.sync` so it follows your signed-in Chrome
profile across devices. No page content, no locators, and no browsing history are ever
saved.

**Permissions used, and why:**
- `activeTab` — lets the extension act on the tab you're currently viewing, only after
  you click the toolbar icon. No access to any other tab.
- `scripting` — lets the extension inject its picker/finder logic into the active tab
  when you invoke it.
- `storage` — saves your test-id attribute preference.

Locator Pilot requests no host permissions and does not run on every page by default —
it only activates when you open its popup.

Questions or concerns: open an issue on the project's GitHub repository.
