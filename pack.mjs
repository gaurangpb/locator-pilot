import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const zipPath = path.join(repoRoot, "locator-pilot.zip");

const build = spawnSync(process.execPath, [path.join(repoRoot, "esbuild.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (existsSync(zipPath)) rmSync(zipPath);

const tar = spawnSync("tar", ["-a", "-c", "-f", zipPath, "-C", path.join(repoRoot, "dist"), "."], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (tar.status !== 0) process.exit(tar.status ?? 1);

const list = spawnSync("tar", ["-tf", zipPath], { cwd: repoRoot, encoding: "utf8" });
if (list.status !== 0) process.exit(list.status ?? 1);

const entries = list.stdout.split(/\r?\n/).filter(Boolean);
if (!entries.some((name) => name === "manifest.json" || name === "./manifest.json")) {
  console.error("ZIP is missing manifest.json at the root — Chrome Web Store will reject it.");
  process.exit(1);
}

console.log(`Packed ${zipPath}`);
console.log(entries.join("\n"));
