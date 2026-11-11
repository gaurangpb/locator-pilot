// package.json is the single source of truth for the version. `npm version
// <patch|minor|major>` bumps it, then runs this (the "version" lifecycle script)
// to copy it into manifest.json and stamp the CHANGELOG's Unreleased section,
// before npm commits and tags vX.Y.Z. esbuild.mjs refuses to build if they drift.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const manifestText = readFileSync("manifest.json", "utf8");
writeFileSync("manifest.json", manifestText.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));

const changelog = readFileSync("CHANGELOG.md", "utf8");
const date = new Date().toISOString().slice(0, 10);
if (!changelog.includes(`## [${version}]`)) {
  writeFileSync(
    "CHANGELOG.md",
    changelog.replace("## [Unreleased]\n", `## [Unreleased]\n\n## [${version}] — ${date}\n`),
  );
}
console.log(`manifest.json and CHANGELOG.md set to ${version}`);
