import type { CodeLanguage, LocatorCandidate, ResolutionKind } from "./types";

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

export interface ClearLiveRecheckMessage {
  type: "clear-live-recheck";
}

export interface RecomputeExactMessage {
  type: "recompute-exact";
  index: number;
  exact: boolean;
}

export interface OpenOptionsMessage {
  type: "open-options";
}

export interface BroadcastMessage {
  type: "broadcast";
  payload:
    | ActivatePickerMessage
    | DeactivatePickerMessage
    | FindLocatorMessage
    | ClearLiveRecheckMessage
    | RecomputeExactMessage;
}

/**
 * A frame's result on its way to the top frame's panel. Sent to the background
 * worker, which forwards `message` to the tab's top frame only (frameId 0) — so it
 * never travels over `window.postMessage`, where the page itself could read it or
 * forge one.
 */
export interface RelayToTopMessage {
  type: "relay-to-top";
  message: ContentResponse;
}

export type ExtensionMessage =
  | RelayToTopMessage
  | ContentResponse
  | TogglePanelMessage
  | ActivatePickerMessage
  | DeactivatePickerMessage
  | FindLocatorMessage
  | ClearLiveRecheckMessage
  | RecomputeExactMessage
  | OpenOptionsMessage
  | BroadcastMessage;

export interface ElementPickedMessage {
  type: "element-picked";
  candidates: LocatorCandidate[];
  /** See docs/LOCATOR_STRATEGY.md §1 — non-null when candidates target a resolved ancestor/descendant instead of the picked element. */
  resolvedVia: ResolutionKind | null;
}

export interface FindResultMessage {
  type: "find-result";
  matchCount: number;
  guessed: boolean;
  /** Parts of the pasted expression that couldn't be evaluated and were left out — see `ParseResult.ignoredCalls`. */
  ignoredCalls: string[];
  error?: string;
}

export interface CandidatesUpdatedMessage {
  type: "candidates-updated";
  candidates: LocatorCandidate[];
  resolvedVia: ResolutionKind | null;
}

export type ContentResponse = ElementPickedMessage | FindResultMessage | CandidatesUpdatedMessage;