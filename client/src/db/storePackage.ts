// The single function that stores a ChapterPackage (CONTRACT §6): used by the processing flow and the /dev loader.
import { ChapterPackageSchema, type Character, type ChapterPackage } from "@mumu/shared";
import { db, type AudioRow, type CueRow, type RegionRow } from "./db.ts";

export interface PackageRows {
  cues: CueRow[];
  regions: RegionRow[];
  audio: AudioRow[];
  characters: Character[];
  /** Deprecated: no recap feature. Only set if an old package carries one. */
  recapText?: string;
  recapAudioId?: string;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Pure mapping from a validated package to the rows to write. Tested without IndexedDB. */
export function packageToRows(pkg: ChapterPackage): PackageRows {
  const { chapterId } = pkg;
  return {
    cues: pkg.cues.map((c) => ({ ...c, chapterId })),
    regions: pkg.regions.map((r) => ({ ...r, chapterId })),
    audio: pkg.audio.map((a) => ({
      id: a.id,
      chapterId,
      blob: base64ToBlob(a.dataBase64, a.mime),
      durationMs: a.durationMs,
    })),
    characters: pkg.newCharacters,
    recapText: pkg.recap?.text,
    recapAudioId: pkg.recap?.audioId,
  };
}

/**
 * Validate and store a package in ONE transaction: replace the chapter's cues, regions and audio,
 * add the new characters, save the recap, and mark the chapter `ready`.
 * Throws (and writes nothing) if the package is invalid or the chapter doesn't exist.
 */
export async function storePackage(input: unknown): Promise<ChapterPackage> {
  const pkg = ChapterPackageSchema.parse(input);
  const rows = packageToRows(pkg);

  await db.transaction("rw", [db.chapters, db.cues, db.regions, db.audio, db.characters], async () => {
    const chapter = await db.chapters.get(pkg.chapterId);
    if (!chapter) throw new Error(`Cannot store package: chapter ${pkg.chapterId} is not in the library.`);

    await db.cues.where("chapterId").equals(pkg.chapterId).delete();
    await db.regions.where("chapterId").equals(pkg.chapterId).delete();
    await db.audio.where("chapterId").equals(pkg.chapterId).delete();

    await db.cues.bulkAdd(rows.cues);
    await db.regions.bulkAdd(rows.regions);
    await db.audio.bulkAdd(rows.audio);
    await db.characters.bulkPut(rows.characters);

    await db.chapters.update(pkg.chapterId, {
      status: "ready",
      processedAt: Date.now(),
      recapText: rows.recapText,
      recapAudioId: rows.recapAudioId,
      jobId: undefined,
      error: undefined,
    });
  });
  return pkg;
}
