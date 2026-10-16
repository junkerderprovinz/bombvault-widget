/* Fills the BombVault Activity dashboard tile.
 *
 * Polls the same-origin proxy (server/status.php, which calls BombVault's
 * GET /api/widget/data) and renders the activity log into #bvd-log. The lines
 * mirror BombVault's embeddable widget (internal/api/widget.html): same label
 * tables, line templates, glyphs and colour buckets. Only the timestamp
 * differs, a locale-default short date via Intl (e.g. "26/07 05:02:19").
 *
 * Every value from the feed is written via textContent, and the token stays
 * in the proxy on the server.
 */
(function () {
  "use strict";

  var POLL_MS = 10000;    // matches the widget's own 10s cadence
  var MIN_POLL_MS = 2000;
  // As the widget's BOTTOM_THRESHOLD_PX: within this many px of the bottom
  // counts as following, so a user who scrolled up to read history stays there.
  var FOLLOW_SLACK = 24;
  var PROXY = "/plugins/bombvaultwidget/server/status.php";

  var logEl = null;
  var lastData = null;   // last good feed, kept through outages so history stays
  var offlineMsg = "";   // non-empty = proxy/feed error to show as live line
  var firstRender = true;

  // English label tables, as in widget.html and activityLog.ts. Items carry
  // the singular domain, domain-wide runs the plural one.
  var DOMAIN_LABELS = {
    containers: "Containers", container: "Containers", vms: "VMs", vm: "VMs",
    flash: "Flash", config: "Self-backup", files: "Folders", zfs: "ZFS",
    everything: "Full backup"
  };
  var JOB_LABELS = {
    backup: "backup", offsite: "off-site replication",
    drill: "restore-verification drill", tamper: "tamper test",
    digest: "weekly digest", watchdog: "overdue-backup check",
    receiver: "received-repo check", fleet: "instance check",
    pull: "pull from sources", replica: "ZFS replica"
  };
  // What happens to the key of the backups is recorded as a run of its own.
  var KEY_EVENTS = {
    keyread: "Key tried", keyadopt: "Key taken over",
    keysignins: "Sign-ins taken over", keysettings: "Settings taken over",
    keyundo: "Takeover undone"
  };

  function domainLabel(d) { return DOMAIN_LABELS[d] || d; }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Locale-default short date + 24h time, e.g. "26/07 05:02:19" (en-GB),
  // "26.07. 05:02:19" (de). Falls back to DD/MM, as the widget does, when Intl
  // is unavailable.
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

  // Line composition, as in widget.html's finishedLineText. The line texts
  // match the widget's own, dashes included.
  function bucket(r) {
    if (r.status === "success") return r.kind === "offsite" ? "offsite" : "ok";
    if (r.status === "failed") return "fail";
    return "info"; // skipped + anything unexpected
  }
  function glyph(b) {
    return b === "ok" ? "✓" : b === "fail" ? "✗" :
      b === "offsite" ? "↗" : "ⓘ";
  }
  function cls(b) {
    return b === "ok" ? "bvd-ok" : b === "fail" ? "bvd-fail" :
      b === "offsite" ? "bvd-offsite" : "bvd-info";
  }
  function other(name, r) { return name + " " + r.kind + ": " + r.status; }
  // The stored reason repeats what the line already says.
  function dumpReason(msg) {
    var head = "database dump failed: ";
    return msg.indexOf(head) === 0 ? msg.slice(head.length) : msg;
  }
  function lineText(r) {
    var dur = fmtDur(((r.finishedAt != null ? r.finishedAt : r.startedAt) - r.startedAt));
    var dom = domainLabel(r.domain);
    var name = r.target || dom;
    var ok = r.status === "success", failed = r.status === "failed";
    if (KEY_EVENTS[r.kind]) {
      return failed ? KEY_EVENTS[r.kind] + " refused: " + r.error : KEY_EVENTS[r.kind];
    }
    switch (r.kind) {
      case "prune":
        return ok ? "Retention prune done: " + dom :
          failed ? "Prune failed (" + dom + "): " + r.error : other(dom, r);
      case "verify":
        return ok ? "Verify passed: " + dom :
          failed ? "Verify failed (" + dom + "): " + r.error : other(dom, r);
      case "offsite":
        return ok ? "Off-site replication done: " + dom + " (" + dur + ")" :
          failed ? "Off-site replication failed (" + dom + "): " + r.error : other(dom, r);
      case "drill":
        return ok ? "Restore check passed: " + dom :
          failed ? "Restore check failed (" + dom + "): " + r.error : other(dom, r);
      case "drdrill":
        return ok ? "Off-site DR restore verified: " + dom :
          failed ? "Off-site DR restore failed (" + dom + "): " + r.error : other(dom, r);
      case "tamper":
        return ok ? "Tamper test passed: " + dom + " (delete refused)" :
          failed ? "Tamper test failed. " + dom + " is not append-only: " + r.error :
          r.status === "skipped" ? "Tamper test skipped (" + dom + "): " + r.error : other(dom, r);
      case "export":
        return ok ? "Flash ZIP export done: " + fmtBytes(r.bytes) + " (" + dur + ")" :
          failed ? "Flash ZIP export failed: " + r.error : other(dom, r);
      case "dbdump":
        if (ok) return r.error ? name + " database dumped (one database only)" :
          name + " database dumped - " + fmtBytes(r.bytes);
        return failed ? name + " database dump failed: " + dumpReason(r.error) : other(name, r);
      case "dbdumpsave":
        return ok ? name + " database dump saved - " + fmtBytes(r.bytes) :
          failed ? name + " database dump save failed: " + r.error : other(name, r);
      case "dbimport":
        return ok ? name + " database imported" :
          failed ? name + " database import failed: " + r.error : other(name, r);
      case "import":
        return ok ? name + ": Appdata.Backup archive imported (" + fmtBytes(r.bytes) + ", " + dur + ")" :
          failed ? name + ": Appdata.Backup import failed: " + r.error : other(name, r);
      case "replica":
        return ok ? name + " replicated: " + fmtBytes(r.bytes) + " in " + dur :
          failed ? name + " replica failed: " + r.error : other(name, r);
      case "restore":
        return ok ? name + " restored: " + dur :
          failed ? name + " restore failed: " + r.error : other(name, r);
      case "update":
        return ok ? name + " updated: " + dur :
          failed ? name + " update failed: " + r.error : other(name, r);
      default: // backup (and any future kind falls back to the same shape)
        if (ok) return name + " backed up: " + fmtBytes(r.bytes) + " in " + dur;
        if (failed) return name + " backup failed: " + r.error;
        if (r.status === "skipped") return name + " backup skipped: " + r.error;
        return other(name, r);
    }
  }

  // A container and a folder set can share a name, so a run's line names its
  // domain, as BombVault's own log does.
  function row(ts, g, c, text, live, dom) {
    var div = document.createElement("div");
    div.className = "bvd-row" + (live ? " bvd-live" : "");
    var t = document.createElement("span"); t.className = "bvd-ts"; t.textContent = ts;
    var gl = document.createElement("span"); gl.className = "bvd-g " + c; gl.textContent = g;
    var m = document.createElement("span"); m.className = "bvd-msg " + c; m.textContent = text;
    m.title = text; // lines are ellipsized to one row, so the full text goes on hover
    div.appendChild(t); div.appendChild(gl);
    if (dom) {
      var d = document.createElement("span"); d.className = "bvd-dom"; d.textContent = dom;
      div.appendChild(d);
    }
    div.appendChild(m);
    return div;
  }

  function isAtBottom() {
    return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight <= FOLLOW_SLACK;
  }

  function render() {
    var follow = firstRender || isAtBottom();
    var frag = document.createDocumentFragment();

    // Finished runs only, oldest first, so the newest ends up at the bottom.
    var runs = ((lastData && lastData.runs) || []).filter(function (r) {
      return r.finishedAt != null;
    });
    runs.sort(function (a, b) {
      return (a.finishedAt - b.finishedAt) || (a.startedAt - b.startedAt);
    });
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i], b = bucket(r);
      frag.appendChild(row(fmtTs(r.finishedAt), glyph(b), cls(b), lineText(r), false, domainLabel(r.domain)));
    }

    // The pulsing live line: an outage or config problem wins, then the
    // soonest scheduled run ("next: …"), then "nothing yet".
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
          // A proxy 503 or a BombVault refusal keeps the history and flags the outage.
          offlineMsg = (r.d && r.d.error) ? r.d.error : "BombVault unreachable (HTTP " + r.status + ")";
        }
        render();
      })
      .catch(function () {
        offlineMsg = "BombVault unreachable, retrying";
        render();
      });
  }

  function start() {
    logEl = document.getElementById("bvd-log");
    if (!logEl) return; // the tile is unchecked in tile management
    poll();
    setInterval(poll, Math.max(MIN_POLL_MS, POLL_MS));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
