# ADR-0001: Monaco editor bundled locally to preserve offline guarantee

**Status:** Accepted
**Date:** 2026-04-18

## Context

The viewer needs a code editor for the Raw source view. The standard React wrapper (@monaco-editor/react) ships a default loader that, at runtime, fetches the Monaco core files from cdn.jsdelivr.net. This is a direct violation of the offline guarantee (TR1): a user opening the Raw tab on an air-gapped machine would see a blank editor, and any Playwright offline test that did not explicitly trigger the lazy import would pass while the violation was still present.

## Decision

Import monaco-editor as a direct npm dependency and call loader.config({ monaco }) before the editor component mounts. This overrides the CDN path with the locally bundled copy. Monaco is still lazy-loaded via React.lazy and Promise.all, keeping it out of the initial bundle. The initial bundle size is unaffected (469 kB gzip 150 kB); Monaco lands in its own lazy chunk (~4.3 MB, loaded only when the Raw tab is opened). The offline.spec.ts test was extended to explicitly open the Raw tab, forcing the lazy chunk to load and confirming zero external requests.

## Consequences

- **Positive:** Offline guarantee holds unconditionally; no external network traffic at any point during viewer use, including after the Raw tab is opened.
- **Positive:** Initial bundle is unaffected; Monaco is still deferred.
- **Negative:** The monaco-editor package adds ~4.3 MB to the lazy chunk (1.1 MB gzip). This is inherent to Monaco; it cannot be reduced without swapping the editor entirely.
- **Negative:** The @monaco-editor/react library still contains an inert bundled string referencing cdn.jsdelivr.net in its default config object. This string is overridden at runtime and never used, but it appears in the built output. The offline.spec.ts test provides runtime confirmation that no actual request is made.

## Alternatives Considered

- **Use @monaco-editor/react default loader:** Rejected because the default paths point at jsdelivr; any user on a genuinely offline machine would get a broken Raw tab.
- **Replace Monaco with CodeMirror:** Not adopted for v1; CodeMirror is smaller but would require a separate migration effort and is not in the current dependency set. Deferred to v2 if bundle size becomes a concern.
- **Ship Monaco files under public/monaco-editor/ and configure loader path manually:** Technically equivalent outcome but more fragile (path must stay in sync with npm package version). The dynamic import approach is simpler and lets Vite manage chunking automatically.
