# Contributing to memaudit's docs

Thanks for considering a contribution.

## Developer Certificate of Origin

Every commit must be signed off (DCO, not a CLA): add a `Signed-off-by`
trailer to each commit message, e.g.

    git commit -s -m "your message"

By signing off you certify the text in the [DCO](https://developercertificate.org/).
The DCO GitHub App checks every pull request and blocks merging on an
unsigned commit.

## Commit signing

GPG-sign your commits (`git commit -S`, or set `commit.gpgsign true` in
your git config to do it by default). This isn't enforced by CI, but is
expected for every commit landing in this repo, matching `memaudit`'s
own maintainer practice.

## Pull request titles

This repo only allows squash merging, so a PR's title becomes its
permanent entry in `main`'s history. PR titles must follow
[Conventional Commits](https://www.conventionalcommits.org/), e.g.
`docs: clarify the DAMON sysfs check` or `fix: correct a broken link in
architecture.md`. CI checks this on every pull request.

## License headers

New source files need an SPDX header; see existing files for the exact
format. Files that can't carry one get an entry in `REUSE.toml` instead.
`reuse lint` checks compliance, and it also runs in CI.

## Local checks

    npm install
    npm run build   # also validates internal links (starlight-links-validator)
    npx markdownlint-cli2 "**/*.{md,mdx}"
    reuse lint

All of these run in CI on every pull request.
