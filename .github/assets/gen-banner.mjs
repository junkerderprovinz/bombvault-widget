/**
 * Generates the BombVault Widget README banner pair (1600x500):
 *
 *   bombvault-widget-banner.svg / .png       : light (white bg, dark text)
 *   bombvault-widget-banner-dark.svg / .png  : dark (GitHub #0d1117 bg)
 *
 * Theme-adaptive pair (house rule, ShipLog/BombVault reference): the README
 * serves the dark variant via <picture> prefers-color-scheme. The BombVault
 * logo 2.0 master reads on both backgrounds by itself, so both themes embed
 * the SAME logo (exactly like bombvault's own generator).
 *
 * Layout follows the CannonadeCommand precedent for long names: the name stays
 * on ONE line at a reduced size, with generous side margins (~120px) instead
 * of letting the text fill the full canvas — the logo must never sit crammed
 * against the edge. Text is converted to SVG paths (opentype.js) so the SVG
 * needs NO font and renders identically with resvg or a browser.
 *
 * The logo's OPTICAL centre — marked by the designer in the source file — is
 * NOT the geometric centre (the sparks at the top right add ignorable visual
 * weight), so vertical centring uses that point, not the bounding box.
 *
 * NaN guard (house lesson): opentype.js emits NaN points for SOME size/glyph
 * combinations at the REAL pen position — a truncated glyph mid-word. Every
 * fixed font size therefore steps DOWN to the next size whose generated path
 * is NaN-free, and the final SVG is asserted NaN-free before writing.
 *
 * Deps (global): opentype.js, @resvg/resvg-js. Bree Serif + Lato (both OFL)
 * are fetched at runtime to the OS temp dir — NOT committed.
 * Run: node .github/assets/gen-banner.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const groot = execSync("npm root -g").toString().trim();
const opentype = require(`${groot}/opentype.js`);
const { Resvg } = require(`${groot}/@resvg/resvg-js`);

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- content + styling -----------------------------------------------------
const NAME = "BombVault Widget";
const CLAIM = "Watch it tick.";
const W = 1600, H = 500;
const THEMES = [
  { suffix: "",      bg: "#ffffff", name: "#242626", claim: "#5a5d5e" },
  { suffix: "-dark", bg: "#0d1117", name: "#e6edf3", claim: "#9aa4ad" },
];
const LH = 410;                    // logo height
// BombVault logo 2.0 geometry (viewBox 898.34 x 865.1) + designer-marked
// optical centre (see bombvault/.github/assets/gen-banner.mjs).
const LOGO_W = 898.34, LOGO_H = 865.1;
const OPT_CY = 461.2;
const LW = LH * (LOGO_W / LOGO_H); // keep logo aspect
const gap = 64, lineGap = 22;
const MAX_NAME_SIZE = 148, MAX_CLAIM_SIZE = 42;
const margin = 120;                // min space left of logo / right of text
// ---------------------------------------------------------------------------

async function font(file, url) {
  const p = join(tmpdir(), file);
  if (!existsSync(p)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${file} fetch ${r.status}`);
    writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  return opentype.parse(readFileSync(p).buffer.slice(
    readFileSync(p).byteOffset, readFileSync(p).byteOffset + readFileSync(p).byteLength));
}

const bree = await font("BVW-BreeSerif-Regular.ttf",
  "https://github.com/google/fonts/raw/main/ofl/breeserif/BreeSerif-Regular.ttf");
const lato = await font("BVW-Lato-Regular.ttf",
  "https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf");

// Width-fit start size: the text column must fit next to the logo.
const maxTextW = W - LW - gap - 2 * margin;
const startNameSize = Math.min(MAX_NAME_SIZE,
  Math.floor(100 * maxTextW / bree.getAdvanceWidth(NAME, 100)));

// NaN-safe layout: the NaN depends on the REAL pen position, so the loop lays
// out the whole group for each candidate size, generates the actual paths and
// only accepts a combination whose output is NaN-free — stepping DOWN instead
// of shipping a glyph-truncated word.
function layout() {
  for (let nameSize = startNameSize; nameSize > 40; nameSize--) {
    for (let claimSize = MAX_CLAIM_SIZE; claimSize > 14; claimSize--) {
      const nameW = bree.getAdvanceWidth(NAME, nameSize);
      const claimW = lato.getAdvanceWidth(CLAIM, claimSize);
      const groupW = LW + gap + Math.max(nameW, claimW);
      const startX = (W - groupW) / 2;
      const LX = startX, LY = H / 2 - OPT_CY * (LH / LOGO_H);
      const textX = startX + LW + gap;

      const nameAsc = bree.ascender * (nameSize / bree.unitsPerEm);
      const nameDesc = -bree.descender * (nameSize / bree.unitsPerEm);
      const claimAsc = lato.ascender * (claimSize / lato.unitsPerEm);
      const blockH = nameAsc + nameDesc + lineGap + claimAsc;
      const nameBaseline = H / 2 - blockH / 2 + nameAsc;
      const claimBaseline = nameBaseline + nameDesc + lineGap + claimAsc;

      const namePath = bree.getPath(NAME, textX, nameBaseline, nameSize).toPathData(2);
      if (namePath.includes("NaN")) break; // name is the culprit -> next nameSize
      const claimPath = lato.getPath(CLAIM, textX, claimBaseline, claimSize).toPathData(2);
      if (claimPath.includes("NaN")) continue; // claim culprit -> next claimSize
      return { nameSize, claimSize, LX, LY, namePath, claimPath };
    }
  }
  throw new Error("no NaN-free size combination found");
}
const { nameSize, claimSize, LX, LY, namePath, claimPath } = layout();

// Embed the logo master VERBATIM at (x,y,w,h): drop the XML decl, reposition
// its <svg>. viewBox-agnostic — reads the file's own viewBox and preserves it.
function embedLogo(logoFile, x, y, w, h) {
  const raw = readFileSync(join(__dir, logoFile), "utf8").replace(/<\?xml[^>]*\?>\s*/, "");
  const vb = (raw.match(/viewBox="([^"]+)"/) || [, `0 0 ${LOGO_W} ${LOGO_H}`])[1];
  return raw.replace(
    /<svg\b[^>]*>/,
    `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`,
  );
}
const logo = embedLogo("icon.svg", LX, LY, LW, LH);

for (const t of THEMES) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="BombVault Widget">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  ${logo}
  <path d="${namePath}" fill="${t.name}"/>
  <path d="${claimPath}" fill="${t.claim}"/>
</svg>
`;
  if (svg.includes("NaN")) throw new Error("banner SVG contains NaN — aborting");
  writeFileSync(join(__dir, `bombvault-widget-banner${t.suffix}.svg`), svg);
  const png = new Resvg(svg, { background: t.bg, fitTo: { mode: "width", value: W } }).render().asPng();
  writeFileSync(join(__dir, `bombvault-widget-banner${t.suffix}.png`), png);
  console.log(`banner${t.suffix} ok: ${W}x${H}, name ${nameSize}px, claim ${claimSize}px, png ${png.length} bytes`);
}

// Logo-only banner (house rule: always regenerated in the same run) — used by
// support threads, never the wordmark banner: the logo alone, centred on white.
{
  const lx = (W - LW) / 2, ly = H / 2 - OPT_CY * (LH / LOGO_H);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="BombVault Widget">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${embedLogo("icon.svg", lx, ly, LW, LH)}
</svg>
`;
  writeFileSync(join(__dir, "bombvault-widget-banner-logo.svg"), svg);
  const png = new Resvg(svg, { background: "#ffffff", fitTo: { mode: "width", value: W } }).render().asPng();
  writeFileSync(join(__dir, "bombvault-widget-banner-logo.png"), png);
  console.log(`banner-logo ok: ${W}x${H}, png ${png.length} bytes`);
}
