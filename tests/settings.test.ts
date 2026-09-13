import { describe, expect, it } from "vitest";
import { normalizeLanguage, normalizeTestIdAttribute, settingsFromStorage } from "../src/lib/settings";

describe("settings", () => {
  it("defaults language to csharp unless typescript is stored", () => {
    expect(normalizeLanguage(undefined)).toBe("csharp");
    expect(normalizeLanguage("typescript")).toBe("typescript");
    expect(normalizeLanguage("nope")).toBe("csharp");
  });

  it("trims a custom test-id attribute and falls back when empty", () => {
    expect(normalizeTestIdAttribute("  data-qa  ")).toBe("data-qa");
    expect(normalizeTestIdAttribute("")).toBe("data-testid");
    expect(normalizeTestIdAttribute(42)).toBe("data-testid");
  });

  it("reads both values from storage", () => {
    expect(settingsFromStorage({ testIdAttribute: "data-test", language: "typescript" })).toEqual({
      testIdAttribute: "data-test",
      language: "typescript",
    });
  });
});