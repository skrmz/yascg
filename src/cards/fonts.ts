/**
 * Card typography is loaded from Google Fonts rather than bundled @font-face
 * rules, so `document.fonts.ready` alone cannot guarantee the card faces are
 * available: it only waits for fonts already requested by rendered text.
 * Explicitly request every weight/style the cards can use before measuring or
 * printing, then report whether the real faces (not fallbacks) are ready.
 */
const CARD_FONT_FACES = [
  '600 8pt "Vollkorn"',
  'italic 600 8pt "Vollkorn"',
  '700 8pt "Vollkorn"',
  'italic 700 8pt "Vollkorn"',
  '400 8pt "Alegreya Sans"',
  'italic 400 8pt "Alegreya Sans"',
  '500 8pt "Alegreya Sans"',
  'italic 500 8pt "Alegreya Sans"',
  '700 8pt "Alegreya Sans"',
  'italic 700 8pt "Alegreya Sans"',
] as const;

export async function waitForCardFonts(): Promise<boolean> {
  const fonts = (globalThis as { document?: Document }).document?.fonts;
  if (!fonts) return false;

  const loads = CARD_FONT_FACES.map((face) => {
    if (typeof fonts.load !== "function") return Promise.resolve([] as FontFace[]);
    return fonts.load(face).catch(() => [] as FontFace[]);
  });
  await Promise.all(loads);

  if (typeof fonts.ready?.then === "function") {
    await fonts.ready;
  }

  return CARD_FONT_FACES.every((face) => {
    try {
      return fonts.check(face);
    } catch {
      return false;
    }
  });
}
