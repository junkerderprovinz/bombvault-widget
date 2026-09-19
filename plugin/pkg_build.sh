#!/bin/bash
# Builds the BombVault Widget plugin package (.txz), webgui files only. It uses
# tar rather than Slackware's makepkg, so it runs the same on GitHub CI and
# locally, git-bash included.
#
#   plugin/pkg_build.sh [VERSION]      # VERSION defaults to today (YYYY.MM.DD)
#
# Output: plugin/out/bombvaultwidget-<version>-x86_64-1.txz (+ .sha256). The
# release workflow attaches the .txz and injects the SHA256 into
# bombvaultwidget.plg.
set -euo pipefail

VERSION="${1:-$(date +%Y.%m.%d)}"
ARCH="x86_64"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_SRC="$ROOT/plugin/src/bombvaultwidget"
OUT="$ROOT/plugin/out"
PKGROOT="$(mktemp -d)"
trap 'rm -rf "$PKGROOT"' EXIT

echo "==> assembling package tree"
cp -a "$PLUGIN_SRC/." "$PKGROOT/"

# Unraid's PageBuilder splits a .page header on a pure-LF "\n---\n", so a CRLF
# page never parses and is dropped, and a trailing CR breaks shebangs. This
# covers a Windows or autocrlf checkout that .gitattributes did not.
echo "==> normalising text files to LF"
find "$PKGROOT" -type f ! -name '*.png' -print0 \
  | while IFS= read -r -d '' f; do perl -i -pe 's/\r\n/\n/g; s/\r$//' "$f"; done

mkdir -p "$OUT"
TXZ="$OUT/bombvaultwidget-$VERSION-$ARCH-1.txz"
echo "==> packaging → $TXZ"
# --force-local: a Windows output path like "D:/..." has a colon that GNU tar
# would otherwise read as a remote host[:path]. Harmless on Linux/CI.
# --owner/--group/--numeric-owner: root:root on every entry including "./".
# Otherwise the builder's uid is baked in, and upgradepkg applies it to / on
# install, which breaks sshd StrictModes key auth ("bad ownership or modes for
# directory /").
tar --force-local --owner=0 --group=0 --numeric-owner -C "$PKGROOT" -caf "$TXZ" .

echo "==> sha256"
# A bare filename in the .sha256, not the build path, so `sha256sum -c` works
# for anyone who downloads it.
( cd "$OUT" && b="$(basename "$TXZ")" && sha256sum "$b" | tee "$b.sha256" )
echo "done: $TXZ"
