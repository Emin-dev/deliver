#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -hide_banner -loglevel error -f lavfi -i "color=c=0x18382f:s=1920x1080:r=24:d=6" -vf "drawbox=x=140:y=140:w=1640:h=800:color=0x395749:t=3,drawbox=x=220:y=220:w=690:h=640:color=0xdf5d38:t=fill,drawbox=x=970:y=220:w=730:h=270:color=0xe2edc5:t=fill,drawbox=x=970:y=550:w=330:h=310:color=0x8fa57a:t=fill,drawbox=x=1360:y=550:w=340:h=310:color=0xf6f5ef:t=fill" -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -y web/assets/sample.mp4
