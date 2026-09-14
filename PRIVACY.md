# Privacy Policy — Locator Pilot

**Effective date:** 13 September 2026

Locator Pilot is a Chrome extension for generating and looking up Playwright locators
on the page you are viewing. It does not collect, store, or transmit any data to any
server. There is no backend, no analytics, and no telemetry.

## What the extension does with page content

When you activate the element picker or paste a locator to find it, Locator Pilot
reads the structure (DOM) of the currently active tab, entirely inside your browser,
to generate or match locators. This processing happens locally in the page's own
content-script context and is never sent anywhere.

## What is stored

Only your Options preferences (the test-id attribute name, e.g. `data-testid`, and
your C# / TypeScript language choice), saved via `chrome.storage.sync` so they follow
your signed-in Chrome profile across devices. No page content, no locators, and no
browsing history are ever saved.

## Permissions used, and why

- `activeTab` — lets the extension act on the tab you're currently viewing, only after
  you click the toolbar icon. No access to any other tab.
- `scripting` — lets the extension inject its picker/finder logic into the active tab
  when you invoke it.
- `storage` — saves your Options preferences.

Locator Pilot requests no host permissions and does not run on every page by default —
it only activates when you click its toolbar icon.

## Data sharing, sale, and third parties

Locator Pilot does not sell, rent, share, or transfer user data to third parties. It
does not use advertising networks, analytics providers, or crash reporters.

## Children's privacy

Locator Pilot is a developer tool and is not directed at children. It does not
knowingly collect any personal information from anyone, including children under 13.

## Changes

If this policy changes, the updated version will be posted at the same URL with a new
effective date. Because the extension does not collect contact information, we cannot
email you; check this page if you want to review the current policy.

## Contact

Questions or concerns: open an issue at
[https://github.com/gaurangpb/locator-pilot/issues](https://github.com/gaurangpb/locator-pilot/issues).
