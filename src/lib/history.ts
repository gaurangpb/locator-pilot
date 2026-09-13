import type { CodeLanguage, LocatorCandidate, ResolutionKind } from "./types";

/**
 * A single past pick, kept in-memory only (see docs/LOCATOR_STRATEGY.md's sibling
 * privacy stance in PRIVACY.md — nothing here is written to chrome.storage or disk,
 * so it resets on page reload/navigation along with the rest of the content script).
 */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  candidates: LocatorCandidate[];
  resolvedVia: ResolutionKind | null;
}

export const MAX_HISTORY_ENTRIES = 20;

/** Prepends a new pick, evicting the oldest entries beyond MAX_HISTORY_ENTRIES. */
export function addHistoryEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);
}

export function removeHistoryEntry(history: HistoryEntry[], id: string): HistoryEntry[] {
  return history.filter((entry) => entry.id !== id);
}

function codeFor(candidate: LocatorCandidate, language: CodeLanguage): string {
  return language === "typescript" ? candidate.typescript : candidate.csharp;
}

/** The top-ranked candidate's code for an entry — "" if that pick produced no candidates at all. */
export function bestCandidateCode(entry: HistoryEntry, language: CodeLanguage): string {
  return entry.candidates[0] ? codeFor(entry.candidates[0], language) : "";
}

/** Joins every entry's top candidate into one paste-able block, newest first — backs the panel's "Export" button. */
export function exportHistoryText(history: HistoryEntry[], language: CodeLanguage): string {
  return history
    .map((entry) => bestCandidateCode(entry, language))
    .filter((line) => line.length > 0)
    .join("\n");
}
