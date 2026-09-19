<?php
/* Same-origin proxy for the dashboard tile: the browser calls this, and this
 * calls BombVault's widget feed, so there is no cross-origin request and the
 * widget token never reaches the browser.
 *
 *   GET status.php  ->  GET {BV_URL}/api/widget/data   (X-Widget-Token header)
 *
 * The path is hard-coded and no request parameter can change the target, so
 * the proxy cannot be steered anywhere else. On BombVault's side the widget
 * token grants read access to the activity log and schedule preview only.
 * Requires BombVault >= 6.9.0.
 */

require_once '/usr/local/emhttp/plugins/dynamix/include/Wrappers.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$cfg   = parse_plugin_cfg('bombvaultwidget');
$url   = isset($cfg['BV_URL'])       ? trim($cfg['BV_URL'])       : '';
$token = isset($cfg['WIDGET_TOKEN']) ? trim($cfg['WIDGET_TOKEN']) : '';

/* People paste BombVault's full widget URL (http://host:port/widget?token=abc…)
 * into the token field. The settings page extracts the token on save; this
 * covers older or hand-edited cfgs. A bare token never contains "://", so only
 * URL-shaped values are touched. */
if (strpos($token, '://') !== false && preg_match('/[?&#]token=([^&#\s]+)/i', $token, $m)) {
    $token = rawurldecode($m[1]);
}

if ($url === '' || $token === '') {
    http_response_code(503);
    echo json_encode(array(
        'ok'    => false,
        'error' => 'not configured, set the BombVault URL and widget token in Settings',
    ));
    exit;
}
if (!preg_match('#^https?://#i', $url)) {
    http_response_code(503);
    echo json_encode(array(
        'ok'    => false,
        'error' => 'invalid BombVault URL, it must start with http:// or https://',
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
    // BombVault's WebUI on port 3443 serves a self-signed certificate, since
    // there is no CA-signed one for a private IP. TLS still encrypts this
    // server-to-server hop on the LAN, but the peer cannot be CA-verified.
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
            ? 'BombVault rejected the widget token (HTTP 403); regenerate it in BombVault → Settings → System → Dashboard widget'
            : 'BombVault answered HTTP ' . $code,
    ));
    exit;
}

// Healthy: pass BombVault's JSON envelope straight through
// ({ok:true, version, runs:[...], next:[...]}).
echo $body;
