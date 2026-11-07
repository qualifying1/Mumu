import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Stable hash of a list of parts. Each part is length-prefixed so ["ab","c"] ≠ ["a","bc"]. */
export function cacheKey(parts: Array<string | Uint8Array>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    const bytes = typeof part === "string" ? Buffer.from(part, "utf8") : part;
    hash.update(String(bytes.length));
    hash.update(":");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

/** Disk cache shared by every checkout (CONTRACT §9). Writes are atomic: temp file, then rename. */
export class DiskCache {
  constructor(private readonly dir: string) {}

  private fileFor(namespace: string, key: string, ext: string): string {
    return path.join(this.dir, namespace, `${key}.${ext}`);
  }

  async read(namespace: string, key: string, ext = "json"): Promise<Buffer | null> {
    try {
      return await readFile(this.fileFor(namespace, key, ext));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async write(namespace: string, key: string, data: string | Uint8Array, ext = "json"): Promise<void> {
    const file = this.fileFor(namespace, key, ext);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, data);
    try {
      await renameOntoExisting(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }
}

/** Errors Windows raises when another process or writer is renaming onto, or holding, the same target. */
const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 8;

/**
 * rename(tmp, file), retried a few times when Windows refuses it because a concurrent writer of
 * the same key is mid-rename (POSIX replaces atomically and never hits this). The cache is
 * content-addressed, so whichever writer wins leaves a valid entry. After the last attempt the
 * error is thrown: no silent fallback.
 */
async function renameOntoExisting(tmp: string, file: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= RENAME_ATTEMPTS || code === undefined || !TRANSIENT_RENAME_CODES.has(code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt));
    }
  }
}
