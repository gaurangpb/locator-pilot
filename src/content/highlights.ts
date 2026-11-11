// Highlight boxes drawn over page elements (inside the extension's shadow root),
// kept in sync with their element's position on scroll/resize.

// Some elements are the correct locator target but render at a near-zero size —
// e.g. a custom radio/checkbox's real <input>, kept in the accessibility tree but
// visually hidden behind a styled label/icon (common enough that our own
// interactive-relative resolution, docs/LOCATOR_STRATEGY.md §1, routinely lands on
// one). Without a floor, the highlight box shrinks to match and disappears into an
// unhelpful dot. Pad it out to a minimum size around the same center point so it
// stays visible without misrepresenting where the element actually is.
export const MIN_HIGHLIGHT_SIZE = 20;

export function positionBox(box: HTMLElement, rect: DOMRect): void {
  const width = Math.max(rect.width, MIN_HIGHLIGHT_SIZE);
  const height = Math.max(rect.height, MIN_HIGHLIGHT_SIZE);
  box.style.left = `${rect.left - (width - rect.width) / 2}px`;
  box.style.top = `${rect.top - (height - rect.height) / 2}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
}

export interface Highlighter {
  /** Draws a box on `el` that follows it until removed. Secondary boxes mark a resolved (not clicked) element or one of several matches. */
  show(el: Element, secondary?: boolean): HTMLElement;
  remove(box: HTMLElement): void;
  /** Removes every box except the hover box. */
  clearAll(): void;
  /** Moves the single hover box onto `el`, or hides it for null. */
  hover(el: Element | null): void;
  reposition(): void;
}

export function createHighlighter(root: HTMLElement): Highlighter {
  const tracked: { box: HTMLElement; el: Element }[] = [];
  let hoverBox: HTMLElement | null = null;
  let hovered: Element | null = null;

  function untrack(box: HTMLElement): void {
    const index = tracked.findIndex((entry) => entry.box === box);
    if (index !== -1) tracked.splice(index, 1);
  }

  return {
    show(el, secondary = false) {
      const box = document.createElement("div");
      box.className = secondary ? "lp-highlight lp-secondary" : "lp-highlight";
      positionBox(box, el.getBoundingClientRect());
      root.appendChild(box);
      tracked.push({ box, el });
      return box;
    },

    remove(box) {
      untrack(box);
      box.remove();
    },

    clearAll() {
      for (const box of Array.from(root.querySelectorAll<HTMLElement>(".lp-highlight"))) {
        if (box !== hoverBox) {
          untrack(box);
          box.remove();
        }
      }
    },

    hover(el) {
      if (!hoverBox) {
        hoverBox = document.createElement("div");
        hoverBox.className = "lp-highlight";
        hoverBox.style.display = "none";
        root.appendChild(hoverBox);
      }
      hovered = el;
      if (!el) {
        hoverBox.style.display = "none";
        return;
      }
      hoverBox.style.display = "block";
      positionBox(hoverBox, el.getBoundingClientRect());
    },

    reposition() {
      for (const { box, el } of tracked) positionBox(box, el.getBoundingClientRect());
      if (hovered && hoverBox && hoverBox.style.display !== "none") {
        positionBox(hoverBox, hovered.getBoundingClientRect());
      }
    },
  };
}
