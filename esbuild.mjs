import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const buildOptions = {
  entryPoints: [
    { in: "src/content/content.ts", out: "content" },
    { in: "src/popup/popup.ts", out: "popup/popup" },
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
  mkdirSync(`${outdir}/popup`, { recursive: true });
  cpSync("src/popup/popup.html", `${outdir}/popup/popup.html`);
  cpSync("src/popup/popup.css", `${outdir}/popup/popup.css`);
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
