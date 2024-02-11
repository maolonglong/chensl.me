alias s := server
alias serve := server
alias b := build

default:
  just --list

server:
  [ "{{os()}}" = "macos" ] && open http://localhost:1313/
  hugo server -D

build:
  hugo --minify --gc

clean:
  rm -r public
