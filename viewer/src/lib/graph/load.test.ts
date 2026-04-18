import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadGraph } from "./load";
import fixture from "../../../e2e/fixtures/graph.json";

describe("loadGraph", () => {
  const origFetch = global.fetch;
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = origFetch;
  });

  it("returns ok with a typed graph when fetch succeeds", async () => {
    (global as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => fixture,
    });
    const result = await loadGraph();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.version).toBe(1);
  });

  it("returns network error on non-ok response", async () => {
    (global as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    });
    const result = await loadGraph();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("network");
  });

  it("returns schema error on malformed graph", async () => {
    (global as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ version: 2 }),
    });
    const result = await loadGraph();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("schema");
  });

  it("returns network error when fetch rejects", async () => {
    (global as unknown as { fetch: unknown }).fetch = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await loadGraph();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("network");
  });
});
