alias s := server
alias serve := server
alias b := build

default:
  just --list

server:
  #!/usr/bin/env bun
  import { $ } from "bun";
  let cmds = [$`hugo server -D`];
  if ("{{os()}}" === "macos") {
    cmds.push($`sleep 2; open http://localhost:1313/`);
  }
  await Promise.all(cmds);

build:
  hugo --minify --gc

clean:
  rm -r public
