import type { LocatorCandidate } from "./types";

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

export type ExtensionMessage = ActivatePickerMessage | DeactivatePickerMessage | FindLocatorMessage;

export interface ElementPickedMessage {
  type: "element-picked";
  candidates: LocatorCandidate[];
}

export interface FindResultMessage {
  type: "find-result";
  matchCount: number;
  guessed: boolean;
  error?: string;
}

export type ContentResponse = ElementPickedMessage | FindResultMessage;
