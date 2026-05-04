alias s := server
alias serve := server
alias b := build

default:
  just --list

server:
  hugo server -D

build:
  hugo --minify --gc

clean:
  rm -rf public resources/_gen
