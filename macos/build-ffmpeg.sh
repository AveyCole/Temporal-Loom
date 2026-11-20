#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
export MACOSX_DEPLOYMENT_TARGET=12.0
cache="$root/build/macos-ffmpeg"
mkdir -p "$cache" "$root/macos/vendor"
if [[ ! -f "$cache/ffmpeg-9.0.2.tar.xz" ]]; then curl -fsSL https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz -o "$cache/ffmpeg-9.0.2.tar.xz"; fi
printf '%s  %s\n' '8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e' "$cache/ffmpeg-9.0.2.tar.xz" | shasum -a 256 -c -
if [[ ! -d "$cache/ffmpeg-9.0.2" ]]; then tar -xJf "$cache/ffmpeg-9.0.2.tar.xz" -C "$cache"; fi
x264_commit=31e19f92f00c7003fa115047ce50978bc98c3a0d
if [[ ! -f "$cache/x264-source.tar.gz" ]]; then curl -fsSL "https://codeload.github.com/mirror/x264/tar.gz/$x264_commit" -o "$cache/x264-source.tar.gz"; fi
printf '%s  %s\n' 'd053c9d86988d6bc78237ca5205865c5ddf99c98ef4cd9927eec8f6d388f6dd9' "$cache/x264-source.tar.gz" | shasum -a 256 -c -
if [[ ! -f "$cache/x264-install/lib/libx264.a" ]]; then
 tar -xzf "$cache/x264-source.tar.gz" -C "$cache"
 cd "$cache/x264-$x264_commit"
 ./configure --enable-static --enable-pic --disable-cli --disable-opencl --disable-asm --prefix="$cache/x264-install" --extra-cflags=-mmacosx-version-min=12.0 --extra-ldflags=-mmacosx-version-min=12.0
 make -j6
 make install
fi
export PKG_CONFIG_PATH="$cache/x264-install/lib/pkgconfig"
if [[ ! -x "$root/macos/vendor/ffmpeg" ]]; then
 cd "$cache/ffmpeg-9.0.2"
 ./configure --disable-everything --disable-autodetect --disable-network --enable-gpl --enable-libx264 --disable-nonfree --disable-doc --disable-debug --disable-ffplay --disable-ffprobe --enable-ffmpeg --enable-protocol=file,pipe --enable-demuxer=matroska,mov,avi,wav,mp3,ogg,flac,aac --enable-muxer=mp4,ipod,matroska,null --enable-decoder=wrapped_avframe,h264,hevc,vp8,vp9,av1,aac,opus,vorbis,mp3,flac,pcm_s16le,pcm_s24le,pcm_f32le,ffv1 --enable-encoder=wrapped_avframe,libx264,h264_videotoolbox,aac,ffv1,pcm_s16le --enable-parser=h264,hevc,vp8,vp9,av1,aac,opus,vorbis,mpegaudio,flac --enable-filter=pad,format,scale,aresample,anull,null,color,sine --enable-indev=lavfi --enable-bsf=h264_mp4toannexb,hevc_mp4toannexb,aac_adtstoasc --enable-videotoolbox --enable-audiotoolbox --extra-cflags="-I$cache/x264-install/include -mmacosx-version-min=12.0" --extra-ldflags="-L$cache/x264-install/lib -mmacosx-version-min=12.0" --pkg-config-flags=--static
 make -j6
 cp ffmpeg "$root/macos/vendor/ffmpeg"
fi
cd "$cache/ffmpeg-9.0.2"
cp COPYING.LGPLv2.1 COPYING.GPLv2 LICENSE.md "$root/macos/vendor/"
cp "$cache/x264-$x264_commit/COPYING" "$root/macos/vendor/x264-COPYING"
"$root/macos/vendor/ffmpeg" -version > "$root/macos/vendor/FFmpeg-build.txt" 2>&1

printf '%s\n' 'FFmpeg 9.0.2 source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz' 'x264 source: https://github.com/mirror/x264/tree/31e19f92f00c7003fa115047ce50978bc98c3a0d' 'Exact build recipe: macos/build-ffmpeg.sh in the Temporal Loom source repository.' 'The unmodified source archive is also available alongside the Mac release.' > "$root/macos/vendor/FFmpeg-source.txt"
