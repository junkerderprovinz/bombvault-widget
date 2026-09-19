/**
 * Generates the BombVault Widget README banners, a 1600x500 pair the README
 * picks between with <picture> and prefers-color-scheme:
 *
 *   bombvault-widget-banner.svg / .png       : light (white ground, dark text)
 *   bombvault-widget-banner-dark.svg / .png  : dark (GitHub #0d1117 ground)
 *
 * The BombVault logo 2.0 master reads on both grounds, so both embed the same
 * logo, as bombvault's own generator does. The long name stays on one line at
 * a reduced size with about 120px side margins, so the logo never sits crammed
 * against the edge. Text is converted to SVG paths with opentype.js, so the SVG
 * needs no font and renders the same in resvg and a browser.
 *
 * Vertical centring uses the optical centre the designer marked in the source
 * file rather than the bounding box, since the sparks at the top right carry
 * little visual weight.
 *
 * opentype.js emits NaN points for some size and glyph combinations at the
 * real pen position, truncating a glyph mid-word. Each size therefore steps
 * down to the next one whose path is NaN-free, and the final SVG is checked
 * before writing.
 *
 * Deps (global): opentype.js, @resvg/resvg-js. Bree Serif and Lato (both OFL)
 * are fetched to the OS temp dir at runtime and are not committed.
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

const NAME = "BombVault Widget";
const CLAIM = "Watch it tick.";
const W = 1600, H = 500;
const THEMES = [
  { suffix: "",      bg: "#ffffff", name: "#1f2328", claim: "#5a5d5e" },
  { suffix: "-dark", bg: "#0d1117", name: "#e6edf3", claim: "#9aa4ad" },
];
const LH = 386;                    // logo height (house standard)
// BombVault logo 2.0 geometry (viewBox 898.34 x 865.1) + designer-marked
// optical centre (see bombvault/.github/assets/gen-banner.mjs).
const LOGO_W = 898.34, LOGO_H = 865.1;
const OPT_CY = 461.2;
const LW = LH * (LOGO_W / LOGO_H); // keep logo aspect
const gap = 70, lineGap = 8;       // house standard
const MAX_NAME_SIZE = 132, MAX_CLAIM_SIZE = 44;   // house standard
const margin = 120;                // min space left of logo / right of text

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

// Width-fit start size: the text column must fit next to the left-anchored logo.
const startX = 165;                          // left-anchor (house standard)
const maxTextW = W - (startX + LW + gap) - margin;
const startNameSize = Math.min(MAX_NAME_SIZE,
  Math.floor(100 * maxTextW / bree.getAdvanceWidth(NAME, 100)));

// The NaN depends on the real pen position, so each candidate size lays out
// the whole group and generates the actual paths, stepping down until the
// output is NaN-free.
function layout() {
  for (let nameSize = startNameSize; nameSize > 40; nameSize--) {
    for (let claimSize = MAX_CLAIM_SIZE; claimSize > 14; claimSize--) {
      const nameW = bree.getAdvanceWidth(NAME, nameSize);
      const claimW = lato.getAdvanceWidth(CLAIM, claimSize);
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

// Embeds the logo master verbatim at (x,y,w,h), keeping the file's own viewBox.
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
  if (svg.includes("NaN")) throw new Error("banner SVG contains NaN, aborting");
  writeFileSync(join(__dir, `bombvault-widget-banner${t.suffix}.svg`), svg);
  const png = new Resvg(svg, { background: t.bg, fitTo: { mode: "width", value: W } }).render().asPng();
  writeFileSync(join(__dir, `bombvault-widget-banner${t.suffix}.png`), png);
  console.log(`banner${t.suffix} ok: ${W}x${H}, name ${nameSize}px, claim ${claimSize}px, png ${png.length} bytes`);
}

// The logo alone, centred on white, for support threads.
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
