#!/usr/bin/env bash

#------------------------------------------------------------------------------
# @file
# Bootstraps Hugo for building a site on Cloudflare Workers.
#
# Node.js dependency handling is outside this script.
#------------------------------------------------------------------------------

main() {

  HUGO_VERSION=0.158.0
  HUGO_ARCHIVE="hugo_${HUGO_VERSION}_linux-amd64.tar.gz"
  HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_ARCHIVE}"
  HUGO_INSTALL_DIR="${HOME}/.local/hugo"
  TMP_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/hugo.XXXXXX.tar.gz")"
  TMP_HUGO_DIR=""
  BACKUP_HUGO_DIR=""

  export TZ=Asia/Shanghai

  cleanup() {
    local exit_code=$?

    rm -f "${TMP_ARCHIVE}"

    if [ "${exit_code}" -ne 0 ] && [ -n "${BACKUP_HUGO_DIR}" ] && [ ! -d "${HUGO_INSTALL_DIR}" ] && [ -d "${BACKUP_HUGO_DIR}/hugo" ]; then
      mv "${BACKUP_HUGO_DIR}/hugo" "${HUGO_INSTALL_DIR}"
    fi

    if [ -n "${TMP_HUGO_DIR}" ]; then
      rm -rf "${TMP_HUGO_DIR}"
    fi

    if [ -n "${BACKUP_HUGO_DIR}" ]; then
      rm -rf "${BACKUP_HUGO_DIR}"
    fi
  }

  trap cleanup EXIT

  # Install Hugo
  echo "Installing Hugo ${HUGO_VERSION}..."
  mkdir -p "${HOME}/.local"
  TMP_HUGO_DIR="$(mktemp -d "${HOME}/.local/hugo.new.XXXXXX")"
  curl -fsSL -o "${TMP_ARCHIVE}" "${HUGO_URL}"
  tar -C "${TMP_HUGO_DIR}" -xf "${TMP_ARCHIVE}"

  if [ -d "${HUGO_INSTALL_DIR}" ]; then
    BACKUP_HUGO_DIR="$(mktemp -d "${HOME}/.local/hugo.old.XXXXXX")"
    mv "${HUGO_INSTALL_DIR}" "${BACKUP_HUGO_DIR}/hugo"
  fi

  mv "${TMP_HUGO_DIR}" "${HUGO_INSTALL_DIR}"
  TMP_HUGO_DIR=""
  export PATH="${HUGO_INSTALL_DIR}:${PATH}"

  # Verify installation
  echo "Verifying installation..."
  echo Hugo: "$(hugo version)"

  # Build the site
  echo "Building the site..."
  hugo build --gc --minify

}

set -euo pipefail
main "$@"
