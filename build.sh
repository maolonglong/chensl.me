#!/usr/bin/env bash

#------------------------------------------------------------------------------
# @file
# Bootstraps Hugo for building a site on Cloudflare Workers.
#
# Node.js dependency handling is outside this script.
#------------------------------------------------------------------------------

main() {

  local hugo_version="0.166.0"
  local hugo_archive=""
  local hugo_checksum=""
  local hugo_bin=""
  local temp_dir=""

  export TZ=Asia/Shanghai

  cleanup() {
    local cleanup_dir="${temp_dir:-}"
    if [ -n "${cleanup_dir}" ]; then
      rm -rf -- "${cleanup_dir}"
    fi
  }

  trap cleanup EXIT

  local system_hugo=""
  system_hugo="$(command -v hugo || true)"
  local is_ci=false
  case "${CI:-}" in
    ""|0|false)
      ;;
    *)
      is_ci=true
      ;;
  esac

  if [ "${is_ci}" = false ]; then
    if [ -z "${system_hugo}" ]; then
      echo "Hugo is required for local builds." >&2
      exit 1
    fi
    hugo_bin="${system_hugo}"
  else
    case "$(uname -s)/$(uname -m)" in
      Darwin/arm64|Darwin/x86_64)
        hugo_archive="hugo_${hugo_version}_darwin-universal.pkg"
        hugo_checksum="387c90d4cc3fa4add9949db0304c1db52175a2e939a77353e2809da15722b5a6"
        ;;
      Linux/aarch64|Linux/arm64)
        hugo_archive="hugo_${hugo_version}_linux-arm64.tar.gz"
        hugo_checksum="0e15cbc595e799401698c11af39d2594b64292b39d9ec7a19665bd43e05fcb2c"
        ;;
      Linux/x86_64|Linux/amd64)
        hugo_archive="hugo_${hugo_version}_linux-amd64.tar.gz"
        hugo_checksum="45228f5a52eb118b0ca168068f01d7df0447314a24056f1d29667ed9fc368308"
        ;;
      *)
        echo "Unsupported platform: $(uname -s)/$(uname -m)" >&2
        exit 1
        ;;
    esac

    temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/hugo.XXXXXX")"
    local archive_path="${temp_dir}/${hugo_archive}"
    local hugo_url="https://github.com/gohugoio/hugo/releases/download/v${hugo_version}/${hugo_archive}"

    echo "Downloading Hugo ${hugo_version} for $(uname -s)/$(uname -m)..."
    curl -fsSL -o "${archive_path}" "${hugo_url}"

    local actual_checksum=""
    if command -v sha256sum >/dev/null 2>&1; then
      actual_checksum="$(sha256sum "${archive_path}" | awk '{ print $1 }')"
    elif command -v shasum >/dev/null 2>&1; then
      actual_checksum="$(shasum -a 256 "${archive_path}" | awk '{ print $1 }')"
    else
      echo "A SHA-256 checksum tool is required." >&2
      exit 1
    fi

    if [ "${actual_checksum}" != "${hugo_checksum}" ]; then
      echo "Hugo archive checksum mismatch." >&2
      exit 1
    fi

    case "${hugo_archive}" in
      *.pkg)
        local package_dir="${temp_dir}/package"
        pkgutil --expand-full "${archive_path}" "${package_dir}"
        hugo_bin="$(find "${package_dir}" -type f -name hugo -perm -111 -print -quit)"
        ;;
      *.tar.gz)
        local extract_dir="${temp_dir}/hugo"
        mkdir -p "${extract_dir}"
        tar -C "${extract_dir}" -xf "${archive_path}"
        hugo_bin="${extract_dir}/hugo"
        ;;
    esac
  fi

  if [ ! -x "${hugo_bin}" ]; then
    echo "Unable to locate the Hugo executable." >&2
    exit 1
  fi

  # Verify installation
  echo "Verifying installation..."
  "${hugo_bin}" version

  # Build the site
  echo "Building the site..."
  "${hugo_bin}" build --cleanDestinationDir --gc --minify

  echo "Running regression tests..."
  HUGO_BIN="${hugo_bin}" node --test scripts/*.test.mjs

  cleanup
  trap - EXIT

}

set -euo pipefail
main "$@"
