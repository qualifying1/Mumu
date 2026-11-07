// Pure helpers for the import flow (SPEC F1). No DOM, no Dexie: unit-tested in pages.test.ts.

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
};

function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** MIME type for an image file name, or null when it isn't an image we accept. */
export function imageMime(path: string): string | null {
  return IMAGE_MIME[extensionOf(path)] ?? null;
}

/** True for files that are real pages: an image extension, not a dotfile, not OS metadata (`__MACOSX/`, `Thumbs.db`). */
export function isPageFile(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((s) => s === "__MACOSX" || s.startsWith("."))) return false;
  return imageMime(normalized) !== null;
}

export function isArchiveName(name: string): boolean {
  const ext = extensionOf(name);
  return ext === "cbz" || ext === "zip";
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Natural order: `2` before `10`, case-insensitive. Compares full paths so folders sort first. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function sortNaturally<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((x, y) => naturalCompare(key(x), key(y)));
}

/** Highest existing chapter number + 1, or 1 for an empty series. */
export function nextChapterNumber(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/** Default series title from a file name: drop the extension, turn `_`/`-` runs into spaces. */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
