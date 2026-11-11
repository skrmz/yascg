import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorkspace, type Workspace } from "./files.ts";

export interface SeedSpell {
  id: string;
  name?: string;
  level?: number;
  school?: string;
  description: string[];
  higherLevels?: string[];
}

export interface SeedOptions {
  locales?: string[];
  spells?: Record<string, SeedSpell>;
  authoring?: Record<string, unknown>;
}

export const LONG_DESCRIPTION = [
  "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.",
  "Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
];

export const HIGHER_LEVELS = [
  "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
];

export function defaultSpells(): Record<string, SeedSpell> {
  return {
    "srd-fireball": {
      id: "srd-fireball",
      name: "Fireball",
      level: 3,
      school: "Evocation",
      description: LONG_DESCRIPTION,
      higherLevels: HIGHER_LEVELS,
    },
    "srd-light": {
      id: "srd-light",
      name: "Light",
      level: 0,
      school: "Evocation",
      description: [
        "You touch one object that is no larger than 10 feet in any dimension. Until the spell ends, the object sheds bright light in a 20-foot radius and dim light for an additional 20 feet.",
      ],
    },
  };
}

export async function createTempWorkspace(prefix = "sd-test-"): Promise<Workspace> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  return createWorkspace(root);
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function seedWorkspace(
  workspace: Workspace,
  options: SeedOptions = {},
): Promise<Workspace> {
  const locales = options.locales ?? ["en"];
  const spellsByLocale = options.spells ?? defaultSpells();
  const manifest = locales.map((locale) => ({
    code: locale,
    displayName: locale,
    dataset: locale === "en" ? "/spells.srd.json" : `/spells.srd.${locale}.json`,
  }));
  await writeJsonFile(workspace.manifestFile, manifest);
  for (const locale of locales) {
    const spells = Object.values(spellsByLocale).map((spell) => ({
      ...spell,
      source: "SRD-5.2.1",
    }));
    await writeJsonFile(
      workspace.datasetPath(locale === "en" ? "/spells.srd.json" : `/spells.srd.${locale}.json`),
      spells,
    );
    const authoring = options.authoring?.[locale];
    if (authoring !== undefined) {
      await writeJsonFile(workspace.authoringFile(locale), authoring);
    }
  }
  return workspace;
}
