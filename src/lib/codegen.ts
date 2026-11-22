import type { LocatorSpec } from "./types";

function csharpString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tsString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** "textbox" -> "Textbox", "img" -> "Img" — matches Microsoft.Playwright's AriaRole enum naming. */
function csharpAriaRole(role: string): string {
  return `AriaRole.${role.charAt(0).toUpperCase()}${role.slice(1)}`;
}

function toCSharpCall(spec: LocatorSpec): string {
  switch (spec.strategy) {
    case "role": {
      const opts: string[] = [];
      if (spec.name) opts.push(`Name = ${csharpString(spec.name)}`);
      if (spec.exact) opts.push("Exact = true");
      const optsArg = opts.length > 0 ? `, new() { ${opts.join(", ")} }` : "";
      return `GetByRole(${csharpAriaRole(spec.role)}${optsArg})`;
    }
    case "label": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `GetByLabel(${csharpString(spec.text)}${optsArg})`;
    }
    case "placeholder": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `GetByPlaceholder(${csharpString(spec.text)}${optsArg})`;
    }
    case "altText": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `GetByAltText(${csharpString(spec.text)}${optsArg})`;
    }
    case "title": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `GetByTitle(${csharpString(spec.text)}${optsArg})`;
    }
    case "text": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `GetByText(${csharpString(spec.text)}${optsArg})`;
    }
    case "testId":
      return `GetByTestId(${csharpString(spec.value)})`;
    case "chained": {
      const filter = spec.parentHasText ? `.Filter(new() { HasText = ${csharpString(spec.parentHasText)} })` : "";
      return `${toCSharpCall(spec.parent)}${filter}.${toCSharpCall(spec.child)}`;
    }
    case "css":
      return `Locator(${csharpString(spec.selector)})`;
    case "xpath":
      return `Locator(${csharpString(`xpath=${spec.expression}`)})`;
  }
}

function toTypeScriptCall(spec: LocatorSpec): string {
  switch (spec.strategy) {
    case "role": {
      const opts: string[] = [];
      if (spec.name) opts.push(`name: ${tsString(spec.name)}`);
      if (spec.exact) opts.push("exact: true");
      const optsArg = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `getByRole(${tsString(spec.role)}${optsArg})`;
    }
    case "label": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `getByLabel(${tsString(spec.text)}${optsArg})`;
    }
    case "placeholder": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `getByPlaceholder(${tsString(spec.text)}${optsArg})`;
    }
    case "altText": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `getByAltText(${tsString(spec.text)}${optsArg})`;
    }
    case "title": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `getByTitle(${tsString(spec.text)}${optsArg})`;
    }
    case "text": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `getByText(${tsString(spec.text)}${optsArg})`;
    }
    case "testId":
      return `getByTestId(${tsString(spec.value)})`;
    case "chained": {
      const filter = spec.parentHasText ? `.filter({ hasText: ${tsString(spec.parentHasText)} })` : "";
      return `${toTypeScriptCall(spec.parent)}${filter}.${toTypeScriptCall(spec.child)}`;
    }
    case "css":
      return `locator(${tsString(spec.selector)})`;
    case "xpath":
      return `locator(${tsString(`xpath=${spec.expression}`)})`;
  }
}

export function toCSharp(spec: LocatorSpec, frameSelectors?: string[]): string {
  const frames = (frameSelectors ?? []).map((sel) => `.FrameLocator(${csharpString(sel)})`).join("");
  return `Page${frames}.${toCSharpCall(spec)}`;
}

export function toTypeScript(spec: LocatorSpec, frameSelectors?: string[]): string {
  const frames = (frameSelectors ?? []).map((sel) => `.frameLocator(${tsString(sel)})`).join("");
  return `page${frames}.${toTypeScriptCall(spec)}`;
}
