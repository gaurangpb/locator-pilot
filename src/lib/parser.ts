import type { TextPattern } from "./matcher";
import type { FilterStep, LocatorQuery, QueryStep } from "./query";
import type { LocatorSpec } from "./types";

export interface ParseResult {
  /** The base (first) locator of the expression — see `query` for the whole chain. */
  spec: LocatorSpec;
  /** The full expression: the base locator plus any chained locators, filters, index picks and and/or combinations. */
  query: LocatorQuery;
  /** True when we only recovered a raw selector string, without knowing the intended strategy for sure. */
  guessed: boolean;
  /**
   * Chained calls we recognised as changing what the locator matches but couldn't
   * evaluate (e.g. a `.filter({ has })` whose value is a variable) — the result
   * reflects the expression without them, so the UI should say so.
   */
  ignoredCalls: string[];
}

// ---------------------------------------------------------------------------
// Scanning helpers — all of them skip over string and regex literals, so a paren,
// comma or brace inside `'a, (b)'` or `/\(x\)/` never confuses the structure.
// ---------------------------------------------------------------------------

const REGEX_START_PREDECESSORS = new Set(["(", ",", ":", "=", "[", "{"]);

function previousNonSpace(text: string, index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(text[i]!)) return text[i]!;
  }
  return null;
}

/** If a string or regex literal starts at `i`, returns the index just past it; otherwise returns `i`. */
function skipLiteral(text: string, i: number): number {
  const ch = text[i];

  if (ch === '"' || ch === "'" || ch === "`") {
    // C# verbatim string: backslashes are literal and `""` is an escaped quote.
    if (ch === '"' && text[i - 1] === "@") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') j += 2;
          else return j + 1;
        } else j++;
      }
      return text.length;
    }
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === ch) return j + 1;
    }
    return text.length;
  }

  if (ch === "/") {
    const prev = previousNonSpace(text, i);
    if (prev !== null && !REGEX_START_PREDECESSORS.has(prev)) return i;
    let inClass = false;
    for (let j = i + 1; j < text.length; j++) {
      const c = text[j];
      if (c === "\n") return i;
      if (c === "\\") j++;
      else if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) {
        if (j === i + 1) return i; // `//` is a comment or an XPath, not an empty regex
        let end = j + 1;
        while (end < text.length && /[a-z]/i.test(text[end]!)) end++;
        return end;
      }
    }
    return i;
  }

  return i;
}

/** Index of the bracket closing the `(`/`{`/`[` at `openIndex`, or -1 when it's never closed. */
function findClose(text: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  while (i < text.length) {
    const next = skipLiteral(text, i);
    if (next !== i) {
      i = next;
      continue;
    }
    const ch = text[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Splits top-level comma-separated arguments, respecting nesting and literals. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const next = skipLiteral(text, i);
    if (next !== i) {
      i = next;
      continue;
    }
    const ch = text[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Reads an options object — TS `{ name: 'x', exact: true }` or C#
 * `new() { Name = "x", Exact = true }` — into a map of lower-cased key → raw value text.
 */
function parseOptions(raw: string): Map<string, string> {
  const options = new Map<string, string>();
  const open = raw.indexOf("{");
  if (open === -1) return options;
  const close = findClose(raw, open);
  const inner = raw.slice(open + 1, close === -1 ? raw.length : close);
  for (const part of splitTopLevel(inner)) {
    const match = /^([A-Za-z_]\w*)\s*[:=]\s*([\s\S]+)$/.exec(part);
    if (match) options.set(match[1]!.toLowerCase(), match[2]!.trim());
  }
  return options;
}

// ---------------------------------------------------------------------------
// Argument values
// ---------------------------------------------------------------------------

const QUOTED = /^(@?)("(?:[^"\\]|\\.|"")*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)$/;
const JS_REGEX_LITERAL = /^\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\\/\n[])+)\/([a-z]*)$/i;
const DOTNET_REGEX_CTOR = /^new\s+(?:[\w.]+\.)?Regex\s*\(/;

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r" };

function parseStringLiteral(raw: string): string | null {
  const match = QUOTED.exec(raw.trim());
  if (!match) return null;
  const inner = match[2]!.slice(1, -1);
  if (match[1] === "@") return inner.replace(/""/g, '"');
  return inner.replace(/\\([\s\S])/g, (_, ch: string) => ESCAPES[ch] ?? ch);
}

function buildRegex(source: string, flags: string): RegExp {
  // `g`/`y` make RegExp.test() stateful; they don't change *whether* text matches.
  const safeFlags = Array.from(new Set(flags.replace(/[gy]/g, ""))).join("");
  try {
    return new RegExp(source, safeFlags);
  } catch {
    throw new Error(`Couldn't evaluate the regex /${source}/${safeFlags} — it isn't valid JavaScript regex syntax.`);
  }
}

/** A JS regex literal (`/submit/i`) or a .NET `new Regex("submit", RegexOptions.IgnoreCase)`, as a JS RegExp — null when `raw` is neither. */
function parseRegexValue(raw: string): RegExp | null {
  const trimmed = raw.trim();

  const literal = JS_REGEX_LITERAL.exec(trimmed);
  if (literal) return buildRegex(literal[1]!, literal[2]!);

  if (DOTNET_REGEX_CTOR.test(trimmed)) {
    const open = trimmed.indexOf("(");
    const close = findClose(trimmed, open);
    const args = splitTopLevel(trimmed.slice(open + 1, close === -1 ? trimmed.length : close));
    let source = args[0] !== undefined ? parseStringLiteral(args[0]) : null;
    if (source === null) {
      throw new Error("Couldn't read the pattern passed to new Regex() — only a string literal is supported.");
    }
    const optionsText = args.slice(1).join(",");
    let flags = "";
    if (/IgnoreCase/.test(optionsText)) flags += "i";
    if (/Multiline/.test(optionsText)) flags += "m";
    if (/Singleline/.test(optionsText)) flags += "s";
    // .NET's leading inline option group, e.g. `(?i)submit` — JS has no equivalent syntax.
    const inline = /^\(\?([ims]+)\)/.exec(source);
    if (inline) {
      flags += inline[1]!;
      source = source.slice(inline[0].length);
    }
    return buildRegex(source, flags);
  }

  return null;
}

function looksLikeRegex(raw: string): boolean {
  const trimmed = raw.trim();
  return JS_REGEX_LITERAL.test(trimmed) || DOTNET_REGEX_CTOR.test(trimmed);
}

/** A string literal or regex argument; null when it's something else (a variable, a template expression, ...). */
function parseTextValue(raw: string | undefined): TextPattern | null {
  if (raw === undefined) return null;
  return parseStringLiteral(raw) ?? parseRegexValue(raw);
}

function requireTextValue(raw: string | undefined, method: string): TextPattern {
  const value = parseTextValue(raw);
  if (value === null) {
    throw new Error(`Couldn't read the argument to ${method}() — only string and regex literals are supported, not variables.`);
  }
  return value;
}

/** Splits a text argument into the spec's string field and the optional regex override (see `LocatorStep.pattern`). */
function textAndPattern(value: TextPattern): { text: string; pattern?: RegExp } {
  return typeof value === "string" ? { text: value } : { text: value.source, pattern: value };
}

const ARIA_ROLE_ENUM = /AriaRole\.(\w+)/;

function parseRole(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const enumMatch = raw.match(ARIA_ROLE_ENUM);
  if (enumMatch?.[1]) return enumMatch[1].toLowerCase();
  return parseStringLiteral(raw);
}

function parseSelectorString(raw: string): LocatorSpec {
  if (raw.startsWith("text=")) return { strategy: "text", text: raw.slice(5), exact: false };
  if (raw.startsWith("css=")) return { strategy: "css", selector: raw.slice(4) };
  if (raw.startsWith("xpath=")) return { strategy: "xpath", expression: raw.slice(6) };
  if (raw.startsWith("//") || raw.startsWith("(//") || raw.startsWith("./")) {
    return { strategy: "xpath", expression: raw };
  }
  if (looksLikeRegex(raw)) {
    throw new Error("A regex on its own isn't a locator — paste the whole call, e.g. getByText(/submit/i).");
  }
  return { strategy: "css", selector: raw };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Reads the first key present, so `hasText`, C#'s `HasTextString` and `HasTextRegex` all land in one place. */
function firstOption(options: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = options.get(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

interface ParseContext {
  testIdAttribute: string;
  ignored: string[];
}

/** Builds a filter step from `.filter(...)`'s options (also accepted as `locator()`'s second argument) — null when none of them are set. */
function parseFilterOptions(options: Map<string, string>, label: string, ctx: ParseContext): FilterStep | null {
  const step: FilterStep = { kind: "filter" };
  let any = false;

  const textOptions = [
    ["hasText", ["hastext", "hastextstring", "hastextregex"]],
    ["hasNotText", ["hasnottext", "hasnottextstring", "hasnottextregex"]],
  ] as const;
  for (const [field, keys] of textOptions) {
    const raw = firstOption(options, [...keys]);
    if (raw === undefined) continue;
    const value = parseTextValue(raw);
    if (value === null) ctx.ignored.push(`${label}'s ${field} (not a string or regex literal)`);
    else {
      step[field] = value;
      any = true;
    }
  }

  for (const field of ["has", "hasNot"] as const) {
    const raw = options.get(field.toLowerCase());
    if (raw === undefined) continue;
    const inner = parseExpression(raw, ctx);
    if (inner === null) ctx.ignored.push(`${label}'s ${field} (not an inline locator)`);
    else {
      step[field] = inner;
      any = true;
    }
  }

  return any ? step : null;
}

const TEXT_STRATEGIES = {
  getbylabel: "label",
  getbyplaceholder: "placeholder",
  getbyalttext: "altText",
  getbytitle: "title",
  getbytext: "text",
} as const;

/** Parses one `getBy…()`/`locator()` call into its step(s) — `locator()` with filter options yields two. */
function parseLocatorCall(method: string, displayName: string, argsText: string, ctx: ParseContext): QueryStep[] {
  const args = splitTopLevel(argsText);
  const options = parseOptions(args.slice(1).join(","));
  const exact = options.get("exact") === "true";

  if (method === "getbyrole") {
    const role = parseRole(args[0]);
    if (!role) throw new Error(`Couldn't read the role passed to ${displayName}().`);
    const rawName = firstOption(options, ["name", "namestring", "nameregex"]);
    const name = parseTextValue(rawName);
    if (rawName !== undefined && name === null) {
      ctx.ignored.push(`${displayName}'s name option (not a string or regex literal)`);
    }
    if (name === null) return [{ kind: "locator", spec: { strategy: "role", role, exact } }];
    const { text, pattern } = textAndPattern(name);
    return [{ kind: "locator", spec: { strategy: "role", role, name: text, exact }, pattern }];
  }

  if (method === "getbytestid") {
    const { text, pattern } = textAndPattern(requireTextValue(args[0], displayName));
    return [{ kind: "locator", spec: { strategy: "testId", attribute: ctx.testIdAttribute, value: text }, pattern }];
  }

  if (method === "locator") {
    const selector = args[0] !== undefined ? parseStringLiteral(args[0]) : null;
    if (selector === null) {
      throw new Error(`Couldn't read the selector passed to ${displayName}() — only a string literal is supported.`);
    }
    const steps: QueryStep[] = [{ kind: "locator", spec: parseSelectorString(selector) }];
    const filter = parseFilterOptions(options, displayName, ctx);
    if (filter) steps.push(filter);
    return steps;
  }

  const strategy = TEXT_STRATEGIES[method as keyof typeof TEXT_STRATEGIES];
  const { text, pattern } = textAndPattern(requireTextValue(args[0], displayName));
  return [{ kind: "locator", spec: { strategy, text, exact }, pattern }];
}

const LOCATOR_METHODS = "getByRole|getByLabel|getByPlaceholder|getByAltText|getByTitle|getByText|getByTestId|locator";
// The lookbehind keeps `frameLocator(` from being read as `locator(`.
const METHOD_PATTERN = new RegExp(`(?<![A-Za-z0-9_])(${LOCATOR_METHODS})\\s*\\(`, "i");
const LOCATOR_METHOD_NAMES = new Set(LOCATOR_METHODS.toLowerCase().split("|"));
/** Calls that hop into an iframe. Every frame runs its own search, so the hop itself is dropped and whatever follows is searched for in all frames. */
const FRAME_HOPS = new Set(["framelocator", "contentframe"]);

/**
 * Parses the first locator expression found in `text` — a base `getBy…()`/
 * `locator()` call plus everything chained onto it. Stops quietly at the first
 * chained call that isn't part of the locator (`.click()`, `.toBeVisible()`, ...).
 * Returns null when `text` contains no locator call at all.
 */
function parseExpression(text: string, ctx: ParseContext): LocatorQuery | null {
  const base = METHOD_PATTERN.exec(text);
  if (!base) return null;

  const baseOpen = base.index + base[0].length - 1;
  const baseClose = findClose(text, baseOpen);
  const baseArgs = text.slice(baseOpen + 1, baseClose === -1 ? text.length : baseClose);
  let steps: QueryStep[] = parseLocatorCall(base[1]!.toLowerCase(), base[1]!, baseArgs, ctx);
  if (baseClose === -1) return steps;

  let pos = baseClose + 1;
  for (;;) {
    const call = /^\s*\.\s*([A-Za-z_]\w*)\s*(\()?/.exec(text.slice(pos));
    if (!call) break;
    const displayName = call[1]!;
    const name = displayName.toLowerCase();
    let end = pos + call[0].length;
    let args = "";
    if (call[2]) {
      const close = findClose(text, end - 1);
      if (close === -1) break;
      args = text.slice(end, close);
      end = close + 1;
    }

    if (LOCATOR_METHOD_NAMES.has(name)) {
      if (!call[2]) break;
      steps.push(...parseLocatorCall(name, displayName, args, ctx));
    } else if (name === "filter") {
      const filter = parseFilterOptions(parseOptions(args), `.${displayName}()`, ctx);
      if (filter) steps.push(filter);
    } else if (name === "first") {
      steps.push({ kind: "nth", index: 0 });
    } else if (name === "last") {
      steps.push({ kind: "nth", index: -1 });
    } else if (name === "nth") {
      const index = Number.parseInt(args.trim(), 10);
      if (Number.isNaN(index)) ctx.ignored.push(`.${displayName}() (index isn't a number literal)`);
      else steps.push({ kind: "nth", index });
    } else if (name === "and" || name === "or") {
      const inner = parseExpression(args, ctx);
      if (inner === null) ctx.ignored.push(`.${displayName}() (argument isn't an inline locator)`);
      else steps.push({ kind: name, query: inner });
    } else if (FRAME_HOPS.has(name)) {
      steps = [];
    } else {
      break;
    }
    pos = end;
  }

  if (steps.length === 0 || steps[0]!.kind !== "locator") {
    throw new Error("Nothing to find after the frame locator — add the locator for the element inside the frame.");
  }
  return steps;
}

/**
 * Parses a pasted locator: a full Playwright expression (TS or C#, optionally
 * embedded in a larger statement, with chained locators/filters/index picks and
 * regex arguments), a classic engine-prefixed selector string (`text=`, `css=`,
 * `xpath=`), or a bare CSS/XPath selector.
 */
export function parseLocator(input: string, testIdAttribute: string): ParseResult {
  const text = input.trim();
  if (!text) throw new Error("Nothing to parse — paste a locator first.");

  const ctx: ParseContext = { testIdAttribute, ignored: [] };
  const query = parseExpression(text, ctx);
  if (query) {
    const first = query[0]!;
    if (first.kind !== "locator") throw new Error("Couldn't find a base locator in that expression.");
    return { spec: first.spec, query, guessed: false, ignoredCalls: ctx.ignored };
  }

  const spec = parseSelectorString(text);
  return { spec, query: [{ kind: "locator", spec }], guessed: true, ignoredCalls: [] };
}
