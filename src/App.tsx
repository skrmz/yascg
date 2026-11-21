import { useLayoutEffect } from "react";
import { AppProvider, useApp } from "./state/AppProvider.tsx";
import { AppErrorBoundary } from "./components/ErrorBoundary.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { Toaster } from "./ui/Sonner.tsx";
import { TooltipProvider } from "./ui/Tooltip.tsx";
import i18n, { applyDocumentLanguage } from "./i18n.ts";

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

export function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <TooltipProvider delayDuration={200}>
          <UiLocaleBridge />
          <AppShell />
          <Toaster />
        </TooltipProvider>
      </AppProvider>
    </AppErrorBoundary>
  );
}
