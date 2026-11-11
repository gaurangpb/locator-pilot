import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(repoRoot, "dist");
const zipPath = path.join(repoRoot, "locator-pilot.zip");

const build = spawnSync(process.execPath, [path.join(repoRoot, "esbuild.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

function listFiles(dir, prefix = "") {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) files.push(...listFiles(full, rel));
    else files.push({ full, rel });
  }
  return files;
}

function u16(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}

function u32(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n);
  return buf;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const data = readFileSync(file.full);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const name = Buffer.from(file.rel, "utf8");
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(checksum),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(checksum),
      u32(compressed.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}

const files = listFiles(distDir);
if (!files.some((file) => file.rel === "manifest.json")) {
  console.error("dist/ is missing manifest.json — Chrome Web Store will reject the zip.");
  process.exit(1);
}

if (existsSync(zipPath)) rmSync(zipPath);
writeFileSync(zipPath, zipStore(files));

console.log(`Packed ${zipPath}`);
for (const file of files) console.log(file.rel);
