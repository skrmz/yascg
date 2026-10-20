import { AboutDialog } from "./AboutDialog.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { OfflineStatus } from "./OfflineStatus.tsx";

export function Header() {
  return (
    <header className="app-no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <h1 className="text-base font-semibold text-foreground">Spell Card Generator</h1>
        <span className="text-xs text-muted-foreground">SRD 5.2.1</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <OfflineStatus />
        <LanguagePicker />
        <AboutDialog />
      </div>
    </header>
  );
}
