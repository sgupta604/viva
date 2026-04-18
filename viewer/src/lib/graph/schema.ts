import { z } from "zod";
import type { Graph } from "./types";

const paramKind = z.enum(["scalar", "list", "map"]);
const edgeKind = z.enum(["include", "ref", "import"]);
const fileKind = z.enum(["xml", "yaml", "json", "ini"]);

const paramNode = z.object({
  key: z.string(),
  value: z.string(),
  kind: paramKind,
  line: z.number().int().nullable(),
});

const fileNode = z.object({
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

const edge = z.object({
  source: z.string(),
  target: z.string().nullable(),
  kind: edgeKind,
  unresolved: z.string().nullable(),
});

export const graphSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  generatedAt: z.string().optional(),
  files: z.array(fileNode),
  edges: z.array(edge),
});

export type GraphFromSchema = z.infer<typeof graphSchema>;

export function parseGraph(data: unknown): Graph {
  return graphSchema.parse(data) as Graph;
}
