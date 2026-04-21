# Running viva on your codebase

One `docker run` command points viva at any local codebase and serves an
interactive viewer at `http://localhost:5173`. No Python, no Node, no `pip`,
no `npm` — just Docker.

## Quickstart

Run it from the root of the codebase you want to explore:

```bash
docker run --rm --pull=always -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva
```

Open <http://localhost:5173> in your browser. Press Ctrl-C (or `docker stop`)
to exit.

`--pull=always` re-checks `ghcr.io` on every run and downloads only if the
digest changed — usually a no-op, but it keeps you on the latest viva without
having to remember to pull.

### Skip the auto-update

To use your locally cached image instead (fully offline, or pinned to whatever
you already have), drop the `--pull=always` flag:

```bash
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva
```

Pull manually when you want updates: `docker pull ghcr.io/sgupta604/viva`.

### Windows

PowerShell:

```powershell
docker run --rm --pull=always -v "${PWD}:/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva
```

cmd.exe:

```cmd
docker run --rm --pull=always -v "%cd%:/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva
```

Git Bash / WSL: use the bash command above.

**Paths with spaces:** always quote the entire `-v` argument. The forms above
already do this.

## Common tweaks

### Use a different host port

If `5173` is in use on your host, remap it:

```bash
docker run --rm -v "$(pwd):/target:ro" -p 8080:5173 ghcr.io/sgupta604/viva
```

Then open <http://localhost:8080>. The container always listens on `5173`;
only the host side changes.

### Pass crawler flags

Anything after the image name is forwarded to `python -m crawler`:

```bash
# Only scan XML and YAML
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva \
  --include '**/*.xml' '**/*.yaml'

# Skip tests
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva \
  --exclude '**/tests/**'

# Include raw source snippets in graph.json
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva \
  --emit-sources

# Show all crawler options
docker run --rm ghcr.io/sgupta604/viva --help
```

### Stop the container

Ctrl-C in the foreground terminal, or `docker stop <name>` if run with `-d`.
The entrypoint `exec`s the HTTP server, so SIGTERM propagates cleanly.

## Offline: BUILD vs RUNTIME

**BUILD** (building the image) fetches packages from npm and pip public
registries. This is normal, happens once, and runs on whoever builds or
publishes the image.

**RUNTIME** (running the container against your code) makes zero outbound
network calls. Your proprietary code stays in the read-only `/target` mount;
the crawler reads it, writes `graph.json` inside the container layer
(destroyed when the container exits because of `--rm`), and the viewer serves
static files over localhost only.

This is not a theoretical distinction. During v1, the viewer almost shipped
with a Monaco editor CDN loader that silently fetched from `cdn.jsdelivr.net`
at runtime — a single line buried in a library default config. Caught it with
an explicit offline regression test. The lesson: any library that lazy-loads
assets can mask an offline violation. viva's runtime image is verified
network-free; contributors who add any fetch will break the offline guarantee.

## The `:ro` mount

`-v "$(pwd):/target:ro"` mounts your codebase read-only. The crawler does not
write to `/target` by design (output goes to `/app/viewer/dist/graph.json`
inside the container), but `:ro` is a belt-and-suspenders guarantee for
proprietary codebases. Always keep it.

## Troubleshooting

- **"Port is already allocated" / "bind: address already in use".** Remap the
  host port, e.g. `-p 8080:5173`, and open <http://localhost:8080>.

- **Windows path has spaces.** Quote the entire `-v` value. The commands
  above do this; if you write your own, keep the quotes.

- **Apple Silicon (M1/M2/M3) warning.** The MVP ships amd64 only. Docker on
  Apple Silicon will warn about a platform mismatch and run the image under
  emulation (slower, but works). Multi-arch builds are a follow-up.

- **"Can't install Docker on this machine".** Fall back to the host install
  path in the repo root `README.md` (Python 3.12 + Node 20).

## What's NOT in the image

No telemetry. No phone-home. No update check. No CDN fetches (Monaco and
fonts are bundled). No network listener beyond the local HTTP server on
`5173`. No auto-browser-open (impossible cleanly across platforms).

## Fallback: build locally

If `docker pull ghcr.io/sgupta604/viva` fails with 403/404 (package not yet
published, or not yet made public), or you want to build from source, clone
the repo and build the image locally:

```bash
git clone https://github.com/sgupta604/viva.git
cd viva
docker build -t viva .
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 viva
```

(`$(pwd)` in the last line means "the codebase you want to explore", which
may or may not be the viva repo itself.)

### Windows (fallback)

PowerShell:

```powershell
docker run --rm -v "${PWD}:/target:ro" -p 5173:5173 viva
```

cmd.exe:

```cmd
docker run --rm -v "%cd%:/target:ro" -p 5173:5173 viva
```

Git Bash / WSL: use the bash command above.
