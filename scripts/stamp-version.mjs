// Keep the app version in sync with the release tag.
//
// Usage: node scripts/stamp-version.mjs 0.2.0
//
// Updates:
//   - package.json            version
//   - src-tauri/tauri.conf.json  version  (bundle file names)
//   - src-tauri/Cargo.toml       package version (shown in About / binaries)

import { readFileSync, writeFileSync } from "node:fs";

const version = (process.argv[2] ?? "").trim();

if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(
    `stamp-version: expected a semver version like 0.2.0, got "${version}"`,
  );
  process.exit(1);
}

function stampJson(path) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

function stampCargoToml(path) {
  const raw = readFileSync(path, "utf8");
  const next = raw.replace(/^version = "[^"]*"/m, `version = "${version}"`);
  if (next === raw && !raw.includes(`version = "${version}"`)) {
    console.error(`stamp-version: no [package] version found in ${path}`);
    process.exit(1);
  }
  writeFileSync(path, next);
}

stampJson("package.json");
stampJson("src-tauri/tauri.conf.json");
stampCargoToml("src-tauri/Cargo.toml");

console.log(`stamp-version: set app version to ${version}`);
