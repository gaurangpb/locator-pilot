import { refreshCandidates, withExact } from "../lib/locatorEngine";
import type { LocatorCandidate, ResolutionKind } from "../lib/types";

export const LIVE_RECHECK_DEBOUNCE_MS = 300;

export interface LiveRecheck {
  /** Candidates of the pick this frame owns, or null when another frame (or nobody) does. */
  readonly candidates: LocatorCandidate[] | null;
  readonly resolvedVia: ResolutionKind | null;
  start(candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null): void;
  stop(): void;
  /** Recomputes candidate `index` with exact on/off. Returns false when this frame doesn't own the pick. */
  setExact(index: number, exact: boolean): boolean;
}

/**
 * Live re-check: whichever frame most recently picked an element owns the pick's
 * candidates and watches its own document for changes, so an SPA re-render doesn't
 * leave the panel showing stale match counts. `onUpdate` fires (debounced) with
 * the recomputed candidates.
 */
export function createLiveRecheck(
  onUpdate: (candidates: LocatorCandidate[], resolvedVia: ResolutionKind | null) => void,
): LiveRecheck {
  let observer: MutationObserver | null = null;
  let debounce: number | undefined;
  let candidates: LocatorCandidate[] | null = null;
  // Set once at pick time and carried through every update for this pick —
  // resolution (docs/LOCATOR_STRATEGY.md §1) doesn't change as match counts are refreshed.
  let resolvedVia: ResolutionKind | null = null;

  function stop(): void {
    observer?.disconnect();
    observer = null;
    if (debounce !== undefined) {
      window.clearTimeout(debounce);
      debounce = undefined;
    }
    candidates = null;
    resolvedVia = null;
  }

  function start(next: LocatorCandidate[], nextResolvedVia: ResolutionKind | null): void {
    stop();
    candidates = next;
    resolvedVia = nextResolvedVia;
    observer = new MutationObserver(() => {
      if (debounce !== undefined) return;
      debounce = window.setTimeout(() => {
        debounce = undefined;
        if (!candidates) return;
        candidates = refreshCandidates(candidates, document);
        onUpdate(candidates, resolvedVia);
      }, LIVE_RECHECK_DEBOUNCE_MS);
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }

  return {
    get candidates() {
      return candidates;
    },
    get resolvedVia() {
      return resolvedVia;
    },
    start,
    stop,
    setExact(index, exact) {
      if (!candidates) return false;
      candidates = withExact(candidates, index, exact, document);
      return true;
    },
  };
}
