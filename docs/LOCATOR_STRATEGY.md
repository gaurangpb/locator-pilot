# Locator Strategy — precedence & resolution rules

This is the core value proposition of Locator Pilot, so the rules for *which* locator
we recommend need to be explicit and intentional, not an emergent property of
tag-name branching in `buildSpecs`. This doc is the source of truth for that logic —
`src/lib/locatorEngine.ts` points back here in its comments, and any change to
ranking/resolution behavior should update this doc in the same change.

## Guiding principle

Prefer locators that describe the element the way a user (or assistive tech)
perceives it, not how it happens to be implemented. This is Playwright's own stated
philosophy (mirrored by Testing Library) and it also happens to produce the most
change-resilient locators: user-facing semantics (role, label, visible text) change
far less often than markup, classes, or DOM structure.

## 1. Element resolution — which node do we generate specs from?

Before ranking strategies, decide *which element* the specs should be built from.
Today the engine only ever looks at the exact element the user clicked, which is the
root cause of cases like a custom `<sdps-card>` wrapper: it has no ARIA role of its
own, so the engine falls straight to a CSS class chain and never notices the properly
labelled `<input type="radio">` nested inside it.

Given the picked element `el`:

1. If `el` itself exposes a role, or a direct label/placeholder/text/test-id (today's
   only path) → use `el`. This stays the common case, unchanged.
2. Otherwise, look for a resolution target, in this order, and only promote if the
   search finds **exactly one** match — never guess among several equally-plausible
   candidates:
   1. **Nearest interactive ancestor.** Walk up a small bounded number of levels (or
      until crossing a shadow-root boundary) for the nearest ancestor with a role.
      Handles "clicked the icon glyph inside a `<button>`."
   2. **Nearest interactive descendant.** Walk down the same bound for a single
      element that has both a role and a resolvable accessible name. Handles
      "clicked a custom-element card wrapping a labelled `<input>`" — the
      `sdps-card` case.
3. If resolution promotes to a different element than `el`, the UI must surface that
   — highlight the *resolved* element (not just `el`), and label the candidate group
   (e.g. "via nested radio"). Silently handing back a locator for a different element
   than the one the user pointed at would be confusing.
4. If no unique interactive relative is found, fall back to building specs from `el`
   itself (role if any, then structural CSS/XPath) — today's behavior.

**Status: implemented** — `resolveTargetElement`/`pickCandidates` in
[locatorEngine.ts](../src/lib/locatorEngine.ts). Resolution to an ancestor or
descendant is surfaced to the panel via `resolvedVia` on the `element-picked`/
`candidates-updated` messages, shown as a note plus a secondary highlight box on
the resolved element ([ui.ts](../src/content/ui.ts),
[content.ts](../src/content/content.ts)).

## 2. Strategy precedence — once we know the target element

1. `role` + accessible name — most resilient; matches Playwright's own actionability
   model and excludes hidden elements the way `getByRole()` does.
2. `label` — form controls with an associated `<label>`.
3. `placeholder` — weaker than label (hint text, not guaranteed unique or present),
   still user-facing.
4. `altText` / `title` — images/icons without visible text.
   - **Status: implemented** — `buildSpecs` in
     [locatorEngine.ts](../src/lib/locatorEngine.ts) adds a `getByAltText` candidate
     for any `<img>` with a non-empty `alt`, and a `getByTitle` candidate for any
     element with a `title` attribute and no visible text of its own — alongside,
     not instead of, the `role` candidate (which already surfaces the same text via
     `getAccessibleName`'s alt/title fallback).
5. `text` — static content (headings, links, buttons without a distinguishing name).
   Prone to copy changes and to matching more than one node.
6. `testId` — explicit test hook. Stable across markup changes, but only exists where
   the app was instrumented for it. Deliberately ranked below the accessible-first
   strategies above — this nudges toward accessible markup and matches Playwright's
   own documented preference order.
7. `css` — last resort, and only ever built from stable signals, tried in this order:
   `#id` → a single distinguishing non-state attribute (`[name=]`, `[type=]`,
   `[value=]`, `[href=]`, …) → non-state classes → tag + `nth-of-type` path.
   - **Never include a class that encodes transient state**
     (`--selected`, `--active`, `is-*`, `has-*`) or a framework/hydration marker
     (`hydrated`, `ng-star-inserted`, …) — these flip or vanish at runtime and
     produce exactly the kind of false-negative locator seen in the `sdps-card`
     case (`.sdps-card--selected.hydrated` stops matching the moment the card is
     deselected or before Stencil finishes hydrating it).
   - **Status: implemented** — `isTransientClassToken` in
     [locatorEngine.ts](../src/lib/locatorEngine.ts) filters both categories out of
     `buildCssSelector`'s candidate classes, alongside the existing hash-like
     auto-generated-class filter.
8. `xpath` — absolute last resort; already flagged brittle by `assessBrittleness`.

## 3. Explicit non-goals / decisions

- We do **not** rank `testId` above `role`, even though some teams treat test-ids as
  ground truth. This matches Playwright's own documented order and is a deliberate
  nudge toward accessible markup. Revisit only if strongly requested.
- Resolution promotion (§1) never guesses between multiple equally-plausible
  candidates — ambiguity always falls back to the originally-picked element, even if
  that yields a worse (CSS/XPath) locator. A silently wrong guess is worse than an
  honestly fragile locator.

## Related backlog items

See `BACKLOG.md` for history: interactive-element resolution (§1), CSS state-class
filtering (§2.7), `getByAltText`/`getByTitle` strategies (§2.4), and making
non-unique candidates visually distinct in the panel (relevant to §1.3) are all now
implemented.
