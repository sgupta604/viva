# Release

How viva publishes container images to GHCR and how to cut a release.

## First-time publish setup

The workflow publishes to `ghcr.io/sgupta604/viva`, but the package starts
**private** on first publish. Six one-time steps to make it public and
linked:

1. Merge the PR that adds `.github/workflows/publish-image.yml` into `main`.
2. Navigate to the repo **Actions** tab. Wait for the first
   `Publish Docker image` run to finish (2–5 min). Verify it succeeds.
3. Navigate to the repo home page. Scroll to **Packages** on the right
   sidebar and click the `viva` package.
4. On the package page, click **Package settings** (top right).
5. Scroll to **Danger Zone** → **Change visibility** → **Public**. Type the
   repo name to confirm.
6. Back on the package main page, click **Connect Repository** and link
   `sgupta604/viva`. Verify with `docker pull ghcr.io/sgupta604/viva` from
   any machine that is not logged into GHCR.

After these six steps, anonymous pulls work and every subsequent push to
`main` or tag push publishes automatically — no further manual action.

## Cutting a release

Tag the commit and push the tag:

```bash
git tag -a v1.2.3 -m "Release 1.2.3"
git push --tags
```

The workflow builds and publishes four tags on GHCR: `:v1.2.3`, `:1.2`,
`:1`, and `:latest`. Verify at
<https://github.com/sgupta604/viva/pkgs/container/viva> → **Versions**, or
pull the new tag directly:

```bash
docker pull ghcr.io/sgupta604/viva:v1.2.3
```

## Tag strategy

- **`:latest`** — every push to `main`. For teammates riding the bleeding
  edge.
- **`:v1.2.3`, `:1.2`, `:1`** — semver ladder from `v*.*.*` git tags. For
  teammates pinning in CI or production.
- **`:sha-<shortsha>`** — every push. For debugging and exact
  reproducibility.
- **`:main`** — most recent `main` commit. Same as `:latest` today; kept
  separate so `:latest` can later shift to "last stable tag" without
  breaking teammates who want head-of-main.
