import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en.ts";
import { de } from "./locales/de.ts";
import { readLanguagePreference } from "./services/data/language.ts";

export const UI_LOCALES = ["en", "de"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export function toUiLocale(code: string): UiLocale {
  return code === "de" ? "de" : "en";
}

export function applyDocumentLanguage(code: string): UiLocale {
  const locale = toUiLocale(code);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  return locale;
}

const resources = {
  en: { translation: en },
  de: { translation: de },
} as const;

const initialUiLocale = toUiLocale(readLanguagePreference() ?? "en");

void i18n.use(initReactI18next).init({
  resources,
  lng: initialUiLocale,
  fallbackLng: "en",
  supportedLngs: UI_LOCALES,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

applyDocumentLanguage(initialUiLocale);

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}

export default i18n;
