export type LocatorStrategy =
  | "role"
  | "label"
  | "placeholder"
  | "altText"
  | "title"
  | "text"
  | "testId"
  | "chained"
  | "css"
  | "xpath";

export interface RoleLocatorSpec {
  strategy: "role";
  role: string;
  name?: string;
  exact: boolean;
}

export interface LabelLocatorSpec {
  strategy: "label";
  text: string;
  exact: boolean;
}

export interface PlaceholderLocatorSpec {
  strategy: "placeholder";
  text: string;
  exact: boolean;
}

export interface AltTextLocatorSpec {
  strategy: "altText";
  text: string;
  exact: boolean;
}

export interface TitleLocatorSpec {
  strategy: "title";
  text: string;
  exact: boolean;
}

export interface TextLocatorSpec {
  strategy: "text";
  text: string;
  exact: boolean;
}

export interface TestIdLocatorSpec {
  strategy: "testId";
  attribute: string;
  value: string;
}

/**
 * A semantic locator scoped to an unambiguous ancestor container (e.g. a table row,
 * list item, or test-id wrapper) to disambiguate a non-unique child locator.
 */
export interface ChainedLocatorSpec {
  strategy: "chained";
  parent: LocatorSpec;
  /** Optional `.filter({ hasText })` narrowing `parent` (e.g. for `row` or `listitem`). */
  parentHasText?: string;
  child: LocatorSpec;
}

export interface CssLocatorSpec {
  strategy: "css";
  selector: string;
}

export interface XPathLocatorSpec {
  strategy: "xpath";
  expression: string;
}

export type LocatorSpec =
  | RoleLocatorSpec
  | LabelLocatorSpec
  | PlaceholderLocatorSpec
  | AltTextLocatorSpec
  | TitleLocatorSpec
  | TextLocatorSpec
  | TestIdLocatorSpec
  | ChainedLocatorSpec
  | CssLocatorSpec
  | XPathLocatorSpec;

export type BrittlenessLevel = "robust" | "medium" | "fragile";

export interface BrittlenessResult {
  level: BrittlenessLevel;
  reasons: string[];
}

export interface LocatorCandidate {
  spec: LocatorSpec;
  matchCount: number;
  isUnique: boolean;
  /** True when at least one matched element is CSS-hidden (display:none or visibility:hidden) — Playwright actionability (click, fill, etc.) will fail or time out on it even though the locator resolves. Deliberately excludes aria-hidden, which is a common pattern on visible decorative elements and doesn't affect actionability. */
  hasHiddenMatch: boolean;
  brittleness: BrittlenessResult;
  /** Outermost-to-innermost CSS selectors for enclosing same-origin iframes, when picked inside a frame. */
  frameSelectors?: string[];
  csharp: string;
  typescript: string;
}

export interface EngineOptions {
  testIdAttribute: string;
  /** Enclosing same-origin iframe CSS selectors (outermost first) to prepend as `frameLocator(...)` calls. */
  frameSelectors?: string[];
}

/**
 * How the engine resolved away from the exact element the user picked, per
 * docs/LOCATOR_STRATEGY.md §1 — "ancestor" or "descendant" means candidates target a
 * different (uniquely-identifiable interactive) element than the one picked; null
 * means no resolution happened and candidates target the picked element itself.
 */
export type ResolutionKind = "ancestor" | "descendant";

export type CodeLanguage = "csharp" | "typescript";

export const DEFAULT_TEST_ID_ATTRIBUTE = "data-testid";
export const DEFAULT_LANGUAGE: CodeLanguage = "csharp";
