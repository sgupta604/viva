import { z } from "zod";
import type { Graph } from "./types";

// -----------------------------------------------------------------------------
// Common shapes (v1 + v2 share ParamNode, file-kind, etc.)
// -----------------------------------------------------------------------------

const paramKind = z.enum(["scalar", "list", "map"]);
const fileKind = z.enum(["xml", "yaml", "json", "ini"]);

// Widened for v2. Keep old values at the head so v1 edges still match.
const edgeKindV2 = z.enum([
  "include",
  "ref",
  "import",
  "xsd",
  "d-aggregate",
  "logical-id",
]);
const edgeKindV1 = z.enum(["include", "ref", "import"]);

const clusterKind = z.enum(["folder", "d-aggregate"]);

const paramNode = z.object({
  key: z.string(),
  value: z.string(),
  kind: paramKind,
  line: z.number().int().nullable(),
});

const edgeAttrs = z
  .object({
    order: z.number().int().optional(),
  })
  .passthrough()
  .optional();

// -----------------------------------------------------------------------------
// v1 shapes (for legacy graph.json on disk)
// -----------------------------------------------------------------------------

const fileNodeV1 = z.object({
  id: z.string().min(1),
  path: z.string(),
  name: z.string(),
  folder: z.string(),
  kind: fileKind,
  sizeBytes: z.number().int().nonnegative(),
  params: z.array(paramNode),
  parseError: z.string().nullable(),
  isTest: z.boolean(),
});

const edgeV1 = z.object({
  source: z.string(),
  target: z.string().nullable(),
  kind: edgeKindV1,
  unresolved: z.string().nullable(),
});

const graphV1 = z.object({
  version: z.literal(1),
  root: z.string(),
  generatedAt: z.string().optional(),
  files: z.array(fileNodeV1),
  edges: z.array(edgeV1),
});

// -----------------------------------------------------------------------------
// v2 shapes
// -----------------------------------------------------------------------------

const fileNodeV2 = z.object({
  id: z.string().min(1),
  path: z.string(),
  name: z.string(),
  folder: z.string(),
  kind: fileKind,
  sizeBytes: z.number().int().nonnegative(),
  params: z.array(paramNode),
  parseError: z.string().nullable(),
  isTest: z.boolean(),
  // v2: default to false/null when omitted (shouldn't happen in-spec but is
  // defensive against older crawler builds that didn't emit these fields).
  generated: z.boolean().default(false),
  generatedFrom: z.string().nullable().default(null),
});

const edgeV2 = z.object({
  source: z.string(),
  target: z.string().nullable(),
  kind: edgeKindV2,
  unresolved: z.string().nullable(),
  attrs: edgeAttrs,
});

const clusterNode = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  childFiles: z.array(z.string()),
  childClusters: z.array(z.string()),
  kind: clusterKind,
});

const graphV2 = z.object({
  version: z.literal(2),
  root: z.string(),
  generatedAt: z.string().optional(),
  files: z.array(fileNodeV2),
  edges: z.array(edgeV2),
  clusters: z.array(clusterNode),
  // Newer crawlers may emit parseErrors[]; tolerated and passed through.
  parseErrors: z.array(z.unknown()).optional(),
});

// -----------------------------------------------------------------------------
// Discriminated union — parseGraph returns a v2-shaped Graph either way.
// -----------------------------------------------------------------------------

export const graphSchema = z.discriminatedUnion("version", [graphV1, graphV2]);

export type GraphFromSchema = z.infer<typeof graphSchema>;

/**
 * Parse an arbitrary graph.json and return a normalized Graph.
 *
 * - v2 inputs pass through (with zod defaults filling optional fields).
 * - v1 inputs are upgrade-shimmed: empty `clusters[]` is derived, and every
 *   FileNode gets `generated=false` + `generatedFrom=null`. The returned
 *   `version` field preserves the input's declared version so callers can
 *   detect "this came from an older crawler."
 */
export function parseGraph(data: unknown): Graph {
  const parsed = graphSchema.parse(data);
  if (parsed.version === 2) {
    return parsed as Graph;
  }
  // v1 -> v2 upgrade shim.
  return {
    version: 1,
    root: parsed.root,
    generatedAt: parsed.generatedAt,
    files: parsed.files.map((f) => ({
      ...f,
      generated: false,
      generatedFrom: null,
    })),
    edges: parsed.edges.map((e) => ({ ...e })),
    clusters: [],
  };
}
