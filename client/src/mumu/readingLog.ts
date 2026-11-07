// Writes reading time into the contract-owned `readingLog` table (CONTRACT §6): one row per local date.
import { db } from "../db/db.ts";
import { localDateKey } from "./readTime.ts";

/** Add `seconds` to today's row, in one transaction so two writers cannot lose each other's time. */
export async function addReadingSeconds(seconds: number, now: Date = new Date()): Promise<void> {
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error(`addReadingSeconds needs a positive whole number of seconds, got ${seconds}`);
  const date = localDateKey(now);
  await db.transaction("rw", db.readingLog, async () => {
    const row = await db.readingLog.get(date);
    await db.readingLog.put({ date, seconds: (row?.seconds ?? 0) + seconds });
  });
}
