#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node port.mjs
rm -rf macos/assets macos/web-template
cp -R assets macos/assets
cp -R web-template macos/web-template
node --input-type=module <<'JS'
import fs from 'node:fs';
const page='macos/assets/index.html';
fs.writeFileSync(page,fs.readFileSync(page,'utf8').replace('<script>','<script>'+fs.readFileSync('macos/bridge.js','utf8')+'\n').replaceAll('Android MIDI','macOS MIDI').replaceAll('this Android WebView','this macOS runtime').replace('hidden>Share clip</button>','hidden>Show saved clip</button>'));
JS
cd macos
npm ci
npm run package

codesign --force --deep --sign - "dist/Temporal Loom-darwin-arm64/Temporal Loom.app"
codesign --verify --deep --strict "dist/Temporal Loom-darwin-arm64/Temporal Loom.app"
