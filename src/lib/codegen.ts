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

export function toCSharp(spec: LocatorSpec): string {
  switch (spec.strategy) {
    case "role": {
      const opts: string[] = [];
      if (spec.name) opts.push(`Name = ${csharpString(spec.name)}`);
      if (spec.exact) opts.push("Exact = true");
      const optsArg = opts.length > 0 ? `, new() { ${opts.join(", ")} }` : "";
      return `Page.GetByRole(${csharpAriaRole(spec.role)}${optsArg})`;
    }
    case "label": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `Page.GetByLabel(${csharpString(spec.text)}${optsArg})`;
    }
    case "placeholder": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `Page.GetByPlaceholder(${csharpString(spec.text)}${optsArg})`;
    }
    case "text": {
      const optsArg = spec.exact ? `, new() { Exact = true }` : "";
      return `Page.GetByText(${csharpString(spec.text)}${optsArg})`;
    }
    case "testId":
      return `Page.GetByTestId(${csharpString(spec.value)})`;
    case "css":
      return `Page.Locator(${csharpString(spec.selector)})`;
    case "xpath":
      return `Page.Locator(${csharpString(`xpath=${spec.expression}`)})`;
  }
}

export function toTypeScript(spec: LocatorSpec): string {
  switch (spec.strategy) {
    case "role": {
      const opts: string[] = [];
      if (spec.name) opts.push(`name: ${tsString(spec.name)}`);
      if (spec.exact) opts.push("exact: true");
      const optsArg = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `page.getByRole(${tsString(spec.role)}${optsArg})`;
    }
    case "label": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `page.getByLabel(${tsString(spec.text)}${optsArg})`;
    }
    case "placeholder": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `page.getByPlaceholder(${tsString(spec.text)}${optsArg})`;
    }
    case "text": {
      const optsArg = spec.exact ? `, { exact: true }` : "";
      return `page.getByText(${tsString(spec.text)}${optsArg})`;
    }
    case "testId":
      return `page.getByTestId(${tsString(spec.value)})`;
    case "css":
      return `page.locator(${tsString(spec.selector)})`;
    case "xpath":
      return `page.locator(${tsString(`xpath=${spec.expression}`)})`;
  }
}
