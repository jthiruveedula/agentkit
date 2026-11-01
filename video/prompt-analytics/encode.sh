#!/bin/sh
# Re-encode the HyperFrames render into the site assets (needs a working ffmpeg).
# Usage: npm run data && npm run render && ./encode.sh
set -e
cd "$(dirname "$0")"
A=../../site/assets/prompt-analytics
mkdir -p "$A"
ffmpeg -y -i out/raw.mp4 -i ../audio/tracks/prompt-analytics.wav -af "afade=t=in:d=1.5,afade=t=out:st=70.4:d=2.5,volume=0.35" -map 0:v -map 1:a -t 72.9 -c:a aac -b:a 160k -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "$A/prompt-analytics.mp4"
ffmpeg -y -i out/raw.mp4 -i ../audio/tracks/prompt-analytics.wav -af "afade=t=in:d=1.5,afade=t=out:st=70.4:d=2.5,volume=0.35" -map 0:v -map 1:a -t 72.9 -c:a libopus -b:a 128k -c:v libvpx-vp9 -crf 28 -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p "$A/prompt-analytics.webm"
ffmpeg -y -ss 7.0 -i out/raw.mp4 -frames:v 1 -vf scale=1280:-1 "$A/poster.png"
ls -la "$A"
