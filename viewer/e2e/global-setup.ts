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
import {
  generateXLargeGraph,
  generateXXLargeGraph,
} from "../src/lib/fixtures/xlarge";

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
  stageSynth("large", JSON.stringify(generateLargeGraph(1)), here);

  // Optional scale-test fixtures (xlarge ~5k, xxlarge ~10k). These exist so
  // ad-hoc browser scale-tests can opt into them via ?graph=xlarge etc. They
  // are NOT exercised by the default Playwright suite (regenerating two more
  // multi-MB JSON files on every test run would slow startup with no benefit
  // to the FPS-bench specs that are the gate). To re-enable for E2E, point a
  // dedicated spec at them — the staging itself is fast enough.
  stageSynth("xlarge", JSON.stringify(generateXLargeGraph(1)), here);
  stageSynth("xxlarge", JSON.stringify(generateXXLargeGraph(1)), here);
}

function stageSynth(name: string, json: string, here: string): void {
  const fixtureDest = resolve(here, `fixtures/${name}/graph.json`);
  mkdirSync(dirname(fixtureDest), { recursive: true });
  writeFileSync(fixtureDest, json, "utf8");
  for (const outPath of [
    resolve(here, `../public/graph-${name}.json`),
    resolve(here, `../dist/graph-${name}.json`),
  ]) {
    if (outPath.includes("dist") && !existsSync(dirname(outPath))) continue;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, json, "utf8");
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
