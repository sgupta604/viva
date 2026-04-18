import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Stage the committed e2e fixture as `viewer/public/graph.json` so `npm run
 * preview` serves it. Also mirror the sample-module sources into
 * `viewer/public/source/` so the Raw tab has something to render.
 */
export default async function globalSetup() {
  const fixture = resolve(here, "fixtures/graph.json");
  const outGraph = resolve(here, "../public/graph.json");
  mkdirSync(dirname(outGraph), { recursive: true });
  copyFileSync(fixture, outGraph);

  const sourceRoot = resolve(here, "../../crawler/tests/fixtures/sample-module");
  const publicSource = resolve(here, "../public/source");
  if (existsSync(sourceRoot)) {
    copyDir(sourceRoot, publicSource);
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
