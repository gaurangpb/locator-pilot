import { describe, expect, it } from "vitest";
import { createFindAggregator } from "../src/content/findAggregator";
import type { FindResultMessage } from "../src/lib/messages";

const result = (overrides: Partial<FindResultMessage> = {}): FindResultMessage => ({
  type: "find-result",
  matchCount: 0,
  guessed: false,
  ignoredCalls: [],
  ...overrides,
});

describe("createFindAggregator", () => {
  it("reports no matches when no frame found anything", () => {
    const find = createFindAggregator();
    find.add(result());
    find.add(result());
    expect(find.summary()).toEqual({ text: "No matches found on this page.", kind: "error" });
  });

  it("sums match counts across frames", () => {
    const find = createFindAggregator();
    find.add(result({ matchCount: 1 }));
    expect(find.summary().kind).toBe("ok");
    find.add(result({ matchCount: 2 }));
    expect(find.summary()).toEqual({ text: "Found 3 matches — highlighted on the page.", kind: "warn" });
  });

  it("notes a guessed raw selector and de-duplicated ignored calls", () => {
    const find = createFindAggregator();
    find.add(result({ matchCount: 1, guessed: true, ignoredCalls: ["frameLocator('#x')"] }));
    find.add(result({ ignoredCalls: ["frameLocator('#x')"] }));
    const { text, kind } = find.summary();
    expect(kind).toBe("warn"); // an ignored step means the single match may not be the right one
    expect(text).toContain("(interpreted as a raw selector)");
    expect(text.match(/frameLocator/g)).toHaveLength(1);
  });

  it("surfaces a parse error over any counts, and reset clears it", () => {
    const find = createFindAggregator();
    find.add(result({ matchCount: 4 }));
    find.add(result({ error: "regex arguments aren't supported" }));
    expect(find.summary()).toEqual({ text: "regex arguments aren't supported", kind: "error" });
    find.reset();
    expect(find.summary().text).toBe("No matches found on this page.");
  });
});
