#!/bin/sh
# Re-capture screenshots + bounding boxes from the MOCK dashboard on :5330 (see capture.mjs).
set -e
cd "$(dirname "$0")"
sed "s|__ROOT__|$PWD|" capture.mjs | ego-browser nodejs
