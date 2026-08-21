#!/usr/bin/env node
/**
 * Prepare an npm-publishable tarball under your own scope.
 *
 * The repo keeps the `@deepseek-ai/dsh-client-ui-usage` identity (that name
 * lives in the official @deepseek-ai npm scope and we cannot publish there).
 * npm requires a name under YOUR scope, so this script copies the package
 * into a temp dir, renames it, and rewrites the cordis insert name to match.
 *
 * Usage:
 *   npm login                                   # once, in any directory
 *   node scripts/npm-publish-prep.mjs           # default scope: woosh2010
 *   node scripts/npm-publish-prep.mjs <scope> <version>
 *
 * The script prints the exact publish command; run it in the printed temp dir.
 * After a successful publish, users can install with:
 *   dsh plugin --profile web add @<scope>/dsh-client-ui-usage
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scope = (process.argv[2] ?? "woosh2010").replace(/^@/, "");
const version = process.argv[3] ?? JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const name = `@${scope}/dsh-client-ui-usage`;

const dir = mkdtempSync(join(tmpdir(), "npm-publish-"));
for (const f of ["lib", "cordis.patch.yml", "README.md", "LICENSE"]) {
  cpSync(new URL(`../${f}`, import.meta.url).pathname, join(dir, f), { recursive: true });
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
pkg.name = name;
pkg.version = version;
delete pkg.private;
writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

let patch = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
patch = patch.replaceAll("name: '@deepseek-ai/dsh-client-ui-usage'", `name: '${name}'`);
writeFileSync(join(dir, "cordis.patch.yml"), patch);

console.log(`Prepared ${name}@${version} in ${dir}`);
console.log("");
console.log("  cd", JSON.stringify(dir));
console.log("  npm publish --access public");
console.log("");
console.log("After publishing, install with:");
console.log(`  dsh plugin --profile web add ${name}`);
