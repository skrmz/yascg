import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppProvider, useApp } from "./state/AppProvider.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { Toaster } from "./ui/Sonner.tsx";
import { db } from "./db/database.ts";
import i18n, { applyDocumentLanguage } from "./i18n.ts";
import { message, translateMessage, type MessageDescriptor } from "./locales/messages.ts";

function UiLocaleBridge() {
  const { language, languageStatus } = useApp();
  useLayoutEffect(() => {
    if (languageStatus === "loading") return;
    const code = applyDocumentLanguage(languageStatus === "failed" ? "en" : language);
    if (i18n.resolvedLanguage !== code) {
      void i18n.changeLanguage(code);
    }
  }, [language, languageStatus]);
  return null;
}

function StorageNotice() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<MessageDescriptor | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await db.open();
      } catch (error) {
        console.error("Local storage is unavailable:", error);
        if (!cancelled) {
          setNotice(message("error.storageUnavailable"));
        }
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice) return null;
  return (
    <div
      role="alert"
      className="app-no-print border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
    >
      {translateMessage(t, notice)}
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
