// First-run seeding (CONTRACT §6): the 30 premade voice profiles.
import { DEFAULT_PROFILES } from "@mumu/shared";
import { db } from "./db.ts";

/**
 * Add any default profile that isn't in the DB yet. Existing rows are never touched,
 * so the user's edits from the Voices tab survive. Idempotent.
 */
export async function seedProfiles(): Promise<number> {
  return db.transaction("rw", db.profiles, async () => {
    const have = new Set(await db.profiles.toCollection().primaryKeys());
    const missing = DEFAULT_PROFILES.filter((p) => !have.has(p.id));
    if (missing.length > 0) await db.profiles.bulkAdd([...missing]);
    return missing.length;
  });
}
