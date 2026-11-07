import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ChapterPackageSchema } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { assertPackageFitsPages } from "./loadPackage.ts";

const pkg = ChapterPackageSchema.parse(JSON.parse(readFileSync(resolve(__dirname, "../../../fixtures/sample.json"), "utf8")));
const lastPage = Math.max(...pkg.cues.map((c) => c.pageIndex), ...pkg.regions.flatMap((r) => [r.start.pageIndex, r.end.pageIndex]));

describe("assertPackageFitsPages", () => {
  it("accepts exactly the pages the sample needs", () => {
    expect(() => assertPackageFitsPages(pkg, lastPage + 1)).not.toThrow();
  });

  it("rejects too few pages and names the problem", () => {
    expect(() => assertPackageFitsPages(pkg, lastPage)).toThrow(/not provided/);
  });
});
