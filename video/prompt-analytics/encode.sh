#!/bin/sh
# Re-encode the HyperFrames render into the site assets (needs a working ffmpeg).
# Usage: npm run data && npm run render && ./encode.sh
set -e
cd "$(dirname "$0")"
A=../../site/assets/prompt-analytics
mkdir -p "$A"

# Music bed -> out/audio.wav: fades, then two-pass EBU R128 loudnorm
# (I=-16 LUFS, TP=-1.5 dBTP, LRA=11), 48 kHz. Fades come first in both passes
# so the measurement matches the final signal.
WAV=../audio/tracks/prompt-analytics.wav
FADE="afade=t=in:d=1.5,afade=t=out:st=70.4:d=2.5"
LN="loudnorm=I=-16:TP=-1.5:LRA=11"
norm_audio() {
  m=$(ffmpeg -hide_banner -i "$WAV" -t 72.9 -af "$FADE,$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
  v() { echo "$m" | sed -n "s/.*\"$1\" *: *\"\(.*\)\".*/\1/p"; }
  ffmpeg -y -i "$WAV" -t 72.9 -ar 48000 -af "$FADE,$LN:measured_I=$(v input_i):measured_TP=$(v input_tp):measured_LRA=$(v input_lra):measured_thresh=$(v input_thresh):offset=$(v target_offset):linear=true" "$1"
}
mkdir -p out
norm_audio out/audio.wav

ffmpeg -y -i out/raw.mp4 -i out/audio.wav -map 0:v -map 1:a -t 72.9 -c:a aac -b:a 192k -ar 48000 -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "$A/prompt-analytics.mp4"
ffmpeg -y -i out/raw.mp4 -i out/audio.wav -map 0:v -map 1:a -t 72.9 -c:a libopus -b:a 128k -ar 48000 -c:v libvpx-vp9 -crf 28 -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p "$A/prompt-analytics.webm"
ffmpeg -y -ss 7.0 -i out/raw.mp4 -frames:v 1 -vf scale=1280:-1 "$A/poster.png"
ls -la "$A"
