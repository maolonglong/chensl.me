# Agent Note: GitHub repository cards from committed metadata

Status: implemented

## Problem

Several articles end a section with a paragraph that is only a link to a GitHub repository, such as the author's own project. The paragraph shows a bare URL or an `owner/repo` link text, so the reader does not see what the repository is before they leave the page.

## Decision

`remarkSite` in `src/lib/markdown.mjs` turns a top-level paragraph that holds only a link to a repository root (`https://github.com/<owner>/<repo>`) into a card. The card is the same link, with the repository name and its description, in the frame of a code block. Links inside sentences, in lists, quotes, or footnotes, to files or other GitHub pages, and paragraphs with two links stay plain.

- **Metadata in the repository.** The name and description come from `src/data/github-repos.json`. Only `scripts/github-repos.mjs` writes it, by hand: it lists the qualifying links in the articles and reads each repository from the GitHub REST API. A build and CI read only the committed file, so they work while the GitHub API is down or rate-limited.
- **Fallback.** A link without an entry stays a plain link. A repository with no description gets a card with its name only.
- **Cache.** The content collection digest includes the metadata file, so a refresh renders the articles again.
- **No page cost.** The card has no image, icon, or script, so the CSP and the page weight stay the same. Search and the fonts read the card text like other article text.

## Alternatives considered

**Fetch the metadata during the build.** It keeps descriptions fresh with no manual step, but every build then depends on the GitHub API and its unauthenticated limit of 60 requests an hour. A failed request would either fail the build or silently change the page.

**Client-side embed or a third-party card service.** It shows stars and an avatar, but it needs a script, an external image or frame, and a CSP change, which the site avoids.

**Cards for every GitHub link.** A card in the middle of a sentence or a list breaks the reading flow, and a link to a file has no repository description to show.

## Consequences

A description stays as it was at the last refresh until someone runs the script again. The script needs network access and, for many repositories, a `GITHUB_TOKEN`. The card text adds the descriptions to the search index of the articles that contain cards.

## Reopen when

The site needs live repository data, such as stars, or the articles link many repositories that change often.
