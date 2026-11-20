#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
node prepare.mjs
npm ci
bash build-ffmpeg.sh
npm run verify
npm run package
codesign --force --sign - "dist/Temporal Loom-darwin-arm64/Temporal Loom.app/Contents/Resources/app/vendor/ffmpeg"
codesign --force --deep --sign - "dist/Temporal Loom-darwin-arm64/Temporal Loom.app"
codesign --verify --deep --strict "dist/Temporal Loom-darwin-arm64/Temporal Loom.app"
