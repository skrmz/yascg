export const CARD_DESIGNS = ["classic", "compact"] as const;

export type CardDesign = (typeof CARD_DESIGNS)[number];

export const DEFAULT_CARD_DESIGN: CardDesign = "compact";

export const CARD_DESIGN_LABEL_KEYS = {
  classic: "card.design.classic",
  compact: "card.design.compact",
} as const satisfies Record<CardDesign, string>;

export function normalizeCardDesign(value: unknown): CardDesign {
  return value === "classic" || value === "compact" ? value : DEFAULT_CARD_DESIGN;
}
