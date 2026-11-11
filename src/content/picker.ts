import { deepElementFromPoint } from "../lib/domQuery";
import type { Highlighter } from "./highlights";

export interface PickerOptions {
  /** The extension's own shadow host — never pickable. */
  host: HTMLElement;
  highlighter: Highlighter;
  /** The user clicked `el`; the picker has already stopped itself. */
  onPicked: (el: Element | null) => void;
  /** Escape pressed while picking; the picker has already stopped itself. */
  onCancel: () => void;
}

export interface Picker {
  readonly active: boolean;
  start(): void;
  /** Detaches listeners and hides the hover box. No-op when not active. */
  stop(): void;
}

/**
 * Hover-to-highlight, click-to-pick mode for one frame's document. Listeners are
 * capture-phase on the document so the page's own handlers never see the pick click.
 */
export function createPicker({ host, highlighter, onPicked, onCancel }: PickerOptions): Picker {
  let active = false;
  let lastHovered: Element | null = null;

  const eventOnHost = (e: Event): boolean => e.composedPath().includes(host);

  function onMouseMove(e: MouseEvent): void {
    if (eventOnHost(e)) return;
    const target = deepElementFromPoint(document, e.clientX, e.clientY);
    if (target === host || (target && host.contains(target))) return;
    lastHovered = target;
    highlighter.hover(target);
  }

  function onClick(e: MouseEvent): void {
    if (eventOnHost(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const picked = lastHovered ?? deepElementFromPoint(document, e.clientX, e.clientY);
    stop();
    onPicked(picked);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    // Marks the event handled, so the panel's own Escape-to-close (content.ts)
    // leaves the panel open for this first Escape.
    e.preventDefault();
    stop();
    onCancel();
  }

  function start(): void {
    if (active) return;
    active = true;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function stop(): void {
    if (!active) return;
    active = false;
    lastHovered = null;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    highlighter.hover(null);
  }

  return {
    get active() {
      return active;
    },
    start,
    stop,
  };
}
