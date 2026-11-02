import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { buildCompactPresentation, parseCastingTime, parseDuration } from "@/cards/compact.ts";
import i18n from "@/i18n.ts";
import { analyzeCustomImport } from "@/io/import-custom.ts";
import { componentMarkers } from "@/locales/labels.ts";
import { parseSpellBody } from "@/markdown/parse.ts";

interface GuideCase {
  locale: "en" | "de";
  file: string;
  name: string;
  castingTime: string;
  range: string;
  duration: string;
  sourceLabel: string;
  descriptionSnippet: string;
}

const GUIDES: GuideCase[] = [
  {
    locale: "en",
    file: "docs/custom-spells-guide.md",
    name: "The Funniest Joke in the World",
    castingTime: "1 Action",
    range: "60 feet",
    duration: "Up to 1 minute",
    sourceLabel: "Custom (Playtest)",
    descriptionSnippet: "You tell a joke so absurd",
  },
  {
    locale: "de",
    file: "docs/custom-spells-guide.de.md",
    name: "Der tödlichste Witz der Welt",
    castingTime: "1 Aktion",
    range: "18 Meter",
    duration: "Bis zu 1 Minute",
    sourceLabel: "Eigen (Playtest)",
    descriptionSnippet: "Du erzählst einen so absurden Witz",
  },
];

function fencedJsonBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const pattern = /```json\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    if (match[1] !== undefined) blocks.push(match[1]);
  }
  return blocks;
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("custom-spells guide examples", () => {
  for (const guide of GUIDES) {
    it(`validates the ${guide.locale} example through import and compact-card parsing`, async () => {
      const markdown = readFileSync(resolve(process.cwd(), guide.file), "utf8");
      const envelopes = fencedJsonBlocks(markdown).filter((block) => {
        try {
          return (JSON.parse(block) as { type?: unknown }).type === "custom-spells";
        } catch {
          return false;
        }
      });
      expect(envelopes).toHaveLength(1);
      const json = envelopes[0] ?? "";
      const payload = JSON.parse(json) as { srdSpellOverrides?: unknown };
      expect(payload.srdSpellOverrides).toEqual([]);

      const analysis = analyzeCustomImport(json, []);
      if (!analysis.ok)
        throw new Error(`Guide example failed import analysis: ${analysis.error.key}`);
      const entry = analysis.plan.entries[0];
      if (!entry) throw new Error("Guide example did not produce an import entry");
      expect(analysis.plan.collisions).toEqual([]);
      expect(analysis.plan.remaps).toEqual([]);
      expect(analysis.plan.overrides).toEqual([]);

      const record = entry.record;
      expect(record).toMatchObject({
        name: guide.name,
        level: 3,
        school: "Enchantment",
        castingTime: guide.castingTime,
        range: guide.range,
        duration: guide.duration,
        concentration: true,
        ritual: true,
        classes: ["Bard", "Sorcerer", "Warlock"],
        subclasses: ["Bard: College of Lore", "Sorcerer: Draconic Sorcery"],
        savingThrow: "WIS",
        damageTypes: ["psychic"],
        source: "Custom",
        sourceLabel: guide.sourceLabel,
        updatedAt: 1767225600000,
        components: {
          verbal: true,
          somatic: true,
          material: true,
          materialConsumed: true,
        },
      });
      expect(record.components.verbalDescription).toBeTruthy();
      expect(record.components.somaticDescription).toBeTruthy();
      expect(record.components.materialDescription).toBeTruthy();
      expect(record.components.materialCost).toBeTruthy();
      expect(record.higherLevels).toHaveLength(1);
      expect(record.description.join(" ")).toContain(guide.descriptionSnippet);

      const casting = parseCastingTime(record.castingTime);
      expect(casting.kind).toBe("base");
      if (casting.kind === "base") expect(casting.base).toMatchObject({ kind: "action" });

      const duration = parseDuration(record.duration);
      expect(duration.caret).toBe(false);
      expect(duration.value).toBe(guide.duration);

      await i18n.changeLanguage(guide.locale);
      const blocks = parseSpellBody(
        record,
        i18n.t("spell.higherLevels"),
        componentMarkers(guide.locale),
        { markSections: true },
      );
      const presentation = buildCompactPresentation(record, blocks, i18n.t);
      expect(presentation.displayCastingTime).toBe("A");
      expect(presentation.displayDuration).toBe(guide.duration);
    });
  }
});
