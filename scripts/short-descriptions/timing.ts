import { performance } from "node:perf_hooks";

/**
 * Opt-in timing diagnostics for the authoring pipeline. Values are durations
 * from a monotonic clock and are printed only when `--timings` is enabled.
 * They never include prompts, model responses, headers, or credentials.
 */

/** Monotonic clock in milliseconds. */
export type Clock = () => number;

export function monotonicClock(): Clock {
  return () => performance.now();
}

export interface EntryTimings {
  /** Generation API request. */
  generation?: number;
  /** Deterministic structural, numeric, vocabulary, and length checks. */
  checks?: number;
  /** Judge API request. */
  judgement?: number;
  /** Whole entry, including local bookkeeping. */
  total: number;
}

const LABEL_WIDTH = 23;

export function formatTimingLine(label: string, milliseconds: number): string {
  return `  ${`${label}:`.padEnd(LABEL_WIDTH)}${formatDuration(milliseconds)}`;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000;
  return `${seconds.toFixed(1)}s`;
}

export function formatEntryTimings(timings: EntryTimings): string[] {
  const lines: string[] = [];
  if (timings.generation !== undefined) {
    lines.push(formatTimingLine("generation API", timings.generation));
  }
  if (timings.checks !== undefined) {
    lines.push(formatTimingLine("deterministic checks", timings.checks));
  }
  if (timings.judgement !== undefined) {
    lines.push(formatTimingLine("judge API", timings.judgement));
  }
  lines.push(formatTimingLine("total", timings.total));
  return lines;
}
