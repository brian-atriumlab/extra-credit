import { describe, expect, it } from "vitest";
import {
  buildMeta,
  connectRate,
  csvField,
  dayKeys,
  isoDate,
  windowStartIso,
} from "./metrics";

// These cover the pure metric/window math that the Monday number, the daily
// series, and the CSV all depend on. If someone breaks the window boundaries or
// the divide-by-zero guard, these fail.

describe("connectRate", () => {
  it("computes a 0–1 rate", () => {
    expect(connectRate(50, 200)).toBe(0.25);
  });

  it("is 0 when there were no calls (no divide-by-zero)", () => {
    expect(connectRate(0, 0)).toBe(0);
  });

  it("is 1 when every call connected", () => {
    expect(connectRate(7, 7)).toBe(1);
  });
});

describe("windowStartIso", () => {
  it("subtracts exactly N days from now", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    expect(windowStartIso(now, 7)).toBe("2026-05-13T12:00:00.000Z");
  });
});

describe("dayKeys", () => {
  const now = new Date("2026-05-20T08:30:00.000Z");

  it("returns exactly N calendar dates", () => {
    expect(dayKeys(now, 28)).toHaveLength(28);
  });

  it("is oldest-first and ends on today (UTC)", () => {
    const keys = dayKeys(now, 14);
    expect(keys[0]).toBe("2026-05-07");
    expect(keys[keys.length - 1]).toBe("2026-05-20");
  });
});

describe("buildMeta", () => {
  it("aligns window_start/window_end with the day series", () => {
    const now = new Date("2026-05-20T08:30:00.000Z");
    const meta = buildMeta(now, 28);
    expect(meta.window_start).toBe("2026-04-23");
    expect(meta.window_end).toBe(isoDate(now));
    expect(meta.generated_at).toBe(now.toISOString());
  });
});

describe("csvField", () => {
  it("leaves plain values (including spaces and hyphens) unquoted", () => {
    expect(csvField("West Coast")).toBe("West Coast");
    expect(csvField("Mid-Market")).toBe("Mid-Market");
    expect(csvField(42)).toBe("42");
  });

  it("quotes and escapes values containing commas or quotes", () => {
    expect(csvField("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });
});
