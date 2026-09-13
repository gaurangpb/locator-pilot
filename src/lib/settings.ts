import { DEFAULT_LANGUAGE, DEFAULT_TEST_ID_ATTRIBUTE, type CodeLanguage } from "./types";

export interface ExtensionSettings {
  testIdAttribute: string;
  language: CodeLanguage;
}

export function normalizeLanguage(value: unknown): CodeLanguage {
  return value === "typescript" ? "typescript" : DEFAULT_LANGUAGE;
}

export function normalizeTestIdAttribute(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TEST_ID_ATTRIBUTE;
}

export function settingsFromStorage(stored: Record<string, unknown>): ExtensionSettings {
  return {
    testIdAttribute: normalizeTestIdAttribute(stored.testIdAttribute),
    language: normalizeLanguage(stored.language),
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(["testIdAttribute", "language"]);
  return settingsFromStorage(stored);
}

export async function saveLanguage(language: CodeLanguage): Promise<void> {
  await chrome.storage.sync.set({ language });
}