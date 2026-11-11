import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";

// package.json is the version's source of truth (scripts/sync-version.mjs keeps
// manifest.json in step via `npm version`); never ship a build where they differ.
const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const manifestVersion = JSON.parse(readFileSync("manifest.json", "utf8")).version;
if (pkgVersion !== manifestVersion) {
  console.error(
    `Version mismatch: package.json ${pkgVersion} vs manifest.json ${manifestVersion}. ` +
      "Bump with `npm version <patch|minor|major>`, which updates both.",
  );
  process.exit(1);
}

const watch = process.argv.includes("--watch");
const outdir = "dist";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const buildOptions = {
  entryPoints: [
    { in: "src/content/content.ts", out: "content" },
    { in: "src/background/background.ts", out: "background" },
    { in: "src/options/options.ts", out: "options/options" },
  ],
  bundle: true,
  format: "iife",
  target: "chrome116",
  outdir,
  loader: { ".css": "text" },
  logLevel: "info",
};

function copyStaticFiles() {
  cpSync("manifest.json", `${outdir}/manifest.json`);
  cpSync("icons", `${outdir}/icons`, { recursive: true });
  mkdirSync(`${outdir}/options`, { recursive: true });
  cpSync("src/options/options.html", `${outdir}/options/options.html`);
}

if (watch) {
  const ctx = await context(buildOptions);
  copyStaticFiles();
  await ctx.watch();
  console.log("Watching for changes... (static files copied once at startup)");
} else {
  await build(buildOptions);
  copyStaticFiles();
  console.log(`Built extension into ./${outdir}`);
}
