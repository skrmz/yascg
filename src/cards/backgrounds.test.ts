import { describe, expect, it } from "vite-plus/test";
import {
  CARD_BACKGROUNDS,
  CARD_BACKGROUND_NONE,
  DEFAULT_CARD_BACKGROUND,
  cardBackgroundLabel,
  cardBackgroundStyle,
  cardBackgroundUrl,
  normalizeCardBackground,
} from "@/cards/backgrounds.ts";

describe("card background registry", () => {
  it("discovers a sorted, unique set of jpg file names", () => {
    expect(CARD_BACKGROUNDS.length).toBeGreaterThan(0);
    for (const option of CARD_BACKGROUNDS) {
      expect(option.id.endsWith(".jpg")).toBe(true);
      expect(option.label).toBe(option.id);
      expect(option.url).toContain(".jpg");
    }
    const ids = CARD_BACKGROUNDS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      [...ids].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
    );
  });

  it("normalizes every discovered id and falls back to none", () => {
    for (const option of CARD_BACKGROUNDS) {
      expect(normalizeCardBackground(option.id)).toBe(option.id);
    }
    expect(DEFAULT_CARD_BACKGROUND).toBe(CARD_BACKGROUND_NONE);
    expect(normalizeCardBackground("unknown")).toBe(CARD_BACKGROUND_NONE);
    expect(normalizeCardBackground(null)).toBe(CARD_BACKGROUND_NONE);
    expect(normalizeCardBackground(3)).toBe(CARD_BACKGROUND_NONE);
  });

  it("resolves every texture to a distinct non-empty jpg url", () => {
    const urls = CARD_BACKGROUNDS.map((option) => cardBackgroundUrl(option.id));
    expect(urls.every((url) => url !== null && url.length > 0 && url.includes(".jpg"))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
    expect(cardBackgroundUrl(CARD_BACKGROUND_NONE)).toBeNull();
    expect(cardBackgroundUrl(undefined)).toBeNull();
    expect(cardBackgroundUrl("unknown")).toBeNull();
  });

  it("exposes the image only for a selected texture", () => {
    expect(cardBackgroundStyle(CARD_BACKGROUND_NONE)).toEqual({});
    expect(cardBackgroundStyle(undefined)).toEqual({});
    const style = cardBackgroundStyle(CARD_BACKGROUNDS[0].id) as Record<string, string>;
    expect(style["--card-background-image"]).toContain(".jpg");
  });

  it("truncates long file names for display", () => {
    const long = "spell-card-background-with-a-very-long-file-name.jpg";
    expect(cardBackgroundLabel("spell-card-bg-1.jpg")).toBe("spell-card-bg-1.jpg");
    const label = cardBackgroundLabel(long);
    expect(label).toHaveLength(36);
    expect(label.endsWith("…")).toBe(true);
    expect(cardBackgroundLabel(long, 10)).toHaveLength(10);
  });
});
