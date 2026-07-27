<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/junkerderprovinz/bombvault-widget/main/.github/assets/bombvault-widget-banner-dark.png">
    <img src="https://raw.githubusercontent.com/junkerderprovinz/bombvault-widget/main/.github/assets/bombvault-widget-banner.png" alt="BombVault Widget" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/junkerderprovinz/bombvault-widget/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/junkerderprovinz/bombvault-widget/release.yml?label=Release&style=for-the-badge&logo=githubactions&logoColor=white" alt="Release" height="36"></a>&nbsp;
  <a href="https://unraid.net"><img src="https://img.shields.io/badge/Unraid-Plugin-f15a2c?style=for-the-badge&logo=unraid&logoColor=white" alt="Unraid" height="36"></a>&nbsp;
  <a href="https://github.com/junkerderprovinz/bombvault"><img src="https://img.shields.io/badge/Requires-BombVault%20%E2%89%A5%206.9.0-161616?style=for-the-badge" alt="Requires BombVault 6.9.0+" height="36"></a>&nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License" height="36"></a>
</p>

<br>

<p align="center">
💣 <b>BombVault Widget</b> puts <a href="https://github.com/junkerderprovinz/bombvault">BombVault</a>'s activity log where you already look: a <b>real, native tile</b> on the Unraid&nbsp;7 <b>dashboard</b>. Every backup, restore, verify, prune, off-site replication and drill scrolls by as it happens — plus the <b>next scheduled run</b> — in the same dark terminal-style log as BombVault's own widget.<br>
<br>
<b>Read-only</b> — the tile is fed through a same-origin proxy; the widget token never reaches the browser.
</p>

<br>

<p align="center">
  <a href="https://buymeacoffee.com/junkerderprovinz">
    <img src="https://raw.githubusercontent.com/junkerderprovinz/bombvault-widget/main/.github/assets/button-buy-me-a-coffee.svg" alt="Buy me a coffee" width="220">
  </a>
</p>

<br>

## Table of Contents

1. [What is this?](#1-what-is-this)
2. [Screenshots](#2-screenshots)
3. [Requirements](#3-requirements)
4. [Install on Unraid](#4-install-on-unraid)
5. [Setup](#5-setup)
6. [How it works](#6-how-it-works)
7. [Security](#7-security)
8. [License](#8-license)

## 1. What is this?

A small Unraid plugin (no daemon, no container) that registers a native dashboard tile named **BombVault Activity**. The tile shows up in the dashboard's tile-management list like the built-in ones — hide it, move it between columns, collapse it. Its body is a fixed-height, scrollable, always-dark log (newest at the bottom, auto-follow unless you scroll up) whose lines mirror BombVault's own embeddable widget one-to-one: green for success, red for failures, blue for off-site replication, yellow for the pulsing "next: …" line.

## 2. Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/junkerderprovinz/bombvault-widget/main/.github/assets/screenshots/tile.png" alt="BombVault Activity tile on the Unraid dashboard" width="90%">
  <br><em>The BombVault Activity tile on the Unraid dashboard — every backup, restore and verify scrolls by in the dark terminal-style log, with the pulsing "next: …" line at the bottom.</em>
</p>

<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/junkerderprovinz/bombvault-widget/main/.github/assets/screenshots/settings.png" alt="BombVault Widget settings page" width="90%">
  <br><em>Settings under Utilities: BombVault URL + widget token with a one-click connection test, and a short note on how the tile behaves.</em>
</p>

## 3. Requirements

- **Unraid 6.12.0 or newer** (the tile uses the modern dashboard; built for Unraid 7).
- **[BombVault](https://github.com/junkerderprovinz/bombvault) 6.9.0 or newer** running on your network.
- A **widget token**, generated in BombVault → Settings → System → Dashboard widget.

## 4. Install on Unraid

*Community Applications listing: TODO — until the CA entry in [unraid-apps](https://github.com/junkerderprovinz/unraid-apps) is live, install via* **Plugins → Install Plugin** *with the raw `.plg` URL:*

```
https://raw.githubusercontent.com/junkerderprovinz/bombvault-widget/main/plugin/bombvaultwidget.plg
```

## 5. Setup

1. In **BombVault** open *Settings → System → Dashboard widget* and generate a widget token (copy it right away — it is shown only once).
2. In **Unraid** open *Settings → Utilities → BombVault Widget*, enter the BombVault URL (e.g. `https://192.168.20.51:3443`) and the token, hit **Apply**. Pasting BombVault's full widget URL (`…/widget?token=…`) into the token field works too — the token part is extracted automatically.
3. Click **Test connection** — it answers with the BombVault version when everything is wired.
4. Open the **Dashboard**: the *BombVault Activity* tile is live in the middle column.

## 6. How it works

- `bombvaultwidget.Dashboard.page` registers the tile (`Menu="Dashboard:0"` + `$mytiles`), a static scaffold with the native Unraid 7 tile header (chevron, an open-BombVault link once a URL is configured, cog to the settings page).
- `scripts/bombvaultwidget.js` polls `server/status.php` every 10 seconds and renders the log rows via `textContent` (no HTML from feed data ever runs).
- `server/status.php` is a same-origin proxy: it reads the URL + token from `/boot/config/plugins/bombvaultwidget/bombvaultwidget.cfg` and calls exactly one endpoint — BombVault's `GET /api/widget/data` — with the `X-Widget-Token` header, 5 s timeout, self-signed LAN TLS accepted. Unreachable or misconfigured = a clean JSON 503, which the tile shows as a pulsing red status line while keeping the history on screen.

## 7. Security

The widget token stays server-side: the browser only ever talks to the Unraid webgui (session-protected), and the proxy only ever talks to the one hard-coded BombVault endpoint — no request parameter can redirect it. On BombVault's side the token grants read-only access to the activity log and schedule preview, nothing else, and can be revoked/rotated any time in BombVault's settings. TLS peer verification is deliberately disabled for the LAN call because BombVault serves a self-signed certificate on a private address.

## 8. License

MIT — see [LICENSE](LICENSE).
