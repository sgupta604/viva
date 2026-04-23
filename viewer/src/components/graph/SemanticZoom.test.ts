import { describe, it, expect } from "vitest";
import {
  zoomModeFor,
  Z_OVERVIEW_MAX,
  Z_DETAIL_MIN,
} from "./SemanticZoom";

describe("zoomModeFor", () => {
  it("returns overview under Z_OVERVIEW_MAX", () => {
    expect(zoomModeFor(0.1)).toBe("overview");
    expect(zoomModeFor(Z_OVERVIEW_MAX - 0.001)).toBe("overview");
  });
  it("returns mid between thresholds", () => {
    expect(zoomModeFor(Z_OVERVIEW_MAX)).toBe("mid");
    expect(zoomModeFor(0.75)).toBe("mid");
    expect(zoomModeFor(Z_DETAIL_MIN - 0.001)).toBe("mid");
  });
  it("returns detail at + above Z_DETAIL_MIN", () => {
    expect(zoomModeFor(Z_DETAIL_MIN)).toBe("detail");
    expect(zoomModeFor(2.5)).toBe("detail");
  });
});
