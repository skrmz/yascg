import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import {
  AppError,
  message,
  toMessageDescriptor,
  translateMessage,
  type MessageKey,
} from "./messages.ts";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("typed message descriptors", () => {
  it("translates descriptors in the active locale", async () => {
    const descriptor = message("library.results", { count: 2 });
    expect(translateMessage(i18n.t, descriptor)).toBe("2 results");
    await i18n.changeLanguage("de");
    expect(translateMessage(i18n.t, descriptor)).toBe("2 Ergebnisse");
  });

  it("interpolates supported primitive values", () => {
    const descriptor = message("deck.fitModeAria", { name: "Feuerball" });
    expect(translateMessage(i18n.t, descriptor)).toBe("Fit mode for Feuerball");
  });

  it("rejects missing interpolation values", () => {
    expect(() => message("deck.fitModeAria", {} as Record<"name", string>)).toThrow(
      /missing a valid "name" value/,
    );
  });

  it("rejects unknown catalog keys", () => {
    expect(() => message("app.missing.key" as MessageKey, undefined as never)).toThrow(
      /Unknown translation key/,
    );
  });

  it("preserves intentional AppError descriptors", () => {
    const descriptor = message("error.deckConflict", { expected: 1, actual: 2 });
    expect(toMessageDescriptor(new AppError(descriptor))).toBe(descriptor);
  });

  it("logs unexpected errors and returns only the generic descriptor", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const descriptor = toMessageDescriptor(new Error("secret internal detail"));
    expect(descriptor).toEqual(message("error.generic"));
    expect(spy).toHaveBeenCalled();
    expect(translateMessage(i18n.t, descriptor)).not.toContain("secret internal detail");
    spy.mockRestore();
  });
});
