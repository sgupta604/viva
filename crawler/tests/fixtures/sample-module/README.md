# sample-module (fixture)

Fictional "radar ingestion" configuration module. Used as the deterministic
test input for the crawler and the fixture for the viewer's E2E suite.

Do not import from application code. Regenerate `graph.json` against this
tree to refresh `sample-module.expected.graph.json`.

## Notable test-trap files

- `config/broken.xml` — intentionally malformed. Exercises `parseError` plus
  partial-parse recovery (one valid `<param>` survives recover mode).
- `config/encoding-latin1.xml` — declared-latin1 content; verifies lxml honors
  the XML declaration's encoding.
- `config/xi-include.xml` — XInclude (`<xi:include href="…"/>`) with the
  `xmlns:xi` declaration deliberately omitted. Exercises lxml recover mode and
  the `prefix:local` normalization in `_local_name` — the raw `href` must be
  captured as a kind=`include` reference.
- `config/entity-decl.xml` — internal DTD with an `<!ENTITY … SYSTEM "…">`
  declaration. Exercises ENTITY raw-ref capture; the system URL must surface
  as a kind=`include` raw reference.
