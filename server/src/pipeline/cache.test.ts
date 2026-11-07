import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheKey, DiskCache } from "./cache.js";

describe("cacheKey", () => {
  it("is stable and sensitive to every part", () => {
    expect(cacheKey(["m", "v1", Buffer.from("x")])).toBe(cacheKey(["m", "v1", Buffer.from("x")]));
    expect(cacheKey(["m", "v1", Buffer.from("x")])).not.toBe(cacheKey(["m", "v2", Buffer.from("x")]));
    expect(cacheKey(["m", "v1", Buffer.from("x")])).not.toBe(cacheKey(["m", "v1", Buffer.from("y")]));
  });
  it("does not confuse part boundaries", () => {
    expect(cacheKey(["ab", "c"])).not.toBe(cacheKey(["a", "bc"]));
  });
});

describe("DiskCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mumu-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null on a miss and the bytes on a hit", async () => {
    const cache = new DiskCache(dir);
    expect(await cache.read("vision", "k1")).toBeNull();
    await cache.write("vision", "k1", '{"a":1}');
    expect((await cache.read("vision", "k1"))?.toString()).toBe('{"a":1}');
  });

  it("leaves no temp files behind", async () => {
    const cache = new DiskCache(dir);
    await Promise.all([cache.write("vision", "k", "1"), cache.write("vision", "k", "2")]);
    const files = await readdir(path.join(dir, "vision"));
    expect(files).toEqual(["k.json"]);
  });

  it("survives many concurrent writers of one key (Windows refuses simultaneous renames onto one target)", async () => {
    const cache = new DiskCache(dir);
    await Promise.all(Array.from({ length: 24 }, (_, i) => cache.write("tts", "same", `v${i}`, "wav")));
    expect(await readdir(path.join(dir, "tts"))).toEqual(["same.wav"]);
    expect((await cache.read("tts", "same", "wav"))?.toString()).toMatch(/^v\d+$/);
  });
});
