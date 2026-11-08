// /dev loader: put a ChapterPackage JSON (hand-written sample, or a fixture-script output) plus its page images
// into the library, then store the package through the one shared `storePackage` function (CONTRACT §6).
import { ChapterPackageSchema, type ChapterPackage } from "@mumu/shared";
import { db, type Chapter, type PageRow } from "../db/db.ts";
import { storePackage } from "../db/storePackage.ts";
import type { ImportedPage } from "./extract.ts";
import { nextChapterNumber } from "./pages.ts";

/** Pure check: every cue and region must point at a page we actually have. Throws a readable error. */
export function assertPackageFitsPages(pkg: ChapterPackage, pageCount: number): void {
  const bad: string[] = [];
  for (const cue of pkg.cues) if (cue.pageIndex >= pageCount) bad.push(`cue ${cue.id} (page ${cue.pageIndex})`);
  for (const region of pkg.regions) {
    const last = Math.max(region.start.pageIndex, region.end.pageIndex);
    if (last >= pageCount) bad.push(`region ${region.id} (page ${last})`);
  }
  if (bad.length > 0) {
    throw new Error(
      `The package refers to pages that were not provided (you gave ${pageCount}): ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ", …" : ""}.`,
    );
  }
}

export interface LoadedPackage {
  seriesId: string;
  chapterId: string;
  pageCount: number;
}

/**
 * Create (or reset) the series and chapter rows named by the package, replace the chapter's pages,
 * then store the package. Safe to run repeatedly with the same package.
 */
export async function loadPackageWithPages(
  packageJson: unknown,
  pages: readonly ImportedPage[],
  seriesTitle: string,
): Promise<LoadedPackage> {
  const pkg = ChapterPackageSchema.parse(packageJson);
  if (pages.length === 0) throw new Error("Pick the page images (or a .cbz) that belong to this package.");
  assertPackageFitsPages(pkg, pages.length);

  const pageRows: PageRow[] = pages.map((p, index) => ({
    id: `${pkg.chapterId}:p${index}`,
    chapterId: pkg.chapterId,
    index,
    blob: p.blob,
    width: p.width,
    height: p.height,
  }));
  const coverPageId = pageRows[0]!.id;

  await db.transaction("rw", db.series, db.chapters, db.pages, async () => {
    const existingSeries = await db.series.get(pkg.seriesId);
    await db.series.put({
      id: pkg.seriesId,
      title: existingSeries?.title ?? seriesTitle,
      coverPageId: existingSeries?.coverPageId ?? coverPageId,
      createdAt: existingSeries?.createdAt ?? Date.now(),
    });

    const existing = await db.chapters.get(pkg.chapterId);
    const siblings = await db.chapters.where("seriesId").equals(pkg.seriesId).toArray();
    const number = existing?.number ?? nextChapterNumber(siblings.map((c) => c.number));
    const chapter: Chapter = {
      id: pkg.chapterId,
      seriesId: pkg.seriesId,
      number,
      title: `Chapter ${number}`,
      pageCount: pageRows.length,
      status: "imported",
    };
    await db.chapters.put(chapter);
    await db.pages.where("chapterId").equals(pkg.chapterId).delete();
    await db.pages.bulkAdd(pageRows);
  });

  await storePackage(pkg);
  return { seriesId: pkg.seriesId, chapterId: pkg.chapterId, pageCount: pages.length };
}
