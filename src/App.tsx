import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./state/AppProvider.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { Toaster } from "./ui/Sonner.tsx";
import { db } from "./db/database.ts";
import i18n, { toUiLocale } from "./i18n.ts";

function UiLocaleBridge() {
  const { language } = useApp();
  useEffect(() => {
    const code = toUiLocale(language);
    if (i18n.resolvedLanguage !== code) {
      void i18n.changeLanguage(code);
    }
  }, [language]);
  return null;
}

function StorageNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await db.open();
      } catch (error) {
        if (!cancelled) {
          setMessage(
            `Local storage is unavailable, so spells and decks cannot be saved. ${
              error instanceof Error ? error.message : String(error)
            } Export your data as JSON when storage is working.`,
          );
        }
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="alert"
      className="app-no-print border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
    >
      {message}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <UiLocaleBridge />
      <StorageNotice />
      <AppShell />
      <Toaster />
    </AppProvider>
  );
}
