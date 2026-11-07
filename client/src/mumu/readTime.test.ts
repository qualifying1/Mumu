import { describe, expect, it } from "vitest";
import { localDateKey, readTimeMessage } from "./readTime.ts";

describe("localDateKey", () => {
  it("is the local date, zero padded", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 10, 7, 0, 1))).toBe("2026-11-07");
  });
});

describe("readTimeMessage", () => {
  it("reads minutes", () => {
    expect(readTimeMessage(23 * 60 + 40)).toBe("You've read 23 min today!");
  });
  it("handles nothing logged and under a minute", () => {
    expect(readTimeMessage(undefined)).toMatch(/No reading yet/);
    expect(readTimeMessage(0)).toMatch(/No reading yet/);
    expect(readTimeMessage(30)).toBe("You've read less than a minute today!");
  });
  it("switches to hours", () => {
    expect(readTimeMessage(59 * 60)).toBe("You've read 59 min today!");
    expect(readTimeMessage(65 * 60)).toBe("You've read 1 h 5 min today!");
    expect(readTimeMessage(120 * 60)).toBe("You've read 2 h today!");
  });
});
