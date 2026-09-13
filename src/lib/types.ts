export type LocatorStrategy =
  | "role"
  | "label"
  | "placeholder"
  | "text"
  | "testId"
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
  | TextLocatorSpec
  | TestIdLocatorSpec
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
  brittleness: BrittlenessResult;
  csharp: string;
  typescript: string;
}

export interface EngineOptions {
  testIdAttribute: string;
}

export type CodeLanguage = "csharp" | "typescript";

export const DEFAULT_TEST_ID_ATTRIBUTE = "data-testid";
export const DEFAULT_LANGUAGE: CodeLanguage = "csharp";
