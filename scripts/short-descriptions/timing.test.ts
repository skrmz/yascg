import { describe, expect, it } from "vite-plus/test";
import { formatDuration, formatEntryTimings, formatTimingLine } from "./timing.ts";

describe("timing diagnostics", () => {
  it("formats durations in seconds with one decimal", () => {
    expect(formatDuration(2400)).toBe("2.4s");
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(-5)).toBe("0.0s");
  });

  it("formats per-entry stage lines", () => {
    expect(
      formatEntryTimings({ generation: 2400, checks: 100, judgement: 3100, total: 5800 }),
    ).toEqual([
      "  generation API:        2.4s",
      "  deterministic checks:  0.1s",
      "  judge API:             3.1s",
      "  total:                 5.8s",
    ]);
  });

  it("omits stages that did not run", () => {
    expect(formatEntryTimings({ total: 100 })).toEqual(["  total:                 0.1s"]);
    expect(formatTimingLine("total run", 1500)).toBe("  total run:             1.5s");
  });
});
