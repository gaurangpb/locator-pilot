import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const filePath = path.normalize(path.join(repoRoot, urlPath));
  if (!filePath.startsWith(repoRoot)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const jobs = [
  { url: "/store/scenes/01-pick-element.html", out: "store/screenshots/01-pick-element.png", w: 1280, h: 800 },
  { url: "/store/scenes/02-csharp.html", out: "store/screenshots/02-csharp.png", w: 1280, h: 800 },
  { url: "/store/scenes/03-paste-find.html", out: "store/screenshots/03-paste-find.png", w: 1280, h: 800 },
  { url: "/store/scenes/04-history.html", out: "store/screenshots/04-history.png", w: 1280, h: 800 },
  { url: "/store/scenes/promo-small.html", out: "store/promo/small-440x280.png", w: 440, h: 280 },
  { url: "/store/scenes/promo-marquee.html", out: "store/promo/marquee-1400x560.png", w: 1400, h: 560 },
];

function pngSize(file) {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function screenshot(url, outPath, width, height) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${width},${height}`,
        "--virtual-time-budget=2000",
        `--screenshot=${outPath}`,
        url,
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`chrome exited ${code} for ${url}`));
    });
  });
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
mkdirSync(path.join(repoRoot, "store/screenshots"), { recursive: true });
mkdirSync(path.join(repoRoot, "store/promo"), { recursive: true });

try {
  for (const job of jobs) {
    const outPath = path.join(repoRoot, job.out);
    await screenshot(`http://127.0.0.1:${port}${job.url}`, outPath, job.w, job.h);
    const { width, height } = pngSize(outPath);
    const kb = Math.round(statSync(outPath).size / 1024);
    console.log(`${job.out}: ${width}x${height} (${kb} KB)`);
    if (width !== job.w || height !== job.h) {
      console.warn(`  expected ${job.w}x${job.h}`);
    }
  }
} finally {
  server.close();
}
