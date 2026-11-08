#!/usr/bin/env bash
# Build command for Cloudflare Workers Builds. The build image has no Hugo, so download the
# version pinned in mise.toml.
set -euo pipefail

version="$(sed -n 's/^hugo = "\(.*\)"$/\1/p' mise.toml)"
dir="$(mktemp -d)"
curl -sfL "https://github.com/gohugoio/hugo/releases/download/v${version}/hugo_${version}_linux-amd64.tar.gz" | tar -xz -C "$dir" hugo
"$dir/hugo" build --panicOnWarning --cleanDestinationDir
