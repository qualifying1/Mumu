import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
    await rename(tmp, file);
  }
}
