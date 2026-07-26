<?php
/* BombVault Dashboard same-origin proxy: the browser on the Dashboard calls
 * this PHP, and this PHP calls BombVault's widget feed — so the browser never
 * makes a cross-origin request (no CORS) and the widget token stays strictly
 * server-side (it is never sent to, or readable by, the browser).
 *
 *   GET status.php  ->  GET {BV_URL}/api/widget/data   (X-Widget-Token header)
 *
 * Allowlist: EXACTLY this one endpoint. The path is hard-coded and no request
 * parameter can change the target — the proxy can never be steered anywhere
 * else. The feed is read-only by construction on BombVault's side too (the
 * widget token grants access to the activity log + schedule preview, nothing
 * else). Requires BombVault >= 6.9.0.
 */

require_once '/usr/local/emhttp/plugins/dynamix/include/Wrappers.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$cfg   = parse_plugin_cfg('bombvaultdash');
$url   = isset($cfg['BV_URL'])       ? trim($cfg['BV_URL'])       : '';
$token = isset($cfg['WIDGET_TOKEN']) ? trim($cfg['WIDGET_TOKEN']) : '';

if ($url === '' || $token === '') {
    http_response_code(503);
    echo json_encode(array(
        'ok'    => false,
        'error' => 'not configured — set the BombVault URL and widget token in Settings',
    ));
    exit;
}
if (!preg_match('#^https?://#i', $url)) {
    http_response_code(503);
    echo json_encode(array(
        'ok'    => false,
        'error' => 'invalid BombVault URL — it must start with http:// or https://',
    ));
    exit;
}

$endpoint = rtrim($url, '/') . '/api/widget/data';

$ch = curl_init($endpoint);
curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_HTTPHEADER     => array(
        'X-Widget-Token: ' . $token,
        'Accept: application/json',
    ),
    // BombVault's WebUI on port 3443 serves a self-signed certificate on the
    // LAN (there is no CA-signed cert for a private IP). This proxy talks to
    // it server-to-server inside the same network, so TLS here provides
    // encryption but the peer cannot be CA-verified — accept it deliberately.
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
    // never follow a redirect off the configured host
    CURLOPT_FOLLOWLOCATION => false,
));
$body = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($body === false || $code === 0) {
    http_response_code(503);
    echo json_encode(array(
        'ok'    => false,
        'error' => 'BombVault unreachable' . ($err !== '' ? ' (' . $err . ')' : ''),
    ));
    exit;
}
if ($code !== 200) {
    // e.g. 403 = widget token missing/rotated/disabled in BombVault (the body
    // is plain text there, so wrap it in the JSON shape the tile expects).
    http_response_code(503);
    echo json_encode(array(
        'ok'    => false,
        'error' => $code === 403
            ? 'BombVault rejected the widget token (HTTP 403) — regenerate it in BombVault → Settings → System → Dashboard widget'
            : 'BombVault answered HTTP ' . $code,
    ));
    exit;
}

// Healthy: pass BombVault's JSON envelope straight through
// ({ok:true, version, runs:[...], next:[...]}).
echo $body;
