# Chrome Web Store listing — copy/paste

Use this when filling out [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
The upload ZIP is `locator-pilot.zip` at the repo root (`npm run pack`).

Privacy policy URL (after GitHub Pages is live):

`https://gaurangpb.github.io/locator-pilot/privacy.html`

Fallback if Pages is still building:

`https://github.com/gaurangpb/locator-pilot/blob/master/PRIVACY.md`

## Product

| Field | Value |
| --- | --- |
| Name | Locator Pilot — Playwright Element Locators |
| Summary (from manifest, max 132) | Pick any element and get a Playwright locator in C# or TypeScript. Paste a locator to find it on the page. |
| Category | Developer Tools |
| Language | English |
| Visibility | Public |
| Distribution | All regions |
| Official / homepage URL | https://github.com/gaurangpb/locator-pilot |
| Support URL | https://github.com/gaurangpb/locator-pilot/issues |
| Mature content | No |

## Graphic assets

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `icons/icon128.png` (already in the ZIP) | 128×128 |
| Screenshot 1 | `store/screenshots/01-pick-element.png` | 1280×800 |
| Screenshot 2 | `store/screenshots/02-csharp.png` | 1280×800 |
| Screenshot 3 | `store/screenshots/03-paste-find.png` | 1280×800 |
| Screenshot 4 | `store/screenshots/04-history.png` | 1280×800 |
| Small promo tile | `store/promo/small-440x280.png` | 440×280 |
| Marquee promo tile (optional) | `store/promo/marquee-1400x560.png` | 1400×560 |
| Promo video | skip | — |

## Detailed description

Paste this into the Store listing **Detailed description** field (basic HTML is allowed):

```
Locator Pilot helps you write Playwright tests faster. Click any element on a page and copy a ranked set of locators in C# or TypeScript — or paste a locator back in to find and highlight it.

<b>Pick an element, get a locator</b>
Open the docked panel from the toolbar, click Pick an element, and click anything on the page. Locator Pilot ranks candidates the way Playwright recommends: role and accessible name first, then label, placeholder, alt text, title, text, test-id, CSS, and XPath.

<b>See which locator will actually work</b>
Every candidate shows how many elements it matches right now. Unique locators stay quiet; 2+ matches and zero matches get their own color so you don't copy a locator that will flake. Brittleness warnings call out auto-generated class names, positional selectors, and unnamed roles. Hidden matches (display:none / visibility:hidden) get an orange badge, because Playwright actions will time out on them.

<b>C# and TypeScript</b>
Toggle the language in the panel. Your last choice is remembered. Copy a single locator, or export the whole pick history as one block.

<b>Paste a locator to find it</b>
Paste a Playwright call (TS or C#), a text=/css=/xpath= selector, or a bare CSS/XPath expression. Matches are highlighted on the page — including inside open shadow roots and same-origin iframes.

<b>What this extension does not do</b>
No servers, no account, no telemetry. It only runs after you click the toolbar icon. The only thing saved is your Options preference (test-id attribute name and language), in chrome.storage.sync.

Source and issue tracker: https://github.com/gaurangpb/locator-pilot
Privacy policy: https://gaurangpb.github.io/locator-pilot/privacy.html
```

## Privacy practices tab

### Single purpose

```
Generate and look up Playwright locators for elements on the currently active tab, so developers can write more reliable test automation.
```

### Permission justifications

**activeTab**
```
Used only after the user clicks the toolbar icon, so the extension can read the active tab's DOM and generate or match locators on that page. It does not run on other tabs and has no host_permissions.
```

**scripting**
```
Used to inject the picker/finder content script into the active tab (and its same-origin frames) when the user clicks the toolbar icon.
```

**storage**
```
Used to save the user's test-id attribute preference and C#/TypeScript language choice via chrome.storage.sync. No page content is stored.
```

### Remote code

Select: **No, I am not using remote code.**

### Data usage / collection

Do **not** check any collected-data categories. The extension does not transmit user data off the device.

It does read the active tab's DOM locally to generate locators; that is described in the privacy policy and is never sent anywhere.

Certify:

- [x] I do not sell or transfer user data to third parties, except as noted
- [x] I do not use or transfer user data for purposes unrelated to the item's core functionality
- [x] I do not use or transfer user data to determine creditworthiness or for lending

### Privacy policy URL

`https://gaurangpb.github.io/locator-pilot/privacy.html`
