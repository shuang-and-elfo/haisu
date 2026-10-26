#!/bin/bash
# Encode helper: enc <in> <out-base> [ss] [t]  -> out-base.mp4 + out-base-poster.jpg
# Long side capped at 1280, 30fps, x264 slow crf 24 capped ~3.2Mbps, AAC 96k, faststart.
set -e
VF="scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))',fps=30,format=yuv420p"
enc() {
  local in="$1" out="$2" ss="${3:-0}" t="$4"
  local targs=(); [ -n "$t" ] && targs=(-t "$t")
  ffmpeg -v error -y -ss "$ss" -i "$in" "${targs[@]}" -vf "$VF" \
    -c:v libx264 -preset slow -crf 24 -maxrate 3200k -bufsize 6400k \
    -c:a aac -b:a 96k -ac 2 -movflags +faststart "$out.mp4"
  ffmpeg -v error -y -ss 0.8 -i "$out.mp4" -frames:v 1 -vf "scale='if(gte(iw,ih),min(960,iw),-2)':'if(gte(iw,ih),-2,min(960,ih))'" -q:v 5 "$out-poster.jpg" \
    || ffmpeg -v error -y -i "$out.mp4" -frames:v 1 -q:v 5 "$out-poster.jpg"
  echo "$out.mp4 $(du -h "$out.mp4" | cut -f1)"
}
img() { # img <in> <out.jpg>
  convert "$1[0]" -auto-orient -resize 1600x1600\> -strip -interlace Plane -quality 84 "$2"; echo "$2 $(du -h "$2" | cut -f1)"
}
"$@"
