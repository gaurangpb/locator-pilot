import type { FindResultMessage } from "../lib/messages";
import type { FindKind } from "./ui";

/**
 * "Find on page" is broadcast to every frame; each answers with its own
 * find-result. This collects those answers into the one line the panel shows.
 * Pure (no DOM, no timers) so it's unit-testable — content.ts owns the wait window.
 */
export interface FindAggregator {
  reset(): void;
  add(message: FindResultMessage): void;
  summary(): { text: string; kind: FindKind };
}

export function createFindAggregator(): FindAggregator {
  let total = 0;
  let guessed = false;
  let ignored: string[] = [];
  let error: string | undefined;

  return {
    reset() {
      total = 0;
      guessed = false;
      ignored = [];
      error = undefined;
    },

    add(message) {
      if (message.error) {
        error = message.error;
        return;
      }
      total += message.matchCount;
      guessed = guessed || message.guessed;
      for (const call of message.ignoredCalls) {
        if (!ignored.includes(call)) ignored.push(call);
      }
    },

    summary() {
      if (error) return { text: error, kind: "error" };
      const guessNote = guessed ? " (interpreted as a raw selector)" : "";
      const ignoredNote =
        ignored.length > 0 ? ` — couldn't evaluate ${ignored.join(", ")}; showing matches without it` : "";
      const note = `${guessNote}${ignoredNote}`;
      if (total === 0) return { text: `No matches found on this page${note}.`, kind: "error" };
      if (total === 1 && ignored.length === 0) {
        return { text: `Found 1 match — highlighted on the page${note}.`, kind: "ok" };
      }
      return { text: `Found ${total} matches — highlighted on the page${note}.`, kind: "warn" };
    },
  };
}
