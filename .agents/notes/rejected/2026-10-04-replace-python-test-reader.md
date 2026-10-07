# Agent Note: Replace the Python test reader with JavaScript

Status: rejected — the tests use Python on purpose, as a parser independent of the code under test

## Problem

Several tests in `tests/` run `python3` to parse built HTML, RSS, and sitemap XML. Python is a second runtime in a Node project, and `README.md` must list it as a requirement. A cleanup review on 2026-10-04 proposed to remove it.

## Proposal

Parse the output in the Node tests with the same unified and rehype packages that the site and `scripts/check-site.mjs` use, and drop Python from the requirements.

<!-- agent-note-format: alternatives-not-recorded -->

## Rejection

The owner decided to keep Python. A test that reads output with the same parser that produced or checks it can share that parser's bugs and pass for the wrong reason. Python's standard library HTML and XML parsers are an independent reader. `e7063e2` kept Python for this reason.
