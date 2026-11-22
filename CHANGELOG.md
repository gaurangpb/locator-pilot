# Changelog

All notable changes to Locator Pilot. Versions match `manifest.json` / the Chrome
Web Store listing. Releasing is described in [RELEASING.md](RELEASING.md).

## [Unreleased]

## [0.3.0] — 2026-11-22

### Added
- Automatic chained disambiguation: when a semantic locator matches multiple
  elements (e.g. repeated "Delete" buttons in a table or list), Locator Pilot
  scopes it to the nearest unambiguous container (`testId`, named landmark/region,
  or `row`/`listitem` with `.filter({ hasText })`) ahead of CSS/XPath fallbacks.
- Iframe-aware codegen: picking inside a same-origin `<iframe>` now prepends the
  enclosing `frameLocator(...)` / `FrameLocator(...)` chain so generated locators
  are ready to paste into Playwright tests.
- `Ctrl+Enter` / `Cmd+Enter` inside the "Paste a locator" input triggers "Find on page".
- Playwright E2E regression suite driven directly against `docs/playground/`.

### Fixed
- Toggling between C# and TypeScript in the panel now re-renders pick history
  entries in the newly selected language immediately (previously only the active
  Results cards updated).

### Security
- Pinned GitHub Actions in CI and release workflows to commit SHAs, added
  `npm audit --audit-level=high` to CI, and scoped `release.yml` permissions per job.
- Validated custom `testIdAttribute` values against HTML attribute-name syntax and
  escaped attribute names in CSS attribute selectors.
- Validated `sender.id` and allowlisted relayed/broadcast message types in the
  background service worker.
- Added Dependabot configuration for weekly `npm` and `github-actions` updates.

## [0.2.0] — 2026-11-11

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
