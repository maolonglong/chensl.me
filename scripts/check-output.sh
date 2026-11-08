#!/usr/bin/env bash
# Check the actual deployment output as well as the fixture site.
set -euo pipefail
out="${1:?Usage: check-output.sh OUTPUT_DIRECTORY}"
[ -s "$out/index.html" ] || { echo "FAIL  missing home page: $out"; exit 1; }
if grep -ri '<script' "$out"; then
  echo "FAIL  output contains a script"
  exit 1
else
  status=$?
  [ "$status" -eq 1 ] || exit "$status"
fi
[ ! -e "$out/tags" ] && [ ! -e "$out/categories" ] || { echo "FAIL  output contains taxonomy pages"; exit 1; }
echo "PASS  output has a home page, no scripts, and no taxonomy pages: $out"
