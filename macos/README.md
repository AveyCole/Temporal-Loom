# Temporal Loom for macOS

Apple Silicon desktop port of AveyCole/Temporal-Loom, using Electron and the existing shared visual instrument.

Run `macos/build.sh` from a checkout with Node.js 22 or later installed. The app is produced in `macos/dist/Temporal Loom-darwin-arm64/`. Install by copying Temporal Loom.app to Applications.

Included: shared effects and type tools, file imports, microphone input, browser MIDI, native folder selection, snapshot/session saves, native clip saving, archive/Wikipedia search, media relay and fullscreen.

Limitations: Google Images automated search is unavailable; Open Google Images opens the system browser. Recording saves the format supported by Chromium (usually WebM); this port does not bundle FFmpeg for MP4 conversion. Windows ASIO, window capture, and detached display are not ported. Live website extraction supports ordinary image/video src attributes. Network providers may independently restrict requests. MIDI, microphone hardware, and live provider searches need interactive verification.

The app is locally packaged and ad hoc signed, without Apple notarization. The restricted build environment could not launch the GUI because macOS application registration aborted before app code ran. Page JavaScript syntax, dependency audit, packaging, architecture, and bundle verification were checked.
