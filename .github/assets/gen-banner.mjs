/**
 * Generates the BombVault Widget README banner (white 1600x500):
 *
 *   bombvault-widget-banner.svg / .png : logo (embedded VERBATIM from icon.svg,
 *   the BombVault logo 2.0 master) on the left, "BombVault Widget" in Bree
 *   Serif + the claim in Lato to the right. Text is converted to SVG paths
 *   (opentype.js) so the SVG needs NO font and renders identically with resvg
 *   or a browser.
 *
 * Mechanics follow the ShipLog generator (viewBox-agnostic logo embed) with the
 * BombVault-specific optical-centre placement: the logo's OPTICAL centre —
 * marked by the designer in the source file — is NOT the geometric centre (the
 * sparks at the top right add ignorable visual weight), so vertical centring
 * uses that point, not the bounding box.
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
const BG = "#ffffff", NAME_FILL = "#242626", CLAIM_FILL = "#5a5d5e";
const LH = 410;                    // logo height
// BombVault logo 2.0 geometry (viewBox 898.34 x 865.1) + designer-marked
// optical centre (see bombvault/.github/assets/gen-banner.mjs).
const LOGO_W = 898.34, LOGO_H = 865.1;
const OPT_CY = 461.2;
const LW = LH * (LOGO_W / LOGO_H); // keep logo aspect
const gap = 64, lineGap = 22;
const MAX_NAME_SIZE = 148, MAX_CLAIM_SIZE = 42;
const margin = 56;                 // min space left of logo / right of text
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

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="BombVault Widget">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${embedLogo("icon.svg", LX, LY, LW, LH)}
  <path d="${namePath}" fill="${NAME_FILL}"/>
  <path d="${claimPath}" fill="${CLAIM_FILL}"/>
</svg>
`;
if (svg.includes("NaN")) throw new Error("banner SVG contains NaN — aborting");

writeFileSync(join(__dir, "bombvault-widget-banner.svg"), svg);
const png = new Resvg(svg, { background: BG, fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(join(__dir, "bombvault-widget-banner.png"), png);
console.log(`banner ok: ${W}x${H}, name ${nameSize}px, claim ${claimSize}px, png ${png.length} bytes`);
