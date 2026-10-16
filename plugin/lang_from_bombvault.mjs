// Copies the activity log's strings from a BombVault checkout into the tile's
// language files, so every line reads exactly as BombVault's own log does in
// that language. Keys BombVault has not translated fall back to English.
//
// Run: node plugin/lang_from_bombvault.mjs <path to the bombvault checkout>

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEYS = [
  ...["Containers", "VMs", "Flash", "Config", "Files", "ZFS", "Everything"].map((d) => `activityLog.domain${d}`),
  ...["Backup", "Offsite", "Drill", "Tamper", "Digest", "Watchdog", "Receiver", "Fleet", "Pull", "Replica"].map((j) => `activityLog.job${j}`),
  ...["Read", "Adopt", "SignIns", "Settings", "Undo"].map((k) => `run.kindKey${k}`),
  ...[
    "KeyRefused",
    "PruneSuccess", "PruneFailed", "VerifySuccess", "VerifyFailed",
    "OffsiteSuccess", "OffsiteFailed", "DrillSuccess", "DrillFailed",
    "DRDrillSuccess", "DRDrillFailed", "TamperSuccess", "TamperFailed", "TamperSkipped",
    "ExportSuccess", "ExportFailed",
    "DbDumpSuccess", "DbDumpNote", "DbDumpFailed", "DbDumpSaved", "DbDumpSaveFailed",
    "DbImported", "DbImportFailed", "ImportSuccess", "ImportFailed",
    "ReplicaSuccess", "ReplicaFailed", "RestoreSuccess", "RestoreFailed",
    "UpdateSuccess", "UpdateFailed", "BackupSuccess", "BackupFailed", "BackupSkipped",
    "Other", "NextWithDomain", "NextNoDomain", "Empty",
  ].map((l) => `activityLog.line${l}`),
];

const bv = process.argv[2];
if (!bv) throw new Error("usage: node plugin/lang_from_bombvault.mjs <bombvault checkout>");
const lib = join(bv, "web", "src", "lib");
const langDir = join(dirname(fileURLToPath(import.meta.url)), "src", "bombvaultwidget", "usr", "local", "emhttp", "plugins", "bombvaultwidget", "lang");

// The tables are object literals with one "key": "value" per line, so the
// values are valid JSON strings as they stand.
function table(source) {
  const out = {};
  for (const m of source.matchAll(/^\s*"([^"]+)":\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

const i18n = readFileSync(join(lib, "i18n.ts"), "utf8");
const split = i18n.indexOf("export const de");
const tables = { en: table(i18n.slice(0, split)), de: table(i18n.slice(split)) };
const read = (lang) => tables[lang] ?? table(readFileSync(join(lib, "locales", `${lang}.ts`), "utf8"));

const missing = KEYS.filter((key) => !(key in tables.en));
if (missing.length > 0) throw new Error(`BombVault has no English text for ${missing.join(", ")}`);

for (const file of readdirSync(langDir).filter((name) => name.endsWith(".json"))) {
  const lang = file.replace(/\.json$/, "");
  const path = join(langDir, file);
  const current = JSON.parse(readFileSync(path, "utf8"));
  const source = read(lang);
  for (const key of KEYS) {
    if (key in source) current[key] = source[key];
    else delete current[key];
  }
  writeFileSync(path, JSON.stringify(current, null, 2) + "\n");
}
