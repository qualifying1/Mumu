// Turn the files a user picked (CBZ, ZIP or loose images) into ordered page blobs (SPEC F1).
import JSZip from "jszip";
import { imageMime, isArchiveName, isPageFile, sortNaturally } from "./pages.ts";

export interface ImportedPage {
  /** Original file name, for error messages and the debug list. */
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

interface PageSource {
  /** Sort key: source name + path, so several archives stay in order. */
  key: string;
  name: string;
  read: () => Promise<Blob>;
}

async function archiveSources(file: File): Promise<PageSource[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    throw new Error(`${file.name} is not a readable CBZ/ZIP: ${e instanceof Error ? e.message : String(e)}`);
  }
  const sources: PageSource[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir || !isPageFile(path)) return;
    const mime = imageMime(path)!;
    sources.push({
      key: `${file.name}/${path}`,
      name: path,
      read: async () => new Blob([await entry.async("arraybuffer")], { type: mime }),
    });
  });
  return sources;
}

async function measure(source: PageSource): Promise<ImportedPage> {
  const blob = await source.read();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    throw new Error(`Could not decode image ${source.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const { width, height } = bitmap;
  bitmap.close();
  return { name: source.name, blob, width, height };
}

/**
 * Expand the picked files into pages in natural reading order.
 * Non-image files are ignored. Throws when nothing usable is found.
 */
export async function extractPages(files: readonly File[]): Promise<ImportedPage[]> {
  const sources: PageSource[] = [];
  for (const file of files) {
    if (isArchiveName(file.name)) {
      sources.push(...(await archiveSources(file)));
    } else if (isPageFile(file.name)) {
      sources.push({ key: file.name, name: file.name, read: async () => file });
    }
  }
  if (sources.length === 0) {
    throw new Error("No images found. Pick a .cbz, a .zip, or image files (jpg, png, webp).");
  }
  const ordered = sortNaturally(sources, (s) => s.key);
  const pages: ImportedPage[] = [];
  for (const source of ordered) pages.push(await measure(source));
  return pages;
}
