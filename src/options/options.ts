import { isValidTestIdAttribute, normalizeTestIdAttribute } from "../lib/settings";
import { DEFAULT_TEST_ID_ATTRIBUTE } from "../lib/types";

const input = document.getElementById("testid-attr") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const status = document.getElementById("status")!;

async function load(): Promise<void> {
  const stored = await chrome.storage.sync.get("testIdAttribute");
  input.value = normalizeTestIdAttribute(stored.testIdAttribute);
}

async function save(): Promise<void> {
  const raw = input.value.trim();
  if (raw && !isValidTestIdAttribute(raw)) {
    status.textContent = "Invalid attribute name (e.g. data-testid).";
    status.style.color = "#f87171";
    return;
  }
  const value = raw || DEFAULT_TEST_ID_ATTRIBUTE;
  input.value = value;
  await chrome.storage.sync.set({ testIdAttribute: value });
  status.style.color = "";
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
}

saveBtn.addEventListener("click", () => void save());
void load();
