#!/bin/sh
# Final encode: Remotion picture (out/remotion.mp4, muted) + VO + Openverse music bed.
# Music ducks under the VO (sidechain), fades, then two-pass EBU R128 loudnorm
# (I=-16 LUFS, TP=-1.5 dBTP, LRA=11), 48 kHz. Outputs ../out/prompt-analytics-release.{mp4,webm} + poster.
# Usage: python build_audio.py && npm run render -- --muted && ./encode.sh
set -e
cd "$(dirname "$0")"
O=../out
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $O/remotion.mp4)
FO=$(echo "$D - 2.5" | bc)
MIX="[1]volume=0.32,afade=t=in:d=1.2,afade=t=out:st=$FO:d=2.5[m];[0]asplit[v][sc];[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[d];[v][d]amix=inputs=2:normalize=0,atrim=0:$D"
LN="loudnorm=I=-16:TP=-1.5:LRA=11"
m=$(ffmpeg -hide_banner -i public/vo.wav -i media/music.mp3 -filter_complex "$MIX,$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
v() { echo "$m" | sed -n "s/.*\"$1\" *: *\"\(.*\)\".*/\1/p"; }
ffmpeg -v error -y -i public/vo.wav -i media/music.mp3 -filter_complex "$MIX,$LN:measured_I=$(v input_i):measured_TP=$(v input_tp):measured_LRA=$(v input_lra):measured_thresh=$(v input_thresh):offset=$(v target_offset):linear=true" -ar 48000 -ac 2 $O/mix.wav

ffmpeg -v error -y -i $O/remotion.mp4 -i $O/mix.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest $O/prompt-analytics-release.mp4
ffmpeg -v error -y -i $O/remotion.mp4 -i $O/mix.wav -map 0:v -map 1:a -c:v libvpx-vp9 -crf 30 -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p -c:a libopus -b:a 128k -shortest $O/prompt-analytics-release.webm
ffmpeg -v error -y -ss 12 -i $O/remotion.mp4 -frames:v 1 -vf scale=1280:-1 $O/poster.png
ls -la $O/prompt-analytics-release.* $O/poster.png
