import type { CodeLanguage, LocatorCandidate } from "./types";

export const PAGE_CHANNEL = "locator-pilot";

export interface TogglePanelMessage {
  type: "toggle-panel";
  testIdAttribute: string;
  language: CodeLanguage;
}

export interface ActivatePickerMessage {
  type: "activate-picker";
  testIdAttribute: string;
}

export interface DeactivatePickerMessage {
  type: "deactivate-picker";
}

export interface FindLocatorMessage {
  type: "find-locator";
  raw: string;
  testIdAttribute: string;
}

export interface OpenOptionsMessage {
  type: "open-options";
}

export interface BroadcastMessage {
  type: "broadcast";
  payload: ActivatePickerMessage | DeactivatePickerMessage | FindLocatorMessage;
}

export type ExtensionMessage =
  | TogglePanelMessage
  | ActivatePickerMessage
  | DeactivatePickerMessage
  | FindLocatorMessage
  | OpenOptionsMessage
  | BroadcastMessage;

export interface ElementPickedMessage {
  type: "element-picked";
  candidates: LocatorCandidate[];
}

export interface FindResultMessage {
  type: "find-result";
  matchCount: number;
  guessed: boolean;
  /** True when chained calls after the parsed locator (`.filter()`, `.nth()`, `.first()`, ...) were ignored. */
  chained: boolean;
  error?: string;
}

export type ContentResponse = ElementPickedMessage | FindResultMessage;

export interface PageEnvelope {
  source: typeof PAGE_CHANNEL;
  message: ContentResponse;
}

export function isPageEnvelope(data: unknown): data is PageEnvelope {
  if (!data || typeof data !== "object") return false;
  const value = data as PageEnvelope;
  return value.source === PAGE_CHANNEL && !!value.message && typeof value.message.type === "string";
}