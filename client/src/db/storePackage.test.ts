import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ChapterPackageSchema } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { packageToRows } from "./storePackage.ts";

const samplePath = resolve(__dirname, "../../../fixtures/sample.json");
const pkg = ChapterPackageSchema.parse(JSON.parse(readFileSync(samplePath, "utf8")));

describe("packageToRows", () => {
  const rows = packageToRows(pkg);

  it("tags every cue and region with the chapter id and keeps order", () => {
    expect(rows.cues).toHaveLength(pkg.cues.length);
    expect(rows.cues.every((c) => c.chapterId === pkg.chapterId)).toBe(true);
    expect(rows.cues.map((c) => c.order)).toEqual(pkg.cues.map((c) => c.order));
    expect(rows.regions).toHaveLength(pkg.regions.length);
    expect(rows.regions.every((r) => r.chapterId === pkg.chapterId)).toBe(true);
  });

  it("decodes each audio clip to an mp3 blob with the right size", () => {
    expect(rows.audio).toHaveLength(pkg.audio.length);
    pkg.audio.forEach((clip, i) => {
      const row = rows.audio[i]!;
      expect(row.id).toBe(clip.id);
      expect(row.blob.type).toBe("audio/mpeg");
      expect(row.blob.size).toBe(Buffer.from(clip.dataBase64, "base64").length);
      expect(row.durationMs).toBe(clip.durationMs);
    });
  });

  it("carries the recap and new characters", () => {
    expect(rows.recapText).toBe(pkg.recap.text);
    expect(rows.recapAudioId).toBe(pkg.recap.audioId);
    expect(rows.characters).toEqual(pkg.newCharacters);
    expect(rows.audio.some((a) => a.id === rows.recapAudioId)).toBe(true);
  });
});
