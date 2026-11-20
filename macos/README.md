# Temporal Loom for macOS

macOS 13 or later, Apple Silicon desktop build of the current Temporal Loom shared engine (1.21). Download the Mac ZIP from the [download page](https://aveycole.github.io/Temporal-Loom/#downloads), unzip it, and drag Temporal Loom.app into Applications. The app is locally signed and is not Apple-notarized.

## Feature parity

| Feature | macOS implementation |
| --- | --- |
| Fragment deck, progressive loading, shuffle/reordering, tempo sync, organic variants, effects, type, Viewfinder | Generated from the same current source as Windows |
| Audio playback, video soundtracks, restoring previous audio | Shared engine plus native local soundtrack decoding |
| Local media and folder search | File import and recursive folder scanning; ranged video playback |
| Internet Archive, Wayback, Wikipedia, NASA, PeerTube, Commons | Shared searches and bounded media relay, including separate audio renditions |
| Live websites | Images, lazy image URLs, video sources, Open Graph media, and direct media links |
| Google Images | Isolated browser search and thumbnails; Open Google Images shows the browser for consent or provider issues |
| Microphone input | CoreAudio devices exposed by macOS; selectable input and exposed channels |
| Camera | Shared 1.21 camera stills, live feeds, and clips with a desktop camera device picker |
| MIDI | Selectable browser MIDI input with device connection updates |
| MP4 recording and local video soundtrack extraction | Bundled FFmpeg with software H.264 and AAC |
| Detached display and fullscreen | Shared desktop display code in a separate native window |
| Window/display capture | macOS system picker when available; a window/display picker fallback |

ASIO is specific to Windows. The Mac build uses CoreAudio devices; channel availability depends on the device and what Chromium exposes. Captured system audio depends on macOS and the selected sharing surface; the fallback picker supplies video. Native microphone, MIDI, screen capture permissions, multiple monitors, and provider consent still require interactive hardware checks. A provider can change or block its search responses.

## Build

Install Node.js 22 or later , Xcode Command Line Tools, and `pkg-config` (for example, `brew install pkg-config`), then run:

```sh
bash macos/build.sh
```

This regenerates the current desktop page, installs locked dependencies, compiles a small redistributable FFmpeg build from verified source, runs integration checks, packages the app, and verifies an ad hoc signature. The app lands in `macos/dist/Temporal Loom-darwin-arm64/`.

The preparation step uses `windows/desktop.mjs` and replaces its native bridge, so shared desktop controls and engine changes remain aligned. Generated assets, dependencies, FFmpeg binary, and build output are ignored by Git.

## Verification

The integration suite covers media byte ranges, recursive folder filtering, website response/session contracts, bounded provider bodies, separate video audio relaying, detached-display routing, current desktop integration points, MP4 conversion, and decoding a local video soundtrack. Run `npm run verify --prefix macos` after preparing assets and building FFmpeg.

## Third-party components

FFmpeg 9.0.2 is built with x264 (commit `31e19f92f00c7003fa115047ce50978bc98c3a0d`) and without nonfree components; this converter is licensed under GPL 2 or later. The app includes its licenses, build configuration, and source reference in `vendor/`; the unmodified FFmpeg and x264 source archives are provided with the Mac release. `macos/build-ffmpeg.sh` contains the exact build recipe and source SHA-256. FFmpeg runs as a separate executable. The license notices for Electron, npm runtime dependencies, fonts, and WordNet are included with the app or its ZIP.
