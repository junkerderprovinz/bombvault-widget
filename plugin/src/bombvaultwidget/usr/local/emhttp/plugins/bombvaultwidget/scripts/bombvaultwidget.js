/* Fills the BombVault Activity dashboard tile.
 *
 * Polls the same-origin proxy (server/status.php, which calls BombVault's
 * GET /api/widget/data) and renders the activity log into #bvd-log. The lines
 * read as BombVault's own activity log does in Unraid's language, with the
 * glyphs and colour buckets of BombVault's embeddable widget. The timestamp is
 * a locale-default short date via Intl (e.g. "26/07 05:02:19").
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

  // The lines are BombVault's own log lines in Unraid's language. The page
  // hands over the strings, copied from BombVault's translations by
  // plugin/lang_from_bombvault.mjs.
  var T = window.BVD_T || {};
  function t(key, params) {
    var s = T[key] || key;
    for (var p in params) s = s.split("{" + p + "}").join(params[p]);
    return s;
  }

  // Items carry the singular domain, domain-wide runs the plural one.
  var DOMAINS = {
    containers: "Containers", container: "Containers", vms: "VMs", vm: "VMs",
    flash: "Flash", config: "Config", files: "Files", zfs: "ZFS", everything: "Everything"
  };
  var JOBS = {
    backup: "Backup", offsite: "Offsite", drill: "Drill", tamper: "Tamper",
    digest: "Digest", watchdog: "Watchdog", receiver: "Receiver", fleet: "Fleet",
    pull: "Pull", replica: "Replica"
  };
  // What happens to the key of the backups is recorded as a run of its own.
  var KEY_EVENTS = {
    keyread: "Read", keyadopt: "Adopt", keysignins: "SignIns",
    keysettings: "Settings", keyundo: "Undo"
  };

  function domainLabel(d) { return DOMAINS[d] ? t("activityLog.domain" + DOMAINS[d]) : d; }
  function jobLabel(j) { return JOBS[j] ? t("activityLog.job" + JOBS[j]) : j; }

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
  function other(name, r) { return t("activityLog.lineOther", { name: name, kind: r.kind, status: r.status }); }
  // The stored reason repeats what the line already says.
  function dumpReason(msg) {
    var head = "database dump failed: ";
    return msg.indexOf(head) === 0 ? msg.slice(head.length) : msg;
  }
  // The success or failure line of a kind, null for any other status.
  function outcome(r, ok, failed, name) {
    return r.status === "success" ? t("activityLog.line" + ok, name) :
      r.status === "failed" ? t("activityLog.line" + failed, name) : null;
  }
  function lineText(r) {
    var duration = fmtDur(((r.finishedAt != null ? r.finishedAt : r.startedAt) - r.startedAt));
    var dom = domainLabel(r.domain);
    var name = r.target || dom;
    var p = { domain: dom, name: name, duration: duration, bytes: fmtBytes(r.bytes), error: r.error };
    if (KEY_EVENTS[r.kind]) {
      var what = t("run.kindKey" + KEY_EVENTS[r.kind]);
      return r.status === "failed" ? t("activityLog.lineKeyRefused", { what: what, error: r.error }) : what;
    }
    var line;
    switch (r.kind) {
      case "prune": line = outcome(r, "PruneSuccess", "PruneFailed", p); break;
      case "verify": line = outcome(r, "VerifySuccess", "VerifyFailed", p); break;
      case "offsite": line = outcome(r, "OffsiteSuccess", "OffsiteFailed", p); break;
      case "drill": line = outcome(r, "DrillSuccess", "DrillFailed", p); break;
      case "drdrill": line = outcome(r, "DRDrillSuccess", "DRDrillFailed", p); break;
      case "tamper":
        line = r.status === "skipped" ? t("activityLog.lineTamperSkipped", p) : outcome(r, "TamperSuccess", "TamperFailed", p);
        break;
      case "export": line = outcome(r, "ExportSuccess", "ExportFailed", p); break;
      case "dbdump":
        if (r.status === "success" && r.error) { p.note = r.error; return t("activityLog.lineDbDumpNote", p); }
        p.error = dumpReason(r.error || "");
        line = outcome(r, "DbDumpSuccess", "DbDumpFailed", p);
        break;
      case "dbdumpsave": line = outcome(r, "DbDumpSaved", "DbDumpSaveFailed", p); break;
      case "dbimport": line = outcome(r, "DbImported", "DbImportFailed", p); break;
      case "import": line = outcome(r, "ImportSuccess", "ImportFailed", p); break;
      case "replica": line = outcome(r, "ReplicaSuccess", "ReplicaFailed", p); break;
      case "restore": line = outcome(r, "RestoreSuccess", "RestoreFailed", p); break;
      case "update": line = outcome(r, "UpdateSuccess", "UpdateFailed", p); break;
      default: // backup, and any kind this tile does not know yet
        line = r.status === "skipped" ? t("activityLog.lineBackupSkipped", p) : outcome(r, "BackupSuccess", "BackupFailed", p);
    }
    return line || other(r.kind in { prune: 1, verify: 1, offsite: 1, drill: 1, drdrill: 1, tamper: 1, export: 1 } ? dom : name, r);
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
        var q = { job: jobLabel(next.job), time: fmtClock(at), countdown: fmtDur((at - Date.now()) / 1000) };
        if (next.domain) q.domain = domainLabel(next.domain);
        var text = t(next.domain ? "activityLog.lineNextWithDomain" : "activityLog.lineNextNoDomain", q);
        frag.appendChild(row(fmtTs(nowSec), "▶", "bvd-idle", text, true));
      } else if (runs.length === 0) {
        frag.appendChild(row(fmtTs(nowSec), "▶", "bvd-idle", t("activityLog.lineEmpty"), true));
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
          offlineMsg = (r.d && r.d.error) ? r.d.error : t("t_unreachable", { status: r.status });
        }
        render();
      })
      .catch(function () {
        offlineMsg = t("t_retrying");
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
