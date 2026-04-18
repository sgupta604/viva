import { describe, it, expect, beforeEach } from "vitest";
import { useFilterStore } from "./filter-store";

describe("filter store", () => {
  beforeEach(() => {
    useFilterStore.getState().reset();
  });

  it("defaults hideTests to true", () => {
    expect(useFilterStore.getState().hideTests).toBe(true);
  });

  it("defaults to all kinds enabled", () => {
    const { kinds } = useFilterStore.getState();
    expect(kinds.has("xml")).toBe(true);
    expect(kinds.has("yaml")).toBe(true);
    expect(kinds.has("json")).toBe(true);
    expect(kinds.has("ini")).toBe(true);
  });

  it("toggles a kind off and on", () => {
    useFilterStore.getState().toggleKind("xml");
    expect(useFilterStore.getState().kinds.has("xml")).toBe(false);
    useFilterStore.getState().toggleKind("xml");
    expect(useFilterStore.getState().kinds.has("xml")).toBe(true);
  });

  it("reset restores defaults", () => {
    useFilterStore.getState().setHideTests(false);
    useFilterStore.getState().setSearchQuery("foo");
    useFilterStore.getState().reset();
    const s = useFilterStore.getState();
    expect(s.hideTests).toBe(true);
    expect(s.searchQuery).toBe("");
  });
});
