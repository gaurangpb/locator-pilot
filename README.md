# Locator Pilot

A Chrome extension for writing Playwright tests faster: pick any element on a page and
get a ranked set of Playwright locators in **C#** and **TypeScript** — or paste a
locator back in to find and highlight it on the current page.

## Features (v1)

- **Element picker** — click the toolbar icon to open a docked right-hand panel, then
  pick an element. The panel stays open. Works inside open shadow roots and same-origin
  iframes. A C# / TypeScript toggle remembers your last choice.
- **Ranked locator candidates** — up to 3 per element, following Playwright's own
  priority: role/name → label → placeholder → alt text/title → text → test-id → CSS →
  XPath. See [docs/LOCATOR_STRATEGY.md](./docs/LOCATOR_STRATEGY.md) for the full
  precedence and element-resolution rules behind this ranking.
- **Live uniqueness check** — every candidate shows how many elements on the page it
  currently matches; a non-unique or zero-match candidate gets its own badge color and
  card border so it's not easy to miss.
- **Brittleness warnings** — flags locators built on auto-generated class names,
  positional (`nth-child`/indexed XPath) selectors, or unnamed roles.
- **Pick history & export** — every element you pick is kept in an in-panel history
  list for the current page session, so you can revisit, copy, or remove earlier
  picks; "Export" copies every pick's top locator to the clipboard as one block.
- **Paste-and-find** — paste a Playwright locator call (TS or C#), a classic
  `text=`/`css=`/`xpath=` selector string, or a bare CSS/XPath expression, and it
  highlights every match on the page.
- **Configurable test-id attribute** — Options page lets you set `data-testid`,
  `data-test`, `data-qa`, or whatever your team uses.
- No servers, no accounts, no telemetry. See [PRIVACY.md](./PRIVACY.md).

## Project layout

```
src/
  lib/            Pure, unit-tested logic: role/name computation, locator generation,
                  brittleness scoring, the paste-a-locator parser, C#/TS codegen,
                  and DOM matching (shadow-DOM aware).
  content/        Content script: the docked right-hand panel, picker overlay,
                  hover/click handling, and the paste-and-find highlighter. Renders
                  its UI inside a shadow root so host-page CSS can't interfere with it.
  background/     Service worker: toolbar click injects the panel and relays messages.
  options/        Options page for the test-id attribute setting.
tests/            Vitest + jsdom unit tests for src/lib.
```

## Building

```bash
npm install
npm run build
```

This produces a `dist/` folder — that's what you load into Chrome.

```bash
npm run pack                # build + zip dist/ as locator-pilot.zip (Chrome Web Store upload)
npm run store:screenshots   # regenerate store listing screenshots/promo tiles
```

## Loading the extension locally

1. Run `npm run build` (or `npm run watch` while developing).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
   select the `dist/` folder.
3. Pin the extension, open any page, click the icon.

## Testing

```bash
npm test        # unit tests (locator engine, parser, codegen, brittleness)
npm run typecheck
```

The picker/overlay UI itself needs a real browser to exercise (hover/click/highlight
positioning) — load `dist/` unpacked and try it on a real page as described above.

## Known limitations / things to verify

- **Cross-origin iframes**: same-origin iframes and shadow DOM are fully supported.
  Cross-origin iframes rely on Chrome's `activeTab` permission extending to child
  frames of the active tab; this should work but hasn't been verified against a live
  cross-origin iframe case. If it doesn't, the fix is adding narrowly-scoped
  `host_permissions` (with the store-review trade-off that implies) rather than
  `<all_urls>`.
- **Text-matching heuristics** approximate Playwright's own `getByText`/accessible-name
  algorithms closely enough for common cases, but are not a full implementation of the
  W3C accname spec.
- **Pick history is in-memory only**, scoped to the current page load — it resets on
  reload/navigation and is never written to `chrome.storage` or disk, so it doesn't
  change the no-persistence privacy stance in [PRIVACY.md](./PRIVACY.md).

## Chrome Web Store

The listing is ready to submit. Copy-paste fields, privacy answers, and asset paths
are in [store/LISTING.md](./store/LISTING.md).

- Manifest V3, no remote code — everything is bundled locally and not minified.
- Minimal permissions: `activeTab`, `scripting`, `storage`. No `host_permissions`.
- Privacy policy (public URL): https://gaurangpb.github.io/locator-pilot/privacy.html
  (source: [PRIVACY.md](./PRIVACY.md) / [docs/privacy.html](./docs/privacy.html)).
- Upload `locator-pilot.zip` from `npm run pack`. `manifest.json` is at the zip root.
- Single purpose: element locator generation/lookup for Playwright test automation.

Publishing still requires a Chrome Web Store developer account (one-time $5, 2-Step
Verification on). You cannot finish the dashboard upload from this repo alone.

## License

MIT — see [LICENSE](./LICENSE).
