# Locator Pilot — Backlog

Findings from an architecture review (2026-09-13), backed by direct testing of the
matching/generation engine against real DOM cases (hidden elements, shadow DOM,
same-origin iframes, chained/regex locators, an ~8,800-node synthetic page). Ordered
by priority within each section — top of a section is highest priority.

Status legend: `[ ]` open, `[x]` done.

## P0 — Correctness bugs (hand out locators that don't actually work in Playwright)

- [x] **Role locators ignore visibility.** Playwright's `getByRole()` excludes
  elements not exposed to the accessibility tree (`display:none`,
  `visibility:hidden`, `aria-hidden="true"`) by default. The tool currently reports
  these as "robust, 1 match" — a locator that will find 0 elements in a real test.
  Confirmed for all three hiding mechanisms. Fix in [matcher.ts](src/lib/matcher.ts)
  `matchByRole`.
- [x] **XPath match counts don't match Playwright's real semantics with shadow DOM.**
  Playwright's XPath engine does not pierce shadow roots; `domQuery.ts`'s
  `deepEvaluateXPath` does, so `xpath=//button[1]` on a page with a light-DOM button
  and a shadow-DOM button reports 2 matches when real Playwright would find 1. This
  is the strategy the tool already flags as brittle, but for the wrong reason —
  worth fixing since XPath is still common in legacy suites. Fixed in
  [domQuery.ts](src/lib/domQuery.ts) `deepEvaluateXPath` — it now evaluates only
  against the main document instead of walking shadow roots.
- [x] **Chained/compound locators are silently truncated.**
  `page.getByTestId('foo').getByRole('button')`, `.filter({hasText})`, `.first()`,
  `.nth()` all get silently dropped by the parser — only the first method call is
  used, so "Find on page" highlights the wrong (usually broader/container) element
  with no indication anything was lost.
- [x] **Regex locator arguments aren't recognized.** `getByText(/submit/i)` doesn't
  match the parser's quoted-string pattern, so it silently falls through to
  `guessed: true` and gets treated as an invalid raw CSS selector instead of
  surfacing a clear "regex arguments aren't supported yet" message. Fixed in
  [parser.ts](src/lib/parser.ts) — JS regex literals and `.NET` `new Regex(...)`
  arguments (positional or in a `name`/`Name` option) now throw a clear
  "regex arguments aren't supported yet" error instead of being misparsed.

## P1 — Missing features with real user impact

> Locator selection/ranking is the core value of this tool — the precedence and
> resolution rules behind it are written down in
> [docs/LOCATOR_STRATEGY.md](docs/LOCATOR_STRATEGY.md), and every piece of that design
> is now implemented (see the checked-off items below). Keep the doc in sync with any
> future change to ranking/resolution behavior.

- [x] **CSS candidates include transient state/framework classes.** `buildCssSelector`
  only stripped hash-like auto-generated class names — it kept state classes
  (`--selected`, `is-*`) and hydration markers (`hydrated`, `ng-star-inserted`)
  verbatim, so a candidate like `sdps-card.sdps-card--selected.hydrated` stopped
  matching the moment the card is deselected. Fixed via `isTransientClassToken` in
  [locatorEngine.ts](src/lib/locatorEngine.ts) `buildCssSelector`, per
  [docs/LOCATOR_STRATEGY.md §2.7](docs/LOCATOR_STRATEGY.md#2-strategy-precedence--once-we-know-the-target-element).
- [x] **No "nearest interactive relative" resolution.** Candidates were only ever
  generated from the exact element the user clicked. A role-less wrapper (common
  with custom elements/web components, e.g. `<sdps-card>` wrapping a labelled
  `<input type="radio">`) fell straight through to a CSS class chain, even though a
  uniquely-identifiable interactive ancestor or descendant existed one hop away.
  Added `resolveTargetElement`/`pickCandidates` in
  [locatorEngine.ts](src/lib/locatorEngine.ts), wired through a new `resolvedVia`
  field on the `element-picked`/`candidates-updated` messages
  ([messages.ts](src/lib/messages.ts), [content.ts](src/content/content.ts)), and
  surfaced in the panel as a blue note + secondary highlight box on the resolved
  element ([ui.ts](src/content/ui.ts), [overlay.css](src/content/overlay.css)) per
  [docs/LOCATOR_STRATEGY.md §1](docs/LOCATOR_STRATEGY.md#1-element-resolution--which-node-do-we-generate-specs-from).
- [x] **No visibility/actionability signal in the UI.** Even after the P0 matcher
  fix, the panel gives no visual cue that a candidate targets a hidden element —
  add a badge/warning independent of which strategy is shown. Added
  `hasHiddenMatch` to `LocatorCandidate` ([types.ts](src/lib/types.ts)), computed
  in [locatorEngine.ts](src/lib/locatorEngine.ts) from the same
  `isExposedToAccessibilityTree` check the P0 role fix uses, and surfaced as an
  orange "Hidden" badge on any candidate card in [ui.ts](src/content/ui.ts)
  regardless of strategy.
- [x] **No live re-check of match counts.** Counts are computed once at pick/find
  time; on an SPA that re-renders, a "1 match, robust" badge can go stale
  immediately. Added a `MutationObserver`-driven re-check (debounced 300ms) that
  runs in whichever frame owns the current pick, recomputing candidates via the
  new `refreshCandidates` helper in [locatorEngine.ts](src/lib/locatorEngine.ts)
  and pushing updates to the panel through a `candidates-updated` message in
  [content.ts](src/content/content.ts)/[messages.ts](src/lib/messages.ts).
  Scoped to the picked-candidates panel (not the one-off "Find on page" text).
- [x] **No `exact` toggle in the panel.** Every generated spec defaults to
  `exact: false`; flipping a candidate to exact match currently requires editing
  the copied code by hand. Added an "Exact match" checkbox per applicable
  candidate card in [ui.ts](src/content/ui.ts), wired through a new
  `recompute-exact` broadcast message to the owning frame, which recomputes the
  candidate via the new `withExact` helper in
  [locatorEngine.ts](src/lib/locatorEngine.ts).
- [x] **Non-unique candidates aren't visually distinct.** `isUnique` is now factored
  into the UI: the match-count text turns amber (2+ matches) or red (0 matches) and
  bolds, and the candidate card gets a matching border color, in
  [ui.ts](src/content/ui.ts) (`matchCountClass`/`candidateCardClass`) and
  [overlay.css](src/content/overlay.css).
- [x] **No `getByAltText()` / `getByTitle()` candidate strategies.** Added as
  strategies in [types.ts](src/lib/types.ts), generated in `buildSpecs`
  ([locatorEngine.ts](src/lib/locatorEngine.ts)) alongside (not instead of) the role
  candidate, with matching support in [matcher.ts](src/lib/matcher.ts),
  [codegen.ts](src/lib/codegen.ts), [brittleness.ts](src/lib/brittleness.ts), and
  round-trip parsing in [parser.ts](src/lib/parser.ts). Per
  [docs/LOCATOR_STRATEGY.md §2.4](docs/LOCATOR_STRATEGY.md#2-strategy-precedence--once-we-know-the-target-element).
- [x] **No export / history.** Added an in-panel History section
  ([ui.ts](src/content/ui.ts), [content.ts](src/content/content.ts)) backed by pure
  helpers in [history.ts](src/lib/history.ts): every pick is appended (capped at 20),
  each entry can be copied or removed individually, and "Export" copies every pick's
  top locator to the clipboard as one block. Deliberately in-memory only (resets on
  page reload) rather than `chrome.storage`-backed, to avoid contradicting
  [PRIVACY.md](PRIVACY.md)'s "nothing persisted" stance — see README.md.

## P2 — Hardening / code quality

- [ ] **`buildCssSelector`'s uniqueness check is blind to shadow DOM.** It validates
  candidate selectors with plain `doc.querySelectorAll`, which can't see into
  shadow roots — the shortest-unique-selector logic silently never runs correctly
  there. Swap in `deepQuerySelectorAll` for the uniqueness probes.
- [ ] **`<img alt="">` still gets role `"img"`.** An empty `alt` marks a decorative
  image (excluded from the a11y tree) but `getImplicitRole` doesn't account for it
  — same root cause as the P0 visibility bug.
- [ ] **Zero test coverage on the riskiest code.** `matcher.ts`, `domQuery.ts`, and
  `accessibility.ts` (where the shadow-DOM/XPath-piercing bugs above live) have no
  tests at all. Prioritize these over more `codegen`/`brittleness` coverage.
- [ ] **No Playwright-based e2e tests of the extension itself.** Ironic for a
  Playwright-locator tool — loading the built `dist/` as an unpacked extension via
  `launchPersistentContext` would catch picker/highlight/panel regressions that
  jsdom unit tests structurally can't.
- [ ] **Escape only cancels picking, not the panel.** Minor UX inconsistency with
  most docked-panel patterns.
- [ ] **Perf watch-item, not yet a problem.** ~36ms per click on an 8,800-node
  synthetic page (several full-DOM sweeps: one per candidate for match-count, plus
  the CSS uniqueness-shortening loop's own per-segment queries). No caching between
  the "generate" and "confirm uniqueness" passes. The new interactive-relative
  resolution ([locatorEngine.ts](src/lib/locatorEngine.ts) `resolveTargetElement`)
  adds a bounded ancestor/descendant walk (depth 3) on top of this, but only for
  role-less picks — not measured, likely negligible next to the existing sweeps.
  Revisit if it gets reported as laggy on real 40k+ node SPAs.
- [x] **Land the in-flight popup → docked-panel refactor as its own commit.** Done
  in [017e94a](https://github.com/gaurangpb/locator-pilot/commit/017e94a) — stale
  by the time this list was written down; no longer an uncommitted diff.

## Done (this session)

- [x] Highlight boxes now track their source element and reposition on
  scroll/resize instead of staying pinned to the viewport coordinates captured at
  find-time. ([content.ts](src/content/content.ts))
- [x] **Highlight boxes collapsed to an invisible dot on near-zero-size targets.**
  A custom radio/checkbox's real `<input>` is often kept in the accessibility tree
  (so it's a valid, exposed locator target) but rendered at ~0px, visually hidden
  behind a styled label/icon — exactly the kind of element our interactive-relative
  resolution (§1) routinely resolves to. `positionBox` in
  [content.ts](src/content/content.ts) now floors the highlight box to a minimum
  20x20px, centered on the element's real position, instead of shrinking to match.
