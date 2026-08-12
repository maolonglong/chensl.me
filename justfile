alias s := server
alias serve := server
alias b := build
alias c := check

default:
  just --list

server:
  hugo server -D

build:
  hugo --cleanDestinationDir --minify --gc

check: build
  node scripts/check-site.mjs

clean:
  rm -rf public resources/_gen
