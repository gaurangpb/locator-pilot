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
- [ ] **XPath match counts don't match Playwright's real semantics with shadow DOM.**
  Playwright's XPath engine does not pierce shadow roots; `domQuery.ts`'s
  `deepEvaluateXPath` does, so `xpath=//button[1]` on a page with a light-DOM button
  and a shadow-DOM button reports 2 matches when real Playwright would find 1. This
  is the strategy the tool already flags as brittle, but for the wrong reason —
  worth fixing since XPath is still common in legacy suites.
- [x] **Chained/compound locators are silently truncated.**
  `page.getByTestId('foo').getByRole('button')`, `.filter({hasText})`, `.first()`,
  `.nth()` all get silently dropped by the parser — only the first method call is
  used, so "Find on page" highlights the wrong (usually broader/container) element
  with no indication anything was lost.
- [ ] **Regex locator arguments aren't recognized.** `getByText(/submit/i)` doesn't
  match the parser's quoted-string pattern, so it silently falls through to
  `guessed: true` and gets treated as an invalid raw CSS selector instead of
  surfacing a clear "regex arguments aren't supported yet" message.

## P1 — Missing features with real user impact

- [ ] **No visibility/actionability signal in the UI.** Even after the P0 matcher
  fix, the panel gives no visual cue that a candidate targets a hidden element —
  add a badge/warning independent of which strategy is shown.
- [ ] **No live re-check of match counts.** Counts are computed once at pick/find
  time; on an SPA that re-renders, a "1 match, robust" badge can go stale
  immediately. Consider a refresh action or a `MutationObserver`-driven re-check
  while the panel is open.
- [ ] **No `exact` toggle in the panel.** Every generated spec defaults to
  `exact: false`; flipping a candidate to exact match currently requires editing
  the copied code by hand.
- [ ] **Non-unique candidates aren't visually distinct.** `isUnique` is computed but
  unused in the UI — a 2-match candidate still gets a green "robust" badge next to
  muted gray "2 matches" text that's easy to miss. Should affect badge
  color/border, not just adjacent text.
- [ ] **No `getByAltText()` / `getByTitle()` candidate strategies.** Accessible-name
  computation already extracts `alt`/`title`; images only ever get
  `getByRole('img', {name})`, which works but isn't the idiom most Playwright
  codebases use.
- [ ] **No export / history.** Only one candidate can be copied at a time; nothing
  persists across a debugging session (picking many elements is the common case).

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
  the "generate" and "confirm uniqueness" passes. Revisit if it gets reported as
  laggy on real 40k+ node SPAs.
- [ ] **Land the in-flight popup → docked-panel refactor as its own commit** before
  stacking more feature work on top of the currently-uncommitted diff.

## Done (this session)

- [x] Highlight boxes now track their source element and reposition on
  scroll/resize instead of staying pinned to the viewport coordinates captured at
  find-time. ([content.ts](src/content/content.ts))
