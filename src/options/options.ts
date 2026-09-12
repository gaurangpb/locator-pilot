import { DEFAULT_TEST_ID_ATTRIBUTE } from "../lib/types";

const input = document.getElementById("testid-attr") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const status = document.getElementById("status")!;

async function load(): Promise<void> {
  const stored = await chrome.storage.sync.get("testIdAttribute");
  input.value = typeof stored.testIdAttribute === "string" ? stored.testIdAttribute : DEFAULT_TEST_ID_ATTRIBUTE;
}

async function save(): Promise<void> {
  const value = input.value.trim() || DEFAULT_TEST_ID_ATTRIBUTE;
  await chrome.storage.sync.set({ testIdAttribute: value });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
}

saveBtn.addEventListener("click", () => void save());
void load();
