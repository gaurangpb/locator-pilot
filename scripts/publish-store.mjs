// Uploads locator-pilot.zip to the existing Chrome Web Store item and submits it
// for review, via the Chrome Web Store API v2. Used by .github/workflows/release.yml;
// can also be run by hand (`npm run pack && npm run publish:store`) with the same
// environment variables set. Setup is described in RELEASING.md.
//
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN  OAuth client + refresh token
//                                                         (scope .../auth/chromewebstore)
//   CWS_PUBLISHER_ID   Developer Dashboard → Publisher → Settings
//   CWS_ITEM_ID        optional; defaults to the live listing's ID
//   CWS_UPLOAD_ONLY=1  optional; upload the draft but don't submit for review
import { readFileSync } from "node:fs";

const DEFAULT_ITEM_ID = "mlbblliaikkmocgelpinldnnbjdgkpje";
const API = "https://chromewebstore.googleapis.com";

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    console.error(`Missing ${name} — see RELEASING.md for Chrome Web Store API setup.`);
    process.exit(1);
  }
  return value;
}

const clientId = env("CWS_CLIENT_ID");
const clientSecret = env("CWS_CLIENT_SECRET");
const refreshToken = env("CWS_REFRESH_TOKEN");
const publisherId = env("CWS_PUBLISHER_ID");
const itemId = env("CWS_ITEM_ID", DEFAULT_ITEM_ID);
const itemPath = `publishers/${publisherId}/items/${itemId}`;

async function call(method, url, { token, body, headers } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} → HTTP ${res.status}: ${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { access_token: token } = await call("POST", "https://oauth2.googleapis.com/token", {
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }),
});

const version = JSON.parse(readFileSync("manifest.json", "utf8")).version;
console.log(`Uploading locator-pilot.zip (v${version}) to item ${itemId}…`);
const upload = await call("POST", `${API}/upload/v2/${itemPath}:upload`, {
  token,
  headers: { "content-type": "application/zip" },
  body: readFileSync("locator-pilot.zip"),
});
console.log("Upload response:", JSON.stringify(upload));

let state = upload.uploadState;
for (let attempt = 0; state === "IN_PROGRESS" && attempt < 30; attempt++) {
  await sleep(5000);
  const status = await call("GET", `${API}/v2/${itemPath}:fetchStatus`, { token });
  state = status.lastAsyncUploadState ?? status.uploadState ?? state;
  console.log(`Upload still processing (${state})…`);
}
if (state && state !== "SUCCEEDED" && state !== "IN_PROGRESS") {
  console.error(`Upload did not succeed (uploadState: ${state}).`);
  process.exit(1);
}

if (process.env.CWS_UPLOAD_ONLY === "1") {
  console.log("CWS_UPLOAD_ONLY=1 — draft uploaded; submit it for review from the Developer Dashboard.");
  process.exit(0);
}

const publish = await call("POST", `${API}/v2/${itemPath}:publish`, { token });
console.log("Submitted for review:", JSON.stringify(publish));
const status = await call("GET", `${API}/v2/${itemPath}:fetchStatus`, { token });
console.log("Item status:", JSON.stringify(status, null, 2));
