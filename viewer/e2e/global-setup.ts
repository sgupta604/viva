import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateLargeGraph } from "../src/lib/fixtures/large";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Stage the committed e2e fixture as the graph.json that `vite preview` will
 * serve. Vite preview serves `dist/`, so we copy the fixture into both
 * `public/graph.json` (source of truth for fresh dev/build) AND
 * `dist/graph.json` (what preview actually serves when dist already exists).
 * The duplication keeps E2E honest regardless of whether the tester just ran
 * `npm run build` or not.
 *
 * Also mirror the sample-module sources into `public/source/` AND
 * `dist/source/` so the Raw tab has something to render under preview.
 */
export default async function globalSetup() {
  const fixture = resolve(here, "fixtures/graph.json");

  for (const outGraph of [
    resolve(here, "../public/graph.json"),
    resolve(here, "../dist/graph.json"),
  ]) {
    // If dist doesn't exist yet, skip — preview will rebuild or fail loudly.
    if (outGraph.includes("dist") && !existsSync(dirname(outGraph))) continue;
    mkdirSync(dirname(outGraph), { recursive: true });
    copyFileSync(fixture, outGraph);
  }

  const sourceRoot = resolve(here, "../../crawler/tests/fixtures/sample-module");
  if (existsSync(sourceRoot)) {
    for (const dstSource of [
      resolve(here, "../public/source"),
      resolve(here, "../dist/source"),
    ]) {
      if (dstSource.includes("dist") && !existsSync(dirname(dstSource))) continue;
      copyDir(sourceRoot, dstSource);
    }
  }

  // Stage the synthesized large-scale fixture for the fps-bench + large-scale
  // specs. The JSON is not committed (too bulky) — regenerate on every run.
  // Seed=1 keeps the output byte-stable.
  const large = generateLargeGraph(1);
  const largeJson = JSON.stringify(large);
  const largeDest = resolve(here, "fixtures/large/graph.json");
  mkdirSync(dirname(largeDest), { recursive: true });
  writeFileSync(largeDest, largeJson, "utf8");
  // Also publish at /graph-large.json under public/ + dist/ so the viewer
  // (running under vite preview) can load it via App.tsx's ?graph=large
  // query-param dispatch.
  for (const outPath of [
    resolve(here, "../public/graph-large.json"),
    resolve(here, "../dist/graph-large.json"),
  ]) {
    if (outPath.includes("dist") && !existsSync(dirname(outPath))) continue;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, largeJson, "utf8");
  }
}

function copyDir(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry.startsWith(".")) continue; // skip .hidden
    const src = join(from, entry);
    const dst = join(to, entry);
    const st = statSync(src);
    if (st.isDirectory()) copyDir(src, dst);
    else if (st.isFile()) copyFileSync(src, dst);
  }
}
