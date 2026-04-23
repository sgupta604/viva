// Generate xlarge (~5k files) and xxlarge (~10k files) synthetic graph.json
// fixtures for ad-hoc browser scale-testing of the dendrogram view.
//
// Output:
//   - viewer/public/graph-xlarge.json   (~5k files, ~1.5k edges)
//   - viewer/public/graph-xxlarge.json  (~10k files, ~3k edges)
//   - viewer/e2e/fixtures/xlarge/graph.json   (mirror, gitignored — for tests)
//   - viewer/e2e/fixtures/xxlarge/graph.json  (mirror)
//
// Self-contained pure Node — no TypeScript transform needed. The CANONICAL
// generator is `viewer/src/lib/fixtures/xlarge.ts` (consumed by Playwright
// global-setup + Vitest); this script is a thin convenience wrapper that
// duplicates the same algorithm so devs can `node scripts/...` without
// spinning up the test runner. Kept in lockstep manually — both files have
// the same fixture spec constants.
//
// OFFLINE: stdlib only.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(here, "..");

const XLARGE = {
  TOP: 25,
  MID: 12,
  LEAF: 16,
  D_AGGREGATE_COUNT: 2,
  D_AGGREGATE_CHILDREN: 12,
  REF_DENSITY: 0.18,
  REFS_PER_FILE: 2.5,
  HUB_COUNT: 4,
  REFS_PER_HUB: 12,
};

const XXLARGE = {
  TOP: 40,
  MID: 15,
  LEAF: 16,
  D_AGGREGATE_COUNT: 4,
  D_AGGREGATE_CHILDREN: 12,
  REF_DENSITY: 0.18,
  REFS_PER_FILE: 2.5,
  HUB_COUNT: 6,
  REFS_PER_HUB: 14,
};

function sha1(s) {
  return createHash("sha1").update(s, "utf8").digest("hex").slice(0, 10);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickKind(rng) {
  const r = rng();
  if (r < 0.6) return "xml";
  if (r < 0.7) return "yaml";
  if (r < 0.9) return "json";
  return "ini";
}

function pickRefKind(rng) {
  const r = rng();
  if (r < 0.45) return "include";
  if (r < 0.75) return "ref";
  if (r < 0.9) return "import";
  if (r < 0.97) return "logical-id";
  return "xsd";
}

function generate(spec, seed = 1) {
  const rng = mulberry32(seed);
  const { TOP, MID, LEAF, D_AGGREGATE_COUNT, D_AGGREGATE_CHILDREN } = spec;
  const files = [];
  const clusters = [];
  const edges = [];

  for (let t = 0; t < TOP; t += 1) {
    const topName = `top${t.toString().padStart(2, "0")}`;
    const topPath = topName;
    const topChildClusters = [];
    const topCluster = {
      path: topPath,
      parent: null,
      childFiles: [],
      childClusters: topChildClusters,
      kind: "folder",
    };
    clusters.push(topCluster);

    for (let m = 0; m < MID; m += 1) {
      const midName = `mid${m.toString().padStart(2, "0")}`;
      const isDAggregate = t < D_AGGREGATE_COUNT && m === MID - 1;
      const effectiveMidPath = isDAggregate
        ? `${topPath}/${midName}.d`
        : `${topPath}/${midName}`;
      topChildClusters.push(effectiveMidPath);

      const midChildFiles = [];
      clusters.push({
        path: effectiveMidPath,
        parent: topPath,
        childFiles: midChildFiles,
        childClusters: [],
        kind: isDAggregate ? "d-aggregate" : "folder",
      });

      const leafCount = isDAggregate ? D_AGGREGATE_CHILDREN : LEAF;
      for (let l = 0; l < leafCount; l += 1) {
        const isAnchor = m === 0 && l <= 1;
        const fileKind = isDAggregate || isAnchor ? "xml" : pickKind(rng);
        const ext = fileKind;
        const base = isDAggregate
          ? `${(l + 1).toString().padStart(2, "0")}-piece${l}`
          : `leaf${l.toString().padStart(2, "0")}`;
        const fileName = `${base}.${ext}`;
        const filePath = `${effectiveMidPath}/${fileName}`;
        const fileId = sha1(filePath);
        midChildFiles.push(fileId);
        files.push({
          id: fileId,
          path: filePath,
          name: fileName,
          folder: effectiveMidPath,
          kind: fileKind,
          sizeBytes: 200 + Math.floor(rng() * 500),
          params: [
            {
              key: `param_${t}_${m}_${l}`,
              value: `v${t}.${m}.${l}`,
              kind: "scalar",
              line: 1,
            },
          ],
          parseError: null,
          isTest: false,
          generated: false,
          generatedFrom: null,
        });
      }

      if (isDAggregate) {
        const parentName = `${midName}.xml`;
        const parentPath = `${topPath}/${parentName}`;
        const parentId = sha1(parentPath);
        files.push({
          id: parentId,
          path: parentPath,
          name: parentName,
          folder: topPath,
          kind: "xml",
          sizeBytes: 400,
          params: [],
          parseError: null,
          isTest: false,
          generated: false,
          generatedFrom: null,
        });
        topCluster.childFiles.push(parentId);
        midChildFiles.forEach((childId, idx) => {
          edges.push({
            source: parentId,
            target: childId,
            kind: "d-aggregate",
            unresolved: null,
            attrs: { order: idx + 1 },
          });
        });
      }
    }
  }

  // Cross-references.
  const refCandidates = files.filter((f) => f.folder !== f.path.split("/")[0]);
  const referencingCount = Math.floor(refCandidates.length * spec.REF_DENSITY);
  for (let i = 0; i < referencingCount; i += 1) {
    const sourceIdx = Math.floor(rng() * refCandidates.length);
    const source = refCandidates[sourceIdx];
    const sourceTop = source.folder.split("/")[0];
    const refsForThisFile = Math.max(
      1,
      Math.round(spec.REFS_PER_FILE + (rng() - 0.5) * 2),
    );
    for (let r = 0; r < refsForThisFile; r += 1) {
      const sameTop = rng() < 0.3;
      let target;
      let attempts = 0;
      while (!target && attempts < 8) {
        const candIdx = Math.floor(rng() * refCandidates.length);
        const cand = refCandidates[candIdx];
        const candTop = cand.folder.split("/")[0];
        const matchesTopRule = sameTop ? candTop === sourceTop : candTop !== sourceTop;
        if (cand.id !== source.id && matchesTopRule) target = cand;
        attempts += 1;
      }
      if (!target) continue;
      edges.push({
        source: source.id,
        target: target.id,
        kind: pickRefKind(rng),
        unresolved: null,
      });
    }
  }

  // Hubs.
  for (let h = 0; h < spec.HUB_COUNT; h += 1) {
    const hubTopIdx = Math.floor((TOP / spec.HUB_COUNT) * h);
    const hubTopName = `top${hubTopIdx.toString().padStart(2, "0")}`;
    const hub = files.find((f) => f.path === `${hubTopName}/mid00/leaf00.xml`);
    if (!hub) continue;
    for (let r = 0; r < spec.REFS_PER_HUB; r += 1) {
      const targetTopIdx = (hubTopIdx + 1 + r) % TOP;
      const targetTopName = `top${targetTopIdx.toString().padStart(2, "0")}`;
      const candidates = files.filter(
        (f) => f.folder.startsWith(`${targetTopName}/`) && f.id !== hub.id,
      );
      if (candidates.length === 0) continue;
      const target = candidates[Math.floor(rng() * candidates.length)];
      edges.push({
        source: hub.id,
        target: target.id,
        kind: "include",
        unresolved: null,
      });
    }
  }

  // XSD anchors.
  for (let t = 0; t < Math.min(8, TOP); t += 1) {
    const topName = `top${t.toString().padStart(2, "0")}`;
    const mid00Files = files.filter(
      (f) => f.folder === `${topName}/mid00` && f.kind === "xml",
    );
    if (mid00Files.length >= 2) {
      edges.push({
        source: mid00Files[0].id,
        target: mid00Files[1].id,
        kind: "xsd",
        unresolved: null,
      });
    }
  }

  // Logical-id anchors.
  for (let t = 0; t < Math.min(30, TOP); t += 1) {
    const aName = `top${(t % TOP).toString().padStart(2, "0")}`;
    const bName = `top${((t + 1) % TOP).toString().padStart(2, "0")}`;
    const src = files.find((f) => f.path === `${aName}/mid00/leaf00.xml`);
    const tgt = files.find((f) => f.path === `${bName}/mid00/leaf01.xml`);
    if (src && tgt) {
      edges.push({
        source: src.id,
        target: tgt.id,
        kind: "logical-id",
        unresolved: null,
      });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  clusters.sort((a, b) => a.path.localeCompare(b.path));
  edges.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return (a.target ?? "").localeCompare(b.target ?? "");
  });

  return {
    version: 2,
    root: `synthetic-${spec.TOP}x${spec.MID}x${spec.LEAF}`,
    files,
    edges,
    clusters,
  };
}

function emit(name, spec) {
  const g = generate(spec, 1);
  const json = JSON.stringify(g);
  const sizeMb = (json.length / 1024 / 1024).toFixed(2);
  console.log(
    `[${name}] files=${g.files.length} edges=${g.edges.length} clusters=${g.clusters.length} size=${sizeMb}MB`,
  );

  for (const target of [
    resolve(viewerRoot, `public/graph-${name}.json`),
    resolve(viewerRoot, `e2e/fixtures/${name}/graph.json`),
  ]) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, json, "utf8");
    console.log(`  wrote ${target}`);
  }
}

emit("xlarge", XLARGE);
emit("xxlarge", XXLARGE);
console.log("done.");
