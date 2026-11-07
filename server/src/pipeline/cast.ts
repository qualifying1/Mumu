import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CharacterSchema, type Character, type VoiceProfile, type VoiceSlot } from "@mumu/shared";
import { z } from "zod";
import type { NewCharacterDraft } from "./reasonSchema.js";

/**
 * CONTRACT §3 casting rule: for a new character take the first of `<slot>_1`, `<slot>_2`,
 * `<slot>_3` that the series' cast isn't already using; if all three are used, take `<slot>_1`.
 * Code, not an LLM. Unknown slot (no profiles) fails loudly.
 */
export function pickProfileId(slot: VoiceSlot, usedProfileIds: ReadonlySet<string>, profiles: readonly Pick<VoiceProfile, "id" | "slot">[]): string {
  const ids = [1, 2, 3].map((n) => `${slot}_${n}`);
  for (const id of ids) {
    if (!profiles.some((p) => p.id === id)) throw new Error(`casting: no voice profile ${id} was provided`);
  }
  return ids.find((id) => !usedProfileIds.has(id)) ?? ids[0]!;
}

export interface CastingResult {
  /** Characters created by this chapter (the package's `newCharacters`). */
  newCharacters: Character[];
  /** Reasoning key (`new_1`) -> the new character's id. */
  idByKey: Map<string, string>;
}

/** Make `Character`s for the keys the reasoning pass introduced. Existing characters are never touched. */
export function castNewCharacters(args: {
  drafts: readonly NewCharacterDraft[];
  /** Only keys that actually speak; unused drafts are not created. */
  usedKeys: ReadonlySet<string>;
  existingCast: readonly Character[];
  profiles: readonly VoiceProfile[];
  seriesId: string;
  chapterId: string;
  newId?: () => string;
}): CastingResult {
  const newId = args.newId ?? (() => `chr_${randomUUID().slice(0, 8)}`);
  const used = new Set(args.existingCast.map((c) => c.profileId));
  const newCharacters: Character[] = [];
  const idByKey = new Map<string, string>();
  for (const draft of args.drafts) {
    if (!args.usedKeys.has(draft.key)) continue;
    const profileId = pickProfileId(draft.voiceSlot, used, args.profiles);
    used.add(profileId);
    const character: Character = {
      id: newId(),
      seriesId: args.seriesId,
      name: draft.name,
      description: draft.description,
      voiceSlot: draft.voiceSlot,
      profileId,
      firstSeenChapterId: args.chapterId,
    };
    newCharacters.push(character);
    idByKey.set(draft.key, character.id);
  }
  return { newCharacters, idByKey };
}

const CastPackageSchema = z.object({ seriesId: z.string().min(1), newCharacters: z.array(CharacterSchema) });

/**
 * `--cast <package.json>`: the known cast is the `newCharacters` of earlier packages (draft or full).
 * The series id comes from the first package; mixing series, or reusing one id for two
 * different characters, is an error.
 */
export async function loadCastFromPackages(files: readonly string[]): Promise<{ seriesId: string; cast: Character[] }> {
  if (files.length === 0) throw new Error("loadCastFromPackages needs at least one file");
  let seriesId: string | undefined;
  const byId = new Map<string, Character>();
  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      throw new Error(`--cast ${file}: ${(err as Error).message}`);
    }
    const parsed = CastPackageSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`--cast ${file}: not a chapter package (${issue?.path.join(".") || "(root)"}: ${issue?.message})`);
    }
    seriesId ??= parsed.data.seriesId;
    if (parsed.data.seriesId !== seriesId) throw new Error(`--cast ${file}: series ${parsed.data.seriesId} differs from ${seriesId}`);
    for (const c of parsed.data.newCharacters) {
      const prior = byId.get(c.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(c)) throw new Error(`--cast ${file}: character ${c.id} is defined twice with different details`);
      byId.set(c.id, c);
    }
  }
  return { seriesId: seriesId!, cast: [...byId.values()] };
}
