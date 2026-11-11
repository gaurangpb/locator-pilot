# Changelog

All notable changes to Locator Pilot. Versions match `manifest.json` / the Chrome
Web Store listing. Releasing is described in [RELEASING.md](RELEASING.md).

## [Unreleased]

### Fixed
- Pick history and the live match-count re-check silently failed on plain `http://`
  pages (no `crypto.randomUUID` outside secure contexts).
- `getByText` no longer matches `<body>`/containers because of text inside inline
  `<script>`/`<style>`.
- An `<img alt="">` (decorative) is no longer offered or matched as role `img`.
- CSS candidates inside shadow roots are now checked for uniqueness across the whole
  page (including shadow DOM), not just the light DOM.
- A unique candidate can no longer be pushed out of the panel by non-unique ones.
- `getByLabel` also matches `aria-label` and `aria-labelledby`, like Playwright.

### Added
- "Find on page" evaluates chained locators (`.filter()`, `.nth()`, `.first()`,
  `.and()`/`.or()`, nested `getBy…`) and regex arguments.
- Escape closes the panel (when focus is in it); while picking, the first Escape
  still only cancels the pick.

### Security
- Sub-frame results reach the panel through the background worker instead of
  `window.postMessage`, so the page can neither read nor forge them.

## [0.1.0] — 2026-09-13

First Chrome Web Store release: element picker with ranked Playwright locators in
C# and TypeScript, paste-to-find, shadow DOM and same-origin iframe support, hidden/
non-unique warnings, live re-check, exact-match toggle, and in-memory pick history.
