#!/usr/bin/env bash
# 前置: bun run app:build 已完成
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:?usage: package-release.sh <version>}"
NAME="Spider-${VERSION}-portable-x64"
OUT="$ROOT/dist-release"
STAGE="$OUT/$NAME"

rm -rf "$OUT"
mkdir -p "$STAGE/seed"

cp src-tauri/target/release/spider.exe "$STAGE/Spider.exe"
cp src-tauri/target/release/spider-server.exe "$STAGE/spider-server.exe"
cp -r dist "$STAGE/dist"
cp packaging/seed-settings.json "$STAGE/seed/settings.json"
cp packaging/使用说明.txt "$STAGE/使用说明.txt"

cp src-tauri/target/release/bundle/nsis/Spider_${VERSION}_x64-setup.exe "$OUT/"

cd "$OUT"
python -m zipfile -c "$NAME.zip" "$NAME"
sha256sum "$NAME.zip" "Spider_${VERSION}_x64-setup.exe" > SHA256SUMS.txt

cat SHA256SUMS.txt
ls -la "$OUT"
