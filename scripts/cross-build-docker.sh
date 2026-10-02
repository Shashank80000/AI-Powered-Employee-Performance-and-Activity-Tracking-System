#!/bin/bash
# Builds the Linux (.AppImage, .deb) and Windows (.zip) desktop agent packages in Docker, so a Mac can
# publish downloads for every system. Then publish them with:  npm run agent:publish -- --from <out dir>
#
#   scripts/cross-build-docker.sh <server address> <out dir>
#   scripts/cross-build-docker.sh 192.168.0.102:4000 /tmp/workplus-out
#
# Windows is a .zip (unzip and run): the .exe installer needs wine, which crashes under x64 emulation
# on Apple Silicon. Build the .exe on a Windows PC with `npm run agent:publish -- --server <address>`.
# Docker Desktop can't read ~/Documents (macOS privacy), so the source is copied to a temp folder first
# (without node_modules or .env files).
set -euo pipefail
if [ "${INSIDE_BUILDER:-}" = "1" ]; then
  mkdir -p /build && cd /src && tar -cf - . | (cd /build && tar xf -)
  cd /build
  npm ci -w @tracker/desktop-agent --no-audit --no-fund
  # get-windows: Linux needs no binary; Windows needs its published prebuilt one.
  (cd node_modules/get-windows && npx --yes @mapbox/node-pre-gyp install --target_platform=win32 --target_arch=x64 --target_libc=unknown)
  COMMON=(-c.extraMetadata.workplus.apiUrl="$API_URL" -c.electronVersion="$(node -p "require('electron/package.json').version")"
          -c.npmRebuild=false -c.win.signAndEditExecutable=false --publish never --x64)
  npm run dist -w @tracker/desktop-agent -- "${COMMON[@]}" --linux AppImage deb
  npm run dist -w @tracker/desktop-agent -- "${COMMON[@]}" --win zip
  cp desktop-agent/release/*.AppImage desktop-agent/release/*.deb desktop-agent/release/*-win-*.zip /out/
  exit 0
fi

ADDRESS="${1:?Usage: $0 <server address> <out dir>}"
OUT="$(mkdir -p "${2:?Usage: $0 <server address> <out dir>}" && cd "$2" && pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="$(node --input-type=module -e "import { normalizeServerUrl } from '$ROOT/desktop-agent/src/utils/serverUrl.js'; console.log(normalizeServerUrl(process.argv[1]))" "$ADDRESS")"
SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
(cd "$ROOT" && tar --exclude='./node_modules' --exclude='*/node_modules' --exclude='./desktop-agent/release' --exclude='./server/storage' \
  --exclude='./client/dist' --exclude='*/.venv' --exclude='.env' --exclude='.env.*' --exclude='*/.env.backup' -cf - .) | (cd "$SRC" && tar xf -)
cp "$ROOT/scripts/cross-build-docker.sh" "$SRC/build.sh"
echo "Building Linux and Windows packages for $API_URL (x64 emulation on Apple Silicon takes a few minutes) ..."
docker run --rm --platform linux/amd64 -e INSIDE_BUILDER=1 -e API_URL="$API_URL" -v "$SRC":/src:ro -v "$OUT":/out \
  electronuserland/builder:wine bash /src/build.sh
ls -la "$OUT"
