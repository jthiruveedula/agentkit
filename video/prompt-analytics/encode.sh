#!/bin/sh
# Re-encode the HyperFrames render into the site assets (needs a working ffmpeg).
# Usage: npm run data && npm run render && ./encode.sh
set -e
cd "$(dirname "$0")"
A=../../site/assets/prompt-analytics
mkdir -p "$A"
ffmpeg -y -i out/raw.mp4 -an -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart "$A/prompt-analytics.mp4"
ffmpeg -y -i out/raw.mp4 -an -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 "$A/prompt-analytics.webm"
ffmpeg -y -ss 8.5 -i out/raw.mp4 -frames:v 1 -vf scale=1280:-1 "$A/poster.png"
ls -la "$A"
