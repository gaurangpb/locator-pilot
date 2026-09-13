import { describe, expect, it } from "vitest";
import {
  addHistoryEntry,
  bestCandidateCode,
  exportHistoryText,
  MAX_HISTORY_ENTRIES,
  removeHistoryEntry,
  type HistoryEntry,
} from "../src/lib/history";
import type { LocatorCandidate } from "../src/lib/types";

function makeCandidate(csharp: string, typescript: string): LocatorCandidate {
  return {
    spec: { strategy: "css", selector: "#x" },
    matchCount: 1,
    isUnique: true,
    hasHiddenMatch: false,
    brittleness: { level: "robust", reasons: [] },
    csharp,
    typescript,
  };
}

function makeEntry(id: string, candidates: LocatorCandidate[] = [makeCandidate(`Page.Locator("#${id}")`, `page.locator('#${id}')`)]): HistoryEntry {
  return { id, timestamp: Date.now(), candidates, resolvedVia: null };
}

describe("addHistoryEntry", () => {
  it("prepends the newest pick to the front", () => {
    const history = addHistoryEntry(addHistoryEntry([], makeEntry("a")), makeEntry("b"));
    expect(history.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("evicts the oldest entries beyond MAX_HISTORY_ENTRIES", () => {
    let history: HistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
      history = addHistoryEntry(history, makeEntry(`entry-${i}`));
    }
    expect(history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history[0]!.id).toBe(`entry-${MAX_HISTORY_ENTRIES + 4}`);
    expect(history.some((e) => e.id === "entry-0")).toBe(false);
  });
});

describe("removeHistoryEntry", () => {
  it("removes only the matching entry", () => {
    const history = [makeEntry("a"), makeEntry("b"), makeEntry("c")];
    const next = removeHistoryEntry(history, "b");
    expect(next.map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("bestCandidateCode", () => {
  it("returns the top-ranked candidate's code in the requested language", () => {
    const entry = makeEntry("a", [makeCandidate('Page.GetByRole(AriaRole.Button)', "page.getByRole('button')")]);
    expect(bestCandidateCode(entry, "csharp")).toBe("Page.GetByRole(AriaRole.Button)");
    expect(bestCandidateCode(entry, "typescript")).toBe("page.getByRole('button')");
  });

  it("returns an empty string when the pick produced no candidates", () => {
    const entry = makeEntry("a", []);
    expect(bestCandidateCode(entry, "typescript")).toBe("");
  });
});

describe("exportHistoryText", () => {
  it("joins every entry's top candidate, newest first", () => {
    const history = [
      makeEntry("b", [makeCandidate("Page.Locator(\"#b\")", "page.locator('#b')")]),
      makeEntry("a", [makeCandidate("Page.Locator(\"#a\")", "page.locator('#a')")]),
    ];
    expect(exportHistoryText(history, "typescript")).toBe("page.locator('#b')\npage.locator('#a')");
  });

  it("skips entries with no candidates and returns '' for an empty history", () => {
    expect(exportHistoryText([], "typescript")).toBe("");
    const history = [makeEntry("a", [])];
    expect(exportHistoryText(history, "typescript")).toBe("");
  });
});
