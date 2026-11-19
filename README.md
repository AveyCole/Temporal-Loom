# Temporal Loom

Temporal Loom is a live visual instrument for Windows and Android. Search for photos and video clips, build a deck from local media or custom type, and drive morphs with a microphone, an audio file, or a video's soundtrack.

[Download page](https://aveycole.github.io/Temporal-Loom/) · [Windows 1.20.1](https://github.com/AveyCole/Temporal-Loom/releases/tag/v1.20.1) · [Android 1.17](https://github.com/AveyCole/Temporal-Loom/releases/download/v1.17/Temporal-Loom-1.17-Android.apk) · [User manual](https://github.com/AveyCole/Temporal-Loom/releases/download/v1.20.1/Temporal-Loom-1.20.1-User-Manual.pdf)

## Install

- **Windows 10 or 11, 64-bit**. Extract the release ZIP and open `Temporal Loom.exe`. Keep the companion files alongside the executable. Install Microsoft's WebView2 Evergreen Runtime if Windows prompts for it.
- **Android 8 or later**. Open the release APK and follow the installation prompt.

## Use

- In Studio, choose Photos, Videos, or Both under **Media to find**. Turn on **Abstract search** to try related phrases when the first search runs short.
- Use **Internet Archive videos · any date** for clips outside the archive date window, or try Wikimedia Commons, PeerTube, and NASA.
- In Viewfinder, pair a Radio Aporee field recording with media from its tagged area.
- Use **Type** to make fragments from your own words. **Use audio** on a video card selects its soundtrack, and **Restore previous audio** switches back.
- On Windows, **Detach display** sends the visuals to another window. Use **Fullscreen display** for a clean second-monitor output.
- In Windows 1.20, click a video card to play it on the canvas. Use **Shuffle deck** to randomize the card order, or drag a card by its top-left handle to move it.

## Build from source

Use PowerShell 7 and Node.js on Windows. Run `node port.mjs` from the repo root to regenerate the shared WebView page.

- **Windows**. Install the .NET Framework 4.7.2 Developer Pack, then run `pwsh -File windows/build.ps1`. The script fetches the WebView2 SDK, HtmlAgilityPack, and the FFmpeg distribution. The ZIP lands in `windows/dist/`.
- **Android**. Install a JDK, Android SDK Platform 35, and Android SDK Build Tools 35.0.0. Set `JAVA_HOME` and `ANDROID_HOME`, then run `pwsh -File build.ps1`. This produces `Temporal-Loom.apk` signed with a local key. An update to an existing Android install must use the same signing key as that install.

The built-in English thesaurus ships with the apps. To regenerate it, run `python tools/build-thesaurus.py <path-to-WordNet-3.0.tar.gz>` with the original Princeton distribution.

## Third-party components

The Windows ZIP includes component notices in its `Legal` folder and an FFmpeg build and source reference. The Android package includes the jsoup, WordNet, and font notices in its assets. Media search results retain links to their original providers and file pages.

- [Princeton WordNet 3.0](https://wordnet.princeton.edu/) supplies the vocabulary for Abstract search.
- [Gyan FFmpeg Windows builds](https://www.gyan.dev/ffmpeg/builds/) are used for Windows MP4 export. [FFmpeg source for the bundled build](https://github.com/FFmpeg/FFmpeg/commit/946fcce07b).
