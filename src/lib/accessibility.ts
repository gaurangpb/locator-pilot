import { cssEscape } from "./cssEscape";

// A deliberately simplified subset of the ARIA role + accessible-name-computation
// spec — enough to match Playwright's getByRole() for common HTML, not a full
// implementation of https://www.w3.org/TR/accname-1.1/.

const INPUT_TYPE_ROLES: Record<string, string> = {
  button: "button",
  submit: "button",
  reset: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  search: "searchbox",
  email: "textbox",
  tel: "textbox",
  text: "textbox",
  url: "textbox",
  number: "spinbutton",
  image: "button",
};

const IMPLICIT_ROLE_TAGS: Record<string, string> = {
  a: "link",
  button: "button",
  select: "combobox",
  textarea: "textbox",
  option: "option",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  img: "img",
  table: "table",
  ul: "list",
  ol: "list",
  li: "listitem",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  form: "form",
  dialog: "dialog",
  progress: "progressbar",
};

export function getImplicitRole(el: Element): string | null {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.trim().split(/\s+/)[0] ?? null;

  const tag = el.tagName.toLowerCase();

  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return INPUT_TYPE_ROLES[type] ?? "textbox";
  }

  if (tag === "a") {
    return el.hasAttribute("href") ? "link" : null;
  }

  return IMPLICIT_ROLE_TAGS[tag] ?? null;
}

function isSVGElement(node: Node): node is SVGElement {
  return (node as Element).namespaceURI === "http://www.w3.org/2000/svg";
}

/** Collapses whitespace the way the accname spec does for flattened text. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function textFromLabelledBy(el: Element, doc: Document): string | null {
  const ids = el.getAttribute("aria-labelledby");
  if (!ids) return null;
  const parts = ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .filter((node): node is HTMLElement => node !== null)
    .map((node) => flatten(node.textContent || ""));
  const joined = parts.filter(Boolean).join(" ");
  return joined || null;
}

function textFromAssociatedLabel(el: Element, doc: Document): string | null {
  if (!(el instanceof HTMLElement)) return null;
  const id = el.getAttribute("id");
  if (id) {
    const label = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (label) {
      const text = flatten(label.textContent || "");
      if (text) return text;
    }
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) {
    const text = flatten(wrappingLabel.textContent || "");
    if (text) return text;
  }
  return null;
}

/**
 * Computes an accessible name close enough to the browser's for the roles we
 * support. Priority mirrors the accname spec: aria-labelledby > aria-label >
 * native labelling (label/alt/etc.) > title > text content.
 */
export function getAccessibleName(el: Element, doc: Document = el.ownerDocument): string {
  const labelledBy = textFromLabelledBy(el, doc);
  if (labelledBy) return labelledBy;

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel && flatten(ariaLabel)) return flatten(ariaLabel);

  const tag = el.tagName.toLowerCase();

  if (tag === "img") {
    const alt = el.getAttribute("alt");
    if (alt !== null) return flatten(alt);
  }

  if (tag === "input" || tag === "textarea" || tag === "select") {
    const assocLabel = textFromAssociatedLabel(el, doc);
    if (assocLabel) return assocLabel;
    const placeholder = el.getAttribute("placeholder");
    if (placeholder && flatten(placeholder)) return flatten(placeholder);
  }

  if (isSVGElement(el)) {
    const title = el.querySelector("title");
    if (title) {
      const text = flatten(title.textContent || "");
      if (text) return text;
    }
  }

  const title = el.getAttribute("title");

  const contentBearingTags = new Set([
    "a",
    "button",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "option",
    "li",
    "label",
    "summary",
  ]);
  if (contentBearingTags.has(tag) || el.getAttribute("role")) {
    const text = flatten(el.textContent || "");
    if (text) return text;
  }

  if (title && flatten(title)) return flatten(title);

  return "";
}
