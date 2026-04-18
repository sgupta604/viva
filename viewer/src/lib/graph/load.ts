import type { Graph } from "./types";
import { graphSchema } from "./schema";

export type LoadResult =
  | { ok: true; graph: Graph }
  | { ok: false; error: string; kind: "network" | "schema" | "parse" };

/**
 * Load /graph.json from the same origin, validate it against the locked schema,
 * and return a typed Graph. Never reaches out to any other origin.
 */
export async function loadGraph(url: string = "/graph.json"): Promise<LoadResult> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (err) {
    return { ok: false, kind: "network", error: `fetch failed: ${String(err)}` };
  }
  if (!response.ok) {
    return {
      ok: false,
      kind: "network",
      error: `HTTP ${response.status} ${response.statusText}`,
    };
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    return { ok: false, kind: "parse", error: `invalid JSON: ${String(err)}` };
  }
  const parsed = graphSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, kind: "schema", error: parsed.error.message };
  }
  return { ok: true, graph: parsed.data as Graph };
}
