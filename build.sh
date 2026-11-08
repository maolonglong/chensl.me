#!/usr/bin/env bash
# Build command for Cloudflare Workers Builds. The build image has no Hugo, so download the
# version pinned in mise.toml and verify it against the release checksums before running it.
set -euo pipefail

version="$(sed -n 's/^hugo = "\(.*\)"$/\1/p' mise.toml)"
asset="hugo_${version}_linux-amd64.tar.gz"
base="https://github.com/gohugoio/hugo/releases/download/v${version}"
dir="$(mktemp -d)"

# The build network can drop a slow download midway; -C - resumes it on each retry.
fetch() { curl -fsSL --retry 5 --retry-all-errors --connect-timeout 20 -C - -o "$dir/$1" "$base/$1"; }
fetch "$asset"
fetch "hugo_${version}_checksums.txt"
(cd "$dir" && grep " ${asset}\$" "hugo_${version}_checksums.txt" | sha256sum -c -)

tar -xzf "$dir/$asset" -C "$dir" hugo
"$dir/hugo" build --panicOnWarning --cleanDestinationDir
