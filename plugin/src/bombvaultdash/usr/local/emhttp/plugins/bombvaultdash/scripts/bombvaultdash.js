/* BombVault Activity — dashboard tile filler.
 *
 * Polls the same-origin proxy (server/status.php -> BombVault's
 * GET /api/widget/data) and renders the activity log into #bvd-log. The line
 * composition deliberately MIRRORS BombVault's own embeddable widget
 * (internal/api/widget.html), so the tile shows the exact same English lines
 * as the app's widget: same label tables, same finished-line templates, same
 * glyphs and colour buckets. Only the timestamp differs by design — the
 * locale-default short date via Intl (e.g. "26/07 05:02:19").
 *
 * Safety: every value from the feed (names, errors) is written via
 * textContent — no HTML injection path. The token never reaches this browser
 * code; it stays server-side in the proxy.
 */
(function () {
  "use strict";

  var POLL_MS = 10000;    // matches the widget's own 10s cadence
  var MIN_POLL_MS = 2000; // hard floor — never poll the proxy faster than 2s
  // Auto-follow slack: mirrors the widget's BOTTOM_THRESHOLD_PX — within this
  // many px of the bottom counts as "following", so a user who scrolled up to
  // read history is never yanked back down.
  var FOLLOW_SLACK = 24;
  var PROXY = "/plugins/bombvaultdash/server/status.php";

  var logEl = null;
  var lastData = null;   // last good feed — kept on outages so history stays
  var offlineMsg = "";   // non-empty = proxy/feed error to show as live line
  var firstRender = true;

  // ---- English label tables (mirrors widget.html / activityLog.ts) ---------
  var DOMAIN_LABELS = {
    containers: "Containers", vms: "VMs", flash: "Flash",
    config: "Self-Backup", files: "Folders"
  };
  var JOB_LABELS = {
    backup: "backup", offsite: "off-site replication",
    drill: "restore-verification drill", tamper: "tamper test",
    digest: "weekly digest"
  };

  function domainLabel(d) { return DOMAIN_LABELS[d] || d; }

  // ---- tiny formatters -----------------------------------------------------
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Locale-default short date + 24h time, e.g. "26/07 05:02:19" (en-GB),
  // "26.07. 05:02:19" (de). Falls back to DD/MM like the widget if Intl is
  // unavailable for any reason.
  var dayFmt = null, timeFmt = null;
  try {
    dayFmt = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit" });
    timeFmt = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
  } catch (e) { dayFmt = timeFmt = null; }
  function fmtTs(sec) {
    var d = new Date(sec * 1000);
    if (dayFmt && timeFmt) return dayFmt.format(d) + " " + timeFmt.format(d);
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function fmtClock(ms) {
    var d = new Date(ms);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60), sec = s % 60;
    if (m < 60) return sec ? m + "m " + sec + "s" : m + "m";
    var h = Math.floor(m / 60), mm = m % 60;
    return mm ? h + "h " + mm + "m" : h + "h";
  }
  function fmtBytes(n) {
    if (!n || n <= 0) return "0 B";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var v = n, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(1)) + " " + units[i];
  }

  // ---- line composition (mirrors widget.html finishedLineText) -------------
  function bucket(r) {
    if (r.status === "success") return r.kind === "offsite" ? "offsite" : "ok";
    if (r.status === "failed") return "fail";
    return "info"; // skipped + anything unexpected
  }
  function glyph(b) {
    return b === "ok" ? "✓" : b === "fail" ? "✗" :
      b === "offsite" ? "↗" : "ⓘ";
  }
  function cls(b) { return b === "ok" ? "bvd-ok" : b === "fail" ? "bvd-fail" : "bvd-info"; }
  function other(name, r) { return name + " " + r.kind + " — " + r.status; }
  function lineText(r) {
    var dur = fmtDur(((r.finishedAt != null ? r.finishedAt : r.startedAt) - r.startedAt));
    var dom = domainLabel(r.domain);
    var name = r.target || dom;
    var ok = r.status === "success", failed = r.status === "failed";
    switch (r.kind) {
      case "prune":
        return ok ? "Retention prune done — " + dom :
          failed ? "Prune failed — " + dom + ": " + r.error : other(dom, r);
      case "verify":
        return ok ? "Verify passed — " + dom :
          failed ? "Verify failed — " + dom + ": " + r.error : other(dom, r);
      case "offsite":
        return ok ? "Off-site replication done — " + dom + " (" + dur + ")" :
          failed ? "Off-site replication failed — " + dom + ": " + r.error : other(dom, r);
      case "drill":
        return ok ? "Restore check passed — " + dom :
          failed ? "Restore check failed — " + dom + ": " + r.error : other(dom, r);
      case "drdrill":
        return ok ? "Off-site DR restore verified — " + dom :
          failed ? "Off-site DR restore FAILED — " + dom + ": " + r.error : other(dom, r);
      case "tamper":
        return ok ? "Tamper test passed — " + dom + " (delete refused)" :
          failed ? "Tamper test FAILED — " + dom + " is not append-only: " + r.error :
          r.status === "skipped" ? "Tamper test skipped — " + dom + ": " + r.error : other(dom, r);
      case "export":
        return ok ? "Flash ZIP export done — " + fmtBytes(r.bytes) + " (" + dur + ")" :
          failed ? "Flash ZIP export failed — " + r.error : other(dom, r);
      case "restore":
        return ok ? name + " restored — " + dur :
          failed ? name + " restore failed — " + r.error : other(name, r);
      case "update":
        return ok ? name + " updated — " + dur :
          failed ? name + " update failed — " + r.error : other(name, r);
      default: // backup (and any future kind falls back to the same shape)
        if (ok) return name + " backed up — " + fmtBytes(r.bytes) + " in " + dur;
        if (failed) return name + " backup failed — " + r.error;
        if (r.status === "skipped") return name + " backup skipped — " + r.error;
        return other(name, r);
    }
  }

  // ---- rendering -----------------------------------------------------------
  function row(ts, g, c, text, live) {
    var div = document.createElement("div");
    div.className = "bvd-row" + (live ? " bvd-live" : "");
    var t = document.createElement("span"); t.className = "bvd-ts"; t.textContent = ts;
    var gl = document.createElement("span"); gl.className = "bvd-g " + c; gl.textContent = g;
    var m = document.createElement("span"); m.className = "bvd-msg " + c; m.textContent = text;
    m.title = text; // full text on hover — lines are single-row ellipsized
    div.appendChild(t); div.appendChild(gl); div.appendChild(m);
    return div;
  }

  function isAtBottom() {
    return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight <= FOLLOW_SLACK;
  }

  function render() {
    var follow = firstRender || isAtBottom();
    var frag = document.createDocumentFragment();

    // Finished runs only, oldest first — newest ends up at the BOTTOM.
    var runs = ((lastData && lastData.runs) || []).filter(function (r) {
      return r.finishedAt != null;
    });
    runs.sort(function (a, b) {
      return (a.finishedAt - b.finishedAt) || (a.startedAt - b.startedAt);
    });
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i], b = bucket(r);
      frag.appendChild(row(fmtTs(r.finishedAt), glyph(b), cls(b), lineText(r)));
    }

    // Trailing LIVE line (pulsing): an outage/config problem wins; otherwise
    // the soonest scheduled fire ("next: …"); otherwise "nothing yet".
    var nowSec = Date.now() / 1000;
    if (offlineMsg) {
      frag.appendChild(row(fmtTs(nowSec), "✗", "bvd-fail", offlineMsg, true));
    } else {
      var next = ((lastData && lastData.next) || [])[0];
      if (next) {
        var at = new Date(next.next).getTime();
        var text = "next: " + (JOB_LABELS[next.job] || next.job) +
          (next.domain ? " (" + domainLabel(next.domain) + ")" : "") +
          " at " + fmtClock(at) + " (in " + fmtDur((at - Date.now()) / 1000) + ")";
        frag.appendChild(row(fmtTs(nowSec), "▶", "bvd-idle", text, true));
      } else if (runs.length === 0) {
        frag.appendChild(row(fmtTs(nowSec), "▶", "bvd-idle", "nothing yet", true));
      }
    }

    logEl.textContent = "";
    logEl.appendChild(frag);
    if (follow) logEl.scrollTop = logEl.scrollHeight;
    firstRender = false;
  }

  // ---- polling -------------------------------------------------------------
  function poll() {
    fetch(PROXY, { cache: "no-store", headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, d: d }; });
      })
      .then(function (r) {
        if (r.d && r.d.ok) {
          lastData = r.d;
          offlineMsg = "";
        } else {
          // proxy 503 / BombVault refusal — keep the history, flag the outage
          offlineMsg = (r.d && r.d.error) ? r.d.error : "BombVault unreachable (HTTP " + r.status + ")";
        }
        render();
      })
      .catch(function () {
        offlineMsg = "BombVault unreachable — retrying";
        render();
      });
  }

  function start() {
    logEl = document.getElementById("bvd-log");
    if (!logEl) return; // tile unchecked in tile management — nothing to do
    poll();
    setInterval(poll, Math.max(MIN_POLL_MS, POLL_MS));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
