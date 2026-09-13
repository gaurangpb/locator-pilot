import type { LocatorSpec } from "./types";

export interface ParseResult {
  spec: LocatorSpec;
  /** True when we only recovered a raw selector string, without knowing the intended strategy for sure. */
  guessed: boolean;
  /**
   * True when the input had additional chained calls after the parsed locator
   * (e.g. `.filter(...)`, `.first()`, `.nth(0)`, `.getByRole(...)`) that we
   * ignored — the returned spec only reflects the base locator, so it may match
   * more (or different) elements than the original expression did.
   */
  chained: boolean;
}

function unquote(raw: string): string {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'" || quote === "`") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    return quote === '"'
      ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : inner.replace(new RegExp(`\\\\${quote}`, "g"), quote).replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/** Finds the substring inside the parentheses that open right after `fromIndex`, respecting nesting and quotes. */
function extractBalancedParens(text: string, fromIndex: number): string | null {
  let i = text.indexOf("(", fromIndex);
  if (i === -1) return null;
  const start = i + 1;
  let depth = 1;
  let quote: string | null = null;

  for (i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return text.slice(start, i);
    }
  }
  return null;
}

/** Finds the index of the paren that closes the one at `openParenIndex`, respecting nesting and quotes. */
function findMatchingParenEnd(text: string, openParenIndex: number): number | null {
  let depth = 0;
  let quote: string | null = null;

  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/** True when the text right after a parsed call is another chained call, e.g. `.filter(...)`, `.first()`, `.Nth(0)`. */
function hasChainedCall(text: string, afterIndex: number): boolean {
  const rest = text.slice(afterIndex).trimStart();
  return /^\.\s*[A-Za-z_]\w*\s*\(/.test(rest);
}

/** Splits top-level comma-separated arguments, respecting nested parens/braces/brackets and quotes. */
function splitTopLevelArgs(argsText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";

  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if (quote) {
      current += ch;
      if (ch === "\\") {
        current += argsText[++i] ?? "";
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
    } else if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      current += ch;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

function findOptionValue(optionsText: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`${key}\\s*[:=]\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`);
    const match = optionsText.match(re);
    if (match?.[1]) return unquote(match[1]);
  }
  return undefined;
}

function findExactFlag(optionsText: string): boolean {
  return /\b(exact|Exact)\s*[:=]\s*true\b/.test(optionsText);
}

const QUOTED = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

function firstPositionalArg(argsText: string): string | null {
  const args = splitTopLevelArgs(argsText);
  const first = args[0]?.trim();
  if (!first) return null;
  const match = first.match(QUOTED);
  return match ? unquote(match[0]) : null;
}

const ARIA_ROLE_ENUM = /AriaRole\.(\w+)/;

function firstPositionalRole(argsText: string): string | null {
  const args = splitTopLevelArgs(argsText);
  const first = args[0]?.trim();
  if (!first) return null;
  const enumMatch = first.match(ARIA_ROLE_ENUM);
  if (enumMatch?.[1]) return enumMatch[1].toLowerCase();
  const quoted = first.match(QUOTED);
  return quoted ? unquote(quoted[0]) : null;
}

const METHOD_PATTERN =
  /(getByRole|GetByRole|getByLabel|GetByLabel|getByPlaceholder|GetByPlaceholder|getByText|GetByText|getByTestId|GetByTestId|locator|Locator)\s*\(/;

function parseSelectorString(raw: string): LocatorSpec {
  if (raw.startsWith("text=")) return { strategy: "text", text: raw.slice(5), exact: false };
  if (raw.startsWith("css=")) return { strategy: "css", selector: raw.slice(4) };
  if (raw.startsWith("xpath=")) return { strategy: "xpath", expression: raw.slice(6) };
  if (raw.startsWith("//") || raw.startsWith("(//") || raw.startsWith("./")) {
    return { strategy: "xpath", expression: raw };
  }
  return { strategy: "css", selector: raw };
}

/**
 * Parses a pasted locator: a full Playwright call (TS or C#, optionally
 * embedded in a larger statement), a classic engine-prefixed selector string
 * (`text=`, `css=`, `xpath=`), or a bare CSS/XPath selector.
 */
export function parseLocator(input: string, testIdAttribute: string): ParseResult {
  const text = input.trim();
  if (!text) throw new Error("Nothing to parse — paste a locator first.");

  const methodMatch = text.match(METHOD_PATTERN);
  if (methodMatch && methodMatch.index !== undefined && methodMatch[1]) {
    const method = methodMatch[1].toLowerCase();
    const openParenIndex = methodMatch.index + methodMatch[0].length - 1;
    const argsText = extractBalancedParens(text, openParenIndex);
    const args = argsText ?? "";
    const parenEndIndex = findMatchingParenEnd(text, openParenIndex);
    const chained = parenEndIndex !== null && hasChainedCall(text, parenEndIndex + 1);

    if (method === "getbyrole") {
      const role = firstPositionalRole(args);
      if (role) {
        const name = findOptionValue(args, ["name", "Name"]);
        const exact = findExactFlag(args);
        return { guessed: false, chained, spec: { strategy: "role", role, name, exact } };
      }
    } else if (method === "getbylabel") {
      const value = firstPositionalArg(args);
      if (value !== null) {
        return { guessed: false, chained, spec: { strategy: "label", text: value, exact: findExactFlag(args) } };
      }
    } else if (method === "getbyplaceholder") {
      const value = firstPositionalArg(args);
      if (value !== null) {
        return {
          guessed: false,
          chained,
          spec: { strategy: "placeholder", text: value, exact: findExactFlag(args) },
        };
      }
    } else if (method === "getbytext") {
      const value = firstPositionalArg(args);
      if (value !== null) {
        return { guessed: false, chained, spec: { strategy: "text", text: value, exact: findExactFlag(args) } };
      }
    } else if (method === "getbytestid") {
      const value = firstPositionalArg(args);
      if (value !== null) {
        return { guessed: false, chained, spec: { strategy: "testId", attribute: testIdAttribute, value } };
      }
    } else if (method === "locator") {
      const value = firstPositionalArg(args);
      if (value !== null) {
        return { guessed: false, chained, spec: parseSelectorString(value) };
      }
    }
  }

  return { guessed: true, chained: false, spec: parseSelectorString(text) };
}
