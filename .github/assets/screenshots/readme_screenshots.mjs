// Builds the README screenshots in this folder: the dashboard tile and the
// settings page inside a drawn browser window next to a caption, on the dark
// relief background of BombVault's own README pictures.
//
// Nothing here talks to a real server. The Unraid pages are rebuilt from the
// plugin's own .page files and script, styled with Unraid's stylesheets from
// the public webgui repository, and the tile's proxy call is answered with an
// invented activity feed in the shape of BombVault's /api/widget/data.
//
// Every layer is rendered at twice the size, which keeps the text sharp
// through the window's tilt.
//
// Deps (global): playwright-core with its Chromium installed.
// Run: node .github/assets/screenshots/readme_screenshots.mjs

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright-core`);

const out = dirname(fileURLToPath(import.meta.url));
const root = join(out, "..", "..", "..");
const plugin = join(root, "plugin", "src", "bombvaultwidget", "usr", "local", "emhttp", "plugins", "bombvaultwidget");

// The pages are served from this invented address, so the window bar shows a
// plausible Unraid web UI rather than any real one.
const ORIGIN = "http://192.168.1.20";
const BV_URL = "https://192.168.1.20:3443";
// Shown masked, so only its length reaches the picture.
const TOKEN = "x".repeat(32);
// Pinned so a later webgui change cannot shift the pictures between runs.
const WEBGUI = "https://raw.githubusercontent.com/unraid/webgui/e331ba36c538a683aa72801d2e1a661c88c98ee3/emhttp/plugins/dynamix";
const NOW = "2026-10-03T10:16:50+02:00";

const SHOTS = [
  { file: "tile.png", path: "/Dashboard", caption: "Watch it tick, <em>right on your dashboard</em>" },
  { file: "settings.png", path: "/Settings/bombvaultwidget", caption: "A URL and a token. <em>That's the setup.</em>" },
];
const SUB = "BombVault Widget for Unraid";

const W = 1600;
const H = 940;
const VIEW_W = 1080;
const VIEW_H = 720;
const BAR_H = 48;

// The same night and morning as the activity log in BombVault's README
// dashboard picture, so both READMEs tell one story.
const MB = 1024 * 1024;
const at = (clock) => Date.parse(`2026-10-03T${clock}+02:00`) / 1000;
const run = (kind, domain, target, start, secs, bytes = 0) => ({
  kind,
  status: "success",
  domain,
  target,
  startedAt: at(start),
  finishedAt: at(start) + secs,
  bytes,
  error: "",
});
const FEED = {
  ok: true,
  version: "9.5.0",
  runs: [
    run("backup", "flash", "Unraid flash", "03:00:35", 6, 812.4 * 1024),
    run("verify", "containers", "", "03:10:51", 77),
    run("prune", "containers", "", "03:14:02", 28),
    run("restore", "container", "paperless", "08:40:39", 38),
    run("backup", "container", "homeassistant", "09:58:53", 32, 19.0 * MB),
    run("backup", "container", "immich", "09:59:26", 32, 65.1 * MB),
    run("backup", "container", "jellyfin", "10:00:00", 31, 13.0 * MB),
    run("backup", "container", "nextcloud", "10:00:33", 31, 43.1 * MB),
    run("backup", "container", "paperless", "10:01:06", 31, 23.0 * MB),
    run("backup", "container", "uptime-kuma", "10:01:39", 31, 8.0 * MB),
    run("backup", "container", "vaultwarden", "10:02:12", 31, 4.0 * MB),
    run("backup", "config", "App configuration", "10:02:51", 2, 530.7 * 1024),
    run("offsite", "containers", "", "10:02:54", 8),
    run("tamper", "containers", "", "10:03:04", 2),
  ].map((r) => ({ ...r, bytes: Math.round(r.bytes) })),
  next: [{ job: "backup", domain: "containers", next: "2026-10-04T03:00:00+02:00" }],
};

async function cached(name, url) {
  const path = join(tmpdir(), `bombvault-widget-${name.replace(/[\\/]/g, "_")}`);
  if (!existsSync(path)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: fetch ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(path);
}

const dataUrl = (buf, type) => `data:${type};base64,${buf.toString("base64")}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const bree = dataUrl(
  await cached("BreeSerif-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/breeserif/BreeSerif-Regular.ttf"),
  "font/ttf",
);
const lato = dataUrl(await cached("Lato-Regular.ttf", "https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf"), "font/ttf");
const logo = dataUrl(readFileSync(join(root, ".github", "assets", "icon.svg")), "image/svg+xml");

const strings = JSON.parse(readFileSync(join(plugin, "lang", "en.json"), "utf8"));

// The PHP and HTML body of a .page file, below its "---" header line.
function pageBody(name) {
  const text = readFileSync(join(plugin, name), "utf8");
  return text.slice(text.indexOf("\n---\n") + 5);
}

// The tile as Unraid's dashboard prints it: the $mytiles heredoc with the
// "Open BombVault" link filled in, then the page's own style and script.
function tileMarkup() {
  const body = pageBody("bombvaultwidget.Dashboard.page");
  const open = /\$bvd_open = "(.*)";/.exec(body)?.[1].replace(/" \. htmlspecialchars\(\$bvd_url, ENT_QUOTES\) \. "/, BV_URL);
  const tile = /<<<EOT\n([\s\S]*?)\nEOT;/.exec(body)?.[1];
  if (!open || !tile) throw new Error("bombvaultwidget.Dashboard.page: tile markup not found");
  const tail = body.slice(body.indexOf("\n?>") + 3).replace(/<\?autov\('([^']+)'\)\?>/g, "$1");
  // DashStats adds the collapse chevron to every tile header after load.
  const chevron = "<i class='fa fa-fw fa-chevron-up control openclose' title=\"Show/Hide Content\"></i>";
  return {
    tile: tile.replace("{$bvd_open}", open).replace(/(<\/i><\/a>)(<\/span><\/span><\/span>)/, `$1${chevron}$2`),
    tail,
  };
}

function settingsMarkup() {
  const body = pageBody("bombvaultwidget.page");
  const html = body
    .slice(body.indexOf("\n?>") + 3)
    .replace(/<\?=htmlspecialchars\(\$L\['(\w+)'\]\)\?>/g, (_, k) => esc(strings[k]))
    .replace(/<\?=\$L\['(\w+)'\]\?>/g, (_, k) => strings[k])
    .replace(/<\?=htmlspecialchars\(\$bvurl\)\?>/g, esc(BV_URL))
    .replace(/<\?=htmlspecialchars\(\$wtok\)\?>/g, esc(TOKEN))
    .replace(/<\?=json_encode\(\$L[^?]*\?>/g, JSON.stringify(strings))
    .replace(/<\?autov\('([^']+)'\)\?>/g, "$1");
  if (html.includes("<?")) throw new Error("bombvaultwidget.page: unhandled PHP left in the markup");
  return html;
}

const UNRAID_LOGO =
  "M146.7,29.47H135l-3,9h-6.49L138.93,0h8l13.41,38.49h-7.09L142.62,6.93l-5.83,16.88h8ZM29.69,0V25.4c0,8.91-5.77,13.64-14.9,13.64S0,34.31,0,25.4V0H6.54V25.4c0,5.17,3.19,7.92,8.25,7.92s8.36-2.75,8.36-7.92V0ZM50.86,12v26.5H44.31V0h6.11l17,26.5V0H74V38.49H67.9ZM171.29,0h6.54V38.49h-6.54Zm51.07,24.69c0,9-5.88,13.8-15.17,13.8H192.67V0H207.3c9.18,0,15.06,4.78,15.06,13.8ZM215.82,13.8c0-5.28-3.3-8.14-8.52-8.14h-8.08V32.77h8c5.33,0,8.63-2.8,8.63-8.08ZM108.31,23.92c4.34-1.6,6.93-5.28,6.93-11.55C115.24,3.68,110.18,0,102.48,0H88.84V38.49h6.55V5.66h6.87c3.8,0,6.21,1.82,6.21,6.71s-2.41,6.76-6.21,6.76H98.88l9.21,19.36h7.53Z";

// Unraid 7's frame around a page: the stylesheets DefaultPageLayout.php
// links, the header, and the top navigation. The header is a Vue component on
// a real server; this draws its resting state with a dark custom header colour,
// one of Unraid's display settings.
function unraidPage(active, head, content) {
  const tabs = ["Dashboard", "Main", "Shares", "Users", "Settings", "Plugins", "Docker", "VMs", "Apps", "Tools"];
  const utils = [
    ["fa fa-lock", "Lock"],
    ["fa fa-question-circle", "Help"],
    ["icon-u-bell", "Notifications"],
    ["fa fa-terminal", "Terminal"],
    ["fa fa-file-text-o", "Log"],
    ["fa fa-comments-o", "Feedback"],
    ["fa fa-info-circle", "Info"],
  ];
  const sheets = [
    "default-fonts.css",
    "default-cases.css",
    "font-awesome.css",
    "default-color-palette.css",
    "default-base.css",
    "default-dynamix.css",
    "themes/black.css",
  ];
  return `<!doctype html><html lang="en" class="Theme--black Theme--width-boxed"><head><meta charset="utf-8">
<title>Tower/${active}</title>
${sheets.map((s) => `<link rel="stylesheet" href="/webGui/styles/${s}">`).join("\n")}
<style>
:root { --custom-header-background-color: #141414; --customer-header-text-color: #f2f2f2; }
#header .uh { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: .5rem 1.6rem .5rem 1rem; box-sizing: border-box; }
#header .uh-logo { display: flex; flex-direction: column; gap: 8px; }
#header .uh-logo svg.word { width: 16rem; height: auto; display: block; }
#header .uh-ver { display: inline-flex; align-items: center; gap: 4px; color: #999; font-weight: 600; font-size: 14px; position: relative; top: 5px; }
#header .uh-ver svg { width: 12px; height: 12px; }
#header .uh-me { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; color: #f2f2f2; }
#header .uh-meta { font-size: 12px; color: #999; }
#header .uh-name { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: bold; }
#header .uh-name small { font-size: 13px; font-weight: normal; color: #bdbdbd; }
#header .uh-name i { font-size: 18px; color: #bdbdbd; }
</style>
${head}
</head><body>
<div id="header" class="unraid-consolidated-header"><div class="uh">
  <div class="uh-logo">
    <svg class="word" viewBox="0 0 222.36 39.04"><defs><linearGradient id="g" x1="47.53" y1="79.1" x2="170.71" y2="-44.08" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e32929"/><stop offset="1" stop-color="#ff8d30"/></linearGradient></defs><path fill="url(#g)" d="${UNRAID_LOGO}"/></svg>
    <span class="uh-ver"><svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd"/></svg>7.2.0</span>
  </div>
  <div class="uh-me">
    <span class="uh-meta">Uptime 12 days, 4 hours &nbsp;&middot;&nbsp; Pro</span>
    <span class="uh-name"><span>Tower <small>Media server</small></span><i class="fa fa-user-circle"></i></span>
  </div>
</div></div>
<div id="menu">
  <div class="nav-tile">${tabs.map((t) => `<div class="nav-item${t === active ? " active" : ""}"><a href="/${t}">${t}</a></div>`).join("")}</div>
  <div class="nav-tile right">
    ${utils.map(([icon, title]) => `<div class="nav-item util"><a href="#" title="${title}"><b class="${icon} system"></b><span>${title}</span></a></div>`).join("")}
  </div>
</div>
${content}
</body></html>`;
}

function dashboardPage() {
  const { tile, tail } = tileMarkup();
  const controls = (icons) => `<span class='tile-header-right'><span class='tile-header-right-controls'>${icons
    .map((i) => `<i class='fa fa-fw fa-${i} control'></i>`)
    .join("")}</span></span>`;
  const header = (icon, title, sub, icons) =>
    `<tr><td><span class='tile-header'><span class='tile-header-left'><i class='${icon} f32'></i><div class='section'><h3 class='tile-header-main'>${title}</h3>${sub}</div></span>${controls(
      icons,
    )}</span></td></tr>`;
  const bar = (label, pct) =>
    `<tr><td><span class='w26'>${label}</span><span class='w72'><span class='load resize'>${pct}%</span><div class='usage-disk sys'><span style='width:${pct}%'></span><span></span></div></span></td></tr>`;
  const containers = ["homeassistant", "immich", "jellyfin", "nextcloud", "paperless", "uptime-kuma", "vaultwarden", "bombvault"];
  const column1 = `
<tbody class='system'>
${header("icon-performance", "Tower", "<span>Media server</span><span class='switch head_time'></span><br>", ["cog", "wrench tile", "eject", "chevron-up"])}
<tr><td><div class='leftside'>
<span style='font-size:3rem'>10:16</span><br><span>Saturday, 3 October 2026</span><br><br>
<span class='header'><i class='indent fa fa-file-text-o'></i>Model</span><br><i class='indent'></i>Custom<br><br>
<span class='header'><i class='indent fa fa-id-badge'></i>Registration</span><br><i class='indent'></i>Unraid OS <b><em>Pro</em></b><br><br>
<span class='header'><i class='indent fa fa-clock-o'></i>Uptime</span><br><i class='indent'></i>12 days, 4 hours, 9 minutes
</div><div class='rightside'><i class='fa fa-hdd-o' style='font-size:96px;opacity:.85'></i></div></td></tr>
</tbody>
<tbody title="Processor">
${header("icon-cpu", "Processor", "<span>AMD Ryzen 7 5700G</span>", ["cog", "chevron-up"])}
${bar("Overall Load:", 7)}${bar("CPU 0 - HT 8", 12)}${bar("CPU 1 - HT 9", 4)}${bar("CPU 2 - HT 10", 9)}${bar("CPU 3 - HT 11", 3)}
<tr><td></td></tr>
</tbody>`;
  const column2 = `${tile}
<tbody title="Docker Containers">
${header("icon-docker", "Docker Containers", "<span>8 started, 0 stopped</span>", ["cog", "chevron-up"])}
<tr><td>${containers
    .map((c) => `<span class='w44' style='padding:3px 0'><i class='fa fa-play green-text' style='margin-right:8px'></i>${c}</span>`)
    .join("")}</td></tr>
</tbody>`;
  const content = `<div id="displaybox"><div class="content"><div class='frame'><div class='grid'>
<div class='tile' id='tile1' style='display:block'><table id='db_box1' class='dashboard'>${column1}</table></div>
<div class='tile' id='tile2' style='display:block'><table id='db_box2' class='dashboard'>${column2}</table></div>
</div></div></div></div>
${tail}`;
  return unraidPage("Dashboard", '<link rel="stylesheet" href="/webGui/sheets/DashStats.css">', content);
}

function settingsPage() {
  const title = `<div class="title"><span class='left inline-flex flex-row items-center gap-1'><img src='/plugins/bombvaultwidget/icons/bombvaultwidget.png' class='icon' style='max-width: 18px; max-height: 18px; width: auto; height: auto; object-fit: contain;'>BombVault Widget</span><span class="right inline-flex flex-row items-center gap-1"></span></div>`;
  return unraidPage("Settings", "", `<div id="displaybox"><div class="content">${title}${settingsMarkup()}</div></div>`);
}

const MIME = { css: "text/css", js: "text/javascript", png: "image/png", woff: "font/woff", svg: "image/svg+xml", json: "application/json" };

async function serve(route) {
  const { pathname } = new URL(route.request().url());
  if (pathname === "/Dashboard") return route.fulfill({ contentType: "text/html", body: dashboardPage() });
  if (pathname === "/Settings/bombvaultwidget") return route.fulfill({ contentType: "text/html", body: settingsPage() });
  if (pathname === "/plugins/bombvaultwidget/server/status.php") return route.fulfill({ json: FEED });
  if (pathname.startsWith("/plugins/bombvaultwidget/")) {
    return route.fulfill({ path: join(plugin, pathname.slice("/plugins/bombvaultwidget/".length)) });
  }
  if (pathname.startsWith("/webGui/")) {
    const rel = pathname.slice("/webGui/".length);
    const body = await cached(`webgui-${rel}`, `${WEBGUI}/${rel}`);
    return route.fulfill({ body, contentType: MIME[rel.split(".").pop()] ?? "application/octet-stream" });
  }
  return route.fulfill({ status: 404, body: "" });
}

async function page(browser, { path }) {
  const ctx = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    locale: "en-GB",
    timezoneId: "Europe/Vienna",
  });
  await ctx.route(`${ORIGIN}/**`, serve);
  const tab = await ctx.newPage();
  await tab.clock.setFixedTime(new Date(NOW));
  await tab.goto(ORIGIN + path);
  await tab.evaluate(() => document.fonts.ready);
  if (path === "/Dashboard") {
    await tab.waitForSelector("#bvd-log .bvd-row");
  } else {
    await tab.getByRole("button", { name: strings.s_test }).click();
    await tab.waitForSelector("#bvd-test-result.ok");
  }
  // Stops the pulse of the live line, so it is shot at full opacity.
  await tab.addStyleTag({ content: ".bvd-live .bvd-g { animation: none !important; }" });
  await tab.waitForTimeout(400);
  const png = await tab.screenshot();
  await ctx.close();
  return png;
}

function frame(shot, png) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Bree Serif"; src: url(${bree}); }
@font-face { font-family: Lato; src: url(${lato}); }
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; font-family: Lato, sans-serif; background: #0c0c0b; }
.backdrop, .backdrop * { position: absolute; }
.backdrop { inset: 0; overflow: hidden; }
.wall { inset: 0; background: radial-gradient(55% 60% at 62% 35%, #26231d, #0f0e0c 72%); }
.mark { left: -9%; top: -4%; width: 46%; transform: rotate(-10deg); opacity: .32;
  filter: grayscale(1) brightness(.36) contrast(1.2) drop-shadow(-2px -2px 0 rgba(255,255,255,.16)) drop-shadow(12px 18px 26px rgba(0,0,0,.85)); }
.vignette { inset: 0; box-shadow: inset 0 0 200px rgba(0,0,0,.6); }
.copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 330px; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
.copy img { width: 72px; }
h1 { font: 400 46px/1.14 "Bree Serif", serif; color: #f4f4f4; text-wrap: balance; }
h1 em { font-style: normal; color: #FCC419; }
.copy p { font-size: 21px; color: #9d9481; }
.stage { position: absolute; left: 470px; top: ${(H - VIEW_H - BAR_H) / 2}px; width: ${VIEW_W}px; height: ${VIEW_H + BAR_H}px; perspective: 2400px; }
.floor { position: absolute; left: 6%; right: 6%; bottom: -34px; height: 60px; border-radius: 50%; background: rgba(0,0,0,.75); filter: blur(28px); }
.win { position: absolute; inset: 0; border-radius: 12px; background: #1c1c1c; transform: rotateY(-7deg) rotateX(3deg);
  box-shadow: 0 0 0 1px #333, 0 1px 0 1px rgba(255,255,255,.05), 0 2px 4px rgba(0,0,0,.35), 0 16px 32px rgba(0,0,0,.4), 0 48px 96px rgba(0,0,0,.5); }
.bar { height: ${BAR_H}px; display: flex; align-items: center; gap: 16px; padding: 0 16px; border-radius: 12px 12px 0 0;
  background: linear-gradient(#242424, #1c1c1c); border-bottom: 1px solid #0e0e0e; }
.dots { display: flex; gap: 8px; } .dots i { width: 12px; height: 12px; border-radius: 50%; background: #3d3d3d; }
.nav { display: flex; gap: 14px; color: #7c7c7c; } .nav svg { width: 16px; height: 16px; display: block; }
.url { flex: 1; height: 30px; border-radius: 15px; background: #2b2b2b; color: #b4b4b4; font-size: 14px; display: flex; align-items: center; gap: 8px; padding: 0 16px; }
.url svg { width: 12px; height: 12px; color: #7c7c7c; }
.more { color: #7c7c7c; font-size: 18px; }
.view img { display: block; border-radius: 0 0 12px 12px; }
</style></head><body>
<div class="backdrop"><div class="wall"></div><img class="mark" src="${logo}"><div class="vignette"></div></div>
<div class="copy"><img src="${logo}"><h1>${shot.caption}</h1><p>${SUB}</p></div>
<div class="stage">
  <div class="floor"></div>
  <div class="win">
    <div class="bar">
      <div class="dots"><i></i><i></i><i></i></div>
      <div class="nav">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 3 5 8l5 5"/></svg>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 3 5 5-5 5"/></svg>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5"/></svg>
      </div>
      <div class="url"><svg viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="5" width="8" height="6" rx="1.2"/><path d="M4 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>${new URL(ORIGIN).host}${shot.path}</div>
      <div class="more">&#8942;</div>
    </div>
    <div class="view"><img src="${dataUrl(png, "image/png")}" width="${VIEW_W}" height="${VIEW_H}"></div>
  </div>
</div>
</body></html>`;
}

const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const png = await page(browser, shot);
    const canvas = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await canvas.setContent(frame(shot, png));
    await canvas.evaluate(() => document.fonts.ready);
    await canvas.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    await canvas.screenshot({ path: join(out, shot.file) });
    await canvas.close();
    console.log(`wrote ${shot.file}`);
  }
} finally {
  await browser.close();
}
