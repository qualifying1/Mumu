// Persist an imported chapter: series (if new) + chapter row + page blobs, in one transaction (CONTRACT §6).
import { db, type Chapter, type PageRow, type Series } from "../db/db.ts";
import type { ImportedPage } from "./extract.ts";

export type SeriesChoice = { kind: "existing"; seriesId: string } | { kind: "new"; title: string };

export interface ImportRequest {
  series: SeriesChoice;
  chapterNumber: number;
  pages: readonly ImportedPage[];
}

export interface ImportResult {
  seriesId: string;
  chapterId: string;
}

const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export async function importChapter(req: ImportRequest): Promise<ImportResult> {
  if (req.pages.length === 0) throw new Error("A chapter needs at least one page.");
  if (!Number.isInteger(req.chapterNumber) || req.chapterNumber < 1) {
    throw new Error(`Chapter number must be a whole number ≥ 1 (got ${req.chapterNumber}).`);
  }
  if (req.series.kind === "new" && req.series.title.trim() === "") {
    throw new Error("Give the new series a name.");
  }

  const chapterId = newId("chp");
  const pageRows: PageRow[] = req.pages.map((p, index) => ({
    id: `${chapterId}:p${index}`,
    chapterId,
    index,
    blob: p.blob,
    width: p.width,
    height: p.height,
  }));
  const coverPageId = pageRows[0]!.id;

  return db.transaction("rw", db.series, db.chapters, db.pages, async () => {
    let seriesId: string;
    if (req.series.kind === "new") {
      seriesId = newId("ser");
      const series: Series = { id: seriesId, title: req.series.title.trim(), coverPageId, createdAt: Date.now() };
      await db.series.add(series);
    } else {
      seriesId = req.series.seriesId;
      const existing = await db.series.get(seriesId);
      if (!existing) throw new Error(`Series ${seriesId} no longer exists.`);
      if (existing.coverPageId === null) await db.series.update(seriesId, { coverPageId });
    }

    const clash = await db.chapters.where("[seriesId+number]").equals([seriesId, req.chapterNumber]).first();
    if (clash) throw new Error(`This series already has a chapter ${req.chapterNumber}.`);

    const chapter: Chapter = {
      id: chapterId,
      seriesId,
      number: req.chapterNumber,
      title: `Chapter ${req.chapterNumber}`,
      pageCount: pageRows.length,
      status: "imported",
    };
    await db.chapters.add(chapter);
    await db.pages.bulkAdd(pageRows);
    return { seriesId, chapterId };
  });
}
